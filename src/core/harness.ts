/**
 * Tenetx v1 — Core Harness (prepareHarness entry point)
 *
 * v1 설계: v1-bootstrap 기반 세션 오케스트레이션.
 * philosophy/scope/pack 의존 제거. Profile + Preset Manager + Rule Renderer.
 *
 * Module Structure:
 * - Lines 1-70: Imports, utility helpers
 * - Lines 70-220: injectSettings — Claude Code settings.json injection
 * - Lines 220-400: Agent/skill installation helpers
 * - Lines 400-550: Rule file injection, gitignore, compound memory
 * - Lines 550+: prepareHarness — main orchestration
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnv, generateClaudeRuleFiles, registerTmuxBindings } from './config-injector.js';
import { createLogger } from './logger.js';
import { COMPOUND_HOME, ME_BEHAVIOR, ME_DIR, ME_RULES, ME_SOLUTIONS, SESSIONS_DIR, STATE_DIR, TENETX_HOME } from './paths.js';
import { RULE_FILE_CAPS } from '../hooks/shared/injection-caps.js';
import {
  acquireLock,
  atomicWriteFileSync,
  CLAUDE_DIR,
  releaseLock,
  rollbackSettings,
  SETTINGS_BACKUP_PATH,
  SETTINGS_PATH,
} from './settings-lock.js';
import { ConfigError } from './errors.js';
import { bootstrapV1Session, ensureV1Directories, type V1BootstrapResult } from './v1-bootstrap.js';

const log = createLogger('harness');

// ── v1 HarnessContext (simplified) ──

export interface V1HarnessContext {
  cwd: string;
  inTmux: boolean;
  v1: V1BootstrapResult;
}

/** tenetx 패키지 루트 */
function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** 최초 실행 여부: ~/.tenetx/ 디렉토리가 없으면 true */
export function isFirstRun(): boolean {
  return !fs.existsSync(TENETX_HOME);
}

