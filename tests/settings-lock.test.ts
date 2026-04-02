import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// vi.hoisted()로 mock 값을 먼저 생성 (vi.mock 호이스팅보다 앞서 평가)
const mocks = vi.hoisted(() => {
  const tmpDir = '/tmp/tenetx-settings-lock-test-' + process.pid;
  return {
    CLAUDE_DIR: tmpDir,
    SETTINGS_PATH: tmpDir + '/settings.json',
  };
});

vi.mock('../src/core/paths.js', () => ({
  CLAUDE_DIR: mocks.CLAUDE_DIR,
  SETTINGS_PATH: mocks.SETTINGS_PATH,
  COMPOUND_HOME: '/tmp/tenetx-compound-test-' + process.pid,
  ME_DIR: '/tmp/tenetx-compound-test-' + process.pid + '/me',
  ME_PHILOSOPHY: '/tmp/tenetx-compound-test-' + process.pid + '/me/philosophy.json',
  ME_SOLUTIONS: '/tmp/tenetx-compound-test-' + process.pid + '/me/solutions',
  ME_BEHAVIOR: '/tmp/tenetx-compound-test-' + process.pid + '/me/behavior',
  ME_RULES: '/tmp/tenetx-compound-test-' + process.pid + '/me/rules',
  PACKS_DIR: '/tmp/tenetx-compound-test-' + process.pid + '/packs',
  STATE_DIR: '/tmp/tenetx-compound-test-' + process.pid + '/state',
  SESSIONS_DIR: '/tmp/tenetx-compound-test-' + process.pid + '/sessions',
  GLOBAL_CONFIG: '/tmp/tenetx-compound-test-' + process.pid + '/config.json',
  LAB_DIR: '/tmp/tenetx-compound-test-' + process.pid + '/lab',
  LAB_EVENTS: '/tmp/tenetx-compound-test-' + process.pid + '/lab/events.jsonl',
  FORGE_PROFILE: '/tmp/tenetx-compound-test-' + process.pid + '/me/forge-profile.json',
  ALL_MODES: ['ralph', 'autopilot', 'ultrawork', 'team', 'pipeline', 'ccg', 'ralplan', 'deep-interview', 'ecomode'],
  projectDir: (cwd: string) => path.join(cwd, '.compound'),
  packLinkPath: (cwd: string) => path.join(cwd, '.compound', 'pack.link'),
  projectPhilosophyPath: (cwd: string) => path.join(cwd, '.compound', 'philosophy.json'),
  projectForgeProfilePath: (cwd: string) => path.join(cwd, '.compound', 'forge-profile.json'),
}));

import {
  acquireLock,
  releaseLock,
  atomicWriteFileSync,
  readSettings,
  writeSettings,
  rollbackSettings,
  SETTINGS_BACKUP_PATH,
} from '../src/core/settings-lock.js';

const TEST_DIR = mocks.CLAUDE_DIR;
const TEST_SETTINGS_PATH = mocks.SETTINGS_PATH;
const LOCK_PATH = TEST_DIR + '/settings.json.lock';

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  // 잠금 파일 및 임시 파일 정리
  try { fs.rmSync(LOCK_PATH, { force: true }); } catch { /* ignore */ }
  try { fs.rmSync(TEST_SETTINGS_PATH, { force: true }); } catch { /* ignore */ }
  try { fs.rmSync(SETTINGS_BACKUP_PATH, { force: true }); } catch { /* ignore */ }
  // .pre-rollback 파일 정리
  try { fs.rmSync(TEST_SETTINGS_PATH + '.pre-rollback', { force: true }); } catch { /* ignore */ }
  // tmp 파일 정리
  const dir = TEST_DIR;
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.tmp.' + process.pid)) {
        try { fs.rmSync(path.join(dir, f), { force: true }); } catch { /* ignore */ }
      }
    }
  }
});

