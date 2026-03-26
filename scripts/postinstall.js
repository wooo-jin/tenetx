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
    // js-yaml 의존성 복사 (solution-matcher가 사용)
    const jsYamlSrc = join(PKG_ROOT, 'node_modules', 'js-yaml');
    if (existsSync(jsYamlSrc)) {
      const nmDst = join(CACHE_DIR, 'node_modules', 'js-yaml');
      mkdirSync(join(CACHE_DIR, 'node_modules'), { recursive: true });
      cpSync(jsYamlSrc, nmDst, { recursive: true });
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

  for (const file of readdirSync(skillsSrc).filter(f => f.endsWith('.md'))) {
    const name = file.replace('.md', '');
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

function injectHooks() {
  // dist/hooks가 없으면 스킵
  if (!existsSync(DIST_HOOKS)) return false;

  let settings = {};
  if (existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch { /* 파싱 실패 시 빈 설정으로 시작 */ }
  }

  // 기존 tenetx 훅 정리 (이전 버전에서 settings.json에 주입한 잔재 제거)
  const hooksConfig = settings.hooks ?? {};
  for (const [event, entries] of Object.entries(hooksConfig)) {
    if (Array.isArray(entries)) {
      hooksConfig[event] = entries.filter(h => !isTenetxHook(h));
      if (hooksConfig[event].length === 0) delete hooksConfig[event];
    }
  }
  settings.hooks = Object.keys(hooksConfig).length > 0 ? hooksConfig : undefined;
  // undefined면 JSON.stringify에서 키 자체가 제거됨

  // env에 COMPOUND_HARNESS 마커만 설정
  const env = settings.env ?? {};
  env.COMPOUND_HARNESS = '1';
  settings.env = env;

  // 불필요한 키 정리
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

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
