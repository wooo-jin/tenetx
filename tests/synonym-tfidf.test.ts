import { describe, it, expect } from 'vitest';
import { expandTagsWithSynonyms, tagWeight, calculateRelevance } from '../src/engine/solution-matcher.js';
import { DEFAULT_MATCH_TERMS } from '../src/engine/term-normalizer.js';

describe('expandTagsWithSynonyms', () => {
  it('known tag에 대해 synonym을 추가한다', () => {
    const expanded = expandTagsWithSynonyms(['react']);
    expect(expanded).toContain('react');
    expect(expanded).toContain('jsx');
    expect(expanded).toContain('component');
    expect(expanded).toContain('hook');
  });

  it('역방향 lookup — synonym 값이면 key를 추가한다', () => {
    const expanded = expandTagsWithSynonyms(['jsx']);
    expect(expanded).toContain('jsx');
    expect(expanded).toContain('react');
  });

  it('unknown tag는 그대로 유지한다', () => {
    const expanded = expandTagsWithSynonyms(['foobar']);
    expect(expanded).toEqual(['foobar']);
  });

  it('여러 tag 동시 확장', () => {
    const expanded = expandTagsWithSynonyms(['database', 'test']);
    expect(expanded).toContain('sql');
    expect(expanded).toContain('schema');
    expect(expanded).toContain('vitest');
    expect(expanded).toContain('jest');
  });

  it('빈 배열은 빈 배열 반환', () => {
    expect(expandTagsWithSynonyms([])).toEqual([]);
  });

  it('한국어 synonym도 동작한다', () => {
    const expanded = expandTagsWithSynonyms(['데이터베이스']);
    expect(expanded).toContain('db');
    expect(expanded).toContain('sql');
  });

  it('중복 없이 반환한다', () => {
    const expanded = expandTagsWithSynonyms(['database', 'db']);
    const unique = new Set(expanded);
    expect(expanded.length).toBe(unique.size);
  });
});

describe('tagWeight', () => {
  it('common tag는 0.5 가중치', () => {
    expect(tagWeight('typescript')).toBe(0.5);
    expect(tagWeight('fix')).toBe(0.5);
    expect(tagWeight('코드')).toBe(0.5);
  });

  it('rare tag는 1.0 가중치', () => {
    expect(tagWeight('react')).toBe(1.0);
    expect(tagWeight('vitest')).toBe(1.0);
    expect(tagWeight('compound')).toBe(1.0);
  });
});

// T2: SYNONYM_MAP removed. The registry now lives in
// src/engine/term-normalizer.ts as DEFAULT_MATCH_TERMS (MatchTermEntry[]).
// Coverage of the registry shape is in tests/term-normalizer.test.ts;
// these legacy spot-checks remain here to guard bilingual migration.
describe('DEFAULT_MATCH_TERMS (migrated from SYNONYM_MAP)', () => {
  it('영어와 한국어 synonym 모두 포함', () => {
    expect(DEFAULT_MATCH_TERMS.length).toBeGreaterThanOrEqual(10);
    const canonicals = new Set(DEFAULT_MATCH_TERMS.map(e => e.canonical));
    expect(canonicals.has('react')).toBe(true);
    expect(canonicals.has('database')).toBe(true);
    // Korean terms that were top-level in SYNONYM_MAP now live inside a
    // canonical's matchTerms array. Spot-check one.
    const database = DEFAULT_MATCH_TERMS.find(e => e.canonical === 'database')!;
    expect(database.matchTerms).toContain('데이터베이스');
  });

  it('모든 canonical이 비어있지 않은 matchTerms를 가진다', () => {
    for (const entry of DEFAULT_MATCH_TERMS) {
      expect(entry.matchTerms.length, `${entry.canonical} should have matchTerms`).toBeGreaterThan(0);
    }
  });
});

describe('calculateRelevance with synonym expansion', () => {
  it('synonym 확장으로 직접 매칭이 안 되는 태그도 매칭된다', () => {
    // "jsx"는 "react"의 synonym — 프롬프트에 "jsx", 솔루션에 "react"가 있을 때
    const result = calculateRelevance(['jsx'], ['react', 'state'], 0.8) as { relevance: number; matchedTags: string[] };
    expect(result.relevance).toBeGreaterThan(0);
    expect(result.matchedTags).toContain('react');
  });

  it('common tag만 매칭되면 가중치가 낮다', () => {
    const commonResult = calculateRelevance(['typescript'], ['typescript', 'module'], 1.0) as { relevance: number; matchedTags: string[] };
    const rareResult = calculateRelevance(['vitest'], ['vitest', 'module'], 1.0) as { relevance: number; matchedTags: string[] };
    // vitest(rare, weight=1.0) > typescript(common, weight=0.5)
    expect(rareResult.relevance).toBeGreaterThan(commonResult.relevance);
  });
});
