/**
 * Tenetx — Core Harness (prepareHarness entry point)
 *
 * Module Structure:
 * - Lines 1-65: Imports, utility helpers (getPackageRoot, isFirstRun, ensureDirectories)
 * - Lines 66-150: injectSettings — Claude Code settings.json injection & hook cleanup
 * - Lines 150-250: contentHash, agent hash persistence, forge overlay helpers
 * - Lines 250-350: installAgentsFromDir — hash-based agent copy with user-edit protection
 * - Lines 350-500: installAgents, injectClaudeRuleFiles, ensureGitignore, slash command helpers
 * - Lines 500-575: installSlashCommands — global + pack skill installation
 * - Lines 575-795: prepareHarness — main orchestration (dirs, philosophy, forge, agents, rules, auto-learn)
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnv, generateClaudeRuleFiles, registerTmuxBindings } from './config-injector.js';
import { loadGlobalConfig } from './global-config.js';
import { createLogger } from './logger.js';
import { autoSyncIfNeeded, loadPackConfigs } from './pack-config.js';
import { COMPOUND_HOME, ME_BEHAVIOR, ME_DIR, ME_RULES, ME_SOLUTIONS, PACKS_DIR, SESSIONS_DIR, STATE_DIR } from './paths.js';
import { RULE_FILE_CAPS } from '../hooks/shared/injection-caps.js';
import { initDefaultPhilosophy, loadPhilosophyForProject } from './philosophy-loader.js';
import { resolveScope } from './scope-resolver.js';
import { startSessionLog } from './session-logger.js';
import {
  acquireLock,
  atomicWriteFileSync,
  CLAUDE_DIR,
  releaseLock,
  rollbackSettings,
  SETTINGS_BACKUP_PATH,
  SETTINGS_PATH,
} from './settings-lock.js';
import type { HarnessContext } from './types.js';
import { ConfigError } from './errors.js';

const log = createLogger('harness');

/** tenetx 패키지 루트 */
function getPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** 최초 실행 여부: ~/.compound/ 디렉토리가 없으면 true */
export function isFirstRun(): boolean {
  return !fs.existsSync(COMPOUND_HOME);
}

