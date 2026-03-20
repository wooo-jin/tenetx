import { describe, it, expect } from 'vitest';
import { shouldWarn, buildContextWarningMessage } from '../src/hooks/context-guard.js';

describe('context-guard', () => {
  // ── shouldWarn (extended) ──

  describe('shouldWarn', () => {
    it('프롬프트 임계값 초과 시 true', () => {
      expect(shouldWarn(
        { promptCount: 50, totalChars: 0, lastWarningAt: 0 },
      )).toBe(true);
    });

    it('문자 수 임계값 초과 시 true', () => {
      expect(shouldWarn(
        { promptCount: 0, totalChars: 200_000, lastWarningAt: 0 },
      )).toBe(true);
    });

    it('임계값 미만이면 false', () => {
      expect(shouldWarn(
        { promptCount: 10, totalChars: 1000, lastWarningAt: 0 },
      )).toBe(false);
    });

    it('쿨다운 기간 내이면 false', () => {
      expect(shouldWarn(
        { promptCount: 100, totalChars: 500_000, lastWarningAt: Date.now() },
      )).toBe(false);
    });

    it('커스텀 임계값을 지원한다', () => {
      expect(shouldWarn(
        { promptCount: 5, totalChars: 0, lastWarningAt: 0 },
        { promptThreshold: 3 },
      )).toBe(true);
    });

    it('커스텀 문자 임계값', () => {
      expect(shouldWarn(
        { promptCount: 0, totalChars: 100, lastWarningAt: 0 },
        { charsThreshold: 50 },
      )).toBe(true);
    });

    it('커스텀 쿨다운', () => {
      const recentWarning = Date.now() - 500;
      expect(shouldWarn(
        { promptCount: 100, totalChars: 500_000, lastWarningAt: recentWarning },
        { cooldownMs: 1000 },
      )).toBe(false);
      expect(shouldWarn(
        { promptCount: 100, totalChars: 500_000, lastWarningAt: recentWarning },
        { cooldownMs: 100 },
      )).toBe(true);
    });

    it('프롬프트와 문자 모두 초과해도 쿨다운이면 false', () => {
      expect(shouldWarn(
        { promptCount: 100, totalChars: 500_000, lastWarningAt: Date.now() - 1000 },
        { cooldownMs: 60_000 },
      )).toBe(false);
    });
  });

  // ── buildContextWarningMessage ──

  describe('buildContextWarningMessage', () => {
    it('프롬프트 수와 문자 수를 포함한다', () => {
      const msg = buildContextWarningMessage(50, 200_000);
      expect(msg).toContain('50 prompts');
      expect(msg).toContain('200K characters');
    });

    it('compound-context-warning 태그를 포함한다', () => {
      const msg = buildContextWarningMessage(10, 50000);
      expect(msg).toContain('<compound-context-warning>');
      expect(msg).toContain('</compound-context-warning>');
    });

    it('K 단위로 반올림한다', () => {
      const msg = buildContextWarningMessage(1, 150_500);
      expect(msg).toContain('151K');
    });

    it('저장 안내를 포함한다', () => {
      const msg = buildContextWarningMessage(1, 1000);
      expect(msg).toContain('save');
    });
  });
});
