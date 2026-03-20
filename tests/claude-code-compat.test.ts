import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// vi.mock보다 먼저 실행되어야 하는 변수: vi.hoisted로 정의
const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-compat-home',
}));

// node:os mock — homedir()을 임시 디렉토리로 교체
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

import { prepareHarness } from '../src/core/harness.js';

const TEST_CLAUDE_DIR = path.join(TEST_HOME, '.claude');
const TEST_SETTINGS_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json');
const TEST_LOCK_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json.lock');
const TEST_CWD = path.join(TEST_HOME, 'test-project');

// Claude Code 호환성 검증 — 훅 스키마, env vars, statusLine
describe('Claude Code compatibility', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD, { recursive: true });
    delete process.env.TMUX;
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    try { fs.rmSync(TEST_LOCK_PATH, { force: true }); } catch {}
  });

  // ── 훅 스키마 검증 ──────────────────────────────────────────────────────

  it('모든 훅 엔트리가 { matcher, hooks: [{ type, command, timeout }] } 스키마를 따른다', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    const hooks = settings.hooks as Record<string, unknown[]>;
    expect(hooks).toBeDefined();

    for (const [eventName, entries] of Object.entries(hooks)) {
      expect(Array.isArray(entries), `${eventName} must be an array`).toBe(true);
      for (const entry of entries as Record<string, unknown>[]) {
        expect(typeof entry.matcher, `${eventName} entry.matcher must be string`).toBe('string');
        expect(Array.isArray(entry.hooks), `${eventName} entry.hooks must be array`).toBe(true);
        for (const hook of entry.hooks as Record<string, unknown>[]) {
          expect(typeof hook.type, `${eventName} hook.type must be string`).toBe('string');
          expect(typeof hook.command, `${eventName} hook.command must be string`).toBe('string');
          expect(typeof hook.timeout, `${eventName} hook.timeout must be number`).toBe('number');
        }
      }
    }
  });

  it('필수 훅 이벤트 타입이 모두 존재한다', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    const hooks = settings.hooks as Record<string, unknown[]>;

    const requiredEvents = [
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'SessionStart',
      'Stop',
      'SubagentStart',
      'SubagentStop',
      'PreCompact',
      'PermissionRequest',
      'PostToolUseFailure',
    ];

    for (const event of requiredEvents) {
      expect(hooks[event], `훅 이벤트 '${event}'가 존재해야 함`).toBeDefined();
      expect(Array.isArray(hooks[event]), `hooks.${event} must be array`).toBe(true);
    }
  });

  it('훅 커맨드가 가리키는 .js 파일이 실제로 존재한다', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    const hooks = settings.hooks as Record<string, unknown[]>;

    for (const [eventName, entries] of Object.entries(hooks)) {
      for (const entry of entries as Record<string, unknown>[]) {
        for (const hook of (entry.hooks as Record<string, unknown>[])) {
          const command = hook.command as string;
          // node "path/to/hook.js" 형식에서 경로 추출
          const match = command.match(/node\s+"([^"]+\.js)"/);
          if (match) {
            const hookPath = match[1];
            expect(
              fs.existsSync(hookPath),
              `${eventName} hook 파일이 존재해야 함: ${hookPath}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  // ── env vars 검증 ────────────────────────────────────────────────────────

  it('COMPOUND_PHILOSOPHY_SOURCE env var가 settings.json에 존재한다', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.env).toBeDefined();
    expect(settings.env.COMPOUND_PHILOSOPHY_SOURCE).toBeDefined();
    expect(['project', 'global', 'default']).toContain(settings.env.COMPOUND_PHILOSOPHY_SOURCE);
  });

  // ── statusLine 검증 ──────────────────────────────────────────────────────

  it('statusLine이 type: "command" 이고 command가 "tenetx"로 시작한다', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.statusLine).toBeDefined();
    expect(settings.statusLine.type).toBe('command');
    expect(typeof settings.statusLine.command).toBe('string');
    expect(settings.statusLine.command.startsWith('tenetx')).toBe(true);
  });
});