/** ~/.compound/ 디렉토리 구조 초기화 */
function ensureDirectories(): void {
  const dirs = [
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
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export { rollbackSettings };

/**
 * # tenetx-managed 마커 이후의 모든 항목을 제거하여
 * permissions.deny/ask의 무한 누적을 방지.
 */
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
function injectSettings(env: Record<string, string>): void {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  acquireLock();

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      // 파싱 성공한 경우에만 백업 생성 (깨진 파일 백업 방지)
      fs.copyFileSync(SETTINGS_PATH, SETTINGS_BACKUP_PATH);
    } catch (e) {
      log.debug('settings.json 파싱 실패, 빈 설정으로 시작',
        new ConfigError('settings.json parse failed', { configPath: SETTINGS_PATH, cause: e }));
    }
  }

  // 기존 env에 하네스 환경변수 병합
  const existingEnv = (settings.env as Record<string, string>) ?? {};
  settings.env = { ...existingEnv, ...env };

  // statusLine: 기존에 tenetx 관련이 아닌 사용자 커스텀 값이 있으면 덮어쓰지 않음.
  // command가 없거나 빈 문자열인 경우는 의도된 커스텀 설정이 아닌 것으로 간주하여 tenetx로 교체.
  const existingStatusLine = settings.statusLine as { type?: string; command?: string } | undefined;
  const isTenetxStatusLine =
    !existingStatusLine ||
    !existingStatusLine.command || // undefined, null, '' 모두 교체 대상
    existingStatusLine.command.startsWith('tenetx');
  if (isTenetxStatusLine) {
    settings.statusLine = {
      type: 'command',
      command: 'tenetx me',
    };
  }

  // 기존 tenetx 훅 정리 (이전 버전에서 settings.json에 주입한 잔재 제거)
  // 훅 등록은 hooks/hooks.json 플러그인 시스템이 담당 — settings.json에는 추가하지 않음
  const pkgRoot = getPackageRoot();
  const hooksConfig = (settings.hooks as Record<string, unknown[]>) ?? {};

  /** tenetx 훅인지 판별 (matcher 래핑 여부 무관) */
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
  settings.hooks = Object.keys(hooksConfig).length > 0 ? hooksConfig : undefined;
  // undefined면 JSON.stringify에서 키 자체가 제거됨

  // 불필요한 키 정리
  if (settings.hooks && Object.keys(settings.hooks as Record<string, unknown>).length === 0) {
    delete settings.hooks;
  }

  // Forge 프로필 기반 보안 정책 생성
  try {
    const profilePath = path.join(os.homedir(), '.compound', 'me', 'forge-profile.json');
    const profile = fs.existsSync(profilePath) ? JSON.parse(fs.readFileSync(profilePath, 'utf-8')) : null;
    if (profile) {
      const risk = profile.dimensions.riskTolerance ?? 0.5;
      const permissions = (settings.permissions as Record<string, string[]>) ?? {};
      // 기존 non-tenetx deny 규칙 보존: # tenetx-managed 마커 이후의 모든 항목도 제거
      const existingDeny = stripTenetxManagedRules(permissions.deny ?? []);

      if (risk <= 0.3) {
        // Conservative: 위험 명령 차단
        permissions.deny = [
          ...existingDeny,
          '# tenetx-managed',
          'Bash(rm -rf *)',
          'Bash(git push --force*)',
          'Bash(git reset --hard*)',
        ];
      } else if (risk <= 0.5) {
        // Cautious: 위험 명령 확인 요청
        const existingAsk = stripTenetxManagedRules(permissions.ask ?? []);
        permissions.ask = [
          ...existingAsk,
          '# tenetx-managed',
          'Bash(rm -rf *)',
          'Bash(git push --force*)',
        ];
        permissions.deny = existingDeny.length > 0 ? existingDeny : undefined as unknown as string[];
      }
      // risk > 0.5: 추가 제한 없음

      // undefined 키 정리
      if (!permissions.deny?.length) delete permissions.deny;
      if (!permissions.ask?.length) delete permissions.ask;
      if (Object.keys(permissions).length > 0) {
        settings.permissions = permissions;
      }
    }
  } catch { /* forge profile 미존재 시 무시 */ }

  try {
    atomicWriteFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (err) {
    // 쓰기 실패 시 백업에서 자동 복원
    rollbackSettings();
    throw err;
  } finally {
    releaseLock();
  }
}

/** 콘텐츠의 SHA-256 해시 (첫 12자) */
function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/** 에이전트 해시 맵 경로 */
const AGENT_HASHES_PATH = path.join(COMPOUND_HOME, 'state', 'agent-hashes.json');

/** 에이전트 해시 맵 로드 */
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

/** 에이전트 해시 맵 저장 */
function saveAgentHashes(hashes: Record<string, string>): void {
  try {
    fs.mkdirSync(path.dirname(AGENT_HASHES_PATH), { recursive: true });
    fs.writeFileSync(AGENT_HASHES_PATH, JSON.stringify(hashes, null, 2));
  } catch (e) {
    log.debug('에이전트 해시 맵 저장 실패', e);
  }
}

/** forge 오버레이 맵 타입 (agentName -> 오버레이) */
type OverlayMap = Map<string, { behaviorModifiers: string[]; parameters: Record<string, number> }>;

/** forge 스킬 오버레이 맵 타입 (skillName -> 오버레이) */
type SkillOverlayMap = Map<
  string,
  { behaviorModifiers: string[]; parameters: Record<string, number | string | boolean> }
>;

/** 에이전트 콘텐츠에 forge 오버레이를 적용 */
function applyForgeOverlay(content: string, agentName: string, overlayMap: OverlayMap): string {
  const overlay = overlayMap.get(agentName);
  if (!overlay || overlay.behaviorModifiers.length === 0) return content;

  // 기존 오버레이 제거
  const cleaned = content.replace(
    /\n*<!-- forge-overlay-start -->[\s\S]*?<!-- forge-overlay-end -->\n*/g,
    '',
  );

  const overlayLines = [
    '',
    '<!-- forge-overlay-start -->',
    '## Forge Profile Tuning',
    '',
    `Strictness: ${overlay.parameters.strictness.toFixed(2)} | ` +
      `Verbosity: ${overlay.parameters.verbosity.toFixed(2)} | ` +
      `Autonomy: ${overlay.parameters.autonomy.toFixed(2)} | ` +
      `Depth: ${overlay.parameters.depth.toFixed(2)}`,
    '',
    '### Behavioral Directives',
  ];
  for (const modifier of overlay.behaviorModifiers) {
    overlayLines.push(`- ${modifier}`);
  }
  overlayLines.push('<!-- forge-overlay-end -->');

  // </Agent_Prompt> 직전에 삽입
  const insertPoint = cleaned.lastIndexOf('</Agent_Prompt>');
  if (insertPoint >= 0) {
    return `${cleaned.slice(0, insertPoint)}${overlayLines.join('\n')}\n\n${cleaned.slice(insertPoint)}`;
  }

  // Agent_Prompt 태그가 없으면 끝에 추가
  return `${cleaned}\n${overlayLines.join('\n')}\n`;
}

/** 스킬 콘텐츠에 forge 오버레이를 적용 */
function applySkillForgeOverlay(
  content: string,
  skillName: string,
  overlayMap: SkillOverlayMap,
): string {
  const overlay = overlayMap.get(skillName);
  if (!overlay || overlay.behaviorModifiers.length === 0) return content;

  // 기존 오버레이 제거
  const cleaned = content.replace(
    /\n*<!-- forge-overlay-start -->[\s\S]*?<!-- forge-overlay-end -->\n*/g,
    '',
  );

  const paramLine = Object.entries(overlay.parameters)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? (v as number).toFixed(2) : v}`)
    .join(' | ');

  const overlayLines = [
    '',
    '<!-- forge-overlay-start -->',
    '## Forge Profile Tuning',
    '',
    paramLine,
    '',
    '### Behavioral Directives',
  ];
  for (const modifier of overlay.behaviorModifiers) {
    overlayLines.push(`- ${modifier}`);
  }
  overlayLines.push('<!-- forge-overlay-end -->');

  // YAML 프론트매터 직후에 삽입 (---\n...\n---\n 패턴)
  const frontmatterEnd = content.match(/^---\n[\s\S]*?\n---\n/);
  if (frontmatterEnd) {
    const idx = frontmatterEnd[0].length;
    return `${cleaned.slice(0, idx)}${overlayLines.join('\n')}\n\n${cleaned.slice(idx)}`;
  }

  // 프론트매터가 없으면 앞에 추가
  return `${overlayLines.join('\n')}\n\n${cleaned}`;
}

/** 에이전트 소스 디렉토리에서 대상 디렉토리로 복사 (해시 기반 보호) */
function installAgentsFromDir(
  sourceDir: string,
  targetDir: string,
  prefix: string,
  hashes: Record<string, string>,
  overlayMap?: OverlayMap,
): void {
  if (!fs.existsSync(sourceDir)) return;

  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const src = path.join(sourceDir, file);
    const dstName = `${prefix}${file}`;
    const dst = path.join(targetDir, dstName);
    let content = fs.readFileSync(src, 'utf-8');

    // forge 오버레이 적용
    if (overlayMap && overlayMap.size > 0) {
      const agentName = file.replace('.md', '');
      content = applyForgeOverlay(content, agentName, overlayMap);
    }

    const newHash = contentHash(content);

    if (fs.existsSync(dst)) {
      const existing = fs.readFileSync(dst, 'utf-8');
      if (existing === content) {
        hashes[dstName] = newHash;
        continue;
      }
      // 오버레이 부분 제외 후 원본 비교로 사용자 수정 판별
      const stripOverlay = (s: string) =>
        s.replace(/\n*<!-- forge-overlay-start -->[\s\S]*?<!-- forge-overlay-end -->\n*/g, '');
      const existingStripped = stripOverlay(existing);
      const sourceOriginal = fs.readFileSync(src, 'utf-8');
      const recordedHash = hashes[dstName];
      if (recordedHash && contentHash(existingStripped) !== contentHash(sourceOriginal)) {
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

/** 에이전트 정의 파일 설치 — 패키지 내장 + 연결된 팩에서 프로젝트 .claude/agents/ 에 복사 */
function installAgents(cwd: string, overlayMap?: OverlayMap): void {
  const pkgRoot = getPackageRoot();
  const targetDir = path.join(cwd, '.claude', 'agents');

  fs.mkdirSync(targetDir, { recursive: true });

  const hashes = loadAgentHashes();

  try {
    // 1. 패키지 내장 에이전트 (ch- 프리픽스)
    installAgentsFromDir(path.join(pkgRoot, 'agents'), targetDir, 'ch-', hashes, overlayMap);

    // 2. 연결된 팩 에이전트 (pack-{name}- 프리픽스)
    const connectedPacks = loadPackConfigs(cwd);
    for (const pack of connectedPacks) {
      const nsDir = path.join(cwd, '.compound', 'packs', pack.name, 'agents');
      const globalDir = path.join(PACKS_DIR, pack.name, 'agents');
      const agentDir = fs.existsSync(nsDir) ? nsDir : globalDir;
      installAgentsFromDir(agentDir, targetDir, `pack-${pack.name}-`, hashes, overlayMap);
    }

    saveAgentHashes(hashes);
  } catch (e) {
    log.debug('에이전트 설치 실패', e);
  }
}

/** 프로젝트 .claude/rules/ 에 다중 하네스 규칙 파일 작성 (Claude Code 자동 로드) */
/**
 * 규칙 파일을 적절한 위치에 작성.
 * - forge-* (사용자 성향 규칙) → ~/.claude/rules/ (글로벌, 모든 프로젝트에 적용)
 * - 나머지 (compound, security 등) → {cwd}/.claude/rules/ (프로젝트별)
 */
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
    // forge-* = 사용자 성향 → 글로벌, 나머지 → 프로젝트
    const isUserPreference = filename.startsWith('forge-');
    const targetDir = isUserPreference ? globalRulesDir : projectRulesDir;
    fs.writeFileSync(path.join(targetDir, filename), capped);
    totalWritten += capped.length;
  }

  // 마이그레이션: 이전 위치(.claude/compound-rules.md) 파일 제거
  const legacyPath = path.join(cwd, '.claude', 'compound-rules.md');
  if (fs.existsSync(legacyPath)) {
    try {
      fs.unlinkSync(legacyPath);
    } catch (e) {
      log.debug('레거시 규칙 파일 삭제 실패', e);
    }
  }

  // 기존 CLAUDE.md에서 이전 마커 블록 제거 (마이그레이션)
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

/**
 * Auto memory에 compound knowledge 포인터를 추가.
 * Claude Code가 세션 시작 시 MEMORY.md를 자동 로딩하므로,
 * compound 솔루션 존재를 인지하고 compound-search를 자발적으로 호출할 수 있게 됨.
 */
function ensureCompoundMemory(cwd: string): void {
  try {
    // Claude Code auto memory 경로: ~/.claude/projects/{sanitized-cwd}/memory/
    const sanitized = cwd.replace(/\//g, '-').replace(/^-/, '');
    const memoryDir = path.join(os.homedir(), '.claude', 'projects', sanitized, 'memory');

    if (!fs.existsSync(memoryDir)) return; // auto memory가 없으면 건너뜀

    const memoryMdPath = path.join(memoryDir, 'MEMORY.md');
    const compoundPointer = '- [Compound Knowledge](compound-index.md) — accumulated patterns/solutions from past sessions';

    // MEMORY.md에 이미 compound 포인터가 있는지 확인
    if (fs.existsSync(memoryMdPath)) {
      const content = fs.readFileSync(memoryMdPath, 'utf-8');
      if (content.includes('compound-index.md')) return; // 이미 있음
      // 포인터 추가 (기존 내용 보존)
      fs.writeFileSync(memoryMdPath, content.trimEnd() + '\n' + compoundPointer + '\n');
    }

    // compound-index.md 생성/업데이트
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
    // auto memory 접근 실패는 무시 (경로 없음, 권한 등)
  }
}

/** tenetx 생성 파일을 .gitignore에 등록 (팀 사용 시 충돌 방지) */
function ensureGitignore(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  const tenetxEntries = [
    '# Tenetx (auto-generated, do not commit)',
    '.claude/agents/ch-*.md',
    '.claude/agents/pack-*.md',
    '.claude/rules/security.md',
    '.claude/rules/golden-principles.md',
    '.claude/rules/anti-pattern.md',
    '.claude/rules/routing.md',
    '.claude/rules/compound.md',
    '.claude/rules/forge-*.md',
    '.compound/project-map.json',
    '.claude/commands/tenetx/',
    '.compound/notepad.md',
    '# pack.lock can be committed (team version consistency)',
    '!.compound/pack.lock',
  ];
  const marker = '.claude/agents/ch-*.md';

  try {
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8');
      // 이미 등록되어 있으면 스킵
      if (content.includes(marker)) return;
    }
    const newContent = `${content.trimEnd()}\n\n${tenetxEntries.join('\n')}\n`;
    fs.writeFileSync(gitignorePath, newContent);
  } catch {
    // .gitignore 쓰기 실패는 무시 (권한 등)
  }
}

/** 스킬 파일을 슬래시 명령 형식으로 변환 */
function buildCommandContent(skillContent: string, skillName: string): string {
  const descMatch = skillContent.match(/description:\s*(.+)/);
  const desc = descMatch?.[1]?.trim() ?? skillName;
  return `# ${desc}\n\n<!-- tenetx-managed -->\n\nActivate Tenetx "${skillName}" mode for the task: $ARGUMENTS\n\n${skillContent}`;
}