describe('acquireLock / releaseLock', () => {
  it('acquireLock()이 PID를 담은 lock 파일을 생성한다', () => {
    acquireLock();
    expect(fs.existsSync(LOCK_PATH)).toBe(true);
    const content = fs.readFileSync(LOCK_PATH, 'utf-8').trim();
    expect(content).toBe(String(process.pid));
    releaseLock();
  });

  it('releaseLock()이 lock 파일을 삭제한다', () => {
    acquireLock();
    expect(fs.existsSync(LOCK_PATH)).toBe(true);
    releaseLock();
    expect(fs.existsSync(LOCK_PATH)).toBe(false);
  });

  it('lock 파일이 없을 때 releaseLock()은 오류 없이 완료된다', () => {
    expect(() => releaseLock()).not.toThrow();
  });

  it('lock 파일이 현재 PID를 정확히 담고 있다', () => {
    acquireLock();
    const pid = parseInt(fs.readFileSync(LOCK_PATH, 'utf-8').trim(), 10);
    expect(pid).toBe(process.pid);
    releaseLock();
  });
});

describe('atomicWriteFileSync', () => {
  it('대상 파일이 존재한다', () => {
    const target = path.join(TEST_DIR, 'atomic-test.txt');
    atomicWriteFileSync(target, 'hello world');
    expect(fs.existsSync(target)).toBe(true);
    fs.rmSync(target, { force: true });
  });

  it('쓴 내용과 읽은 내용이 일치한다', () => {
    const target = path.join(TEST_DIR, 'atomic-content.txt');
    atomicWriteFileSync(target, 'atomic data');
    expect(fs.readFileSync(target, 'utf-8')).toBe('atomic data');
    fs.rmSync(target, { force: true });
  });

  it('기존 파일을 덮어쓴다', () => {
    const target = path.join(TEST_DIR, 'atomic-overwrite.txt');
    atomicWriteFileSync(target, 'old content');
    atomicWriteFileSync(target, 'new content');
    expect(fs.readFileSync(target, 'utf-8')).toBe('new content');
    fs.rmSync(target, { force: true });
  });

  it('.tmp 임시 파일이 완료 후 남지 않는다', () => {
    const target = path.join(TEST_DIR, 'atomic-tmp.txt');
    atomicWriteFileSync(target, 'data');
    const tmpPath = `${target}.tmp.${process.pid}`;
    expect(fs.existsSync(tmpPath)).toBe(false);
    fs.rmSync(target, { force: true });
  });
});

describe('readSettings', () => {
  it('파일이 없으면 빈 객체를 반환한다', () => {
    const result = readSettings();
    expect(result).toEqual({});
  });

  it('유효한 JSON을 파싱하여 반환한다', () => {
    const data = { hooks: { preToolUse: [] }, env: { FOO: 'bar' } };
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(data));
    const result = readSettings();
    expect(result).toEqual(data);
  });

  it('중첩 객체를 올바르게 파싱한다', () => {
    const data = { a: { b: { c: 42 } } };
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(data));
    const result = readSettings();
    expect((result.a as { b: { c: number } }).b.c).toBe(42);
  });

  it('손상된 JSON에서 SyntaxError를 throw한다', () => {
    fs.writeFileSync(TEST_SETTINGS_PATH, '{ invalid json }');
    expect(() => readSettings()).toThrow(SyntaxError);
  });

  it('빈 JSON 파일에서 SyntaxError를 throw한다', () => {
    fs.writeFileSync(TEST_SETTINGS_PATH, '');
    expect(() => readSettings()).toThrow();
  });
});

