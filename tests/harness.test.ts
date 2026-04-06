import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-harness-home',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

import { isFirstRun, rollbackSettings, prepareHarness } from '../src/core/harness.js';

const TEST_CLAUDE_DIR = path.join(TEST_HOME, '.claude');
const TEST_SETTINGS_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json');
const TEST_BACKUP_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json.tenetx-backup');
const TEST_LOCK_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json.lock');
const TEST_TENETX_HOME = path.join(TEST_HOME, '.tenetx');
const TEST_COMPOUND_HOME = path.join(TEST_HOME, '.compound');
const TEST_CWD = path.join(TEST_HOME, 'test-project');

describe('isFirstRun()', () => {
  beforeEach(() => { fs.rmSync(TEST_HOME, { recursive: true, force: true }); });
  afterEach(() => { fs.rmSync(TEST_HOME, { recursive: true, force: true }); });

  it('TENETX_HOME 디렉토리가 없으면 true', () => {
    expect(isFirstRun()).toBe(true);
  });

  it('TENETX_HOME 디렉토리가 있으면 false', () => {
    fs.mkdirSync(TEST_TENETX_HOME, { recursive: true });
    expect(isFirstRun()).toBe(false);
  });
});

describe('rollbackSettings()', () => {
  beforeEach(() => { fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true }); });
  afterEach(() => { fs.rmSync(TEST_HOME, { recursive: true, force: true }); });

  it('.tenetx-backup이 없으면 false', () => {
    expect(rollbackSettings()).toBe(false);
  });

  it('.tenetx-backup이 있으면 true + 복원', () => {
    fs.writeFileSync(TEST_BACKUP_PATH, JSON.stringify({ env: { RESTORED: 'yes' } }));
    expect(rollbackSettings()).toBe(true);

    const restored = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(restored.env.RESTORED).toBe('yes');
    expect(fs.existsSync(TEST_BACKUP_PATH)).toBe(false);
  });
});

describe('prepareHarness() integration', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD, { recursive: true });
    delete process.env.TMUX;
  });
  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    try { fs.rmSync(TEST_LOCK_PATH, { force: true }); } catch {}
  });

  it('settings.json에 환경변수가 주입된다', async () => {
    await prepareHarness(TEST_CWD);

    expect(fs.existsSync(TEST_SETTINGS_PATH)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.env.COMPOUND_HARNESS).toBe('1');
    expect(settings.env.TENETX_V1).toBe('1');
  });

  it('settings.json에 statusLine이 설정된다', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.statusLine).toEqual({
      type: 'command',
      command: 'tenetx me',
    });
  });

  it('커스텀 statusLine은 보존된다', async () => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({
      statusLine: { type: 'command', command: 'my-custom-status-tool' },
    }));

    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.statusLine.command).toBe('my-custom-status-tool');
  });

  it('v1 디렉토리 구조가 생성된다', async () => {
    await prepareHarness(TEST_CWD);

    expect(fs.existsSync(TEST_TENETX_HOME)).toBe(true);
    expect(fs.existsSync(path.join(TEST_TENETX_HOME, 'me'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_TENETX_HOME, 'me', 'rules'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_TENETX_HOME, 'state'))).toBe(true);
  });

  it('레거시 디렉토리도 생성된다', async () => {
    await prepareHarness(TEST_CWD);

    expect(fs.existsSync(TEST_COMPOUND_HOME)).toBe(true);
    expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, 'me'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, 'me', 'solutions'))).toBe(true);
  });

  it('V1HarnessContext를 올바르게 반환한다', async () => {
    const ctx = await prepareHarness(TEST_CWD);

    expect(ctx.cwd).toBe(TEST_CWD);
    expect(ctx.inTmux).toBe(false);
    expect(ctx.v1).toBeDefined();
    expect(typeof ctx.v1.needsOnboarding).toBe('boolean');
  });

  it('project-context.md 규칙이 생성된다', async () => {
    await prepareHarness(TEST_CWD);

    const rulesPath = path.join(TEST_CWD, '.claude', 'rules', 'project-context.md');
    expect(fs.existsSync(rulesPath)).toBe(true);
    const content = fs.readFileSync(rulesPath, 'utf-8');
    expect(content).toContain('Tenetx');
  });

  it('lockfile이 작업 후 정리된다', async () => {
    await prepareHarness(TEST_CWD);
    expect(fs.existsSync(TEST_LOCK_PATH)).toBe(false);
  });

  it('prepareHarness 두 번 호출 (idempotent)', async () => {
    await prepareHarness(TEST_CWD);
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.env.COMPOUND_HARNESS).toBe('1');
  });

  it('기존 env가 병합된다', async () => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: { MY_VAR: 'keep' } }));

    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.env.MY_VAR).toBe('keep');
    expect(settings.env.COMPOUND_HARNESS).toBe('1');
  });

  it('compound staleness marker 생성', async () => {
    const stateDir = path.join(TEST_COMPOUND_HOME, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'last-extraction.json'), JSON.stringify({
      lastExtractedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    await prepareHarness(TEST_CWD);

    const pendingPath = path.join(stateDir, 'pending-compound.json');
    expect(fs.existsSync(pendingPath)).toBe(true);
    const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
    expect(pending.reason).toBe('staleness');
  });

  it('stale lock을 강제 해제하고 진행', async () => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_LOCK_PATH, '99999');

    const ctx = await prepareHarness(TEST_CWD);
    expect(ctx).toBeDefined();
    expect(fs.existsSync(TEST_LOCK_PATH)).toBe(false);
  });
});

describe('rollback cycle via prepareHarness', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD, { recursive: true });
    delete process.env.TMUX;
  });
  afterEach(() => { fs.rmSync(TEST_HOME, { recursive: true, force: true }); });

  it('주입 후 rollback으로 원래 설정 복원', async () => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: { ORIGINAL: 'yes' } }));

    await prepareHarness(TEST_CWD);
    const injected = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(injected.env.COMPOUND_HARNESS).toBe('1');

    rollbackSettings();
    const restored = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(restored.env.ORIGINAL).toBe('yes');
    expect(restored.env.COMPOUND_HARNESS).toBeUndefined();
  });
});
