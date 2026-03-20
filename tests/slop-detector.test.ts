import { describe, it, expect } from 'vitest';
import { detectSlop, SLOP_PATTERNS } from '../src/hooks/slop-detector.js';

describe('slop-detector', () => {
  describe('SLOP_PATTERNS', () => {
    it('패턴 목록이 비어있지 않다', () => {
      expect(SLOP_PATTERNS.length).toBeGreaterThan(0);
    });

    it('모든 패턴에 message와 severity가 있다', () => {
      for (const p of SLOP_PATTERNS) {
        expect(p.message).toBeTruthy();
        expect(['warn', 'info']).toContain(p.severity);
      }
    });
  });

  describe('detectSlop', () => {
    it('빈 텍스트는 빈 배열 반환', () => {
      expect(detectSlop('')).toEqual([]);
    });

    it('TODO 주석을 감지한다', () => {
      const result = detectSlop('// TODO: implement this');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].message).toContain('TODO');
    });

    it('eslint-disable를 감지한다', () => {
      const result = detectSlop('// eslint-disable-next-line');
      expect(result.some(r => r.message.includes('eslint-disable'))).toBe(true);
    });

    it('@ts-ignore를 감지한다', () => {
      const result = detectSlop('// @ts-ignore');
      expect(result.some(r => r.message.includes('@ts-ignore'))).toBe(true);
    });

    it('"as any"를 감지한다', () => {
      const result = detectSlop('const x = foo as any;');
      expect(result.some(r => r.message.includes('as any'))).toBe(true);
    });

    it('console.log를 감지한다', () => {
      const result = detectSlop('console.log("debug");');
      expect(result.some(r => r.message.includes('console.log'))).toBe(true);
    });

    it('빈 catch 블록을 감지한다', () => {
      const result = detectSlop('try { x() } catch (e) {}');
      expect(result.some(r => r.message.includes('catch'))).toBe(true);
    });

    it('불필요한 설명 주석을 감지한다', () => {
      const result = detectSlop('// This is a function that does something');
      expect(result.some(r => r.message.includes('explanatory comment'))).toBe(true);
    });

    it('중복 감지를 방지한다 (같은 패턴 여러 번)', () => {
      const result = detectSlop('as any; as any; as any;');
      const asAnyResults = result.filter(r => r.message.includes('as any'));
      expect(asAnyResults.length).toBe(1);
    });

    it('클린 코드에서는 빈 배열 반환', () => {
      const result = detectSlop('function add(a: number, b: number): number { return a + b; }');
      expect(result).toEqual([]);
    });

    it('severity를 올바르게 분류한다', () => {
      const result = detectSlop('// TODO: fix\nconsole.log("test")');
      const todoResult = result.find(r => r.message.includes('TODO'));
      const logResult = result.find(r => r.message.includes('console.log'));
      expect(todoResult?.severity).toBe('warn');
      expect(logResult?.severity).toBe('info');
    });
  });
});
