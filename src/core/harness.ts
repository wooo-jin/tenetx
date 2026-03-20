import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as crypto from 'node:crypto';
import { loadPhilosophyForProject, initDefaultPhilosophy } from './philosophy-loader.js';
import { resolveScope } from './scope-resolver.js';
import { generateClaudeRuleFiles, buildEnv, registerTmuxBindings } from './config-injector.js';
import { COMPOUND_HOME, ME_DIR, ME_SOLUTIONS, ME_RULES, SESSIONS_DIR } from './paths.js';
import { startSessionLog } from './session-logger.js';
import { ModelRouter } from '../engine/router.js';
import type { RoutingPreset } from '../engine/router.js';
import type { HarnessContext } from './types.js';
import { debugLog } from './logger.js';
import { cleanStaleStateFiles } from './state-gc.js';
import { loadGlobalConfig } from './global-config.js';
import { autoSyncIfNeeded, loadPackConfigs } from './pack-config.js';
import { checkSelfUpdate } from './version-check.js';
import { PACKS_DIR } from './paths.js';
import { loadPackWorkflows, registerPackWorkflows } from '../engine/modes.js';
import {
  CLAUDE_DIR,
  SETTINGS_PATH,
  SETTINGS_BACKUP_PATH,
  acquireLock,
  releaseLock,
  atomicWriteFileSync,
  rollbackSettings,
} from './settings-lock.js';

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
    ME_RULES,
    SESSIONS_DIR,
    path.join(COMPOUND_HOME, 'state'),
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
    } catch (e) { debugLog('harness', 'settings.json 파싱 실패, 빈 설정으로 시작', e); }
  }

  // 기존 env에 하네스 환경변수 병합
  const existingEnv = (settings.env as Record<string, string>) ?? {};
  settings.env = { ...existingEnv, ...env };

  // statusLine: 기존에 tenetx 관련이 아닌 사용자 커스텀 값이 있으면 덮어쓰지 않음.
  // command가 없거나 빈 문자열인 경우는 의도된 커스텀 설정이 아닌 것으로 간주하여 tenetx로 교체.
  const existingStatusLine = settings.statusLine as { type?: string; command?: string } | undefined;
  const isTenetxStatusLine =
    !existingStatusLine ||
    !existingStatusLine.command ||   // undefined, null, '' 모두 교체 대상
    existingStatusLine.command.startsWith('tenetx');
  if (isTenetxStatusLine) {
    settings.statusLine = {
      type: 'command',
      command: 'tenetx status',
    };
  }

  // 훅 주입: Claude Code hooks 시스템에 등록
  // hooks 스키마: { "EventName": [{ "matcher": "...", "hooks": [{ "type": "command", ... }] }] }
  const pkgRoot = getPackageRoot();
  const hooksConfig = settings.hooks as Record<string, unknown[]> ?? {};

  // dist 경로의 훅 스크립트
  const intentClassifierPath = path.join(pkgRoot, 'dist', 'hooks', 'intent-classifier.js');
  const keywordDetectorPath = path.join(pkgRoot, 'dist', 'hooks', 'keyword-detector.js');
  const skillInjectorPath = path.join(pkgRoot, 'dist', 'hooks', 'skill-injector.js');
  const sessionRecoveryPath = path.join(pkgRoot, 'dist', 'hooks', 'session-recovery.js');
  const contextGuardPath = path.join(pkgRoot, 'dist', 'hooks', 'context-guard.js');
  const preToolUsePath = path.join(pkgRoot, 'dist', 'hooks', 'pre-tool-use.js');
  const postToolUsePath = path.join(pkgRoot, 'dist', 'hooks', 'post-tool-use.js');
  const subagentTrackerPath = path.join(pkgRoot, 'dist', 'hooks', 'subagent-tracker.js');
  const preCompactPath = path.join(pkgRoot, 'dist', 'hooks', 'pre-compact.js');
  const permissionHandlerPath = path.join(pkgRoot, 'dist', 'hooks', 'permission-handler.js');
  const postToolFailurePath = path.join(pkgRoot, 'dist', 'hooks', 'post-tool-failure.js');
  const notepadInjectorPath = path.join(pkgRoot, 'dist', 'hooks', 'notepad-injector.js');
  const secretFilterPath = path.join(pkgRoot, 'dist', 'hooks', 'secret-filter.js');
  const dbGuardPath = path.join(pkgRoot, 'dist', 'hooks', 'db-guard.js');
  const rateLimiterPath = path.join(pkgRoot, 'dist', 'hooks', 'rate-limiter.js');
  const solutionInjectorPath = path.join(pkgRoot, 'dist', 'hooks', 'solution-injector.js');
  const slopDetectorPath = path.join(pkgRoot, 'dist', 'hooks', 'slop-detector.js');

  /** tenetx 훅인지 판별 (matcher 래핑 여부 무관) */
  function isCHHook(entry: Record<string, unknown>): boolean {
    // 패키지 dist/hooks 경로를 포함하는 커맨드인지 확인
    const distHooksPath = path.join(pkgRoot, 'dist', 'hooks');
    function matchesHookPath(cmd: string): boolean {
      return cmd.includes(distHooksPath) || /[\\/]dist[\\/]hooks[\\/].*\.js/.test(cmd);
    }
    // 직접 형식: { type, command }
    if (typeof entry.command === 'string' && matchesHookPath(entry.command)) return true;
    // 래핑 형식: { matcher, hooks: [{ command }] }
    const hooks = entry.hooks as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(hooks)) {
      return hooks.some(h => typeof h.command === 'string' && matchesHookPath(h.command));
    }
    return false;
  }

  /** 올바른 hooks 스키마로 래핑하여 엔트리 생성 */
  function makeHookEntry(command: string, timeout: number): Record<string, unknown> {
    return {
      matcher: '',
      hooks: [{ type: 'command', command, timeout }],
    };
  }

  // 기존 CH 훅 제거 (이전 잘못된 형식 포함)
  function ensureArray(val: unknown): Array<Record<string, unknown>> {
    return Array.isArray(val) ? val : [];
  }
  function filterOutCH(arr: unknown): Array<Record<string, unknown>> {
    return ensureArray(arr).filter(h => !isCHHook(h));
  }

  // UserPromptSubmit 훅
  const promptHooks = filterOutCH(
    hooksConfig.UserPromptSubmit);
  if (fs.existsSync(intentClassifierPath)) {
    promptHooks.push(makeHookEntry(`node "${intentClassifierPath}"`, 3000));
  }
  if (fs.existsSync(keywordDetectorPath)) {
    promptHooks.push(makeHookEntry(`node "${keywordDetectorPath}"`, 5000));
  }
  if (fs.existsSync(skillInjectorPath)) {
    promptHooks.push(makeHookEntry(`node "${skillInjectorPath}"`, 3000));
  }
  if (fs.existsSync(contextGuardPath)) {
    promptHooks.push(makeHookEntry(`node "${contextGuardPath}"`, 2000));
  }
  if (fs.existsSync(notepadInjectorPath)) {
    promptHooks.push(makeHookEntry(`node "${notepadInjectorPath}"`, 3000));
  }
  if (fs.existsSync(solutionInjectorPath)) {
    promptHooks.push(makeHookEntry(`node "${solutionInjectorPath}"`, 3000));
  }
  hooksConfig.UserPromptSubmit = promptHooks;

  // SessionStart 훅
  const sessionHooks = filterOutCH(
    hooksConfig.SessionStart);
  if (fs.existsSync(sessionRecoveryPath)) {
    sessionHooks.push(makeHookEntry(`node "${sessionRecoveryPath}"`, 3000));
  }
  hooksConfig.SessionStart = sessionHooks;

  // Stop 훅 (에러 감지 + context limit 경고)
  const stopHooks = filterOutCH(
    hooksConfig.Stop);
  if (fs.existsSync(contextGuardPath)) {
    stopHooks.push(makeHookEntry(`node "${contextGuardPath}"`, 3000));
  }
  hooksConfig.Stop = stopHooks;

  // PreToolUse 훅 (위험 명령어 차단 + 모드 리마인더 + DB 가드 + 레이트 리미터)
  const preToolHooks = filterOutCH(
    hooksConfig.PreToolUse);
  if (fs.existsSync(preToolUsePath)) {
    preToolHooks.push(makeHookEntry(`node "${preToolUsePath}"`, 3000));
  }
  if (fs.existsSync(dbGuardPath)) {
    preToolHooks.push(makeHookEntry(`node "${dbGuardPath}"`, 3000));
  }
  if (fs.existsSync(rateLimiterPath)) {
    preToolHooks.push(makeHookEntry(`node "${rateLimiterPath}"`, 2000));
  }
  hooksConfig.PreToolUse = preToolHooks;

  // PostToolUse 훅 (파일 변경 추적 + 에러 감지 + 시크릿 필터)
  const postToolHooks = filterOutCH(
    hooksConfig.PostToolUse);
  if (fs.existsSync(postToolUsePath)) {
    postToolHooks.push(makeHookEntry(`node "${postToolUsePath}"`, 3000));
  }
  if (fs.existsSync(secretFilterPath)) {
    postToolHooks.push(makeHookEntry(`node "${secretFilterPath}"`, 3000));
  }
  if (fs.existsSync(slopDetectorPath)) {
    postToolHooks.push(makeHookEntry(`node "${slopDetectorPath}"`, 3000));
  }
  hooksConfig.PostToolUse = postToolHooks;

  // SubagentStart 훅
  const subagentStartHooks = filterOutCH(
    hooksConfig.SubagentStart);
  if (fs.existsSync(subagentTrackerPath)) {
    subagentStartHooks.push(makeHookEntry(`node "${subagentTrackerPath}" start`, 2000));
  }
  hooksConfig.SubagentStart = subagentStartHooks;

  // SubagentStop 훅
  const subagentStopHooks = filterOutCH(
    hooksConfig.SubagentStop);
  if (fs.existsSync(subagentTrackerPath)) {
    subagentStopHooks.push(makeHookEntry(`node "${subagentTrackerPath}" stop`, 2000));
  }
  hooksConfig.SubagentStop = subagentStopHooks;

  // PreCompact 훅 (컨텍스트 압축 전 상태 보존)
  const preCompactHooks = filterOutCH(
    hooksConfig.PreCompact);
  if (fs.existsSync(preCompactPath)) {
    preCompactHooks.push(makeHookEntry(`node "${preCompactPath}"`, 3000));
  }
  hooksConfig.PreCompact = preCompactHooks;

  // PermissionRequest 훅 (권한 요청 정책)
  const permissionHooks = filterOutCH(
    hooksConfig.PermissionRequest);
  if (fs.existsSync(permissionHandlerPath)) {
    permissionHooks.push(makeHookEntry(`node "${permissionHandlerPath}"`, 2000));
  }
  hooksConfig.PermissionRequest = permissionHooks;

  // PostToolUseFailure 훅 (도구 실패 시 복구 안내)
  const postToolFailureHooks = filterOutCH(
    hooksConfig.PostToolUseFailure);
  if (fs.existsSync(postToolFailurePath)) {
    postToolFailureHooks.push(makeHookEntry(`node "${postToolFailurePath}"`, 3000));
  }
  hooksConfig.PostToolUseFailure = postToolFailureHooks;

  settings.hooks = hooksConfig;

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
  } catch (e) { debugLog('harness', '에이전트 해시 맵 로드 실패', e); }
  return {};
}

