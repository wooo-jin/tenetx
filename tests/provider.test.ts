import { describe, it, expect } from 'vitest';
import { maskSensitive, classifyHttpStatus } from '../src/engine/provider.js';

describe('provider', () => {
  // ── maskSensitive ──

  describe('maskSensitive', () => {
    it('Bearer 토큰을 마스킹한다', () => {
      const masked = maskSensitive('Authorization: Bearer abc123xyz');
      expect(masked).toBe('Authorization: Bearer ***');
      expect(masked).not.toContain('abc123xyz');
    });

    it('sk- 접두사 키를 마스킹한다', () => {
      const masked = maskSensitive('api_key: sk-abcdef123456');
      expect(masked).toContain('sk-***');
      expect(masked).not.toContain('abcdef123456');
    });

    it('key- 접두사 키를 마스킹한다', () => {
      const masked = maskSensitive('key-abcdef123456');
      expect(masked).toBe('key-***');
    });

    it('마스킹 대상이 없으면 원본 반환', () => {
      const text = 'Hello world';
      expect(maskSensitive(text)).toBe(text);
    });

    it('여러 민감 정보를 동시에 마스킹한다', () => {
      const text = 'Bearer token123 and sk-secret456';
      const masked = maskSensitive(text);
      expect(masked).toContain('Bearer ***');
      expect(masked).toContain('sk-***');
    });
  });

  // ── classifyHttpStatus ──

  describe('classifyHttpStatus', () => {
    it('401은 no-retry', () => {
      expect(classifyHttpStatus(401)).toBe('no-retry');
    });

    it('403은 no-retry', () => {
      expect(classifyHttpStatus(403)).toBe('no-retry');
    });

    it('429는 retry-with-backoff', () => {
      expect(classifyHttpStatus(429)).toBe('retry-with-backoff');
    });

    it('500은 retry', () => {
      expect(classifyHttpStatus(500)).toBe('retry');
    });

    it('502는 retry', () => {
      expect(classifyHttpStatus(502)).toBe('retry');
    });

    it('503은 retry', () => {
      expect(classifyHttpStatus(503)).toBe('retry');
    });

    it('404는 retry (기타)', () => {
      expect(classifyHttpStatus(404)).toBe('retry');
    });
  });
});
