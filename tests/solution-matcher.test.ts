import { describe, it, expect } from 'vitest';
import {
  calculateRelevance,
} from '../src/engine/solution-matcher.js';
import { extractTags as extractKeywords } from '../src/engine/solution-format.js';

describe('calculateRelevance', () => {
  it('완전 매칭은 높은 관련성', () => {
    const relevance = calculateRelevance(
      'wasm 바이너리 패치 오프셋',
      ['wasm', '바이너리', '패치', '오프셋', '검증'],
    );
    expect(relevance).toBeGreaterThan(0.5);
  });

  it('부분 매칭', () => {
    const relevance = calculateRelevance(
      'API 엔드포인트 추가',
      ['api', '엔드포인트', '라우팅', '미들웨어'],
    );
    expect(relevance).toBeGreaterThan(0);
  });

  it('매칭 없음은 0', () => {
    const relevance = calculateRelevance(
      'UI 디자인 변경',
      ['database', 'migration', 'schema'],
    );
    expect(relevance).toBe(0);
  });

  it('빈 프롬프트는 0', () => {
    expect(calculateRelevance('', ['keyword'])).toBe(0);
  });

  it('빈 키워드는 0', () => {
    expect(calculateRelevance('prompt text', [])).toBe(0);
  });

  it('짧은 단어(2자 이하)는 무시', () => {
    const relevance = calculateRelevance(
      'a b c',
      ['a', 'b', 'c'],
    );
    expect(relevance).toBe(0); // 모든 단어가 2자 이하
  });

  it('관련성은 0-1 범위', () => {
    const relevance = calculateRelevance(
      'very very very long matching prompt with many words',
      ['very', 'long', 'matching', 'prompt', 'words', 'many'],
    );
    expect(relevance).toBeGreaterThanOrEqual(0);
    expect(relevance).toBeLessThanOrEqual(1);
  });

  it('한글 키워드 매칭', () => {
    const relevance = calculateRelevance(
      '컴포넌트 분리 작업',
      ['컴포넌트', '분리', '리팩터링'],
    );
    expect(relevance).toBeGreaterThan(0);
  });

  it('부분 문자열 매칭 (키워드가 프롬프트 단어 포함)', () => {
    const relevance = calculateRelevance(
      'authentication 구현',
      ['auth', 'login', 'session'],
    );
    // 'authentication'이 'auth'를 포함하므로 매칭
    expect(relevance).toBeGreaterThan(0);
  });
});

describe('extractKeywords', () => {
  it('텍스트에서 키워드를 추출한다', () => {
    const keywords = extractKeywords('wasm binary patch');
    expect(keywords).toContain('wasm');
    expect(keywords).toContain('binary');
    expect(keywords).toContain('patch');
  });

  it('한글 텍스트에서 키워드 추출', () => {
    const keywords = extractKeywords('WASM 바이너리 패치 전 오프셋 구조를 검증');
    expect(keywords).toContain('wasm');
    expect(keywords).toContain('바이너리');
    expect(keywords).toContain('오프셋');
  });

  it('짧은 단어(2자 이하) 필터링', () => {
    const keywords = extractKeywords('a b cd efg');
    expect(keywords).not.toContain('a');
    expect(keywords).not.toContain('b');
    expect(keywords).not.toContain('cd');
    expect(keywords).toContain('efg');
  });

  it('특수문자 제거', () => {
    const keywords = extractKeywords('hello! world? foo@bar');
    expect(keywords).toContain('hello');
    expect(keywords).toContain('world');
    expect(keywords).toContain('foo');
    expect(keywords).toContain('bar');
  });
});

describe('solution filtering and sorting', () => {
  it('관련성 0.1 이하는 필터링', () => {
    const solutions = [
      { name: 'a', relevance: 0.5 },
      { name: 'b', relevance: 0.05 },
      { name: 'c', relevance: 0.8 },
    ];
    const filtered = solutions.filter(s => s.relevance > 0.1);
    expect(filtered).toHaveLength(2);
    expect(filtered.find(s => s.name === 'b')).toBeUndefined();
  });

  it('관련성 높은 순으로 정렬', () => {
    const solutions = [
      { name: 'a', relevance: 0.3 },
      { name: 'b', relevance: 0.8 },
      { name: 'c', relevance: 0.5 },
    ];
    const sorted = solutions.sort((a, b) => b.relevance - a.relevance);
    expect(sorted[0].name).toBe('b');
    expect(sorted[1].name).toBe('c');
    expect(sorted[2].name).toBe('a');
  });

  it('최대 5개로 제한', () => {
    const solutions = Array.from({ length: 10 }, (_, i) => ({
      name: `sol-${i}`,
      relevance: 1 - i * 0.05,
    }));
    const limited = solutions.slice(0, 5);
    expect(limited).toHaveLength(5);
  });
});