/** 레거시 + v1 디렉토리 구조 초기화 */
function ensureDirectories(): void {
  // 레거시 compound 디렉토리 (기존 훅/MCP가 아직 참조)
  const legacyDirs = [
    COMPOUND_HOME,
    ME_DIR,
    ME_SOLUTIONS,
    ME_BEHAVIOR,
    ME_RULES,
    SESSIONS_DIR,
    STATE_DIR,
    path.join(COMPOUND_HOME, 'handoffs'),
    path.join(COMPOUND_HOME, 'plans'),
    path.join(COMPOUND_HOME, 'specs'),
    path.join(COMPOUND_HOME, 'skills'),
    path.join(COMPOUND_HOME, 'artifacts', 'ask'),
    path.join(ME_DIR, 'skills'),
  ];
  for (const dir of legacyDirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // v1 디렉토리
  ensureV1Directories();
}

export { rollbackSettings };

// ── Settings Injection ──

const TENETX_PERMISSION_RULES = new Set([
  '# tenetx-managed',
  'Bash(rm -rf *)',
  'Bash(git push --force*)',
  'Bash(git reset --hard*)',
]);

function stripTenetxManagedRules(rules: string[]): string[] {
  return rules.filter(r => !TENETX_PERMISSION_RULES.has(r));
}

/** Claude Code settings.json에 하네스 환경변수 + 훅 주입 */
function injectSettings(env: Record<string, string>, v1Result: V1BootstrapResult): void {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  acquireLock();

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      fs.copyFileSync(SETTINGS_PATH, SETTINGS_BACKUP_PATH);
    } catch (e) {
      log.debug('settings.json 파싱 실패, 빈 설정으로 시작',
        new ConfigError('settings.json parse failed', { configPath: SETTINGS_PATH, cause: e }));
    }
  }

  // 환경변수 병합
  const existingEnv = (settings.env as Record<string, string>) ?? {};
  settings.env = { ...existingEnv, ...env };

  // statusLine
  const existingStatusLine = settings.statusLine as { type?: string; command?: string } | undefined;
  const isTenetxStatusLine =
    !existingStatusLine ||
    !existingStatusLine.command ||
    existingStatusLine.command.startsWith('tenetx');
  if (isTenetxStatusLine) {
    settings.statusLine = {
      type: 'command',
      command: 'tenetx me',
    };
  }

  // tenetx 훅 주입: hooks.json → settings.json (CLAUDE_PLUGIN_ROOT 치환)
  const pkgRoot = getPackageRoot();
  const hooksConfig = (settings.hooks as Record<string, unknown[]>) ?? {};

  function isCHHook(entry: Record<string, unknown>): boolean {
    const distHooksPath = path.join(pkgRoot, 'dist', 'hooks');
    function matchesHookPath(cmd: string): boolean {
      return cmd.includes(distHooksPath) || /[\\/]dist[\\/]hooks[\\/].*\.js/.test(cmd);
    }
    if (typeof entry.command === 'string' && matchesHookPath(entry.command)) return true;
    const hooks = entry.hooks as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(hooks)) {
      return hooks.some((h) => typeof h.command === 'string' && matchesHookPath(h.command));
    }
    return false;
  }

  // 기존 tenetx 훅 제거 (재주입 전 정리)
  for (const [event, entries] of Object.entries(hooksConfig)) {
    if (Array.isArray(entries)) {
      const filtered = entries.filter((h) => !isCHHook(h as Record<string, unknown>));
      if (filtered.length === 0) {
        delete hooksConfig[event];
      } else {
        hooksConfig[event] = filtered;
      }
    }
  }

  // hooks.json에서 훅을 읽어 settings.json에 직접 주입
  const hooksJsonPath = path.join(pkgRoot, 'hooks', 'hooks.json');
  try {
    if (fs.existsSync(hooksJsonPath)) {
      const hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8'));
      const hooksData = hooksJson.hooks as Record<string, unknown[]> | undefined;
      if (hooksData) {
        // ${CLAUDE_PLUGIN_ROOT} → 실제 패키지 루트 경로로 치환
        const resolved = JSON.parse(
          JSON.stringify(hooksData).replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pkgRoot),
        );
        for (const [event, handlers] of Object.entries(resolved as Record<string, unknown[]>)) {
          if (!hooksConfig[event]) hooksConfig[event] = [];
          (hooksConfig[event] as unknown[]).push(...handlers);
        }
      }
    }
  } catch (e) {
    log.debug('hooks.json 로드 실패', e);
  }

  settings.hooks = Object.keys(hooksConfig).length > 0 ? hooksConfig : undefined;
  if (settings.hooks && Object.keys(settings.hooks as Record<string, unknown>).length === 0) {
    delete settings.hooks;
  }

  // v1 Profile 기반 보안 정책 (trust policy → permissions)
  if (v1Result.session) {
    const trust = v1Result.session.effective_trust_policy;
    const permissions = (settings.permissions as Record<string, string[]>) ?? {};
    const existingDeny = stripTenetxManagedRules(permissions.deny ?? []);

    if (trust === '가드레일 우선') {
      permissions.deny = [
        ...existingDeny,
        '# tenetx-managed',
        'Bash(rm -rf *)',
        'Bash(git push --force*)',
        'Bash(git reset --hard*)',
      ];
    } else if (trust === '승인 완화') {
      const existingAsk = stripTenetxManagedRules(permissions.ask ?? []);
      permissions.ask = [
        ...existingAsk,
        '# tenetx-managed',
        'Bash(rm -rf *)',
        'Bash(git push --force*)',
      ];
      permissions.deny = existingDeny.length > 0 ? existingDeny : undefined as unknown as string[];
    }
    // '완전 신뢰 실행': 추가 제한 없음

    if (!permissions.deny?.length) delete permissions.deny;
    if (!permissions.ask?.length) delete permissions.ask;
    if (Object.keys(permissions).length > 0) {
      settings.permissions = permissions;
    }
  }

  try {
    atomicWriteFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (err) {
    rollbackSettings();
    throw err;
  } finally {
    releaseLock();
  }
}

// ── Agent Installation ──

function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

const AGENT_HASHES_PATH = path.join(COMPOUND_HOME, 'state', 'agent-hashes.json');

function loadAgentHashes(): Record<string, string> {
  try {
    if (fs.existsSync(AGENT_HASHES_PATH)) {
      return JSON.parse(fs.readFileSync(AGENT_HASHES_PATH, 'utf-8'));
    }
  } catch (e) {
    log.debug('에이전트 해시 맵 로드 실패', e);
  }
  return {};
}

