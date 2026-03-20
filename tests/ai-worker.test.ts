import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// vi.hoisted로 TEST_HOME 정의
const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-ai-worker-home',
}));

// node:os mock
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

// child_process mock
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: vi.fn((cmd: string, args?: string[]) => {
      if (cmd === 'tmux' && args?.[0] === '-V') throw new Error('tmux not found');
      return '';
    }),
    execSync: vi.fn(() => ''),
    spawn: vi.fn(() => {
      const EventEmitter = require('node:events');
      const child = new EventEmitter();
      child.pid = 12345;
      child.unref = vi.fn();
      // emit spawn event asynchronously
      setTimeout(() => child.emit('spawn'), 0);
      return child;
    }),
  };
});

import {
  isTmuxAvailable,
  listWorkers,
  killWorker,
  getWorkerOutput,
  spawnWorker,
  cleanOldWorkers,
  handleWorker,
} from '../src/core/ai-worker.js';

const STATE_DIR = path.join(TEST_HOME, '.compound', 'state');
const WORKERS_FILE = path.join(STATE_DIR, 'workers.json');
const OUTPUT_DIR = path.join(STATE_DIR, 'worker-output');

beforeEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// isTmuxAvailable
// ────────────────────────────────────────────────────────────────────────────
describe('isTmuxAvailable()', () => {
  it('tmux가 없으면 false를 반환한다', () => {
    expect(isTmuxAvailable()).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// listWorkers
// ────────────────────────────────────────────────────────────────────────────
describe('listWorkers()', () => {
  it('워커 파일이 없으면 빈 배열을 반환한다', () => {
    expect(listWorkers()).toHaveLength(0);
  });

  it('저장된 워커 목록을 반환한다', () => {
    const workers = [
      { id: 'abc', type: 'claude', status: 'done', startedAt: new Date().toISOString(), prompt: 'test' },
    ];
    fs.writeFileSync(WORKERS_FILE, JSON.stringify(workers));
    const result = listWorkers();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('abc');
  });

  it('실행 중인 워커의 PID가 죽었으면 상태를 done으로 업데이트한다', () => {
    const workers = [
      { id: 'dead', type: 'claude', status: 'running', pid: 999999, startedAt: new Date().toISOString() },
    ];
    fs.writeFileSync(WORKERS_FILE, JSON.stringify(workers));
    const result = listWorkers();
    expect(result[0].status).toBe('done');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// killWorker
// ────────────────────────────────────────────────────────────────────────────
describe('killWorker()', () => {
  it('없는 ID면 false를 반환한다', () => {
    expect(killWorker('nonexistent')).toBe(false);
  });

  it('존재하는 워커를 종료하면 true를 반환한다', () => {
    const workers = [
      { id: 'kill-me', type: 'gemini', status: 'running', startedAt: new Date().toISOString() },
    ];
    fs.writeFileSync(WORKERS_FILE, JSON.stringify(workers));
    expect(killWorker('kill-me')).toBe(true);

    const updated = JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf-8'));
    expect(updated[0].status).toBe('done');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getWorkerOutput
// ────────────────────────────────────────────────────────────────────────────
describe('getWorkerOutput()', () => {
  it('출력 파일이 없으면 null을 반환한다', () => {
    expect(getWorkerOutput('nonexistent')).toBeNull();
  });

  it('출력 파일이 있으면 내용을 반환한다', () => {
    const validId = 'a1b2c3d4';  // 8자리 hex — 유효한 워커 ID
    fs.writeFileSync(path.join(OUTPUT_DIR, `${validId}.txt`), 'hello output');
    expect(getWorkerOutput(validId)).toBe('hello output');
  });

  it('유효하지 않은 ID는 null을 반환한다 (경로 조작 방지)', () => {
    expect(getWorkerOutput('../../../etc/passwd')).toBeNull();
    expect(getWorkerOutput('../../secret')).toBeNull();
    expect(getWorkerOutput('invalid-id')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// spawnWorker
// ────────────────────────────────────────────────────────────────────────────
describe('spawnWorker()', () => {
  it('워커를 스폰하고 상태를 저장한다', async () => {
    const worker = await spawnWorker('claude', 'test prompt');
    expect(worker.id).toBeTruthy();
    expect(worker.type).toBe('claude');
    expect(worker.prompt).toBe('test prompt');

    const saved = JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf-8'));
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.find((w: any) => w.id === worker.id)).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// cleanOldWorkers
// ────────────────────────────────────────────────────────────────────────────
describe('cleanOldWorkers()', () => {
  it('workers.json이 없으면 에러 없이 동작', () => {
    expect(() => cleanOldWorkers()).not.toThrow();
  });

  it('24시간 이상 된 완료 워커를 제거한다', () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();

    const validOldId = 'aa11bb22';
    fs.writeFileSync(path.join(OUTPUT_DIR, `${validOldId}.txt`), 'old output');
    fs.writeFileSync(WORKERS_FILE, JSON.stringify([
      { id: validOldId, type: 'gemini', status: 'done', startedAt: oldDate },
      { id: 'cc33dd44', type: 'claude', status: 'done', startedAt: recentDate },
    ]));

    cleanOldWorkers();

    const workers = JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf-8'));
    expect(workers.length).toBe(1);
    expect(workers[0].id).toBe('cc33dd44');
    expect(fs.existsSync(path.join(OUTPUT_DIR, `${validOldId}.txt`))).toBe(false);
  });

  it('running 상태 워커는 오래되어도 제거하지 않는다', () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(WORKERS_FILE, JSON.stringify([
      { id: 'ee55ff66', type: 'gemini', status: 'running', startedAt: oldDate, pid: 999999 },
    ]));

    cleanOldWorkers();

    const workers = JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf-8'));
    expect(workers.length).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleWorker CLI
// ────────────────────────────────────────────────────────────────────────────
describe('handleWorker()', () => {
  it('list - 워커가 없을 때', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleWorker(['list']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('활성 워커가 없습니다'));
    logSpy.mockRestore();
  });

  it('list - 워커가 있을 때', async () => {
    fs.writeFileSync(WORKERS_FILE, JSON.stringify([
      { id: 'listed1', type: 'claude', status: 'done', startedAt: new Date().toISOString(), prompt: 'test' },
    ]));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleWorker(['list']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('listed1'));
    logSpy.mockRestore();
  });

  it('인자 없으면 list 실행', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleWorker([]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('AI Workers'));
    logSpy.mockRestore();
  });

  it('output - 존재하는 워커 출력', async () => {
    const validId = 'a1b2c3d4';
    fs.writeFileSync(path.join(OUTPUT_DIR, `${validId}.txt`), 'worker output content');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleWorker(['output', validId]);
    expect(logSpy).toHaveBeenCalledWith('worker output content');
    logSpy.mockRestore();
  });
});