/** 에이전트 해시 맵 저장 */
function saveAgentHashes(hashes: Record<string, string>): void {
  try {
    fs.mkdirSync(path.dirname(AGENT_HASHES_PATH), { recursive: true });
    fs.writeFileSync(AGENT_HASHES_PATH, JSON.stringify(hashes, null, 2));
  } catch (e) { debugLog('harness', '에이전트 해시 맵 저장 실패', e); }
}

/** 연결된 팩의 커스텀 워크플로우를 모드 시스템에 등록 */
function loadAndRegisterPackWorkflows(cwd: string): string[] {
  const warnings: string[] = [];
  try {
    const connectedPacks = loadPackConfigs(cwd);
    for (const pack of connectedPacks) {
      const nsDir = path.join(cwd, '.compound', 'packs', pack.name);
      const globalDir = path.join(PACKS_DIR, pack.name);
      const packDir = fs.existsSync(nsDir) ? nsDir : globalDir;
      const workflows = loadPackWorkflows(packDir);
      if (workflows.length > 0) {
        const skipped = registerPackWorkflows(workflows);
        debugLog('harness', `팩 '${pack.name}'에서 워크플로우 ${workflows.length}개 등록`);
        if (skipped.length > 0) {
          const msg = `⚠ 팩 '${pack.name}' 워크플로우 이름 충돌: ${skipped.join(', ')} (내장 모드 우선)`;
          warnings.push(msg);
        }
      }
    }
  } catch (e) {
    debugLog('harness', '팩 워크플로우 로드 실패', e);
  }
  return warnings;
}

