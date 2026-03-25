/**
 * Tenetx Status Line
 * Claude Code의 statusLine으로 등록되어 하단에 상시 표시
 * stdin으로 Claude Code 세션 데이터를 받아 모델/컨텍스트/하네스 정보를 함께 출력
 *
 * Line 1: [모델 | 프로바이더] ██████░░░░ 60% │ 프로젝트명 git:(브랜치*) │ ⏱️ 5m │ 2 CLAUDE.md │ 3 MCPs
 * Line 2: ⚡ philosophy-name · scope · pack-name
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { debugLog } from './logger.js';
import { loadTokenUsage, formatCost, formatTokenCount } from '../engine/token-tracker.js';
import { readHudCostString } from '../lab/cost-tracker.js';

const execFileAsync = promisify(execFile);

// ── ANSI 색상 코드 ──
const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';

// ── 타입 정의 ──

interface ContextWindow {
  current_usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  context_window_size?: number;
  used_percentage?: number;
}

interface RateLimitBucket {
  used_percentage?: number;
  utilization?: number;       // OAuth API 응답 형식
  resets_at?: string;
}

interface StdinData {
  model?: { display_name?: string; id?: string };
  context_window?: ContextWindow;
  cwd?: string;
  transcript_path?: string;
  // Claude Code가 rate limit을 stdin으로 전달할 경우 (이슈 #32257 COMPLETED)
  rate_limits?: {
    session?: RateLimitBucket;
    weekly?: RateLimitBucket;
  };
  rate_limit?: {
    session_used_percentage?: number;
    weekly_used_percentage?: number;
  };
}

interface GitStatus {
  branch: string;
  isDirty: boolean;
}

interface ConfigCounts {
  claudeMdCount: number;
  rulesCount: number;
  mcpCount: number;
  hooksCount: number;
}

// ── Rate Limit (5시간/주간 사용량) ──

interface UsageLimits {
  fiveHourPct: number;    // 5시간 rolling window 사용률 (0-100)
  weeklyPct: number;      // 주간 사용률 (0-100)
  fiveHourReset?: string; // 리셋 시각
  weeklyReset?: string;
}

/** stdin에서 rate limit 데이터 추출 (Claude Code가 제공하는 경우) */
function extractRateLimitsFromStdin(stdin: StdinData): UsageLimits | null {
  // 형식 1: rate_limits.session/weekly
  if (stdin.rate_limits) {
    const session = stdin.rate_limits.session;
    const weekly = stdin.rate_limits.weekly;
    const fiveHourPct = session?.used_percentage ?? session?.utilization ?? -1;
    const weeklyPct = weekly?.used_percentage ?? weekly?.utilization ?? -1;
    if (fiveHourPct >= 0 || weeklyPct >= 0) {
      return {
        fiveHourPct: Math.max(0, fiveHourPct),
        weeklyPct: Math.max(0, weeklyPct),
        fiveHourReset: session?.resets_at,
        weeklyReset: weekly?.resets_at,
      };
    }
  }
  // 형식 2: rate_limit.session_used_percentage
  if (stdin.rate_limit) {
    const fiveHourPct = stdin.rate_limit.session_used_percentage;
    const weeklyPct = stdin.rate_limit.weekly_used_percentage;
    if (typeof fiveHourPct === 'number' || typeof weeklyPct === 'number') {
      return {
        fiveHourPct: fiveHourPct ?? 0,
        weeklyPct: weeklyPct ?? 0,
      };
    }
  }
  return null;
}

/** 크리덴셜 JSON에서 OAuth 토큰 추출 */
function extractOAuthToken(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      accessToken?: string;
      claudeAiOauth?: { accessToken?: string };
    };
    const creds = parsed.claudeAiOauth ?? parsed;
    return creds.accessToken ?? null;
  } catch {
    return null;
  }
}

/** macOS Keychain에서 크리덴셜 읽기 */
async function getTokenFromKeychain(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { timeout: 2000, encoding: 'utf8' },
    );
    return extractOAuthToken(stdout.trim());
  } catch {
    return null;
  }
}

/** 파일 기반 크리덴셜 읽기 (~/.claude/.credentials.json) */
function getTokenFromFile(): string | null {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credPath)) return null;
    const raw = fs.readFileSync(credPath, 'utf-8').trim();
    return extractOAuthToken(raw);
  } catch {
    return null;
  }
}

/** 크로스 플랫폼 Claude Code OAuth 토큰 획득
 *  macOS: Keychain → 파일 폴백
 *  Linux/Windows: 파일 기반 (~/.claude/.credentials.json)
 */
