#!/usr/bin/env node
/**
 * Tenetx — postinstall script
 *
 * npm i -g tenetx 시 자동 실행.
 * tenetx CLI(harness)를 거치지 않고 claude를 직접 실행해도
 * 슬래시 명령, 훅, 디렉토리 구조가 모두 동작하도록 보장합니다.
 *
 * 크로스 플랫폼 지원: Windows, macOS, Linux (sudo 포함)
 *
 * 설계 결정:
 *   - forge overlay 없이 기본 스킬만 설치 (overlay는 harness 실행 시 적용)
 *   - 사용자가 수정한 파일(<!-- tenetx-managed --> 마커 없음)은 보존
 *   - settings.json의 기존 non-tenetx 설정은 보존
 *   - 실패해도 npm install을 깨뜨리지 않음 (silent failure)
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync, symlinkSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const IS_WINDOWS = platform() === 'win32';

/** SUDO_USER 유효성 검증 — 커맨드 인젝션 방지 */
const SAFE_USERNAME_RE = /^[a-zA-Z0-9_-]+$/;
function getSafeSudoUser() {
  const sudoUser = process.env.SUDO_USER;
  if (!sudoUser) return null;
  if (!SAFE_USERNAME_RE.test(sudoUser)) return null;
  return sudoUser;
}

/**
 * sudo npm i -g 시 homedir()이 /root를 반환하는 문제 해결.
 * SUDO_USER가 있으면 실제 유저의 홈 디렉토리를 찾는다.
 * Windows에서는 sudo가 없으므로 homedir() 그대로 사용.
 *
 * 보안: execFileSync를 사용하여 쉘 보간 없이 실행.
 */
function resolveHome() {
  if (IS_WINDOWS) return homedir();

  const sudoUser = getSafeSudoUser();
  if (sudoUser && process.getuid?.() === 0) {
    try {
      if (platform() === 'darwin') {
        const out = execFileSync('dscl', ['.', '-read', `/Users/${sudoUser}`, 'NFSHomeDirectory'], { encoding: 'utf-8' });
        const home = out.trim().split(':').pop()?.trim();
        if (home) return home;
      } else {
        const out = execFileSync('getent', ['passwd', sudoUser], { encoding: 'utf-8' });
        const home = out.trim().split(':')[5];
        if (home) return home;
      }
    } catch { /* fallback */ }
    return platform() === 'darwin'
      ? join('/Users', sudoUser)
      : join('/home', sudoUser);
  }
  return homedir();
}

/**
 * sudo로 생성된 파일/디렉토리를 실제 유저 소유로 변경.
 * 이렇게 하지 않으면 유저가 나중에 settings.json 등을 수정할 수 없음.
 *
 * 보안: execFileSync를 사용하여 쉘 보간 없이 실행.
 */
function fixOwnership(...paths) {
  if (IS_WINDOWS) return;
  const sudoUser = getSafeSudoUser();
  if (!sudoUser || process.getuid?.() !== 0) return;

  try {
    const uid = execFileSync('id', ['-u', sudoUser], { encoding: 'utf-8' }).trim();
    const gid = execFileSync('id', ['-g', sudoUser], { encoding: 'utf-8' }).trim();
    for (const p of paths) {
      if (existsSync(p)) {
        execFileSync('chown', ['-R', `${uid}:${gid}`, p], { stdio: 'ignore' });
      }
    }
  } catch { /* best effort */ }
}

const HOME = resolveHome();

// ── Paths ──
const SKILLS_DIR = join(PKG_ROOT, 'commands');
const DIST_HOOKS = join(PKG_ROOT, 'dist', 'hooks');
const COMMANDS_DIR = join(HOME, '.claude', 'commands', 'tenetx');
const CLAUDE_DIR = join(HOME, '.claude');
const PLUGINS_DIR = join(CLAUDE_DIR, 'plugins');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const COMPOUND_HOME = join(HOME, '.compound');