function saveAgentHashes(hashes: Record<string, string>): void {
  try {
    fs.mkdirSync(path.dirname(AGENT_HASHES_PATH), { recursive: true });
    fs.writeFileSync(AGENT_HASHES_PATH, JSON.stringify(hashes, null, 2));
  } catch (e) {
    log.debug('에이전트 해시 맵 저장 실패', e);
  }
}

function installAgentsFromDir(
  sourceDir: string,
  targetDir: string,
  prefix: string,
  hashes: Record<string, string>,
): void {
  if (!fs.existsSync(sourceDir)) return;

  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const src = path.join(sourceDir, file);
    const dstName = `${prefix}${file}`;
    const dst = path.join(targetDir, dstName);
    const content = fs.readFileSync(src, 'utf-8');
    const newHash = contentHash(content);

    if (fs.existsSync(dst)) {
      const existing = fs.readFileSync(dst, 'utf-8');
      if (existing === content) {
        hashes[dstName] = newHash;
        continue;
      }
      const recordedHash = hashes[dstName];
      if (recordedHash && contentHash(existing) !== recordedHash) {
        log.debug(`에이전트 파일 보호: ${dstName} (사용자 수정 감지)`);
        continue;
      }
      if (!recordedHash && !existing.includes('<!-- tenetx-managed -->')) {
        log.debug(`에이전트 파일 보호: ${dstName} (레거시 사용자 수정 감지)`);
        continue;
      }
    }

    fs.writeFileSync(dst, content);
    hashes[dstName] = newHash;
  }
}

/** 에이전트 정의 파일 설치 (패키지 내장만) */
function installAgents(cwd: string): void {
  const pkgRoot = getPackageRoot();
  const targetDir = path.join(cwd, '.claude', 'agents');
  fs.mkdirSync(targetDir, { recursive: true });

  const hashes = loadAgentHashes();
  try {
    installAgentsFromDir(path.join(pkgRoot, 'agents'), targetDir, 'ch-', hashes);
    saveAgentHashes(hashes);
  } catch (e) {
    log.debug('에이전트 설치 실패', e);
  }
}

// ── Slash Commands ──

function buildCommandContent(skillContent: string, skillName: string): string {
  const descMatch = skillContent.match(/description:\s*(.+)/);
  const desc = descMatch?.[1]?.trim() ?? skillName;
  return `# ${desc}\n\n<!-- tenetx-managed -->\n\nActivate Tenetx "${skillName}" mode for the task: $ARGUMENTS\n\n${skillContent}`;
}

function safeWriteCommand(cmdPath: string, content: string): boolean {
  if (fs.existsSync(cmdPath)) {
    const existing = fs.readFileSync(cmdPath, 'utf-8');
    if (!existing.includes('<!-- tenetx-managed -->')) return false;
  }
  fs.writeFileSync(cmdPath, content);
  return true;
}

function cleanupStaleCommands(commandsDir: string, validFiles: Set<string>): number {
  if (!fs.existsSync(commandsDir)) return 0;
  let removed = 0;
  for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'))) {
    if (validFiles.has(file)) continue;
    const filePath = path.join(commandsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('<!-- tenetx-managed -->')) {
        fs.unlinkSync(filePath);
        removed++;
      }
    } catch (e) {
      log.debug(`stale 명령 파일 정리 실패: ${file}`, e);
    }
  }
  return removed;
}

/** 스킬을 Claude Code 슬래시 명령으로 설치 (패키지 내장만) */
function installSlashCommands(_cwd: string): void {
  const pkgRoot = getPackageRoot();
  let skillsDir = path.join(pkgRoot, 'commands');
  if (!fs.existsSync(skillsDir)) {
    skillsDir = path.join(pkgRoot, 'skills');
  }
  const homeDir = os.homedir();
  const globalCommandsDir = path.join(homeDir, '.claude', 'commands', 'tenetx');

  if (!fs.existsSync(skillsDir)) return;
  fs.mkdirSync(globalCommandsDir, { recursive: true });

  const skills = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'));
  const validGlobalFiles = new Set<string>();
  let installed = 0;

  for (const file of skills) {
    validGlobalFiles.add(file);
    const skillName = file.replace('.md', '');
    const skillContent = fs.readFileSync(path.join(skillsDir, file), 'utf-8');
    const cmdContent = buildCommandContent(skillContent, skillName);
    if (safeWriteCommand(path.join(globalCommandsDir, file), cmdContent)) {
      installed++;
    }
  }

  const removedGlobal = validGlobalFiles.size > 0
    ? cleanupStaleCommands(globalCommandsDir, validGlobalFiles)
    : 0;

  log.debug(`슬래시 명령 설치: ${installed}개 설치, ${removedGlobal}개 정리`);
}