async function getClaudeOAuthToken(): Promise<string | null> {
  // macOS: Keychain 우선
  if (process.platform === 'darwin') {
    const token = await getTokenFromKeychain();
    if (token) return token;
  }
  // 모든 플랫폼: 파일 기반 폴백
  return getTokenFromFile();
}

/** OAuth API에서 사용량 조회 (비공식 엔드포인트) */
async function fetchUsageLimits(): Promise<UsageLimits | null> {
  const token = await getClaudeOAuthToken();
  if (!token) return null;

  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    // 429 등 에러 시 null 반환 (호출자에서 에러 처리)
    if (!res.ok) return null;

    const data = await res.json() as {
      five_hour?: { utilization?: number; resets_at?: string };
      seven_day?: { utilization?: number; resets_at?: string };
    };

    return {
      fiveHourPct: Math.round(data.five_hour?.utilization ?? 0),
      weeklyPct: Math.round(data.seven_day?.utilization ?? 0),
      fiveHourReset: data.five_hour?.resets_at,
      weeklyReset: data.seven_day?.resets_at,
    };
  } catch {
    return null;
  }
}

/** 사용량 결과 (성공/실패 구분) */
interface UsageResult {
  limits: UsageLimits | null;
  error?: 'rate_limited' | 'no_token' | 'unknown';
}

/** 사용량 캐시 — 성공 시 60초, 실패 시 2분 (429 방지) */
let usageCache: { result: UsageResult; ts: number } | null = null;
const USAGE_CACHE_TTL = 60_000;        // 성공 시 60초
const USAGE_CACHE_FAIL_TTL = 120_000;  // 실패 시 2분 (429 재시도 방지)

async function getUsageLimits(stdin: StdinData): Promise<UsageResult> {
  // 1. stdin에서 직접 제공되면 바로 사용 (가장 확실)
  const fromStdin = extractRateLimitsFromStdin(stdin);
  if (fromStdin) return { limits: fromStdin };

  // 2. 캐시가 유효하면 사용
  const now = Date.now();
  if (usageCache) {
    const ttl = usageCache.result.error ? USAGE_CACHE_FAIL_TTL : USAGE_CACHE_TTL;
    if (now - usageCache.ts < ttl) {
      return usageCache.result;
    }
  }

  // 3. OAuth API 폴백
  const fetched = await fetchUsageLimits();
  if (fetched) {
    const result: UsageResult = { limits: fetched };
    usageCache = { result, ts: now };
    return result;
  }

  // 실패 원인 판별
  const token = await getClaudeOAuthToken();
  const error: UsageResult['error'] = token ? 'rate_limited' : 'no_token';
  const result: UsageResult = { limits: null, error };
  usageCache = { result, ts: now };
  return result;
}

/** 사용량 퍼센트 색상 */
function usageColor(pct: number): string {
  if (pct >= 80) return RED;
  if (pct >= 50) return YELLOW;
  return GREEN;
}