// ── 1. Ensure directories ──
function ensureDirectories() {
  const dirs = [
    COMPOUND_HOME,
    join(COMPOUND_HOME, 'me'),
    join(COMPOUND_HOME, 'me', 'solutions'),
    join(COMPOUND_HOME, 'me', 'rules'),
    join(COMPOUND_HOME, 'me', 'skills'),
    join(COMPOUND_HOME, 'sessions'),
    join(COMPOUND_HOME, 'state'),
    join(COMPOUND_HOME, 'handoffs'),
    join(COMPOUND_HOME, 'lab'),
    CLAUDE_DIR,
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

// ── 2. Register as Claude Code plugin ──
// omc, claude-hud 등 동작하는 플러그인의 실제 구조를 그대로 따름:
//   .claude-plugin/plugin.json  — 메타데이터 + skills 경로
//   hooks/hooks.json            — ${CLAUDE_PLUGIN_ROOT} 기반 훅 정의
//   skills/{name}/SKILL.md      — 스킬 파일 (서브디렉토리 구조)
//   commands/*.md               — 슬래시 커맨드
//
// 설계 결정: 캐시 디렉토리를 PKG_ROOT로 symlink하여 dist/, node_modules/ 접근 보장.
// symlink 실패 시 (sudo, cross-device 등) 필수 파일만 복사.
function registerPlugin() {
  // .claude-plugin/plugin.json 필수 — 없으면 표준 구조가 아님
  if (!existsSync(join(PKG_ROOT, '.claude-plugin', 'plugin.json'))) return false;

  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));
  const version = pkg.version ?? '0.0.0';

  // skills/ 디렉토리 생성 (commands/*.md → skills/{name}/SKILL.md)
  generateSkillsDir();

  // 캐시 경로: ~/.claude/plugins/cache/tenetx-local/tenetx/{version}/
  const cacheParent = join(PLUGINS_DIR, 'cache', 'tenetx-local', 'tenetx');
  const CACHE_DIR = join(cacheParent, version);

  // 이전 잔재 완전 제거
  try { rmSync(cacheParent, { recursive: true, force: true }); } catch { /* ignore */ }
  mkdirSync(join(cacheParent), { recursive: true });

  // 1차: symlink (개발 환경, dist/node_modules 접근 가능)
  let linked = false;
  try {
    symlinkSync(PKG_ROOT, CACHE_DIR, 'dir');
    linked = true;
  } catch {
    // symlink 실패 → 복사 fallback
  }

  if (!linked) {
    // 2차: 필수 디렉토리 복사
    mkdirSync(CACHE_DIR, { recursive: true });
    const copyDirs = ['.claude-plugin', 'hooks', 'skills', 'commands', 'agents'];
    for (const dir of copyDirs) {
      const src = join(PKG_ROOT, dir);
      if (existsSync(src)) {
        cpSync(src, join(CACHE_DIR, dir), { recursive: true });
      }
    }
    // dist/ 복사 (훅 실행에 필요)
    if (existsSync(join(PKG_ROOT, 'dist'))) {
      cpSync(join(PKG_ROOT, 'dist'), join(CACHE_DIR, 'dist'), { recursive: true });
    }
    // 핵심 의존성 복사 (symlink 실패 시 필요)
    const coreDeps = ['js-yaml', '@modelcontextprotocol', 'zod'];
    mkdirSync(join(CACHE_DIR, 'node_modules'), { recursive: true });
    for (const dep of coreDeps) {
      const depSrc = join(PKG_ROOT, 'node_modules', dep);
      if (existsSync(depSrc)) {
        cpSync(depSrc, join(CACHE_DIR, 'node_modules', dep), { recursive: true });
      }
    }
  }

  // installed_plugins.json에 등록
  const installedPath = join(PLUGINS_DIR, 'installed_plugins.json');
  let installed = { version: 2, plugins: {} };
  if (existsSync(installedPath)) {
    try { installed = JSON.parse(readFileSync(installedPath, 'utf-8')); } catch { /* ignore */ }
  }

  const pluginKey = 'tenetx@tenetx-local';
  installed.plugins = installed.plugins ?? {};
  installed.plugins[pluginKey] = [{
    scope: 'user',
    installPath: CACHE_DIR,
    version,
    installedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  }];

  mkdirSync(PLUGINS_DIR, { recursive: true });
  writeFileSync(installedPath, JSON.stringify(installed, null, 2));

  return true;
}

/** settings 객체에 enabledPlugins를 적용합니다 (settings.json 쓰기는 main에서 일괄 수행). */
function applyPluginSettings(settings) {
  const pluginKey = 'tenetx@tenetx-local';
  const enabled = settings.enabledPlugins ?? {};
  enabled[pluginKey] = true;
  settings.enabledPlugins = enabled;
}

/**
 * 설치된 다른 플러그인을 감지하여 겹치는 스킬 목록을 반환.
 * Returns Map<skillName, pluginName>.
 *
 * 설계 결정: 빌드 이전 postinstall 단계에서 실행되므로
 * TypeScript 소스 import 없이 순수 파일시스템 체크만 사용.
 */
