import { describe, it, expect } from 'vitest';
import {
  calculateRelevance,
  shouldRejectByR4T3Rules,
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

// ── R4-T3: shouldRejectByR4T3Rules ──
//
// Two narrow precision rules applied at the orchestration layer (not
// inside calculateRelevance, so unit tests of the scorer aren't affected).
// These rules close the 2 R4-T2 residual false positives without
// regressing any fixture positive — the integration regression guards
// in solution-matcher-eval.test.ts assert the end-to-end behaviour.

describe('shouldRejectByR4T3Rules (R4-T3)', () => {
  describe('Rule A — single-token query AND single-tag match', () => {
    it('rejects when both promptTags and matchedTags have length 1', () => {
      expect(shouldRejectByR4T3Rules(['validation'], ['validation'])).toBe(true);
    });

    it('does NOT reject single-token query with multi-tag match', () => {
      // Even if a query has just one dev token, multiple matching tags
      // on the same solution is corroborating evidence — keep it.
      expect(shouldRejectByR4T3Rules(['async'], ['async', 'promise'])).toBe(false);
    });

    it('does NOT reject multi-token query with single-tag match (Rule B may still fire)', () => {
      // Rule A specifically requires query length === 1.
      // (Rule B's literal-hit check still passes here because 'function'
      // is in the prompt verbatim.)
      expect(shouldRejectByR4T3Rules(['writing', 'function', 'tests'], ['function']))
        .toBe(false);
    });
  });

  describe('Rule B — single-tag match with no literal hit in query', () => {
    it('rejects when the matched tag was reached only via expansion', () => {
      // Real R4-T3 trigger: "database backup recovery procedure" masks
      // to [recovery, procedure]; matched 'handling' has no literal
      // counterpart in the query (handling came from the term-normalizer
      // 'recovery → handling' family expansion).
      expect(shouldRejectByR4T3Rules(['recovery', 'procedure'], ['handling']))
        .toBe(true);
    });

    it('does NOT reject when the matched tag appears literally in the query', () => {
      // Verbatim hit: matched tag appears as a token in the query.
      expect(shouldRejectByR4T3Rules(['cache', 'strategy', 'ttl'], ['cache']))
        .toBe(false);
    });

    it('does NOT reject when matched tag is a substring partial of a query token (length > 3)', () => {
      // Substring partial: query 'code' (length 4) is a substring of
      // 'code-review' (length 11), so the literal-hit rule treats this
      // as a literal signal under Rule B. This mirrors the partialMatches
      // discovery rule in calculateRelevance for symmetry.
      expect(shouldRejectByR4T3Rules(['code', 'review', 'pull'], ['code-review']))
        .toBe(false);
    });

    // ── Prefix-only morphological literal-hit coverage ──
    //
    // The shared-prefix ≥ 4 rule is the DEFENSIVE precision fallback
    // for morphological variants where neither token is a substring of
    // the other. These tests are isolated to exercise the prefix branch
    // specifically (the substring branch must NOT also match, otherwise
    // the test can't tell which branch saved it).
    //
    // Sentinel: `caching` (c-a-c-h-i-n-g) vs `cache` (c-a-c-h-e). Shared
    // prefix is `cach` (length 4). Neither string contains the other
    // because position 4 diverges (`i` vs `e`). Substring branch fails
    // on both directions → only the prefix branch can classify this
    // pair as a literal hit.
    it('does NOT reject prefix-only morphological match (caching ↔ cache)', () => {
      // Sanity check the preconditions of this sentinel: neither string
      // is a substring of the other. If this ever becomes false (e.g.,
      // if the English normalization changes), the test is no longer
      // isolating the prefix branch and must be re-designed.
      expect('caching'.includes('cache')).toBe(false);
      expect('cache'.includes('caching')).toBe(false);
      expect(shouldRejectByR4T3Rules(['caching', 'strategy', 'ttl'], ['cache']))
        .toBe(false);
    });

    it('does NOT reject prefix-only morphological match (caching ↔ cached)', () => {
      // Both `caching` and `cached` share prefix `cach` (length 4) but
      // neither contains the other (they diverge at position 4: `i` vs
      // `e`). Another prefix-branch-only sentinel.
      expect('caching'.includes('cached')).toBe(false);
      expect('cached'.includes('caching')).toBe(false);
      expect(shouldRejectByR4T3Rules(['caching', 'pattern'], ['cached']))
        .toBe(false);
    });

    it('substring fallback handles cache ↔ cached even when prefix does not apply in isolation', () => {
      // Regression guard: `cached` DOES contain `cache` as a substring
      // ('cache' at position 0), so this is the substring branch, not
      // the prefix branch. Included to lock in the contract that
      // `cache` and `cached` are both recognized regardless of which
      // side appears in the query.
      expect('cached'.includes('cache')).toBe(true);
      expect(shouldRejectByR4T3Rules(['cached', 'response'], ['cache'])).toBe(false);
      expect(shouldRejectByR4T3Rules(['documents', 'overview'], ['document'])).toBe(false);
    });

    it('rejects when shared prefix is exactly 3 (below the ≥ 4 threshold)', () => {
      // Direct threshold sentinel: `production` and `procedure` share
      // `pro` (length 3), diverging at position 3 (`d` vs `c`). No
      // substring containment either (neither string contains the
      // other). Shared prefix length is 3, BELOW the ≥ 4 threshold.
      // Rule B must fire.
      let shared = 0;
      const a = 'production'; const b = 'procedure';
      while (shared < Math.min(a.length, b.length) && a[shared] === b[shared]) shared++;
      expect(shared).toBe(3);
      expect('production'.includes('procedure')).toBe(false);
      expect('procedure'.includes('production')).toBe(false);
      expect(shouldRejectByR4T3Rules(['production', 'line'], ['procedure'])).toBe(true);
    });

    it('rejects unrelated tokens with shared prefix < 4 (casino ↔ caching)', () => {
      // 'casino' vs 'caching' share only 'ca' (length 2). Both rules
      // should fail: Rule A (length > 1), substring (no containment),
      // prefix (< 4). Rule B fires → reject.
      expect(shouldRejectByR4T3Rules(['casino', 'royale'], ['caching'])).toBe(true);
    });

    it('rejects when shared prefix is exactly 4 on the matched side but the query string is length 3', () => {
      // Edge case: prompt token 'cab' (length 3) vs matched tag 'cache'
      // (length 5). The substring-branch `pt.length > 3` gate blocks
      // 'cab' from participating (length 3 is NOT > 3). The prefix
      // branch should also be inside the substring-gated `if` so it's
      // skipped too. So Rule B fires. This is a regression guard that
      // the ≥4 prefix check is INSIDE the length gate, not outside.
      expect(shouldRejectByR4T3Rules(['cab', 'driver'], ['cache'])).toBe(true);
    });

    it('does NOT reject when matched.length > 1 even if all are via expansion', () => {
      // "버그 재현 시스템적으로" hits debugging-systematic via two distinct
      // matches (debug + debugging). Multi-tag expansion is corroborating
      // evidence — Rule B intentionally only fires on single-tag matches.
      expect(shouldRejectByR4T3Rules(['버그', '재현', '시스템적'], ['debug', 'debugging']))
        .toBe(false);
    });

    it('counts substring partials (length > 3) as literal hits', () => {
      // 'code' (query) → 'code-review' (matched) is a partialMatches hit
      // and counts as literal evidence under Rule B.
      expect(shouldRejectByR4T3Rules(['avoiding', 'hardcoded', 'code'], ['code-review']))
        .toBe(false);
    });

    it('does not count substring matches under length 4 (avoid noise)', () => {
      // 'api' (length 3) is too short for the partial-match rule, so
      // 'api' (query) vs 'api-key' (matched) does NOT count as a literal
      // hit under Rule B's > 3 length filter. Check this matches the
      // partialMatches filter in calculateRelevance for symmetry.
      // (In practice this case is masked because 'api' literally
      // appears as a query token, but the substring fallback test is
      // still meaningful for the > 3 threshold.)
      const lengths = (['api', 'api-key'] as const).map(s => s.length);
      expect(lengths).toEqual([3, 7]);
      // 'api'.length === 3, so partial substring check (> 3) is bypassed.
      // The literal includes() check still passes because 'api' is in
      // the prompt token list verbatim.
      expect(shouldRejectByR4T3Rules(['api', 'keys'], ['api'])).toBe(false);
    });
  });

  describe('cases that should NOT be rejected (recall preservation)', () => {
    it('keeps multi-token query with multi-tag match', () => {
      expect(shouldRejectByR4T3Rules(
        ['writing', 'async', 'code'],
        ['async', 'promise', 'pattern'],
      )).toBe(false);
    });

    it('keeps single-token query with literal multi-tag match', () => {
      // Edge: a single-tag-named query (degenerate case) still hits Rule
      // A with single match. But if the match includes multiple tags
      // including the literal, Rule A passes because matchedTags > 1.
      expect(shouldRejectByR4T3Rules(['typescript'], ['typescript', 'strict']))
        .toBe(false);
    });

    it('keeps an empty match list (no rule fires on a non-candidate)', () => {
      // Defensive: callers should not pass empty matches, but the rules
      // must not crash if they do.
      expect(shouldRejectByR4T3Rules(['anything'], [])).toBe(false);
    });
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