// ── Rule File Injection ──

function injectClaudeRuleFiles(cwd: string, ruleFiles: Record<string, string>): void {
  const PER_RULE_CAP = RULE_FILE_CAPS.perRuleFile;
  const TOTAL_CAP = RULE_FILE_CAPS.totalRuleFiles;

  const globalRulesDir = path.join(os.homedir(), '.claude', 'rules');
  const projectRulesDir = path.join(cwd, '.claude', 'rules');
  fs.mkdirSync(globalRulesDir, { recursive: true });
  fs.mkdirSync(projectRulesDir, { recursive: true });

  let totalWritten = 0;
  for (const [filename, content] of Object.entries(ruleFiles)) {
    const capped = content.length > PER_RULE_CAP
      ? `${content.slice(0, PER_RULE_CAP)}\n... (capped at rule file limit)\n`
      : content;
    if (totalWritten + capped.length > TOTAL_CAP) {
      log.debug(`rules/ 총량 캡 도달, ${filename} 생략`);
      break;
    }
    const isUserPreference = filename.startsWith('forge-');
    const targetDir = isUserPreference ? globalRulesDir : projectRulesDir;
    fs.writeFileSync(path.join(targetDir, filename), capped);
    totalWritten += capped.length;
  }

  // 마이그레이션: 이전 위치 파일 제거
  const legacyPath = path.join(cwd, '.claude', 'compound-rules.md');
  if (fs.existsSync(legacyPath)) {
    try { fs.unlinkSync(legacyPath); } catch (e) { log.debug('레거시 규칙 파일 삭제 실패', e); }
  }

  // CLAUDE.md에서 이전 마커 블록 제거
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  const marker = '<!-- tenetx:start -->';
  const endMarker = '<!-- tenetx:end -->';
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    if (content.includes(marker)) {
      const regex = new RegExp(`\\n*${marker}[\\s\\S]*?${endMarker}\\n*`, 'g');
      const cleaned = content
        .replace(regex, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      fs.writeFileSync(claudeMdPath, cleaned ? `${cleaned}\n` : '');
    }
  }
}

// ── Compound Memory ──

function ensureCompoundMemory(cwd: string): void {
  try {
    const sanitized = cwd.replace(/\//g, '-').replace(/^-/, '');
    const memoryDir = path.join(os.homedir(), '.claude', 'projects', sanitized, 'memory');
    if (!fs.existsSync(memoryDir)) return;

    const memoryMdPath = path.join(memoryDir, 'MEMORY.md');
    const compoundPointer = '- [Compound Knowledge](compound-index.md) — accumulated patterns/solutions from past sessions';

    if (fs.existsSync(memoryMdPath)) {
      const content = fs.readFileSync(memoryMdPath, 'utf-8');
      if (content.includes('compound-index.md')) return;
      fs.writeFileSync(memoryMdPath, content.trimEnd() + '\n' + compoundPointer + '\n');
    }

    const indexPath = path.join(memoryDir, 'compound-index.md');
    const solutionsDir = path.join(os.homedir(), '.compound', 'me', 'solutions');
    let solutionCount = 0;
    try {
      solutionCount = fs.readdirSync(solutionsDir).filter(f => f.endsWith('.md')).length;
    } catch { /* solutions dir may not exist */ }

    const indexContent = [
      '---',
      'name: compound-knowledge-index',
      'description: Tenetx compound knowledge — use compound-search MCP tool to find relevant patterns',
      'type: reference',
      '---',
      '',
      `${solutionCount} accumulated solutions available via tenetx-compound MCP tools.`,
      '',
      'Use compound-search to find relevant patterns before starting tasks.',
      'Use compound-read to get full solution content.',
    ].join('\n');
    fs.writeFileSync(indexPath, indexContent);
  } catch {
    // auto memory 접근 실패는 무시
  }
}

// ── Gitignore ──

function ensureGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  const tenetxEntries = [
    '# Tenetx (auto-generated, do not commit)',
    '.claude/agents/ch-*.md',
    '.claude/agents/pack-*.md',
    '.claude/rules/project-context.md',
    '.claude/rules/routing.md',
    '.claude/rules/forge-*.md',
    '.claude/rules/v1-rules.md',
    '.compound/project-map.json',
    '.claude/commands/tenetx/',
    '.compound/notepad.md',
  ];
  const marker = '.claude/agents/ch-*.md';

  try {
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8');
      if (content.includes(marker)) return;
    }
    const newContent = `${content.trimEnd()}\n\n${tenetxEntries.join('\n')}\n`;
    fs.writeFileSync(gitignorePath, newContent);
  } catch {
    // .gitignore 쓰기 실패는 무시
  }
}

