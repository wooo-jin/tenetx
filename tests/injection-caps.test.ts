import { describe, it, expect } from 'vitest';
import {
  INJECTION_CAPS,
  TRUNCATION_SUFFIX,
  truncateContent,
} from '../src/hooks/shared/injection-caps.js';

describe('injection-caps', () => {
  // ── INJECTION_CAPS 상수 검증 ──

  describe('INJECTION_CAPS constants', () => {
    it('모든 값이 양수', () => {
      for (const [key, value] of Object.entries(INJECTION_CAPS)) {
        expect(value, `${key} should be positive`).toBeGreaterThan(0);
      }
    });

    it('solutionMax는 solutionSessionMax 이하', () => {
      expect(INJECTION_CAPS.solutionMax).toBeLessThanOrEqual(INJECTION_CAPS.solutionSessionMax);
    });
  });

  // ── truncateContent ──

  describe('truncateContent', () => {
    it('제한 이하 콘텐츠는 그대로 반환', () => {
      const content = 'hello world';
      expect(truncateContent(content, 100)).toBe(content);
    });

    it('제한 초과 시 잘라서 suffix 추가', () => {
      const content = 'a'.repeat(200);
      const result = truncateContent(content, 100);
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result).toContain(TRUNCATION_SUFFIX);
    });

    it('빈 문자열은 그대로 반환', () => {
      expect(truncateContent('', 100)).toBe('');
    });

    it('정확히 제한 길이면 잘리지 않음', () => {
      const content = 'a'.repeat(50);
      expect(truncateContent(content, 50)).toBe(content);
    });

    it('제한이 suffix보다 작으면 빈 문자열 + suffix 반환', () => {
      // cutAt = maxChars - suffix.length < 0 → Math.max(0, cutAt) = 0
      const result = truncateContent('a'.repeat(100), 5);
      expect(result).toBe(TRUNCATION_SUFFIX);
    });

    it('truncation suffix 값이 예상과 일치', () => {
      expect(TRUNCATION_SUFFIX).toBe('\n... (truncated)');
    });
  });
});
