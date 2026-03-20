import { describe, it, expect } from 'vitest';
import { detectSecrets, SECRET_PATTERNS } from '../src/hooks/secret-filter.js';

describe('secret-filter', () => {
  describe('SECRET_PATTERNS', () => {
    it('패턴 목록이 비어있지 않다', () => {
      expect(SECRET_PATTERNS.length).toBeGreaterThan(0);
    });

    it('모든 패턴에 name과 pattern이 있다', () => {
      for (const p of SECRET_PATTERNS) {
        expect(p.name).toBeTruthy();
        expect(p.pattern).toBeInstanceOf(RegExp);
      }
    });
  });

  describe('detectSecrets', () => {
    it('빈 텍스트는 빈 배열 반환', () => {
      expect(detectSecrets('')).toEqual([]);
    });

    it('API 키를 감지한다', () => {
      const result = detectSecrets('sk_live_1234567890abcdefghij');
      expect(result.some(r => r.name === 'API Key')).toBe(true);
    });

    it('AWS Access Key를 감지한다', () => {
      const result = detectSecrets('AKIAIOSFODNN7EXAMPLE');
      expect(result.some(r => r.name === 'AWS Access Key')).toBe(true);
    });

    it('Bearer 토큰을 감지한다', () => {
      const result = detectSecrets('token=abcdefghijklmnopqrstuvwxyz');
      expect(result.some(r => r.name.includes('Token'))).toBe(true);
    });

    it('비밀번호를 감지한다', () => {
      const result = detectSecrets('password="mysecretpassword123"');
      expect(result.some(r => r.name === 'Password')).toBe(true);
    });

    it('프라이빗 키를 감지한다', () => {
      const result = detectSecrets('-----BEGIN RSA PRIVATE KEY-----');
      expect(result.some(r => r.name === 'Private Key')).toBe(true);
    });

    it('커넥션 스트링을 감지한다', () => {
      const result = detectSecrets('mongodb://admin:pass123@localhost:27017');
      expect(result.some(r => r.name === 'Connection String')).toBe(true);
    });

    it('안전한 텍스트에서는 빈 배열 반환', () => {
      const result = detectSecrets('function hello() { return "world"; }');
      expect(result).toEqual([]);
    });

    it('여러 시크릿을 동시에 감지한다', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE\npassword="test12345678"';
      const result = detectSecrets(text);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });
});