// ── Main Harness ──

/** ~/.compound/ → ~/.tenetx/ 스토리지 마이그레이션 (v5.1) */
function migrateCompoundToTenetx(): void {
  const home = os.homedir();
  // 테스트 환경 감지: 실제 홈 디렉토리가 아닌 /tmp/ 등에서는 마이그레이션 스킵
  if (home.startsWith('/tmp/') || home.includes('tenetx-test')) return;

  const compoundHome = path.join(home, '.compound');
  const tenetxHome = path.join(home, '.tenetx');

  // 이미 symlink면 마이그레이션 완료 상태
  try {
    if (fs.lstatSync(compoundHome).isSymbolicLink()) return;
  } catch { /* ~/.compound 없음 — 아래에서 symlink 생성 */ }

  // ~/.compound/가 실제 디렉토리면 내용을 ~/.tenetx/로 복사
  if (fs.existsSync(compoundHome) && fs.statSync(compoundHome).isDirectory()) {
    fs.mkdirSync(tenetxHome, { recursive: true });

    try {
      const entries = fs.readdirSync(compoundHome, { withFileTypes: true });
      for (const entry of entries) {
        const src = path.join(compoundHome, entry.name);
        const dest = path.join(tenetxHome, entry.name);
        if (fs.existsSync(dest)) continue; // 이미 있으면 skip
        if (entry.isDirectory()) {
          fs.cpSync(src, dest, { recursive: true });
        } else if (entry.isFile()) {
          fs.copyFileSync(src, dest);
        }
      }
    } catch (e) {
      log.debug('migrateCompoundToTenetx: 파일 복사 중 오류', e);
    }

    // 원본 디렉토리를 백업 후 symlink로 교체
    const backupPath = compoundHome + '.bak';
    try {
      if (!fs.existsSync(backupPath)) {
        fs.renameSync(compoundHome, backupPath);
        fs.symlinkSync(tenetxHome, compoundHome, 'dir');
        log.debug('migrateCompoundToTenetx: ~/.compound → ~/.tenetx symlink 생성 완료');
      }
    } catch (e) {
      log.debug('migrateCompoundToTenetx: symlink 생성 실패 — 기존 디렉토리 유지', e);
    }
  }

  // ~/.compound가 없으면 바로 symlink 생성
  if (!fs.existsSync(compoundHome)) {
    try { fs.symlinkSync(tenetxHome, compoundHome, 'dir'); } catch { /* ignore */ }
  }
}

