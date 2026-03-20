import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-token-tracker-full',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  recordToolUsage,
  loadTokenUsage,
  cleanStaleUsageFiles,
  inferModelTier,
  formatCost,
  formatTokenCount,
} from '../src/engine/token-tracker.js';

const STATE_DIR = path.join(TEST_HOME, '.compound', 'state');

describe('token-tracker - extended', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── recordToolUsage ──

  describe('recordToolUsage', () => {
    it('새 세션에 토큰 사용량을 기록한다', () => {
      const usage = recordToolUsage('test-session', 'hello world', 'response text');
      expect(usage.sessionId).toBe('test-session');
      expect(usage.toolCalls).toBe(1);
      expect(usage.inputTokens).toBeGreaterThan(0);
      expect(usage.outputTokens).toBeGreaterThan(0);
    });

    it('누적 기록한다', () => {
      recordToolUsage('test-session', 'input1', 'output1');
      const usage2 = recordToolUsage('test-session', 'input2', 'output2');
      expect(usage2.toolCalls).toBe(2);
    });

    it('모델별 분배를 기록한다', () => {
      const usage = recordToolUsage('test-session', 'input', 'output', 'claude-opus-4-6');
      expect(usage.byModel.opus).toBeDefined();
      expect(usage.byModel.opus.calls).toBe(1);
    });

    it('모델 ID가 없으면 sonnet으로 기록', () => {
      const usage = recordToolUsage('test-session', 'input', 'output');
      expect(usage.byModel.sonnet).toBeDefined();
    });

    it('비용을 추정한다', () => {
      const usage = recordToolUsage('test-session', 'a'.repeat(4000), 'b'.repeat(4000));
      expect(usage.estimatedCost).toBeGreaterThan(0);
    });
  });

  // ── loadTokenUsage ──

  describe('loadTokenUsage', () => {
    it('파일이 없으면 초기 상태 반환', () => {
      const usage = loadTokenUsage('nonexistent');
      expect(usage.toolCalls).toBe(0);
      expect(usage.inputTokens).toBe(0);
    });

    it('저장된 사용량을 로드한다', () => {
      recordToolUsage('load-test', 'input', 'output');
      const loaded = loadTokenUsage('load-test');
      expect(loaded.toolCalls).toBe(1);
    });
  });

  // ── cleanStaleUsageFiles ──

  describe('cleanStaleUsageFiles', () => {
    it('STATE_DIR이 없으면 에러 없이 반환', () => {
      expect(() => cleanStaleUsageFiles()).not.toThrow();
    });

    it('최근 파일은 유지한다', () => {
      recordToolUsage('recent', 'input', 'output');
      cleanStaleUsageFiles();
      expect(fs.existsSync(path.join(STATE_DIR, 'token-usage-recent.json'))).toBe(true);
    });
  });

  // ── inferModelTier ──

  describe('inferModelTier', () => {
    it('haiku 모델을 인식한다', () => {
      expect(inferModelTier('claude-haiku-3-5')).toBe('haiku');
    });

    it('opus 모델을 인식한다', () => {
      expect(inferModelTier('claude-opus-4-6')).toBe('opus');
    });

    it('기본값은 sonnet', () => {
      expect(inferModelTier('claude-sonnet-4-6')).toBe('sonnet');
      expect(inferModelTier('unknown-model')).toBe('sonnet');
    });
  });

  // ── formatCost ──

  describe('formatCost', () => {
    it('매우 작은 비용은 4자리 소수점', () => {
      expect(formatCost(0.001)).toBe('$0.0010');
    });

    it('1달러 미만은 3자리 소수점', () => {
      expect(formatCost(0.5)).toBe('$0.500');
    });

    it('1달러 이상은 2자리 소수점', () => {
      expect(formatCost(5.123)).toBe('$5.12');
    });
  });

  // ── formatTokenCount ──

  describe('formatTokenCount', () => {
    it('1M 이상은 M 단위', () => {
      expect(formatTokenCount(1_500_000)).toBe('1.5M');
    });

    it('1K 이상은 k 단위', () => {
      expect(formatTokenCount(1_500)).toBe('1.5k');
    });

    it('1K 미만은 숫자 그대로', () => {
      expect(formatTokenCount(500)).toBe('500');
    });
  });
});
