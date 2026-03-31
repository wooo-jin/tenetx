import { describe, it, expect } from 'vitest';
import {
  isReflectionCandidate,
  COMMON_IDENTIFIERS,
  REFLECTION_WINDOW_MS,
} from '../src/hooks/compound-reflection.js';

describe('compound-reflection', () => {
  describe('COMMON_IDENTIFIERS blocklist', () => {
    it('프레임워크 기본 식별자가 포함되어 있다', () => {
      expect(COMMON_IDENTIFIERS.has('useState')).toBe(true);
      expect(COMMON_IDENTIFIERS.has('useEffect')).toBe(true);
      expect(COMMON_IDENTIFIERS.has('useMemo')).toBe(false); // 6자 미만 → 길이 필터로 이미 제거됨
      expect(COMMON_IDENTIFIERS.has('ErrorBoundary')).toBe(true);
      expect(COMMON_IDENTIFIERS.has('createElement')).toBe(true);
    });

    it('일반적인 도구/라이브러리 이름이 포함되어 있다', () => {
      expect(COMMON_IDENTIFIERS.has('express')).toBe(true);
      expect(COMMON_IDENTIFIERS.has('describe')).toBe(true);
      expect(COMMON_IDENTIFIERS.has('toString')).toBe(true);
    });
  });

  describe('REFLECTION_WINDOW_MS', () => {
    it('15분이다', () => {
      expect(REFLECTION_WINDOW_MS).toBe(15 * 60 * 1000);
    });
  });

  describe('isReflectionCandidate', () => {
    const now = new Date('2026-03-31T12:00:00Z');

    it('식별자가 절반 이상 매칭되고 시간 윈도우 내이면 true', () => {
      const result = isReflectionCandidate({
        identifiers: ['myCustomHook', 'parseUserConfig', 'validateSchema', 'buildContext'],
        code: 'const result = parseUserConfig(data); validateSchema(result);',
        injectedAt: '2026-03-31T11:50:00Z', // 10분 전
        now,
      });
      expect(result.reflected).toBe(true);
      expect(result.matchedCount).toBe(2);
    });

    it('시간 윈도우(15분) 밖이면 false', () => {
      const result = isReflectionCandidate({
        identifiers: ['myCustomHook', 'parseUserConfig'],
        code: 'const result = parseUserConfig(data); myCustomHook();',
        injectedAt: '2026-03-31T11:40:00Z', // 20분 전
        now,
      });
      expect(result.reflected).toBe(false);
      expect(result.reason).toBe('outside-window');
    });

    it('매칭 비율이 50% 미만이면 false', () => {
      // 4개 중 1개만 매칭 (25% < 50%)
      const result = isReflectionCandidate({
        identifiers: ['myCustomHook', 'parseUserConfig', 'validateSchema', 'buildContext'],
        code: 'const x = myCustomHook();',
        injectedAt: '2026-03-31T11:55:00Z',
        now,
      });
      expect(result.reflected).toBe(false);
      expect(result.reason).toBe('low-match-ratio');
    });

    it('COMMON_IDENTIFIERS에 해당하는 식별자는 매칭에서 제외된다', () => {
      // ErrorBoundary, useState는 블록리스트 → 실질 식별자 0개
      const result = isReflectionCandidate({
        identifiers: ['ErrorBoundary', 'useState'],
        code: '<ErrorBoundary><Component /></ErrorBoundary>',
        injectedAt: '2026-03-31T11:55:00Z',
        now,
      });
      expect(result.reflected).toBe(false);
      expect(result.reason).toBe('no-eligible-identifiers');
    });

    it('6자 미만 식별자는 무시된다', () => {
      const result = isReflectionCandidate({
        identifiers: ['map', 'key', 'ref', 'myCustomParser'],
        code: 'const parsed = myCustomParser(data);',
        injectedAt: '2026-03-31T11:55:00Z',
        now,
      });
      // 유효 식별자: myCustomParser (1개 중 1개 = 100%)
      expect(result.reflected).toBe(true);
      expect(result.matchedCount).toBe(1);
    });

    it('유효 식별자가 0개이면 false', () => {
      const result = isReflectionCandidate({
        identifiers: ['map', 'key'], // 전부 6자 미만
        code: 'arr.map(x => x.key)',
        injectedAt: '2026-03-31T11:55:00Z',
        now,
      });
      expect(result.reflected).toBe(false);
      expect(result.reason).toBe('no-eligible-identifiers');
    });

    it('식별자 1개만 있으면 그 1개가 매칭되면 true', () => {
      const result = isReflectionCandidate({
        identifiers: ['myUniqueHelper'],
        code: 'import { myUniqueHelper } from "./utils";',
        injectedAt: '2026-03-31T11:58:00Z',
        now,
      });
      expect(result.reflected).toBe(true);
      expect(result.matchedCount).toBe(1);
    });

    it('코드가 10자 미만이면 false', () => {
      const result = isReflectionCandidate({
        identifiers: ['myHelper'],
        code: 'x = 1;',
        injectedAt: '2026-03-31T11:58:00Z',
        now,
      });
      expect(result.reflected).toBe(false);
      expect(result.reason).toBe('code-too-short');
    });

    it('injectedAt가 유효하지 않으면 false', () => {
      const result = isReflectionCandidate({
        identifiers: ['myHelper'],
        code: 'const x = myHelper();',
        injectedAt: 'invalid-date',
        now,
      });
      expect(result.reflected).toBe(false);
      expect(result.reason).toBe('invalid-injection-time');
    });
  });
});