/** 메인 하네스 준비 함수 (v1) */
export async function prepareHarness(cwd: string): Promise<V1HarnessContext> {
  try {
    // 0. 스토리지 마이그레이션 (v5.1: ~/.compound/ → ~/.tenetx/)
    migrateCompoundToTenetx();

    // 1. 디렉토리 구조 보장
    ensureDirectories();

    // 2. v1 Session Bootstrap (legacy 감지 → profile 로드 → preset 합성 → rule 렌더)
    const v1Result = bootstrapV1Session();

    if (v1Result.needsOnboarding) {
      log.debug('v1: 온보딩 필요 — tenetx setup 실행 안내');
    }

    if (v1Result.legacyBackupPath) {
      log.debug(`v1: 레거시 프로필 백업 완료 → ${v1Result.legacyBackupPath}`);
    }

    if (v1Result.session) {
      const { session } = v1Result;
      log.debug(`v1 세션 시작: ${session.quality_pack}/${session.autonomy_pack}, trust=${session.effective_trust_policy}`);
      for (const w of session.warnings) {
        // mismatch 경고는 사용자에게 직접 표시
        if (w.includes('mismatch')) {
          console.error(`[tenetx] ${w}`);
        }
        log.debug(`v1 경고: ${w}`);
      }
    }

    if (v1Result.mismatch?.quality_mismatch || v1Result.mismatch?.autonomy_mismatch) {
      log.debug(`v1 mismatch 감지: quality=${v1Result.mismatch.quality_score}, autonomy=${v1Result.mismatch.autonomy_score}`);
    }

    // 3. 환경 확인
    const inTmux = !!process.env.TMUX;

    // 4. Claude Code 설정 주입 (환경변수 + trust 기반 permissions)
    const env = buildEnv(cwd, v1Result.session?.session_id);
    injectSettings(env, v1Result);

    // 5. 에이전트 설치
    installAgents(cwd);

    // 6. 규칙 파일 생성 및 주입 (v1 부트스트랩 결과의 renderedRules를 직접 전달)
    const ruleFiles = generateClaudeRuleFiles(cwd, v1Result.renderedRules);
    injectClaudeRuleFiles(cwd, ruleFiles);

    // 7. 슬래시 명령 설치
    installSlashCommands(cwd);

    // 8. tmux 바인딩 등록
    if (inTmux) {
      await registerTmuxBindings();
    }

    // 9. .gitignore 등록
    ensureGitignore(cwd);

    // 10. Auto memory에 compound 포인터 추가
    ensureCompoundMemory(cwd);

    // 11. 세션 로그 시작 (레거시 호환)
    // v1은 session-state-store에 저장하지만, 레거시 세션 로거도 유지
    try {
      const { startSessionLog: legacySessionLog } = await import('./session-logger.js');
      // 레거시 세션 로거는 HarnessContext를 기대하므로 최소 호환 객체 제공
      const legacyContext = {
        philosophy: { name: 'v1', version: '1.0.0', author: 'tenetx', principles: {} },
        philosophySource: 'default' as const,
        scope: {
          me: { philosophyPath: '', solutionCount: 0, ruleCount: 0 },
          project: { path: cwd, solutionCount: 0 },
          summary: `v1(${v1Result.session?.quality_pack ?? 'unknown'})`,
        },
        cwd,
        inTmux,
      };
      legacySessionLog(legacyContext);
    } catch { /* 세션 로그 실패는 무시 */ }

    // 12. Compound staleness guard
    try {
      const stalenessDays = Number(process.env.COMPOUND_STALENESS_DAYS) || 3;
      const stalenessMs = stalenessDays * 24 * 60 * 60 * 1000;
      const lastExtractionPath = path.join(STATE_DIR, 'last-extraction.json');
      if (fs.existsSync(lastExtractionPath)) {
        const lastExtraction = JSON.parse(fs.readFileSync(lastExtractionPath, 'utf-8'));
        const extractedAt = lastExtraction.lastExtractedAt ?? lastExtraction.lastRunAt;
        const lastRunMs = extractedAt ? new Date(extractedAt).getTime() : Number.NaN;
        if (Number.isFinite(lastRunMs)) {
          const elapsed = Date.now() - lastRunMs;
          if (elapsed > stalenessMs) {
            const pendingPath = path.join(STATE_DIR, 'pending-compound.json');
            if (!fs.existsSync(pendingPath)) {
              fs.writeFileSync(pendingPath, JSON.stringify({
                reason: 'staleness',
                detectedAt: new Date().toISOString(),
                daysSinceLastRun: Math.floor(elapsed / (24 * 60 * 60 * 1000)),
              }, null, 2));
            }
          }
        }
      }
    } catch (e) {
      log.debug('Staleness check failed (non-fatal)', e);
    }

    return { cwd, inTmux, v1: v1Result };
  } catch (err) {
    rollbackSettings();
    throw err;
  }
}