/** tenetx-managed 파일만 안전하게 쓰기 (사용자 수정 보호) */
function safeWriteCommand(cmdPath: string, content: string): boolean {
  if (fs.existsSync(cmdPath)) {
    const existing = fs.readFileSync(cmdPath, 'utf-8');
    if (!existing.includes('<!-- tenetx-managed -->')) return false;
  }
  fs.writeFileSync(cmdPath, content);
  return true;
}

/** tenetx-managed인데 현재 스킬 목록에 없는 파일 정리 */
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

/** 스킬을 Claude Code 슬래시 명령(/tenetx:xxx)으로 설치 */
function installSlashCommands(cwd: string, skillOverlayMap?: SkillOverlayMap): void {
  const pkgRoot = getPackageRoot();
  // commands/ (v2.1.10+) 또는 skills/ (v2.1.9 이하) 디렉토리 탐색
  let skillsDir = path.join(pkgRoot, 'commands');
  if (!fs.existsSync(skillsDir)) {
    skillsDir = path.join(pkgRoot, 'skills'); // fallback
  }
  const homeDir = os.homedir();

  // 글로벌: ~/.claude/commands/tenetx/ (모든 프로젝트에서 /tenetx:xxx 사용 가능)
  const globalCommandsDir = path.join(homeDir, '.claude', 'commands', 'tenetx');
  // 프로젝트 로컬: <project>/.claude/commands/tenetx/ (프로젝트별 팩 스킬)
  const localCommandsDir = path.join(cwd, '.claude', 'commands', 'tenetx');

  if (!fs.existsSync(skillsDir)) return;
  fs.mkdirSync(globalCommandsDir, { recursive: true });

  // 1. 코어 스킬 → 글로벌 설치
  const skills = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.md'));
  const validGlobalFiles = new Set<string>();
  let installed = 0;

  for (const file of skills) {
    validGlobalFiles.add(file);
    const skillName = file.replace('.md', '');
    let skillContent = fs.readFileSync(path.join(skillsDir, file), 'utf-8');
    // forge 스킬 오버레이 적용
    if (skillOverlayMap && skillOverlayMap.size > 0) {
      skillContent = applySkillForgeOverlay(skillContent, skillName, skillOverlayMap);
    }
    const cmdContent = buildCommandContent(skillContent, skillName);
    if (safeWriteCommand(path.join(globalCommandsDir, file), cmdContent)) {
      installed++;
    }
  }

  // 2. 연결된 팩의 스킬 → 프로젝트 로컬 설치 (/tenetx:pack-{name}-{skill})
  const validLocalFiles = new Set<string>();
  try {
    const connectedPacks = loadPackConfigs(cwd);
    if (connectedPacks.length > 0) {
      fs.mkdirSync(localCommandsDir, { recursive: true });
    }
    for (const pack of connectedPacks) {
      const localPackSkillsDir = path.join(cwd, '.compound', 'packs', pack.name, 'skills');
      const globalPackSkillsDir = path.join(PACKS_DIR, pack.name, 'skills');
      const packSkillsDir = fs.existsSync(localPackSkillsDir)
        ? localPackSkillsDir
        : globalPackSkillsDir;
      if (!fs.existsSync(packSkillsDir)) continue;
      const packSkills = fs.readdirSync(packSkillsDir).filter((f) => f.endsWith('.md'));
      for (const file of packSkills) {
        const fileName = `pack-${pack.name}-${file}`;
        validLocalFiles.add(fileName);
        const content = fs.readFileSync(path.join(packSkillsDir, file), 'utf-8');
        const skillName = `${pack.name}/${file.replace('.md', '')}`;
        const cmdContent = buildCommandContent(content, skillName);
        if (safeWriteCommand(path.join(localCommandsDir, fileName), cmdContent)) {
          installed++;
        }
      }
    }
  } catch (e) {
    log.debug('팩 스킬 로컬 설치 실패', e);
  }

  // 3. 삭제된 스킬 정리 (tenetx-managed 파일만)
  // validGlobalFiles가 비어있으면 cleanup 스킵 — postinstall이 만든 파일 보호
  const removedGlobal = validGlobalFiles.size > 0
    ? cleanupStaleCommands(globalCommandsDir, validGlobalFiles)
    : 0;
  const removedLocal = validLocalFiles.size > 0
    ? cleanupStaleCommands(localCommandsDir, validLocalFiles)
    : 0;

  log.debug(`슬래시 명령 설치: ${installed}개 설치, ${removedGlobal + removedLocal}개 정리`);
}

