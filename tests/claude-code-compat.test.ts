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

// hooks/hooks.json 경로 (플러그인 시스템이 읽는 파일)
const PKG_ROOT = path.resolve(__dirname, '..');
const HOOKS_JSON_PATH = path.join(PKG_ROOT, 'hooks', 'hooks.json');

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

  // ── 훅 스키마 검증 (hooks/hooks.json 플러그인 파일) ──────────────────────

  it('모든 훅 엔트리가 { matcher, hooks: [{ type, command, timeout }] } 스키마를 따른다', () => {
    const hooksFile = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf-8'));
    const hooks = hooksFile.hooks as Record<string, unknown[]>;
    expect(hooks).toBeDefined();

    for (const [eventName, entries] of Object.entries(hooks)) {
      expect(Array.isArray(entries), `${eventName} must be an array`).toBe(true);
      for (const entry of entries as Record<string, unknown>[]) {
        expect(typeof entry.matcher, `${eventName} entry.matcher must be string`).toBe('string');
        expect(entry.matcher, `${eventName} entry.matcher must be "*" (omc standard)`).toBe('*');
        expect(Array.isArray(entry.hooks), `${eventName} entry.hooks must be array`).toBe(true);
        for (const hook of entry.hooks as Record<string, unknown>[]) {
          expect(typeof hook.type, `${eventName} hook.type must be string`).toBe('string');
          expect(typeof hook.command, `${eventName} hook.command must be string`).toBe('string');
          expect(typeof hook.timeout, `${eventName} hook.timeout must be number`).toBe('number');
          // timeout은 초 단위 (밀리초가 아님)
          expect(hook.timeout as number, `${eventName} hook.timeout must be in seconds (<=60)`).toBeLessThanOrEqual(60);
        }
      }
    }
  });

  it('필수 훅 이벤트 타입이 모두 존재한다', () => {
    const hooksFile = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf-8'));
    const hooks = hooksFile.hooks as Record<string, unknown[]>;

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

  it('훅 커맨드가 ${CLAUDE_PLUGIN_ROOT} 기반 경로를 사용한다', () => {
    const hooksFile = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf-8'));
    const hooks = hooksFile.hooks as Record<string, unknown[]>;

    for (const [eventName, entries] of Object.entries(hooks)) {
      for (const entry of entries as Record<string, unknown>[]) {
        for (const hook of (entry.hooks as Record<string, unknown>[])) {
          const command = hook.command as string;
          expect(
            command.includes('${CLAUDE_PLUGIN_ROOT}'),
            `${eventName} hook command must use \${CLAUDE_PLUGIN_ROOT}: ${command}`,
          ).toBe(true);
          // dist/hooks/ 경로 패턴 확인
          expect(
            command.includes('dist/hooks/'),
            `${eventName} hook command must point to dist/hooks/: ${command}`,
          ).toBe(true);
        }
      }
    }
  });

  it('settings.json에 tenetx 훅이 주입되지 않는다 (플러그인 시스템 전환 후)', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    // hooks 키가 없거나 비어 있어야 함 (이전 잔재 정리 후)
    if (settings.hooks) {
      // hooks가 있다면 tenetx 관련 훅은 없어야 함
      for (const [, entries] of Object.entries(settings.hooks as Record<string, unknown[]>)) {
        for (const entry of entries as Record<string, unknown>[]) {
          const hooksList = entry.hooks as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(hooksList)) {
            for (const hook of hooksList) {
              const command = hook.command as string;
              expect(
                command.includes('dist/hooks/') && command.includes('tenetx'),
                `tenetx hook should not be in settings.json: ${command}`,
              ).toBe(false);
            }
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