function detectPluginConflicts() {
  const conflicts = new Map();

  // oh-my-claudecode: ~/.omc 또는 .omc(프로젝트 루트) 존재 여부 확인
  const omcGlobal = join(HOME, '.omc');
  const omcLocal = join(process.cwd(), '.omc');
  if (existsSync(omcGlobal) || existsSync(omcLocal)) {
    const omcSkills = [
      'autopilot', 'team', 'code-review', 'tdd', 'debug-detective',
      'refactor', 'security-review', 'git-master', 'migrate', 'pipeline', 'ultrawork',
    ];
    for (const skill of omcSkills) {
      conflicts.set(skill, 'oh-my-claudecode');
    }
  }

  // claude-mem: ~/.claude-mem 존재 여부 확인
  const claudeMem = join(HOME, '.claude-mem');
  if (existsSync(claudeMem)) {
    // claude-mem과 겹치는 스킬이 추가되면 여기에 등록
  }

  // superpowers: ~/.codex/superpowers/ 존재 여부 확인
  const superpowers = join(HOME, '.codex', 'superpowers');
  if (existsSync(superpowers)) {
    for (const skill of ['tdd', 'debug-detective', 'refactor', 'code-review']) {
      conflicts.set(skill, 'superpowers');
    }
  }

  // feature-dev (official Anthropic plugin): ~/.claude/plugins/feature-dev/ 존재 여부 확인
  const featureDev = join(HOME, '.claude', 'plugins', 'feature-dev');
  if (existsSync(featureDev)) {
    conflicts.set('pipeline', 'feature-dev');
  }

  // code-review plugin (official Anthropic plugin): ~/.claude/plugins/code-review/ 존재 여부 확인
  const codeReviewPlugin = join(HOME, '.claude', 'plugins', 'code-review');
  if (existsSync(codeReviewPlugin)) {
    conflicts.set('code-review', 'code-review-plugin');
  }

  // commit-commands (official Anthropic plugin): ~/.claude/plugins/commit-commands/ 존재 여부 확인
  const commitCommands = join(HOME, '.claude', 'plugins', 'commit-commands');
  if (existsSync(commitCommands)) {
    conflicts.set('git-master', 'commit-commands');
  }

  return conflicts;
}

/**
 * commands/*.md → skills/{name}/SKILL.md 변환.
 * Claude Code 플러그인은 skills/{name}/SKILL.md 구조로 스킬을 인식.
 */
