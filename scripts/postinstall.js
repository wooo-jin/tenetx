#!/usr/bin/env node
/**
 * Tenetx — postinstall script
 *
 * npm i -g tenetx 시 자동 실행.
 * tenetx CLI(harness)를 거치지 않고 claude를 직접 실행해도
 * 슬래시 명령, 훅, 디렉토리 구조가 모두 동작하도록 보장합니다.
 *
 * 설계 결정:
 *   - forge overlay 없이 기본 스킬만 설치 (overlay는 harness 실행 시 적용)
 *   - 사용자가 수정한 파일(<!-- tenetx-managed --> 마커 없음)은 보존
 *   - settings.json의 기존 non-tenetx 설정은 보존
 *   - 실패해도 npm install을 깨뜨리지 않음 (silent failure)
 */

import { readFileSync, readdirSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

/**
 * sudo npm i -g 시 homedir()이 /root를 반환하는 문제 해결.
 * SUDO_USER가 있으면 실제 유저의 홈 디렉토리를 찾는다.
 */
function resolveHome() {
  const sudoUser = process.env.SUDO_USER;
  if (sudoUser && process.getuid?.() === 0) {
    try {
      // getent passwd로 실제 유저 홈 조회 (Linux/macOS 공통)
      const entry = execSync(`getent passwd ${sudoUser}`, { encoding: 'utf-8' }).trim();
      const home = entry.split(':')[5];
      if (home) return home;
    } catch { /* fallback */ }
    // fallback: /home/{user} (Linux 기본)
    return join('/home', sudoUser);
  }
  return homedir();
}

const HOME = resolveHome();

// ── Paths ──
const SKILLS_DIR = join(PKG_ROOT, 'skills');
const DIST_HOOKS = join(PKG_ROOT, 'dist', 'hooks');
const COMMANDS_DIR = join(HOME, '.claude', 'commands', 'tenetx');
const CLAUDE_DIR = join(HOME, '.claude');
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

// ── 2. Install slash commands ──
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

/** 훅 경로가 tenetx dist/hooks를 가리키는지 판별 */
function isTenetxHook(entry) {
  const check = (cmd) => cmd.includes('/dist/hooks/') && cmd.includes('tenetx');
  if (typeof entry.command === 'string' && check(entry.command)) return true;
  if (Array.isArray(entry.hooks)) {
    return entry.hooks.some((h) => typeof h.command === 'string' && check(h.command));
  }
  return false;
}

function makeHookEntry(command, timeout) {
  return { matcher: '', hooks: [{ type: 'command', command, timeout }] };
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
    // 스크립트 파일명에서 실제 경로 구성 (공백 포함 가능)
    const scriptFile = script.includes(' ') ? script.split(' ')[0] : script;
    const suffix = script.includes(' ') ? ` ${script.split(' ').slice(1).join(' ')}` : '';
    const fullPath = join(DIST_HOOKS, scriptFile);
    if (existsSync(fullPath)) {
      eventHooks[event].push(makeHookEntry(`node "${fullPath}"${suffix}`, timeout));
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
  const commands = installSlashCommands();
  const hooks = injectHooks();

  const parts = [];
  if (commands > 0) parts.push(`${commands} slash commands`);
  if (hooks) parts.push('hooks');
  if (parts.length > 0) {
    console.log(`[tenetx] Installed: ${parts.join(', ')}`);
  }
}

try {
  main();
} catch {
  // postinstall 실패가 npm install을 깨뜨리지 않도록 silent failure
}