/** 메인 하네스 준비 함수 */
export async function prepareHarness(cwd: string): Promise<HarnessContext> {
  try {
    // 1. 디렉토리 구조 보장
    ensureDirectories();

    // 2. 기본 철학 초기화
    initDefaultPhilosophy();

    // 3. 철학 로드 (프로젝트별 우선, 글로벌 폴백)
    const { philosophy, source: philosophySource } = loadPhilosophyForProject(cwd);
    log.debug(`철학 로드: "${philosophy.name}" (source: ${philosophySource})`);

    // 4. 스코프 해석
    const scope = resolveScope(cwd, philosophySource);

    // 5. 모델 라우팅 설정 로드 (정적 테이블 — .claude/rules/routing.md로 대체)
    const globalConfig = loadGlobalConfig();
    const routingPreset = (globalConfig.modelRouting as string | undefined);

    // 6. 컨텍스트 구성
    const inTmux = !!process.env.TMUX;
    const context: HarnessContext = {
      philosophy,
      philosophySource,
      scope,
      cwd,
      inTmux,
      modelRouting: undefined,
      signalRoutingEnabled: false,
      routingPreset: routingPreset ?? 'default',
    };

    // 7. Claude Code 설정 주입 (환경변수 + 훅)
    const env = buildEnv(context);
    injectSettings(env);

    // 7.5. 프로젝트 팩트 스캔 → .claude/rules/project-context.md 생성
    // 사용자 성향은 인터뷰(forge)로만 결정 — 프로젝트 스캔은 팩트 수집만
    try {
      const { scanProject } = await import('../forge/scanner.js');
      const signals = scanProject(cwd);
      const contextLines: string[] = [
        '# Project Context (auto-detected by tenetx)',
        '<!-- tenetx-managed -->',
        '',
      ];
      // Language & Framework
      const stack: string[] = [];
      if (signals.dependencies.hasTypeChecker) stack.push('TypeScript');
      if (signals.codeStyle.testFramework.length > 0) stack.push(signals.codeStyle.testFramework.join(', '));
      if (signals.dependencies.hasLinter) stack.push('Linter');
      if (signals.dependencies.hasFormatter) stack.push('Formatter');
      if (stack.length > 0) contextLines.push(`- Stack: ${stack.join(', ')}`);
      // Git
      contextLines.push(`- Git: ${signals.git.totalCommits} commits, ${signals.git.branchStrategy} strategy`);
      if (signals.codeStyle.hasCI) contextLines.push('- CI: configured');
      if (signals.codeStyle.hasPreCommitHook) contextLines.push('- Pre-commit hooks: configured');
      if (signals.architecture.isMonorepo) contextLines.push('- Structure: monorepo');
      if (signals.dependencies.manager) contextLines.push(`- Package manager: ${signals.dependencies.manager}`);

      const contextPath = path.join(cwd, '.claude', 'rules', 'project-context.md');
      fs.mkdirSync(path.dirname(contextPath), { recursive: true });
      fs.writeFileSync(contextPath, contextLines.join('\n') + '\n');
      log.debug('프로젝트 팩트 생성: project-context.md');
    } catch (e) {
      log.debug('프로젝트 팩트 생성 실패', e);
    }

    // 8. Forge 프로필 로드 → 에이전트 오버레이 + 스킬 오버레이 + 튜닝된 규칙 생성
    let forgeOverlayMap: OverlayMap | undefined;
    let forgeSkillOverlayMap: SkillOverlayMap | undefined;
    let forgeTunedRules: Array<{ filename: string; content: string }> = [];
    try {
      const { loadForgeProfile } = await import('../forge/profile.js');
      const { generateConfig: forgeGenerateConfig } = await import('../forge/generator.js');
      const profile = loadForgeProfile(cwd);
      if (profile) {
        const forgeConfig = forgeGenerateConfig(profile.dimensions);
        // 에이전트 오버레이 맵 구성
        if (forgeConfig.agentOverlays.length > 0) {
          forgeOverlayMap = new Map();
          for (const overlay of forgeConfig.agentOverlays) {
            forgeOverlayMap.set(overlay.agentName, {
              behaviorModifiers: overlay.behaviorModifiers,
              parameters: overlay.parameters,
            });
          }
          log.debug(`Forge 오버레이 ${forgeConfig.agentOverlays.length}개 적용`);
        }
        // 스킬 오버레이 맵 구성
        if (forgeConfig.skillOverlays.length > 0) {
          forgeSkillOverlayMap = new Map();
          for (const overlay of forgeConfig.skillOverlays) {
            forgeSkillOverlayMap.set(overlay.skillName, {
              behaviorModifiers: overlay.behaviorModifiers,
              parameters: overlay.parameters,
            });
          }
          log.debug(`Forge 스킬 오버레이 ${forgeConfig.skillOverlays.length}개 적용`);
        }
        // 튜닝된 규칙 수집
        forgeTunedRules = forgeConfig.tunedRules;
        // hookTuning → ~/.compound/hook-config.json 저장
        if (forgeConfig.hookTuning?.length) {
          try {
            const hookConfigPath = path.join(COMPOUND_HOME, 'hook-config.json');
            const hookConfig: Record<string, unknown> = {};
            for (const tuning of forgeConfig.hookTuning) {
              hookConfig[tuning.hookName] = { enabled: tuning.enabled, ...tuning.parameters };
            }
            const tmp = `${hookConfigPath}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(hookConfig, null, 2));
            fs.renameSync(tmp, hookConfigPath);
            log.debug(`Hook 설정 저장: ${forgeConfig.hookTuning.length}개`);
          } catch (e) {
            log.debug('hook-config.json 저장 실패 (정상 동작에 영향 없음)', e);
          }
        }
      }
    } catch (e) {
      log.debug('Forge 프로필 로드 실패 (정상 동작에 영향 없음)', e);
    }

    // 8.5. 에이전트 설치 (forge 오버레이 포함)
    installAgents(cwd, forgeOverlayMap);

    // 9. 규칙 파일 주입 (기본 5개 + forge 튜닝 규칙)
    const ruleFiles = generateClaudeRuleFiles(context);
    // forge 튜닝 규칙 병합 — 조건부 로딩으로 토큰 절약
    const forgePaths = ['src/**/*.ts', 'src/**/*.tsx', 'tests/**/*.ts'];
    const forgePathsHeader = `---\npaths:\n${forgePaths.map(p => `  - "${p}"`).join('\n')}\n---\n\n`;
    for (const tunedRule of forgeTunedRules) {
      ruleFiles[tunedRule.filename] = forgePathsHeader + tunedRule.content;
    }
    injectClaudeRuleFiles(cwd, ruleFiles);

    // 9.5. 슬래시 명령 설치 (/project:autopilot 등, forge 스킬 오버레이 포함)
    installSlashCommands(cwd, forgeSkillOverlayMap);

    // 10. tmux 바인딩 등록
    if (inTmux) {
      await registerTmuxBindings();
    }

    // 11. .gitignore에 tenetx 생성 파일 등록 (팀 충돌 방지)
    ensureGitignore(cwd);

    // 12. Auto memory에 compound 포인터 추가
    ensureCompoundMemory(cwd);

    // 12. 팩 auto-sync (github 연결 시) + 업데이트 알림
    const syncMessage = await autoSyncIfNeeded(cwd);
    if (syncMessage) {
      // 업데이트 알림은 사용자에게 표시 (⬆ 표시가 있으면 알림)
      if (syncMessage.includes('⬆')) {
        console.error(`[tenetx] ${syncMessage}`);
      } else {
        log.debug(syncMessage);
      }
    }

    // 13. 세션 로그 시작
    startSessionLog(context);

    // ── 17. Compound staleness guard ──
    try {
      const stalenessDays = Number(process.env.COMPOUND_STALENESS_DAYS) || 3;
      const stalenessMs = stalenessDays * 24 * 60 * 60 * 1000;

      // 마지막 compound extraction 시점 확인
      const lastExtractionPath = path.join(STATE_DIR, 'last-extraction.json');
      if (fs.existsSync(lastExtractionPath)) {
        const lastExtraction = JSON.parse(fs.readFileSync(lastExtractionPath, 'utf-8'));
        const extractedAt = lastExtraction.lastExtractedAt ?? lastExtraction.lastRunAt;
        const lastRunMs = extractedAt ? new Date(extractedAt).getTime() : Number.NaN;
        if (!Number.isFinite(lastRunMs)) return context;
        const elapsed = Date.now() - lastRunMs;

        if (elapsed > stalenessMs) {
          // pending-compound 마커가 없을 때만 생성
          const pendingPath = path.join(STATE_DIR, 'pending-compound.json');
          if (!fs.existsSync(pendingPath)) {
            fs.writeFileSync(pendingPath, JSON.stringify({
              reason: 'staleness',
              detectedAt: new Date().toISOString(),
              daysSinceLastRun: Math.floor(elapsed / (24 * 60 * 60 * 1000)),
            }, null, 2));
            log.debug(`Compound staleness detected (${Math.floor(elapsed / (24 * 60 * 60 * 1000))}d) — pending-compound marker created`);
          }
        }
      }
    } catch (e) {
      log.debug('Staleness check failed (non-fatal)', e);
    }

    return context;
  } catch (err) {
    rollbackSettings();
    throw err;
  }
}