/** 에이전트 소스 디렉토리에서 대상 디렉토리로 복사 (해시 기반 보호) */
function installAgentsFromDir(
  sourceDir: string,
  targetDir: string,
  prefix: string,
  hashes: Record<string, string>,
): void {
  if (!fs.existsSync(sourceDir)) return;

  const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.md'));
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
      const existingHash = contentHash(existing);
      const recordedHash = hashes[dstName];
      if (recordedHash && existingHash !== recordedHash) {
        debugLog('harness', `에이전트 파일 보호: ${dstName} (사용자 수정 감지)`);
        continue;
      }
      if (!recordedHash && !existing.includes('<!-- tenetx-managed -->')) {
        debugLog('harness', `에이전트 파일 보호: ${dstName} (레거시 사용자 수정 감지)`);
        continue;
      }
    }

    fs.writeFileSync(dst, content);
    hashes[dstName] = newHash;
  }
}

/** 에이전트 정의 파일 설치 — 패키지 내장 + 연결된 팩에서 프로젝트 .claude/agents/ 에 복사 */
function installAgents(cwd: string): void {
  const pkgRoot = getPackageRoot();
  const targetDir = path.join(cwd, '.claude', 'agents');

  fs.mkdirSync(targetDir, { recursive: true });

  const hashes = loadAgentHashes();

  try {
    // 1. 패키지 내장 에이전트 (ch- 프리픽스)
    installAgentsFromDir(path.join(pkgRoot, 'agents'), targetDir, 'ch-', hashes);

    // 2. 연결된 팩 에이전트 (pack-{name}- 프리픽스)
    const connectedPacks = loadPackConfigs(cwd);
    for (const pack of connectedPacks) {
      const nsDir = path.join(cwd, '.compound', 'packs', pack.name, 'agents');
      const globalDir = path.join(PACKS_DIR, pack.name, 'agents');
      const agentDir = fs.existsSync(nsDir) ? nsDir : globalDir;
      installAgentsFromDir(agentDir, targetDir, `pack-${pack.name}-`, hashes);
    }

    saveAgentHashes(hashes);
  } catch (e) {
    debugLog('harness', '에이전트 설치 실패', e);
  }
}

