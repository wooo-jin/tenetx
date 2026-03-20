import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-rate-limiter',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  checkRateLimit,
  loadRateLimitState,
  saveRateLimitState,
} from '../src/hooks/rate-limiter.js';

const STATE_DIR = path.join(TEST_HOME, '.compound', 'state');

describe('rate-limiter', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── checkRateLimit (pure function) ──

  describe('checkRateLimit', () => {
    it('빈 상태에서는 초과하지 않음', () => {
      const result = checkRateLimit({ calls: [] });
      expect(result.exceeded).toBe(false);
      expect(result.count).toBe(1);
    });

    it('제한 미만이면 통과', () => {
      const now = Date.now();
      const calls = Array(10).fill(0).map((_, i) => now - i * 1000);
      const result = checkRateLimit({ calls }, now);
      expect(result.exceeded).toBe(false);
    });

    it('제한 초과 시 exceeded=true', () => {
      const now = Date.now();
      const calls = Array(30).fill(0).map((_, i) => now - i * 100);
      const result = checkRateLimit({ calls }, now, 30);
      expect(result.exceeded).toBe(true);
    });

    it('윈도우 밖의 호출은 제거된다', () => {
      const now = Date.now();
      const oldCalls = Array(50).fill(0).map((_, i) => now - 120_000 - i * 100);
      const result = checkRateLimit({ calls: oldCalls }, now);
      expect(result.exceeded).toBe(false);
      expect(result.updatedState.calls.length).toBe(1);
    });

    it('커스텀 limit을 지원한다', () => {
      const now = Date.now();
      const calls = Array(5).fill(0).map((_, i) => now - i * 100);
      const result = checkRateLimit({ calls }, now, 5);
      expect(result.exceeded).toBe(true);
    });

    it('승인된 호출만 기록된다', () => {
      const now = Date.now();
      const calls = Array(30).fill(0).map((_, i) => now - i * 100);
      const result = checkRateLimit({ calls }, now, 30);
      expect(result.exceeded).toBe(true);
      // 거부된 호출은 추가되지 않음
      expect(result.updatedState.calls.length).toBe(30);
    });
  });

  // ── loadRateLimitState / saveRateLimitState ──

  describe('loadRateLimitState', () => {
    it('파일이 없으면 빈 상태 반환', () => {
      const state = loadRateLimitState();
      expect(state.calls).toEqual([]);
    });

    it('저장된 상태를 로드한다', () => {
      const calls = [Date.now(), Date.now() - 1000];
      saveRateLimitState({ calls });
      const loaded = loadRateLimitState();
      expect(loaded.calls).toEqual(calls);
    });

    it('손상된 파일이면 빈 상태 반환', () => {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(path.join(STATE_DIR, 'rate-limit.json'), 'not json');
      const state = loadRateLimitState();
      expect(state.calls).toEqual([]);
    });

    it('calls가 number 배열이 아니면 빈 상태 반환', () => {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(STATE_DIR, 'rate-limit.json'),
        JSON.stringify({ calls: ['not', 'numbers'] }),
      );
      const state = loadRateLimitState();
      expect(state.calls).toEqual([]);
    });
  });
});
