import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// vi.mock보다 먼저 실행되어야 하는 변수: vi.hoisted로 정의
const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-harness-home',
}));

// node:os mock — homedir()을 임시 디렉토리로 교체
// harness.ts와 paths.ts 모두 os.homedir() 기반으로 경로를 초기화하므로 여기서 가로챔
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

import { isFirstRun, rollbackSettings, prepareHarness } from '../src/core/harness.js';

// harness.ts의 모듈 레벨 상수와 동일한 경로 계산
const TEST_CLAUDE_DIR = path.join(TEST_HOME, '.claude');
const TEST_SETTINGS_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json');
const TEST_BACKUP_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json.tenetx-backup');
const TEST_LOCK_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json.lock');
const TEST_COMPOUND_HOME = path.join(TEST_HOME, '.compound');
const TEST_CWD = path.join(TEST_HOME, 'test-project');

// ────────────────────────────────────────────────────────────────────────────
// isFirstRun()
// ────────────────────────────────────────────────────────────────────────────
describe('isFirstRun()', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('COMPOUND_HOME 디렉토리가 없으면 true를 반환한다', () => {
    expect(isFirstRun()).toBe(true);
  });

  it('COMPOUND_HOME 디렉토리가 있으면 false를 반환한다', () => {
    fs.mkdirSync(TEST_COMPOUND_HOME, { recursive: true });
    expect(isFirstRun()).toBe(false);
  });

  it('COMPOUND_HOME 삭제 후 다시 true를 반환한다', () => {
    fs.mkdirSync(TEST_COMPOUND_HOME, { recursive: true });
    expect(isFirstRun()).toBe(false);

    fs.rmSync(TEST_COMPOUND_HOME, { recursive: true });
    expect(isFirstRun()).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// rollbackSettings()
// ────────────────────────────────────────────────────────────────────────────
describe('rollbackSettings()', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('.tenetx-backup 파일이 없으면 false를 반환한다', () => {
    expect(rollbackSettings()).toBe(false);
  });

  it('.tenetx-backup 파일이 있으면 true를 반환한다', () => {
    fs.writeFileSync(TEST_BACKUP_PATH, JSON.stringify({ env: { RESTORED: 'yes' } }));
    expect(rollbackSettings()).toBe(true);
  });

  it('.tenetx-backup 내용이 settings.json으로 정확히 복원된다', () => {
    const original = { env: { RESTORED: 'yes' } };
    fs.writeFileSync(TEST_BACKUP_PATH, JSON.stringify(original));
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: { CORRUPTED: 'data' } }));

    rollbackSettings();

    const restored = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(restored.env.RESTORED).toBe('yes');
    expect(restored.env.CORRUPTED).toBeUndefined();
  });

  it('복원 후 .tenetx-backup 파일이 삭제된다', () => {
    fs.writeFileSync(TEST_BACKUP_PATH, JSON.stringify({ env: {} }));

    rollbackSettings();

    expect(fs.existsSync(TEST_BACKUP_PATH)).toBe(false);
  });

  it('settings.json이 없어도 백업에서 복원이 가능하다', () => {
    const backupContent = JSON.stringify({ env: { KEY: 'val' } });
    fs.writeFileSync(TEST_BACKUP_PATH, backupContent);

    const result = rollbackSettings();

    expect(result).toBe(true);
    const restored = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(restored.env.KEY).toBe('val');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// prepareHarness() 통합 테스트
// ────────────────────────────────────────────────────────────────────────────
describe('prepareHarness() integration', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD, { recursive: true });
    // TMUX 환경변수 제거 (tmux 바인딩 스킵)
    delete process.env.TMUX;
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    // lockfile 잔존 방지
    try { fs.rmSync(TEST_LOCK_PATH, { force: true }); } catch {}
  });

  it('settings.json에 환경변수가 주입된다', async () => {
    await prepareHarness(TEST_CWD);

    expect(fs.existsSync(TEST_SETTINGS_PATH)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.env).toBeDefined();
    expect(settings.env.COMPOUND_HARNESS).toBe('1');
    expect(settings.env.COMPOUND_PHILOSOPHY).toBeDefined();
    expect(settings.env.COMPOUND_SCOPE).toBeDefined();
  });

  it('settings.json에 hooks가 등록된다', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    // 최소한 주요 훅 이벤트 키가 존재
    expect(settings.hooks.UserPromptSubmit).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
  });

  it('settings.json에 statusLine이 설정된다', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.statusLine).toEqual({
      type: 'command',
      command: 'tenetx status',
    });
  });

  // ── statusLine 보존 테스트 ──

  it('기존 tenetx statusLine → 덮어쓰기', async () => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({
      statusLine: { type: 'command', command: 'tenetx old-status' },
    }));

    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.statusLine.command).toBe('tenetx status');
  });

  it('기존 커스텀 statusLine → 보존', async () => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({
      statusLine: { type: 'command', command: 'my-custom-status-tool' },
    }));

    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    // 사용자 커스텀 statusLine은 보존되어야 함
    expect(settings.statusLine.command).toBe('my-custom-status-tool');
  });

  it('statusLine 없음 → tenetx 설정', async () => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: {} }));

    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.statusLine).toEqual({
      type: 'command',
      command: 'tenetx status',
    });
  });

  it('settings.json.tenetx-backup이 생성된다 (기존 settings가 있을 때)', async () => {
    // 기존 settings 생성
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    const original = { env: { EXISTING: 'value' }, customKey: true };
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(original));

    await prepareHarness(TEST_CWD);

    expect(fs.existsSync(TEST_BACKUP_PATH)).toBe(true);
    const backup = JSON.parse(fs.readFileSync(TEST_BACKUP_PATH, 'utf-8'));
    expect(backup.env.EXISTING).toBe('value');
    expect(backup.customKey).toBe(true);
  });

  it('기존 settings.json의 env가 병합된다 (덮어쓰기 아님)', async () => {
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: { MY_VAR: 'keep' } }));

    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.env.MY_VAR).toBe('keep');
    expect(settings.env.COMPOUND_HARNESS).toBe('1');
  });

  it('~/.compound/ 디렉토리 구조가 생성된다', async () => {
    await prepareHarness(TEST_CWD);

    expect(fs.existsSync(TEST_COMPOUND_HOME)).toBe(true);
    expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, 'state'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, 'me'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, 'me', 'solutions'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, 'me', 'rules'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, 'sessions'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, 'handoffs'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, 'plans'))).toBe(true);
  });

  it('compound rules가 프로젝트 .claude/rules/compound.md에 생성된다', async () => {
    await prepareHarness(TEST_CWD);

    const rulesPath = path.join(TEST_CWD, '.claude', 'rules', 'compound.md');
    expect(fs.existsSync(rulesPath)).toBe(true);
    const content = fs.readFileSync(rulesPath, 'utf-8');
    expect(content).toContain('Tenetx');

    // 레거시 경로에는 파일이 없어야 함
    const legacyPath = path.join(TEST_CWD, '.claude', 'compound-rules.md');
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  it('HarnessContext를 올바르게 반환한다', async () => {
    const ctx = await prepareHarness(TEST_CWD);

    expect(ctx.cwd).toBe(TEST_CWD);
    expect(ctx.philosophy).toBeDefined();
    expect(ctx.philosophy.name).toBeDefined();
    expect(ctx.philosophySource).toBeDefined();
    expect(['project', 'global', 'default']).toContain(ctx.philosophySource);
    expect(ctx.scope).toBeDefined();
    expect(ctx.inTmux).toBe(false);
    expect(ctx.modelRouting).toBeDefined();
    expect(ctx.signalRoutingEnabled).toBe(true);
  });

  it('lockfile이 작업 후 정리된다', async () => {
    await prepareHarness(TEST_CWD);

    expect(fs.existsSync(TEST_LOCK_PATH)).toBe(false);
  });

  it('prepareHarness를 두 번 호출해도 정상 동작한다 (idempotent)', async () => {
    await prepareHarness(TEST_CWD);
    await prepareHarness(TEST_CWD);

    await prepareHarness(TEST_CWD);
    const secondSettings = fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8');

    // 두 번째 호출 후에도 settings는 유효한 JSON
    const parsed = JSON.parse(secondSettings);
    expect(parsed.env.COMPOUND_HARNESS).toBe('1');
  });

  it('에이전트 파일에 tenetx-managed 마커가 있으면 업데이트된다 (10E)', async () => {
    await prepareHarness(TEST_CWD);

    const agentsDir = path.join(TEST_CWD, '.claude', 'agents');
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter(f => f.startsWith('ch-'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
        expect(content).toContain('<!-- tenetx-managed -->');
      }
    }
  });

  it('사용자 수정 에이전트 파일은 덮어쓰지 않는다 (10E)', async () => {
    await prepareHarness(TEST_CWD);

    const agentsDir = path.join(TEST_CWD, '.claude', 'agents');
    if (!fs.existsSync(agentsDir)) return;

    const files = fs.readdirSync(agentsDir).filter(f => f.startsWith('ch-'));
    if (files.length === 0) return;

    // 에이전트 파일을 사용자가 수정한 것처럼 마커 제거
    const testFile = path.join(agentsDir, files[0]);
    fs.writeFileSync(testFile, '# My Custom Agent\nCustomized by user');

    // 다시 prepareHarness 실행
    await prepareHarness(TEST_CWD);

    // 사용자 수정이 보존되어야 함
    const content = fs.readFileSync(testFile, 'utf-8');
    expect(content).toContain('Customized by user');
  });

  it('settings.json에 COMPOUND_PHILOSOPHY_SOURCE가 포함된다', async () => {
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.env.COMPOUND_PHILOSOPHY_SOURCE).toBeDefined();
    expect(['project', 'global', 'default']).toContain(settings.env.COMPOUND_PHILOSOPHY_SOURCE);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// injectSettings 동작 검증 (prepareHarness를 통한 간접 테스트)
// ────────────────────────────────────────────────────────────────────────────
describe('injectSettings via prepareHarness — rollback cycle', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD, { recursive: true });
    delete process.env.TMUX;
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('주입 후 rollback으로 원래 설정 복원이 가능하다', async () => {
    // 원본 settings 생성
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    const original = { env: { ORIGINAL: 'yes' } };
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(original));

    // prepareHarness로 주입
    await prepareHarness(TEST_CWD);
    const injected = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(injected.env.COMPOUND_HARNESS).toBe('1');

    // rollback으로 복원
    const result = rollbackSettings();
    expect(result).toBe(true);

    const restored = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(restored.env.ORIGINAL).toBe('yes');
    expect(restored.env.COMPOUND_HARNESS).toBeUndefined();
  });

  it('이미 주입된 상태에서 재주입해도 기존 사용자 env가 유지된다', async () => {
    // 사용자 env 포함 settings 생성
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: { USER_KEY: 'my-value' } }));

    // 첫 번째 주입
    await prepareHarness(TEST_CWD);
    // 두 번째 주입 (idempotent)
    await prepareHarness(TEST_CWD);

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.env.USER_KEY).toBe('my-value');
    expect(settings.env.COMPOUND_HARNESS).toBe('1');
  });

  it('lockfile 동시 접근 시뮬레이션 — stale lock 강제 획득', async () => {
    // 미리 stale lockfile 생성
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(TEST_LOCK_PATH, '99999'); // 존재하지 않는 PID

    // prepareHarness가 stale lock을 강제 해제하고 진행해야 함
    const ctx = await prepareHarness(TEST_CWD);
    expect(ctx).toBeDefined();
    expect(ctx.philosophy).toBeDefined();

    // lockfile은 작업 후 정리됨
    expect(fs.existsSync(TEST_LOCK_PATH)).toBe(false);
  });
});
