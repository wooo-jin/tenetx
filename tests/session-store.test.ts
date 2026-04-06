/**
 * session-store 단위 테스트
 *
 * extractContextWindow 순수 함수 검증.
 * SQLite 의존 함수(openDb, indexSession, searchSessions)는
 * Node.js 22+ 런타임이 필요하므로 통합 테스트에서 검증합니다.
 */
import { describe, it, expect } from 'vitest';
import { extractContextWindow } from '../src/core/session-store.js';

describe('extractContextWindow', () => {
  it('토큰 위치를 중심으로 컨텍스트를 추출한다', () => {
    const content = 'a'.repeat(200) + 'TARGET' + 'b'.repeat(200);
    const result = extractContextWindow(content, ['target'], 50);
    expect(result).toContain('TARGET');
    expect(result.startsWith('...')).toBe(true);
    expect(result.endsWith('...')).toBe(true);
  });

  it('토큰이 시작 부분에 있으면 prefix ...가 없다', () => {
    const content = 'TARGET' + 'a'.repeat(300);
    const result = extractContextWindow(content, ['target'], 50);
    expect(result.startsWith('...')).toBe(false);
    expect(result).toContain('TARGET');
  });

  it('토큰이 끝 부분에 있으면 suffix ...가 없다', () => {
    const content = 'a'.repeat(10) + 'TARGET';
    const result = extractContextWindow(content, ['target'], 200);
    expect(result.endsWith('...')).toBe(false);
    expect(result).toContain('TARGET');
  });

  it('토큰이 없으면 처음 200자를 반환한다', () => {
    const content = 'x'.repeat(500);
    const result = extractContextWindow(content, ['notfound']);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('짧은 콘텐츠는 그대로 반환한다', () => {
    const content = 'short text';
    const result = extractContextWindow(content, ['short']);
    expect(result).toBe('short text');
  });

  it('여러 토큰 중 첫 번째를 기준으로 윈도우를 잡는다', () => {
    const content = 'aaa FIRST bbb SECOND ccc';
    const result = extractContextWindow(content, ['first', 'second'], 50);
    expect(result).toContain('FIRST');
  });

  it('대소문자를 구분하지 않고 토큰을 찾는다', () => {
    const content = 'This is a VITEST test result';
    const result = extractContextWindow(content, ['vitest']);
    expect(result).toContain('VITEST');
  });

  it('커스텀 windowSize를 적용한다', () => {
    const content = 'a'.repeat(100) + 'MID' + 'b'.repeat(100);
    const small = extractContextWindow(content, ['mid'], 20);
    const large = extractContextWindow(content, ['mid'], 100);
    expect(large.length).toBeGreaterThan(small.length);
  });
});