/** 프로젝트 .claude/rules/ 에 다중 하네스 규칙 파일 작성 (Claude Code 자동 로드) */
function injectClaudeRuleFiles(cwd: string, ruleFiles: Record<string, string>): void {
  const rulesDir = path.join(cwd, '.claude', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });

  // 각 규칙 파일 작성
  for (const [filename, content] of Object.entries(ruleFiles)) {
    fs.writeFileSync(path.join(rulesDir, filename), content);
  }

  // 마이그레이션: 이전 위치(.claude/compound-rules.md) 파일 제거
  const legacyPath = path.join(cwd, '.claude', 'compound-rules.md');
  if (fs.existsSync(legacyPath)) {
    try { fs.unlinkSync(legacyPath); } catch (e) { debugLog('harness', '레거시 규칙 파일 삭제 실패', e); }
  }

  // 기존 CLAUDE.md에서 이전 마커 블록 제거 (마이그레이션)
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  const marker = '<!-- tenetx:start -->';
  const endMarker = '<!-- tenetx:end -->';

  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    if (content.includes(marker)) {
      const regex = new RegExp(`\\n*${marker}[\\s\\S]*?${endMarker}\\n*`, 'g');
      const cleaned = content.replace(regex, '\n').replace(/\n{3,}/g, '\n\n').trim();
      fs.writeFileSync(claudeMdPath, cleaned ? `${cleaned}\n` : '');
    }
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
    '.compound/project-map.json',
    '.claude/commands/tenetx/',
    '.compound/notepad.md',
    '# pack.lock은 커밋 가능 (팀 버전 일관성)',
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
  for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'))) {
    if (validFiles.has(file)) continue;
    const filePath = path.join(commandsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('<!-- tenetx-managed -->')) {
        fs.unlinkSync(filePath);
        removed++;
      }
    } catch (e) { debugLog('harness', `stale 명령 파일 정리 실패: ${file}`, e); }
  }
  return removed;
}