function generateSkillsDir() {
  const skillsSrc = join(PKG_ROOT, 'commands');
  const skillsDst = join(PKG_ROOT, 'skills');
  if (!existsSync(skillsSrc)) return;

  // 기존 skills/ 제거 후 재생성
  try { rmSync(skillsDst, { recursive: true, force: true }); } catch { /* ignore */ }

  const conflicts = detectPluginConflicts();
  let skipped = 0;

  for (const file of readdirSync(skillsSrc).filter(f => f.endsWith('.md'))) {
    const name = file.replace('.md', '');

    // 다른 플러그인이 동일 스킬을 제공하면 건너뜀
    if (conflicts.has(name)) {
      const pluginName = conflicts.get(name);
      console.log(`[tenetx] Skipping skill "${name}" — provided by ${pluginName}`);
      skipped++;
      continue;
    }

    const raw = readFileSync(join(skillsSrc, file), 'utf-8');

    // description 추출
    const descMatch = raw.match(/description:\s*(.+)/);
    const desc = descMatch?.[1]?.trim() ?? name;

    // frontmatter 이후 본문 추출
    const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    const body = bodyMatch?.[1]?.trim() ?? raw;

    // skills/{name}/SKILL.md 생성 (Claude Code 표준)
    const skillDir = join(skillsDst, name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}\n`);
  }

  if (skipped > 0) {
    console.log(`[tenetx] ${skipped} overlapping skills skipped. Compound knowledge engine remains active.`);
  }
}

// ── 3. Generate hooks/hooks.json dynamically ──

/**
 * HOOK_REGISTRY — hooks/hook-registry.json에서 로드.
 * 단일 소스 오브 트루스: hook-registry.ts와 동일 파일을 읽습니다.
 * 중복/불일치 완전 제거.
 */
const HOOK_REGISTRY = JSON.parse(readFileSync(join(PKG_ROOT, 'hooks', 'hook-registry.json'), 'utf-8'));

/**
 * hook-config.ts의 isHookEnabled 로직 인라인 구현.
 * 우선순위: 개별 훅 > 티어 > 레거시 > 기본값 true
 * compound-core 훅은 tier 설정으로 비활성화 불가.
 */
function isHookEnabledFromConfig(hookName, hookTier, config) {
  if (!config) return true;

  const hooksSection = config['hooks'];
  // 1) 개별 훅 설정 (v2: hooks 섹션)
  if (hooksSection?.[hookName]?.['enabled'] === false) return false;
  if (hooksSection?.[hookName]?.['enabled'] === true) return true;

  // 2) 티어 설정 — compound-core는 tier 비활성화 무시
  if (hookTier !== 'compound-core') {
    const tiers = config['tiers'];
    if (tiers?.[hookTier]?.['enabled'] === false) return false;
  }

  // 3) 레거시 형식 (최상위 hookName.enabled)
  if (config[hookName]?.['enabled'] === false) return false;

  return true;
}

/**
 * 플러그인별 충돌 훅 목록 (plugin-detector.ts의 overlappingHooks와 동기화 필요).
 * 다른 플러그인이 감지되어도 이 목록에 있는 훅만 자동 비활성화.
 */
const PLUGIN_HOOK_CONFLICTS = {
  'oh-my-claudecode': ['intent-classifier', 'keyword-detector', 'skill-injector'],
};

/**
 * hooks/hooks.json을 동적으로 생성합니다.
 *
 * 동작:
 *   1. ~/.compound/hook-config.json 로드 (없으면 모두 활성화)
 *   2. detectPluginConflicts()로 다른 플러그인 존재 여부 판별
 *   3. 활성 훅을 이벤트별 그룹으로 변환하여 hooks.json 작성
 *
 * 설계 결정:
 *   - compound-core 훅은 절대 자동 비활성화 안 함
 *   - script 필드에 공백이 있으면 파일 경로와 인수로 분리
 *     예: "hooks/subagent-tracker.js stop" →
 *         node "${CLAUDE_PLUGIN_ROOT}/dist/hooks/subagent-tracker.js" stop
 *   - 다른 플러그인이 감지되어도 해당 플러그인과 실제 충돌하는 훅만 비활성
 *     (plugin-detector.ts의 overlappingHooks와 동일한 좁은 기준)
 */
function generateAndWriteHooksJson() {
  const pluginRoot = '${CLAUDE_PLUGIN_ROOT}/dist';
  const hooksJsonPath = join(PKG_ROOT, 'hooks', 'hooks.json');

  // hook-config.json 로드 (실패 시 null → 모두 기본 활성)
  let hookConfig = null;
  const hookConfigPath = join(COMPOUND_HOME, 'hook-config.json');
  if (existsSync(hookConfigPath)) {
    try { hookConfig = JSON.parse(readFileSync(hookConfigPath, 'utf-8')); } catch { /* ignore */ }
  }

  // detectPluginConflicts()는 skill→plugin Map이므로, 플러그인 집합을 추출해 훅 충돌 구성
  const skillConflicts = detectPluginConflicts();
  const hasOtherPlugins = skillConflicts.size > 0;
  const detectedPluginNames = new Set(skillConflicts.values());
  const hookConflicts = new Map();
  for (const [plugin, hooks] of Object.entries(PLUGIN_HOOK_CONFLICTS)) {
    if (detectedPluginNames.has(plugin)) {
      for (const h of hooks) hookConflicts.set(h, plugin);
    }
  }

  // 활성 훅 필터링
  const activeHooks = HOOK_REGISTRY.filter(hook => {
    // 1) hook-config.json 기반 개별/티어 비활성화
    if (!isHookEnabledFromConfig(hook.name, hook.tier, hookConfig)) return false;

    // 2) 다른 플러그인과 실제 충돌하는 workflow 훅만 비활성 (compound-critical 제외)
    //    hooks-generator.ts의 hookConflicts.has(hook.name) 조건과 동일한 좁은 기준
    if (hasOtherPlugins && hook.tier === 'workflow' && hookConflicts.has(hook.name) && !hook.compoundCritical) return false;

    return true;
  });

  // 이벤트별 그룹핑 (registry 순서 유지)
  const byEvent = new Map();
  for (const hook of activeHooks) {
    if (!byEvent.has(hook.event)) byEvent.set(hook.event, []);
    byEvent.get(hook.event).push(hook);
  }

  // hooks.json 구조 조립
  const hooks = {};
  for (const [event, entries] of byEvent) {
    hooks[event] = [{
      matcher: '*',
      hooks: entries.map(h => {
        // "hooks/subagent-tracker.js stop" 같은 경우 공백으로 분리
        const spaceIdx = h.script.indexOf(' ');
        let command;
        if (spaceIdx === -1) {
          command = `node "${pluginRoot}/${h.script}"`;
        } else {
          const scriptPath = h.script.slice(0, spaceIdx);
          const args = h.script.slice(spaceIdx + 1);
          command = `node "${pluginRoot}/${scriptPath}" ${args}`;
        }
        return { type: 'command', command, timeout: h.timeout };
      }),
    }];
  }

  const total = HOOK_REGISTRY.length;
  const active = activeHooks.length;
  const result = {
    description: `Tenetx harness hooks (auto-generated, ${active}/${total} active)`,
    hooks,
  };

  mkdirSync(join(PKG_ROOT, 'hooks'), { recursive: true });
  writeFileSync(hooksJsonPath, JSON.stringify(result, null, 2) + '\n');

  return { active, total };
}

// ── 4. Install slash commands ──
function buildCommandContent(skillContent, skillName) {
  const descMatch = skillContent.match(/description:\s*(.+)/);
  const desc = descMatch?.[1]?.trim() ?? skillName;
  return `# ${desc}\n\n<!-- tenetx-managed -->\n\nActivate Tenetx "${skillName}" mode for the task: $ARGUMENTS\n\n${skillContent}`;
}

function safeWriteCommand(cmdPath, content) {
  if (existsSync(cmdPath)) {
    const existing = readFileSync(cmdPath, 'utf-8');
    if (!existing.includes('<!-- tenetx-managed -->')) return false;
  }
  writeFileSync(cmdPath, content);
  return true;
}

function installSlashCommands() {
  if (!existsSync(SKILLS_DIR)) return 0;
  mkdirSync(COMMANDS_DIR, { recursive: true });

  const skills = readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md'));
  let installed = 0;

  for (const file of skills) {
    const skillName = file.replace('.md', '');
    const skillContent = readFileSync(join(SKILLS_DIR, file), 'utf-8');
    const cmdContent = buildCommandContent(skillContent, skillName);
    if (safeWriteCommand(join(COMMANDS_DIR, file), cmdContent)) {
      installed++;
    }
  }
  return installed;
}

// ── 3. Inject hooks into settings.json ──

/** 훅 경로가 tenetx dist/hooks를 가리키는지 판별 (Windows \ 와 Unix / 모두 처리) */
function isTenetxHook(entry) {
  // [\\/] 패턴으로 양쪽 구분자 모두 매칭 (harness.ts와 동일 전략)
  const HOOK_PATTERN = /[\\/]dist[\\/]hooks[\\/].*\.js/;
  const check = (cmd) => HOOK_PATTERN.test(cmd) && cmd.includes('tenetx');
  if (typeof entry.command === 'string' && check(entry.command)) return true;
  if (Array.isArray(entry.hooks)) {
    return entry.hooks.some((h) => typeof h.command === 'string' && check(h.command));
  }
  return false;
}

/** settings 객체에 훅 설정을 적용합니다 (settings.json 쓰기는 main에서 일괄 수행). */
function applyHookSettings(settings) {
  if (!existsSync(DIST_HOOKS)) return false;

  // 기존 tenetx 훅 정리 (이전 버전에서 settings.json에 주입한 잔재 제거)
  const hooksConfig = settings.hooks ?? {};
  for (const [event, entries] of Object.entries(hooksConfig)) {
    if (Array.isArray(entries)) {
      hooksConfig[event] = entries.filter(h => !isTenetxHook(h));
      if (hooksConfig[event].length === 0) delete hooksConfig[event];
    }
  }
  settings.hooks = Object.keys(hooksConfig).length > 0 ? hooksConfig : undefined;

  // env에 COMPOUND_HARNESS 마커만 설정
  const env = settings.env ?? {};
  env.COMPOUND_HARNESS = '1';
  settings.env = env;

  // 불필요한 키 정리
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return true;
}

// ── MCP Server Registration ──

/**
 * settings.json의 mcpServers에 tenetx-compound MCP 서버를 등록합니다.
 * 기존 mcpServers 설정은 보존하며, tenetx-compound만 추가/갱신합니다.
 *
 * 설계 결정:
 *   - dist/mcp/server.js가 없으면 건너뜀 (빌드 전 설치 시)
 *   - 기존에 등록된 다른 MCP 서버 설정은 절대 건드리지 않음
 *   - plugin.json이 아닌 settings.json 직접 등록 (플러그인 스키마 호환성 보장)
 *   - 절대 경로 대신 npm bin 경로를 사용하여 버전 업그레이드에도 동작
 *   - npm bin이 없으면 절대 경로 fallback (로컬 개발 환경)
 */
/** settings 객체에 MCP 서버를 등록합니다 (settings.json 쓰기는 main에서 일괄 수행). */
function applyMcpSettings(settings) {
  const mcpServerPath = join(PKG_ROOT, 'dist', 'mcp', 'server.js');
  if (!existsSync(mcpServerPath)) return false;

  // npm이 설치한 bin 링크 사용 (버전 업그레이드에도 안정적)
  let mcpCommand = 'tenetx-mcp';
  let mcpArgs = [];
  try {
    const whichCmd = IS_WINDOWS ? 'where' : 'which';
    execFileSync(whichCmd, ['tenetx-mcp'], { stdio: 'ignore' });
  } catch {
    mcpCommand = 'node';
    mcpArgs = [mcpServerPath];
  }

  const mcpServers = settings.mcpServers ?? {};
  mcpServers['tenetx-compound'] = {
    command: mcpCommand,
    args: mcpArgs,
  };
  settings.mcpServers = mcpServers;
  return true;
}

// ── Main ──

/**
 * settings.json을 한 번 읽고, 모든 변경을 적용한 후, 한 번만 씁니다.
 * 이전 방식(3곳에서 각각 read-modify-write)은 중간에 다른 프로세스가
 * settings.json을 수정하면 데이터 유실 가능성이 있었습니다.
 */
function main() {
  ensureDirectories();

  // ── 1. settings.json 한 번 읽기 ──
  let settings = {};
  if (existsSync(SETTINGS_PATH)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')); } catch { /* 파싱 실패 시 빈 설정 */ }
  }

  // ── 2. 플러그인 등록 (installed_plugins.json + skills) ──
  let plugin = false;
  try {
    plugin = registerPlugin();
    if (plugin) applyPluginSettings(settings);
  } catch (err) {
    console.error(`[tenetx] plugin registration failed: ${err?.message ?? err}`);
  }

  // ── 3. hooks.json 동적 생성 ──
  let hooksJsonResult = null;
  try {
    hooksJsonResult = generateAndWriteHooksJson();
  } catch (err) {
    console.error(`[tenetx] hooks.json generation failed: ${err?.message ?? err}`);
  }

  // ── 4. 슬래시 커맨드 설치 ──
  let commands = 0;
  try {
    commands = installSlashCommands();
  } catch (err) {
    console.error(`[tenetx] slash commands failed: ${err?.message ?? err}`);
  }

  // ── 5. settings에 훅 설정 적용 ──
  let hooks = false;
  try {
    hooks = applyHookSettings(settings);
  } catch (err) {
    console.error(`[tenetx] hooks settings failed: ${err?.message ?? err}`);
  }

  // ── 6. settings에 MCP 서버 등록 ──
  let mcp = false;
  try {
    mcp = applyMcpSettings(settings);
  } catch (err) {
    console.error(`[tenetx] MCP server registration failed: ${err?.message ?? err}`);
  }

  // ── 7. settings.json 한 번 쓰기 ──
  try {
    mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error(`[tenetx] settings.json write failed: ${err?.message ?? err}`);
  }

  // sudo 실행 시 파일 소유권을 실제 유저로 변경
  fixOwnership(join(HOME, '.claude'), join(HOME, '.compound'));

  const parts = [];
  if (plugin) parts.push('plugin');
  if (hooksJsonResult) parts.push(`hooks.json (${hooksJsonResult.active}/${hooksJsonResult.total} active)`);
  if (commands > 0) parts.push(`${commands} slash commands`);
  if (hooks) parts.push('hooks');
  if (mcp) parts.push('MCP compound');
  if (parts.length > 0) {
    console.log(`[tenetx] Installed: ${parts.join(', ')} → ${HOME}`);
  }
}

try {
  main();
} catch (err) {
  // postinstall 실패가 npm install을 깨뜨리지 않되, 원인은 표시
  console.error(`[tenetx] postinstall warning: ${err?.message ?? err}`);
}
