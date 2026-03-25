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

import { readFileSync, readdirSync, writeFileSync, copyFileSync, mkdirSync, existsSync, lstatSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const IS_WINDOWS = platform() === 'win32';

/**
 * sudo npm i -g 시 homedir()이 /root를 반환하는 문제 해결.
 * SUDO_USER가 있으면 실제 유저의 홈 디렉토리를 찾는다.
 * Windows에서는 sudo가 없으므로 homedir() 그대로 사용.
 */
function resolveHome() {
  if (IS_WINDOWS) return homedir();

  const sudoUser = process.env.SUDO_USER;
  if (sudoUser && process.getuid?.() === 0) {
    try {
      // getent passwd (Linux) 또는 dscl (macOS)
      if (platform() === 'darwin') {
        const home = execSync(`dscl . -read /Users/${sudoUser} NFSHomeDirectory`, { encoding: 'utf-8' })
          .trim().split(':').pop()?.trim();
        if (home) return home;
      } else {
        const entry = execSync(`getent passwd ${sudoUser}`, { encoding: 'utf-8' }).trim();
        const home = entry.split(':')[5];
        if (home) return home;
      }
    } catch { /* fallback */ }
    // fallback: OS별 기본 경로
    return platform() === 'darwin'
      ? join('/Users', sudoUser)
      : join('/home', sudoUser);
  }
  return homedir();
}

/**
 * sudo로 생성된 파일/디렉토리를 실제 유저 소유로 변경.
 * 이렇게 하지 않으면 유저가 나중에 settings.json 등을 수정할 수 없음.
 */
function fixOwnership(...paths) {
  if (IS_WINDOWS) return;
  const sudoUser = process.env.SUDO_USER;
  if (!sudoUser || process.getuid?.() !== 0) return;

  try {
    const uid = execSync(`id -u ${sudoUser}`, { encoding: 'utf-8' }).trim();
    const gid = execSync(`id -g ${sudoUser}`, { encoding: 'utf-8' }).trim();
    for (const p of paths) {
      if (existsSync(p)) {
        execSync(`chown -R ${uid}:${gid} "${p}"`, { stdio: 'ignore' });
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
const PLUGIN_DIR = join(PLUGINS_DIR, 'tenetx');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const SETTINGS_BACKUP = join(CLAUDE_DIR, 'settings.json.bak');
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
    join(COMPOUND_HOME, 'plans'),
    join(COMPOUND_HOME, 'specs'),
    join(COMPOUND_HOME, 'skills'),
    join(COMPOUND_HOME, 'artifacts', 'ask'),
    join(COMPOUND_HOME, 'packs'),
    CLAUDE_DIR,
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

// ── 2. Register as Claude Code plugin ──
// Claude Code는 installed_plugins.json + .claude-plugin/plugin.json 구조로 플러그인 로드.
// commands/ 디렉토리의 .md 파일을 스킬로 인식.
// 참고: claude-hud 등 동작하는 플러그인의 실제 구조를 그대로 따름.
function registerPlugin() {
  const manifestPath = join(PKG_ROOT, 'plugin.json');
  if (!existsSync(manifestPath)) return false;

  // 플러그인 캐시 경로: ~/.claude/plugins/cache/tenetx-local/tenetx/{version}/
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));
  const version = pkg.version ?? '0.0.0';
  const CACHE_DIR = join(PLUGINS_DIR, 'cache', 'tenetx-local', 'tenetx', version);

  mkdirSync(CACHE_DIR, { recursive: true });

  // .claude-plugin/plugin.json 생성 (Claude Code 표준 구조)
  const claudePluginDir = join(CACHE_DIR, '.claude-plugin');
  mkdirSync(claudePluginDir, { recursive: true });

  const pluginMeta = {
    name: 'tenetx',
    description: pkg.description ?? 'Personalized harness for Claude Code',
    version,
    author: { name: pkg.author ?? 'jang-ujin' },
    homepage: pkg.repository?.url?.replace('git+', '').replace('.git', '') ?? '',
    license: pkg.license ?? 'MIT',
  };
  writeFileSync(join(claudePluginDir, 'plugin.json'), JSON.stringify(pluginMeta, null, 2));

  // commands/ 디렉토리에 스킬 파일 복사 (프론트매터를 Claude Code 표준으로 변환)
  // symlink 대신 복사하는 이유: sudo 설치 시 권한/경로 문제 방지
  const commandsDst = join(CACHE_DIR, 'commands');
  const skillsSrc = join(PKG_ROOT, 'commands');
  if (existsSync(skillsSrc)) {
    // 기존 symlink 제거
    if (existsSync(commandsDst)) {
      try { if (lstatSync(commandsDst).isSymbolicLink()) unlinkSync(commandsDst); } catch { /* ignore */ }
    }
    mkdirSync(commandsDst, { recursive: true });
    for (const file of readdirSync(skillsSrc).filter(f => f.endsWith('.md'))) {
      const raw = readFileSync(join(skillsSrc, file), 'utf-8');
      // description 추출
      const descMatch = raw.match(/description:\s*(.+)/);
      const desc = descMatch?.[1]?.trim() ?? file.replace('.md', '');
      // 프론트매터 이후 본문 추출
      const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      const body = bodyMatch?.[1]?.trim() ?? raw;
      // Claude Code 표준 프론트매터 (description만)
      writeFileSync(join(commandsDst, file), `---\ndescription: ${desc}\n---\n\n${body}\n`);
    }
  }

  // installed_plugins.json에 등록 (Claude Code 표준)
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

  // settings.json의 enabledPlugins에 등록
  let settings = {};
  if (existsSync(SETTINGS_PATH)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')); } catch { /* ignore */ }
  }
  const enabled = settings.enabledPlugins ?? {};
  enabled[pluginKey] = true;
  settings.enabledPlugins = enabled;
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));

  return true;
}

// ── 3. Install slash commands ──
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

function makeHookEntry(command, timeout) {
  return { matcher: '', hooks: [{ type: 'command', command, timeout }] };
}

/**
 * 훅 command 문자열을 생성.
 * Windows에서도 node CLI는 forward slash를 인식하므로 통일.
 */
function buildHookCommand(scriptPath, suffix) {
  // Windows 백슬래시를 forward slash로 정규화 (node는 양쪽 다 처리 가능)
  const normalized = scriptPath.replace(/\\/g, '/');
  return `node "${normalized}"${suffix}`;
}

function injectHooks() {
  // dist/hooks가 없으면 스킵 (빌드 전 상태)
  if (!existsSync(DIST_HOOKS)) return false;

  let settings = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      copyFileSync(SETTINGS_PATH, SETTINGS_BACKUP);
    } catch {
      // 파싱 실패 시 빈 설정으로 시작
    }
  }

  const hooksConfig = settings.hooks ?? {};

  // 기존 tenetx 훅 제거 후 재등록
  function filterNonTenetx(arr) {
    return (Array.isArray(arr) ? arr : []).filter((h) => !isTenetxHook(h));
  }

  // 훅 정의: [이벤트명, 스크립트파일, 타임아웃][]
  const hookDefs = [
    ['UserPromptSubmit', 'intent-classifier.js', 3000],
    ['UserPromptSubmit', 'keyword-detector.js', 5000],
    ['UserPromptSubmit', 'skill-injector.js', 3000],
    ['UserPromptSubmit', 'context-guard.js', 2000],
    ['UserPromptSubmit', 'notepad-injector.js', 3000],
    ['UserPromptSubmit', 'solution-injector.js', 3000],
    ['SessionStart', 'session-recovery.js', 3000],
    ['Stop', 'context-guard.js', 3000],
    ['PreToolUse', 'pre-tool-use.js', 3000],
    ['PreToolUse', 'db-guard.js', 3000],
    ['PreToolUse', 'rate-limiter.js', 2000],
    ['PostToolUse', 'post-tool-use.js', 3000],
    ['PostToolUse', 'secret-filter.js', 3000],
    ['PostToolUse', 'slop-detector.js', 3000],
    ['SubagentStart', 'subagent-tracker.js start', 2000],
    ['SubagentStop', 'subagent-tracker.js stop', 2000],
    ['PreCompact', 'pre-compact.js', 3000],
    ['PermissionRequest', 'permission-handler.js', 2000],
    ['PostToolUseFailure', 'post-tool-failure.js', 3000],
  ];

  // 이벤트별로 기존 non-tenetx 훅 유지 + tenetx 훅 추가
  const eventHooks = {};
  for (const [event, script, timeout] of hookDefs) {
    if (!eventHooks[event]) {
      eventHooks[event] = filterNonTenetx(hooksConfig[event]);
    }
    const scriptFile = script.includes(' ') ? script.split(' ')[0] : script;
    const suffix = script.includes(' ') ? ` ${script.split(' ').slice(1).join(' ')}` : '';
    const fullPath = join(DIST_HOOKS, scriptFile);
    if (existsSync(fullPath)) {
      eventHooks[event].push(makeHookEntry(buildHookCommand(fullPath, suffix), timeout));
    }
  }

  // 기존 hooksConfig에서 tenetx가 아닌 이벤트도 보존
  for (const [event, entries] of Object.entries(hooksConfig)) {
    if (!eventHooks[event]) {
      eventHooks[event] = entries;
    }
  }

  settings.hooks = eventHooks;

  // env에 COMPOUND_HARNESS 마커 (훅이 tenetx 환경임을 인식)
  const env = settings.env ?? {};
  env.COMPOUND_HARNESS = '1';
  settings.env = env;

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
}

// ── Main ──
function main() {
  ensureDirectories();

  let plugin = false;
  try {
    plugin = registerPlugin();
  } catch (err) {
    console.error(`[tenetx] plugin registration failed: ${err?.message ?? err}`);
  }

  let commands = 0;
  try {
    commands = installSlashCommands();
  } catch (err) {
    console.error(`[tenetx] slash commands failed: ${err?.message ?? err}`);
  }

  let hooks = false;
  try {
    hooks = injectHooks();
  } catch (err) {
    console.error(`[tenetx] hooks injection failed: ${err?.message ?? err}`);
  }

  // sudo 실행 시 파일 소유권을 실제 유저로 변경
  fixOwnership(join(HOME, '.claude'), join(HOME, '.compound'));

  const parts = [];
  if (plugin) parts.push('plugin');
  if (commands > 0) parts.push(`${commands} slash commands`);
  if (hooks) parts.push('hooks');
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