/** 리셋까지 남은 시간 포맷 */
function formatResetTime(resetAt: string | undefined): string {
  if (!resetAt) return '';
  try {
    const ms = new Date(resetAt).getTime() - Date.now();
    if (ms <= 0) return 'now';
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hours}h${rem}m` : `${hours}h`;
  } catch {
    return '';
  }
}

// ── stdin 읽기 ──

async function readStdin(): Promise<StdinData | null> {
  if (process.stdin.isTTY) return null;

  const chunks: string[] = [];
  process.stdin.setEncoding('utf-8');
  try {
    for await (const chunk of process.stdin) {
      chunks.push(chunk as string);
    }
    const raw = chunks.join('');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── 컨텍스트 계산 ──

function getContextPercent(stdin: StdinData): number {
  // Claude Code v2.1.6+에서 제공하는 네이티브 퍼센트 우선 사용
  const native = stdin.context_window?.used_percentage;
  if (typeof native === 'number' && !Number.isNaN(native)) {
    return Math.min(100, Math.max(0, Math.round(native)));
  }
  // 폴백: 토큰 수 기반 수동 계산
  const size = stdin.context_window?.context_window_size;
  if (!size || size <= 0) return 0;
  const usage = stdin.context_window?.current_usage;
  const total = (usage?.input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0);
  return Math.min(100, Math.round((total / size) * 100));
}

function contextColor(pct: number): string {
  if (pct >= 85) return RED;
  if (pct >= 60) return YELLOW;
  return GREEN;
}

/** 10칸 블록 막대 (컬러 코딩 포함) */
function contextBar(pct: number): string {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  const color = contextColor(pct);
  return `${color}${'█'.repeat(filled)}${DIM}${'░'.repeat(empty)}${RST}`;
}

/** 5칸 미니 바 (사용량 표시용) */
function miniBar(pct: number, color: string): string {
  const filled = Math.round(pct / 20); // 5칸이므로 20%당 1칸
  const empty = 5 - filled;
  return `${color}${'▮'.repeat(filled)}${DIM}${'▯'.repeat(empty)}${RST}`;
}

/** 토큰 수를 k/M 단위로 포맷 */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toString();
}

// ── 모델 / 프로바이더 ──

function getModelName(stdin: StdinData): string {
  return stdin.model?.display_name ?? stdin.model?.id ?? 'Unknown';
}

/** AWS Bedrock 모델 ID 여부 판별 */
function isBedrockModel(stdin: StdinData): boolean {
  const id = (stdin.model?.id ?? '').toLowerCase();
  return id.includes('anthropic.claude-');
}

/** 프로바이더 레이블 (Bedrock 등) */
function getProviderLabel(stdin: StdinData): string | null {
  if (isBedrockModel(stdin)) return 'Bedrock';
  return null;
}

// ── 프로젝트명 ──

function getProjectName(stdin: StdinData): string | null {
  if (!stdin.cwd) return null;
  // 유닉스/윈도우 경로 구분자 모두 지원
  const segments = stdin.cwd.split(/[/\\]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

// ── Git 상태 ──

async function getGitStatus(cwd: string | undefined): Promise<GitStatus | null> {
  if (!cwd) return null;
  try {
    const { stdout: branchOut } = await execFileAsync(
      'git', ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd, timeout: 1500, encoding: 'utf8' }
    );
    const branch = branchOut.trim();
    if (!branch) return null;

    let isDirty = false;
    try {
      const { stdout: statusOut } = await execFileAsync(
        'git', ['--no-optional-locks', 'status', '--porcelain'],
        { cwd, timeout: 1500, encoding: 'utf8' }
      );
      isDirty = statusOut.trim().length > 0;
    } catch {
      // porcelain 실패 시 clean으로 간주
    }

    return { branch, isDirty };
  } catch {
    return null;
  }
}

// ── 세션 시작 시각 (transcript 파싱) ──

async function getSessionStart(transcriptPath: string | undefined): Promise<Date | null> {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  try {
    const fileStream = fs.createReadStream(transcriptPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { timestamp?: string };
        if (entry.timestamp) {
          rl.close();
          fileStream.destroy();
          return new Date(entry.timestamp);
        }
      } catch {
        // 파싱 실패 줄 무시
      }
    }
  } catch {
    // 파일 읽기 실패 시 null 반환
  }
  return null;
}

/** 세션 경과 시간 포맷 (예: "<1m", "5m", "1h 23m") */
function formatDuration(startTime: Date): string {
  const ms = Date.now() - startTime.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m`;
}

// ── Config 카운트 (CLAUDE.md, rules, MCPs, hooks) ──

function getMcpServerNames(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) return new Set();
  try {
    const config = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      return new Set(Object.keys(config.mcpServers as Record<string, unknown>));
    }
  } catch (e) { debugLog('status-line', `MCP 설정 파싱 실패: ${filePath}`, e); }
  return new Set();
}

function countHooksInFile(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const config = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    if (config.hooks && typeof config.hooks === 'object') {
      return Object.keys(config.hooks as Record<string, unknown>).length;
    }
  } catch (e) { debugLog('status-line', `hooks 설정 파싱 실패: ${filePath}`, e); }
  return 0;
}

function countRulesInDir(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countRulesInDir(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        count++;
      }
    }
  } catch (e) { debugLog('status-line', `rules 디렉토리 읽기 실패: ${dir}`, e); }
  return count;
}