describe('writeSettings', () => {
  it('settings.json을 생성한다', () => {
    writeSettings({ env: { KEY: 'value' } });
    expect(fs.existsSync(TEST_SETTINGS_PATH)).toBe(true);
    releaseLock(); // 혹시 남아있는 락 정리
  });

  it('쓴 내용이 파일에 올바르게 저장된다', () => {
    const data = { hooks: [], env: { TEST: '1' } };
    writeSettings(data);
    const saved = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(saved).toEqual(data);
  });

  it('기존 settings.json이 있으면 백업 파일을 생성한다', () => {
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ original: true }));
    writeSettings({ updated: true });
    expect(fs.existsSync(SETTINGS_BACKUP_PATH)).toBe(true);
  });

  it('백업 파일에 수정 전 원본 내용이 담겨있다', () => {
    const original = { env: { ORIGINAL: 'yes' } };
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(original));
    writeSettings({ env: { UPDATED: 'no' } });
    const backup = JSON.parse(fs.readFileSync(SETTINGS_BACKUP_PATH, 'utf-8'));
    expect(backup.env.ORIGINAL).toBe('yes');
    expect(backup.env.UPDATED).toBeUndefined();
  });

  it('writeSettings 후 lock 파일이 해제된다', () => {
    writeSettings({ test: true });
    expect(fs.existsSync(LOCK_PATH)).toBe(false);
  });

  it('settings.json이 없으면 백업이 생성되지 않는다', () => {
    writeSettings({ fresh: true });
    expect(fs.existsSync(SETTINGS_BACKUP_PATH)).toBe(false);
  });
});

describe('rollbackSettings', () => {
  it('백업이 없으면 false를 반환한다', () => {
    const result = rollbackSettings();
    expect(result).toBe(false);
  });

  it('백업이 있으면 true를 반환한다', () => {
    fs.writeFileSync(SETTINGS_BACKUP_PATH, JSON.stringify({ restored: true }));
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ broken: true }));
    const result = rollbackSettings();
    expect(result).toBe(true);
  });

  it('백업에서 settings.json을 복원한다', () => {
    const originalContent = { env: { RESTORED: 'yes' } };
    fs.writeFileSync(SETTINGS_BACKUP_PATH, JSON.stringify(originalContent));
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ corrupted: true }));
    rollbackSettings();
    const restored = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(restored.env.RESTORED).toBe('yes');
    expect(restored.corrupted).toBeUndefined();
  });

  it('rollback 후 백업 파일이 삭제된다', () => {
    fs.writeFileSync(SETTINGS_BACKUP_PATH, JSON.stringify({}));
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({}));
    rollbackSettings();
    expect(fs.existsSync(SETTINGS_BACKUP_PATH)).toBe(false);
  });

  it('rollback 시 현재 settings.json의 .pre-rollback 백업이 생성된다', () => {
    const preRollbackPath = TEST_SETTINGS_PATH + '.pre-rollback';
    fs.writeFileSync(SETTINGS_BACKUP_PATH, JSON.stringify({ backup: true }));
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ current: true }));
    rollbackSettings();
    expect(fs.existsSync(preRollbackPath)).toBe(true);
    const preRollback = JSON.parse(fs.readFileSync(preRollbackPath, 'utf-8'));
    expect(preRollback.current).toBe(true);
  });

  it('rollback 후 lock 파일이 해제된다', () => {
    fs.writeFileSync(SETTINGS_BACKUP_PATH, JSON.stringify({}));
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({}));
    rollbackSettings();
    expect(fs.existsSync(LOCK_PATH)).toBe(false);
  });

  it('settings.json 없이 backup만 있어도 rollback이 성공한다', () => {
    fs.writeFileSync(SETTINGS_BACKUP_PATH, JSON.stringify({ fromBackup: true }));
    const result = rollbackSettings();
    expect(result).toBe(true);
    const restored = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(restored.fromBackup).toBe(true);
  });
});

describe('writeSettings + rollbackSettings 통합 사이클', () => {
  it('writeSettings 후 rollbackSettings 하면 원본이 복원된다', () => {
    const original = { env: { VERSION: 'original' } };
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify(original));

    writeSettings({ env: { VERSION: 'modified' } });
    expect(JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8')).env.VERSION).toBe('modified');

    rollbackSettings();
    const restored = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(restored.env.VERSION).toBe('original');
  });
});
