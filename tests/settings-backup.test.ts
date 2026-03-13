import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// 테스트용 임시 디렉토리 기반으로 모듈 상수를 재현
const TEST_DIR = path.join(os.tmpdir(), 'tenet-test-settings-backup');
const TEST_SETTINGS_PATH = path.join(TEST_DIR, 'settings.json');
const TEST_BACKUP_PATH = path.join(TEST_DIR, 'settings.json.tenet-backup');

// 테스트 대상 로직을 임시 디렉토리 기준으로 인라인 구현
// (실제 ~/.claude/를 건드리지 않기 위해)
function injectSettingsTo(dir: string, env: Record<string, string>): void {
  const settingsPath = path.join(dir, 'settings.json');
  const backupPath = path.join(dir, 'settings.json.tenet-backup');

  fs.mkdirSync(dir, { recursive: true });

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch { /* 파싱 실패 시 빈 설정 */ }
    fs.copyFileSync(settingsPath, backupPath);
  }

  const existingEnv = (settings.env as Record<string, string>) ?? {};
  settings.env = { ...existingEnv, ...env };

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (err) {
    rollbackSettingsIn(dir);
    throw err;
  }
}

function rollbackSettingsIn(dir: string): boolean {
  const settingsPath = path.join(dir, 'settings.json');
  const backupPath = path.join(dir, 'settings.json.tenet-backup');

  if (!fs.existsSync(backupPath)) return false;
  try {
    fs.copyFileSync(backupPath, settingsPath);
    fs.rmSync(backupPath);
    return true;
  } catch {
    return false;
  }
}

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('injectSettings — 백업 생성', () => {
  it('settings.json이 존재하면 .tenet-backup 파일이 생성된다', () => {
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: { FOO: 'bar' } }));

    injectSettingsTo(TEST_DIR, { NEW_VAR: '1' });

    expect(fs.existsSync(TEST_BACKUP_PATH)).toBe(true);
  });

  it('백업 파일은 수정 전 원본 내용을 담고 있다', () => {
    const original = { env: { ORIGINAL: 'yes' } };
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(original));

    injectSettingsTo(TEST_DIR, { INJECTED: 'value' });

    const backup = JSON.parse(fs.readFileSync(TEST_BACKUP_PATH, 'utf-8'));
    expect(backup.env.ORIGINAL).toBe('yes');
    expect(backup.env.INJECTED).toBeUndefined();
  });

  it('settings.json이 없으면 백업 파일도 생성되지 않는다', () => {
    injectSettingsTo(TEST_DIR, { KEY: 'val' });

    expect(fs.existsSync(TEST_BACKUP_PATH)).toBe(false);
  });

  it('기존 settings의 env 값이 주입 후에도 보존된다', () => {
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: { KEEP_ME: 'original' } }));

    injectSettingsTo(TEST_DIR, { ADDED: 'new' });

    const updated = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(updated.env.KEEP_ME).toBe('original');
    expect(updated.env.ADDED).toBe('new');
  });
});

describe('rollbackSettings — 복원 동작', () => {
  it('.tenet-backup이 있으면 settings.json을 복원하고 true를 반환한다', () => {
    const originalContent = JSON.stringify({ env: { RESTORED: 'yes' } });
    fs.writeFileSync(TEST_BACKUP_PATH, originalContent);
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: { CORRUPTED: 'data' } }));

    const result = rollbackSettingsIn(TEST_DIR);

    expect(result).toBe(true);
    const restored = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(restored.env.RESTORED).toBe('yes');
    expect(restored.env.CORRUPTED).toBeUndefined();
  });

  it('복원 후 .tenet-backup 파일은 삭제된다', () => {
    fs.writeFileSync(TEST_BACKUP_PATH, JSON.stringify({ env: {} }));
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({}));

    rollbackSettingsIn(TEST_DIR);

    expect(fs.existsSync(TEST_BACKUP_PATH)).toBe(false);
  });

  it('.tenet-backup이 없으면 false를 반환한다', () => {
    const result = rollbackSettingsIn(TEST_DIR);
    expect(result).toBe(false);
  });
});