async function countConfigs(cwd: string | undefined): Promise<ConfigCounts> {
  let claudeMdCount = 0;
  let rulesCount = 0;
  let hooksCount = 0;

  const homeDir = os.homedir();
  const claudeDir = path.join(homeDir, '.claude');

  // 유저 스코프 MCP 서버 집합
  const userMcpServers = new Set<string>();
  const projectMcpServers = new Set<string>();

  // === 유저 스코프 (~/.claude) ===
  if (fs.existsSync(path.join(claudeDir, 'CLAUDE.md'))) claudeMdCount++;
  rulesCount += countRulesInDir(path.join(claudeDir, 'rules'));

  const userSettings = path.join(claudeDir, 'settings.json');
  for (const name of getMcpServerNames(userSettings)) userMcpServers.add(name);
  hooksCount += countHooksInFile(userSettings);

  // ~/.claude.json (추가 유저 스코프 MCP)
  const userClaudeJson = path.join(homeDir, '.claude.json');
  for (const name of getMcpServerNames(userClaudeJson)) userMcpServers.add(name);

  // disabled MCP 제거
  try {
    if (fs.existsSync(userClaudeJson)) {
      const cfg = JSON.parse(fs.readFileSync(userClaudeJson, 'utf-8')) as Record<string, unknown>;
      if (Array.isArray(cfg.disabledMcpServers)) {
        for (const name of cfg.disabledMcpServers as string[]) userMcpServers.delete(name);
      }
    }
  } catch (e) { debugLog('status-line', 'disabledMcpServers 파싱 실패', e); }

  // === 프로젝트 스코프 (cwd) ===
  if (cwd) {
    if (fs.existsSync(path.join(cwd, 'CLAUDE.md'))) claudeMdCount++;
    if (fs.existsSync(path.join(cwd, 'CLAUDE.local.md'))) claudeMdCount++;
    if (fs.existsSync(path.join(cwd, '.claude', 'CLAUDE.md'))) claudeMdCount++;
    if (fs.existsSync(path.join(cwd, '.claude', 'CLAUDE.local.md'))) claudeMdCount++;

    rulesCount += countRulesInDir(path.join(cwd, '.claude', 'rules'));

    const projectSettings = path.join(cwd, '.claude', 'settings.json');
    for (const name of getMcpServerNames(projectSettings)) projectMcpServers.add(name);
    hooksCount += countHooksInFile(projectSettings);

    const localSettings = path.join(cwd, '.claude', 'settings.local.json');
    for (const name of getMcpServerNames(localSettings)) projectMcpServers.add(name);
    hooksCount += countHooksInFile(localSettings);

    // .mcp.json 처리 (disabled 필터링 포함)
    const mcpJsonPath = path.join(cwd, '.mcp.json');
    const mcpJsonServers = getMcpServerNames(mcpJsonPath);
    try {
      if (fs.existsSync(localSettings)) {
        const cfg = JSON.parse(fs.readFileSync(localSettings, 'utf-8')) as Record<string, unknown>;
        if (Array.isArray(cfg.disabledMcpjsonServers)) {
          for (const name of cfg.disabledMcpjsonServers as string[]) mcpJsonServers.delete(name);
        }
      }
    } catch (e) { debugLog('status-line', 'disabledMcpjsonServers 파싱 실패', e); }
    for (const name of mcpJsonServers) projectMcpServers.add(name);
  }

  const mcpCount = userMcpServers.size + projectMcpServers.size;
  return { claudeMdCount, rulesCount, mcpCount, hooksCount };
}

// ── 메인 출력 함수 ──

