import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-session-recovery',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  saveCheckpoint,
  loadCheckpoint,
  cleanStaleCheckpoints,
} from '../src/hooks/session-recovery.js';
import type { Checkpoint } from '../src/hooks/session-recovery.js';

const STATE_DIR = path.join(TEST_HOME, '.tenetx', 'state');

function makeCheckpoint(overrides?: Partial<Checkpoint>): Checkpoint {
  return {
    sessionId: 'test-session-1',
    mode: 'ralph',
    modifiedFiles: ['src/foo.ts', 'src/bar.ts'],
    lastToolCall: 'Edit',
    toolCallCount: 5,
    timestamp: new Date().toISOString(),
    cwd: '/tmp/project',
    ...overrides,
  };
}

describe('session-recovery', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── saveCheckpoint ──

  describe('saveCheckpoint', () => {
    it('체크포인트를 파일로 저장한다', () => {
      const cp = makeCheckpoint();
      saveCheckpoint(cp);
      const filePath = path.join(STATE_DIR, `checkpoint-${cp.sessionId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(saved.sessionId).toBe('test-session-1');
      expect(saved.mode).toBe('ralph');
    });

    it('STATE_DIR이 없으면 자동 생성한다', () => {
      expect(fs.existsSync(STATE_DIR)).toBe(false);
      saveCheckpoint(makeCheckpoint());
      expect(fs.existsSync(STATE_DIR)).toBe(true);
    });

    it('다른 세션 ID로 별도 파일을 생성한다', () => {
      saveCheckpoint(makeCheckpoint({ sessionId: 'a' }));
      saveCheckpoint(makeCheckpoint({ sessionId: 'b' }));
      expect(fs.existsSync(path.join(STATE_DIR, 'checkpoint-a.json'))).toBe(true);
      expect(fs.existsSync(path.join(STATE_DIR, 'checkpoint-b.json'))).toBe(true);
    });
  });

  // ── loadCheckpoint ──

  describe('loadCheckpoint', () => {
    it('저장된 체크포인트를 로드한다', () => {
      const cp = makeCheckpoint({ sessionId: 'load-test' });
      saveCheckpoint(cp);
      const loaded = loadCheckpoint('load-test');
      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe('load-test');
      expect(loaded!.modifiedFiles).toEqual(['src/foo.ts', 'src/bar.ts']);
    });

    it('존재하지 않는 세션이면 null 반환', () => {
      expect(loadCheckpoint('nonexistent')).toBeNull();
    });

    it('잘못된 JSON이면 null 반환', () => {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(path.join(STATE_DIR, 'checkpoint-bad.json'), 'not json');
      expect(loadCheckpoint('bad')).toBeNull();
    });

    it('구조 검증 실패 시 null 반환', () => {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      // mode 필드 누락
      fs.writeFileSync(
        path.join(STATE_DIR, 'checkpoint-invalid.json'),
        JSON.stringify({ sessionId: 'invalid', timestamp: '2025-01-01' }),
      );
      expect(loadCheckpoint('invalid')).toBeNull();
    });
  });

  // ── cleanStaleCheckpoints ──

  describe('cleanStaleCheckpoints', () => {
    it('STATE_DIR이 없으면 0 반환', () => {
      expect(cleanStaleCheckpoints()).toBe(0);
    });

    it('오래된 체크포인트를 삭제한다', () => {
      const old = makeCheckpoint({
        sessionId: 'old',
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      });
      saveCheckpoint(old);
      expect(cleanStaleCheckpoints()).toBe(1);
      expect(fs.existsSync(path.join(STATE_DIR, 'checkpoint-old.json'))).toBe(false);
    });

    it('최근 체크포인트는 유지한다', () => {
      const recent = makeCheckpoint({ sessionId: 'recent' });
      saveCheckpoint(recent);
      expect(cleanStaleCheckpoints()).toBe(0);
      expect(fs.existsSync(path.join(STATE_DIR, 'checkpoint-recent.json'))).toBe(true);
    });

    it('커스텀 maxAge를 지원한다', () => {
      const cp = makeCheckpoint({
        sessionId: 'custom',
        timestamp: new Date(Date.now() - 5000).toISOString(),
      });
      saveCheckpoint(cp);
      // 1초보다 오래된 것 삭제
      expect(cleanStaleCheckpoints(1000)).toBe(1);
    });

    it('잘못된 JSON 파일도 정리한다', () => {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(path.join(STATE_DIR, 'checkpoint-corrupt.json'), '{bad');
      expect(cleanStaleCheckpoints()).toBe(1);
    });

    it('구조 검증 실패한 파일도 정리한다', () => {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(STATE_DIR, 'checkpoint-invalid.json'),
        JSON.stringify({ foo: 'bar' }),
      );
      expect(cleanStaleCheckpoints()).toBe(1);
    });
  });
});