/** 스킬을 Claude Code 슬래시 명령(/tenetx:xxx)으로 설치 */
function installSlashCommands(cwd: string): void {
  const pkgRoot = getPackageRoot();
  const skillsDir = path.join(pkgRoot, 'skills');
  const homeDir = os.homedir();

  // 글로벌: ~/.claude/commands/tenetx/ (모든 프로젝트에서 /tenetx:xxx 사용 가능)
  const globalCommandsDir = path.join(homeDir, '.claude', 'commands', 'tenetx');
  // 프로젝트 로컬: <project>/.claude/commands/tenetx/ (프로젝트별 팩 스킬)
  const localCommandsDir = path.join(cwd, '.claude', 'commands', 'tenetx');

  if (!fs.existsSync(skillsDir)) return;
  fs.mkdirSync(globalCommandsDir, { recursive: true });

  // 1. 코어 스킬 → 글로벌 설치
  const skills = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
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
      const packSkillsDir = fs.existsSync(localPackSkillsDir) ? localPackSkillsDir : globalPackSkillsDir;
      if (!fs.existsSync(packSkillsDir)) continue;
      const packSkills = fs.readdirSync(packSkillsDir).filter(f => f.endsWith('.md'));
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
  } catch (e) { debugLog('harness', '팩 스킬 로컬 설치 실패', e); }

  // 3. 삭제된 스킬 정리 (tenetx-managed 파일만)
  const removedGlobal = cleanupStaleCommands(globalCommandsDir, validGlobalFiles);
  const removedLocal = cleanupStaleCommands(localCommandsDir, validLocalFiles);

  debugLog('harness', `슬래시 명령 설치: ${installed}개 설치, ${removedGlobal + removedLocal}개 정리`);
}

/** 메인 하네스 준비 함수 */
export async function prepareHarness(cwd: string): Promise<HarnessContext> {
  try {
    // 1. 디렉토리 구조 보장
    ensureDirectories();

    // 1.5. 오래된 세션 상태 파일 정리
    cleanStaleStateFiles();

    // 2. 기본 철학 초기화
    initDefaultPhilosophy();

    // 3. 철학 로드 (프로젝트별 우선, 글로벌 폴백)
    const { philosophy, source: philosophySource } = loadPhilosophyForProject(cwd);
    debugLog('harness', `철학 로드: "${philosophy.name}" (source: ${philosophySource})`);

    // 4. 스코프 해석
    const scope = resolveScope(cwd, philosophySource);

    // 5. 모델 라우터 생성 (Philosophy + Preset + Signal 하이브리드)
    const globalConfig = loadGlobalConfig();
    const routingPreset = globalConfig.modelRouting as RoutingPreset | undefined;
    const router = new ModelRouter(philosophy, routingPreset);
    const modelRouting = router.getTable();

    // 6. 컨텍스트 구성
    const inTmux = !!process.env.TMUX;
    const context: HarnessContext = {
      philosophy, philosophySource, scope, cwd, inTmux,
      modelRouting: Object.fromEntries(
        Object.entries(modelRouting).map(([k, v]) => [k, v as string[]])
      ),
      signalRoutingEnabled: true,
      routingPreset: routingPreset ?? 'default',
    };

    // 7. Claude Code 설정 주입 (환경변수 + 훅)
    const env = buildEnv(context);
    injectSettings(env);

    // 8. 에이전트 설치 + 팩 워크플로우 등록
    installAgents(cwd);
    const workflowWarnings = loadAndRegisterPackWorkflows(cwd);
    for (const w of workflowWarnings) {
      console.error(`[tenetx] ${w}`);
    }

    // 9. 규칙 파일 주입 (5개 분할)
    const ruleFiles = generateClaudeRuleFiles(context);
    injectClaudeRuleFiles(cwd, ruleFiles);

    // 9.5. 슬래시 명령 설치 (/project:autopilot 등)
    installSlashCommands(cwd);

    // 10. tmux 바인딩 등록
    if (inTmux) {
      await registerTmuxBindings();
    }

    // 11. .gitignore에 tenetx 생성 파일 등록 (팀 충돌 방지)
    ensureGitignore(cwd);

    // 12. 팩 auto-sync (github 연결 시) + 업데이트 알림
    const syncMessage = await autoSyncIfNeeded(cwd);
    if (syncMessage) {
      // 업데이트 알림은 사용자에게 표시 (⬆ 표시가 있으면 알림)
      if (syncMessage.includes('⬆')) {
        console.error(`[tenetx] ${syncMessage}`);
      } else {
        debugLog('harness', syncMessage);
      }
    }

    // 13. tenetx 자체 업데이트 알림
    const selfUpdate = await checkSelfUpdate();
    if (selfUpdate) {
      console.error(`[tenetx] ${selfUpdate}`);
    }

    // 14. 세션 로그 시작
    startSessionLog(context);

    return context;
  } catch (err) {
    rollbackSettings();
    throw err;
  }
}