export async function printStatus(): Promise<void> {
  // 하네스 환경변수
  const philosophy = process.env.COMPOUND_PHILOSOPHY ?? 'default';
  const scope = process.env.COMPOUND_SCOPE ?? '-';
  const pack = process.env.COMPOUND_PACK;

  const stdin = await readStdin();

  if (!stdin) {
    // stdin 없이 직접 호출된 경우 (테스트 또는 초기화 중)
    const parts = [`${MAGENTA}${BOLD}⚡${RST} ${philosophy}`, scope];
    if (pack) parts.push(`${CYAN}${pack}${RST}`);
    process.stdout.write(`${parts.join(' · ')}\n`);
    return;
  }

  // 병렬로 비동기 데이터 수집
  const [gitStatus, sessionStart, configCounts, usageLimits] = await Promise.all([
    getGitStatus(stdin.cwd),
    getSessionStart(stdin.transcript_path),
    countConfigs(stdin.cwd),
    getUsageLimits(stdin),
  ]);

  // ── Line 1 조각 구성 ──
  const parts: string[] = [];

  // 1. 모델 + 프로바이더
  const modelName = getModelName(stdin);
  const providerLabel = getProviderLabel(stdin);
  const modelDisplay = providerLabel
    ? `${modelName} | ${providerLabel}`
    : modelName;
  parts.push(`${CYAN}[${modelDisplay}]${RST}`);

  // 2. 컨텍스트 막대 + 퍼센트
  const pct = getContextPercent(stdin);
  const bar = contextBar(pct);
  const pctColor = contextColor(pct);
  const pctDisplay = `${pctColor}${pct}%${RST}`;

  // 85% 이상이면 토큰 상세 추가
  const usage = stdin.context_window?.current_usage;
  if (pct >= 85 && usage) {
    const inputTok = formatTokens(usage.input_tokens ?? 0);
    const cacheTok = formatTokens(
      (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
    );
    parts.push(`${bar} ${pctDisplay}${DIM} (in:${inputTok} cache:${cacheTok})${RST}`);
  } else {
    parts.push(`${bar} ${pctDisplay}`);
  }

  // 3. 사용량 바 (5시간/주간) — 컨텍스트 바 바로 오른쪽
  if (usageLimits.limits) {
    const { fiveHourPct, weeklyPct, fiveHourReset } = usageLimits.limits;
    const fhColor = usageColor(fiveHourPct);
    const wkColor = usageColor(weeklyPct);
    const fhBar = miniBar(fiveHourPct, fhColor);
    const wkBar = miniBar(weeklyPct, wkColor);
    const resetStr = fiveHourReset ? `${DIM}↻${formatResetTime(fiveHourReset)}${RST}` : '';
    parts.push(`5h ${fhBar} ${fhColor}${fiveHourPct}%${RST}${resetStr ? ` ${resetStr}` : ''} ${DIM}│${RST} wk ${wkBar} ${wkColor}${weeklyPct}%${RST}`);
  } else if (usageLimits.error === 'rate_limited') {
    parts.push(`${DIM}5h/wk ${YELLOW}429${RST} ${DIM}rate limited${RST}`);
  } else if (usageLimits.error === 'no_token') {
    parts.push(`${DIM}5h/wk ${DIM}no auth${RST}`);
  }

  // 4. 프로젝트명 + Git 상태 (이전 3→4)
  const projectName = getProjectName(stdin);
  if (projectName) {
    if (gitStatus) {
      const dirtyMark = gitStatus.isDirty ? '*' : '';
      const gitDisplay = `${MAGENTA}git:(${RST}${CYAN}${gitStatus.branch}${dirtyMark}${RST}${MAGENTA})${RST}`;
      parts.push(`${YELLOW}${projectName}${RST} ${gitDisplay}`);
    } else {
      parts.push(`${YELLOW}${projectName}${RST}`);
    }
  } else if (gitStatus) {
    const dirtyMark = gitStatus.isDirty ? '*' : '';
    parts.push(`${MAGENTA}git:(${RST}${CYAN}${gitStatus.branch}${dirtyMark}${RST}${MAGENTA})${RST}`);
  }

  // 4. 세션 경과 시간
  if (sessionStart) {
    parts.push(`${DIM}⏱ ${formatDuration(sessionStart)}${RST}`);
  }

  // 5. Config 카운트
  const { claudeMdCount, rulesCount, mcpCount, hooksCount } = configCounts;
  const totalCounts = claudeMdCount + rulesCount + mcpCount + hooksCount;
  if (totalCounts > 0) {
    if (claudeMdCount > 0) parts.push(`${DIM}${claudeMdCount} CLAUDE.md${RST}`);
    if (rulesCount > 0) parts.push(`${DIM}${rulesCount} rules${RST}`);
    if (mcpCount > 0) parts.push(`${DIM}${mcpCount} MCPs${RST}`);
    if (hooksCount > 0) parts.push(`${DIM}${hooksCount} hooks${RST}`);
  }

  const line1 = parts.join(` ${DIM}│${RST} `);

  // ── Line 2: 하네스 컨텍스트 + 비용 ──
  const line2Parts: string[] = [
    `${MAGENTA}${BOLD}⚡${RST} ${BOLD}${philosophy}${RST}`,
    `${BLUE}${scope}${RST}`,
  ];
  if (pack) {
    line2Parts.push(`${CYAN}${pack}${RST}`);
  }

  // 토큰/비용 표시: Lab cost tracker 우선 (정밀 모델별 가격), fallback으로 기존 token-tracker
  try {
    const labCost = readHudCostString();
    if (labCost) {
      line2Parts.push(`${YELLOW}💰${RST} ${DIM}${labCost}${RST}`);
    } else {
      const sessionId = process.env.COMPOUND_SESSION_ID ?? 'default';
      const tokenUsage = loadTokenUsage(sessionId);
      if (tokenUsage.toolCalls > 0) {
        const totalTokens = formatTokenCount(tokenUsage.inputTokens + tokenUsage.outputTokens);
        const cost = formatCost(tokenUsage.estimatedCost);
        line2Parts.push(`${YELLOW}💰${RST} ${DIM}${totalTokens} (~${cost})${RST}`);
      } else {
        line2Parts.push(`${YELLOW}💰${RST} ${DIM}tracking...${RST}`);
      }
    }
  } catch (e) { debugLog('status-line', 'cost tracker read failed — cost section omitted from status line', e); }

  const line2 = `${DIM}${line2Parts.join(` ${DIM}·${RST} `)}${RST}`;

  process.stdout.write(`${line1}\n${line2}\n`);
}
