/**
 * Term normalizer — indexed matchTerms registry replacing SYNONYM_MAP.
 *
 * Why this module exists (T2 of the Round 3 plan):
 *   The previous `expandTagsWithSynonyms` in solution-matcher.ts did:
 *     1. forward lookup:  SYNONYM_MAP[tag]  → O(1)
 *     2. reverse lookup:  Object.entries(SYNONYM_MAP).filter(...) → O(N)
 *   The reverse sweep was called *inside* `calculateRelevance` which itself
 *   runs once per solution, so expanding a single query against N solutions
 *   cost O(N × M) where M is the synonym-map size. That is the hot-path
 *   cost the plan targets.
 *
 *   This module pre-computes both directions as Maps at module load time,
 *   so every lookup is O(1). The forward map (`canonicalToTerms`) is used
 *   to expand a canonical into its family; the reverse map
 *   (`termToCanonicals`) is used to find which canonical(s) a term belongs
 *   to (a term may belong to more than one canonical — `mock` is both a
 *   testing-family term and a dependency-injection-family term).
 *
 * Migration rules (T2 Task 2, Step 3 of the plan):
 *   - The old SYNONYM_MAP had 32 top-level keys. This migration consolidates
 *     them into 19 canonicals by merging Korean↔English duplicates (e.g.
 *     `에러` was a key AND a value inside `error` — both directions now live
 *     under a single `error` canonical's `matchTerms`). See the registry
 *     block below for per-family merge notes; the `error`/`debug` split is
 *     documented inline because it was reverted from an earlier round after
 *     measurable baseline regression.
 *   - Exact duplicates within a single `matchTerms` array are deduplicated
 *     by the Set construction in `buildTermNormalizer`.
 *   - Korean-English cross-mappings (the big 5.1.2 hotfix) are kept intact:
 *     `에러` ↔ `error`, `핸들링` ↔ `handling`, `배포` ↔ `deploy`, etc.
 *
 *   Input normalization: `normalizeTerms` NFC-normalizes each input term at
 *   entry. macOS HFS+ paths come back as NFD, and `fm.tags` from YAML can
 *   occasionally arrive that way too — matching the same NFC strategy as
 *   PR3's `term-matcher.ts` prevents silent lookup misses on Korean tags.
 *
 * Design contract (consumer-facing):
 *   - `normalizeTerms(input)` is the replacement for
 *     `expandTagsWithSynonyms(input)`. It returns a de-duplicated array.
 *   - `canonicalToTerms` and `termToCanonicals` are exposed for callers
 *     that want richer introspection (the ranking-log writer in T3 will
 *     record "query term → matched canonical → sibling terms" for offline
 *     explainability).
 *   - `defaultNormalizer` is a pre-built instance from `DEFAULT_MATCH_TERMS`,
 *     suitable for direct use in hot paths (matchSolutions, solution-reader,
 *     solution-index). Tests can build their own via `buildTermNormalizer`.
 */

/**
 * A single canonical group in the match-terms registry.
 *
 * `canonical` is the preferred term used for display/debug. `matchTerms`
 * lists all synonyms that should pull the same family. The canonical
 * itself does not need to appear in `matchTerms` — `buildTermNormalizer`
 * always includes it in the expanded set.
 */
export interface MatchTermEntry {
  canonical: string;
  matchTerms: string[];
}

/**
 * Pre-built lookup shape. `buildTermNormalizer` returns this; consumers
 * call `normalizeTerms` in their hot path.
 */
export interface TermNormalizer {
  /** canonical → full Set of terms (canonical + matchTerms). */
  canonicalToTerms: Map<string, Set<string>>;
  /**
   * Any term (canonical OR matchTerm) → ordered list of canonicals it
   * belongs to. Ordered to keep debug traces stable; a term usually
   * belongs to 1 canonical, occasionally 2-3.
   */
  termToCanonicals: Map<string, string[]>;
  /**
   * Expand an input term list to the union of all related terms.
   * Output is deduplicated. Unknown terms pass through unchanged.
   *
   * For each input term:
   *   1. Include the term itself
   *   2. Look up `termToCanonicals[term]` → list of canonicals
   *   3. For each canonical, include `canonicalToTerms[canonical]`
   *      (the full family)
   */
  normalizeTerms(input: string[]): string[];
}

/**
 * Build a term normalizer from a list of `MatchTermEntry` records.
 *
 * Safe for runtime use and for tests (tests can pass custom entries to
 * exercise edge cases without mutating `DEFAULT_MATCH_TERMS`).
 */
export function buildTermNormalizer(entries: MatchTermEntry[]): TermNormalizer {
  const canonicalToTerms = new Map<string, Set<string>>();
  const termToCanonicals = new Map<string, string[]>();

  for (const entry of entries) {
    // Canonical is always in its own family
    const family = new Set<string>([entry.canonical, ...entry.matchTerms]);
    canonicalToTerms.set(entry.canonical, family);

    // Reverse map: every term in the family points back to this canonical
    for (const term of family) {
      const existing = termToCanonicals.get(term) ?? [];
      if (!existing.includes(entry.canonical)) {
        existing.push(entry.canonical);
      }
      termToCanonicals.set(term, existing);
    }
  }

  function normalizeTerms(input: string[]): string[] {
    const out = new Set<string>();
    for (const rawTerm of input) {
      // NFC normalize on ingest — macOS NFD tags must not silently miss the
      // NFC-encoded registry. Mirrors PR3 `term-matcher.ts` strategy.
      const term = rawTerm.normalize('NFC');
      out.add(term); // always include the original (post-normalize)
      const canonicals = termToCanonicals.get(term);
      if (!canonicals) continue;
      for (const canonical of canonicals) {
        const family = canonicalToTerms.get(canonical);
        if (!family) continue;
        for (const related of family) out.add(related);
      }
    }
    return [...out];
  }

  return { canonicalToTerms, termToCanonicals, normalizeTerms };
}

/**
 * Default match-terms registry, ported 1:1 from the previous
 * `SYNONYM_MAP` in `solution-matcher.ts`. Each entry captures one
 * semantic family.
 *
 * Editing guidance:
 *   - Adding a new canonical is safe — it extends coverage without
 *     shifting existing ranks.
 *   - Adding a matchTerm under an existing canonical pulls the new term
 *     into the existing family. Check the bootstrap eval (`npm test --
 *     solution-matcher-eval`) to confirm baseline metrics don't regress.
 *   - Removing a matchTerm can drop recall for the corresponding query
 *     shape. Update `ROUND3_BASELINE` and the plan doc if intentional.
 *   - Korean-English cross-mapping (`에러` ↔ `error`) must not regress —
 *     covered by the bilingual spot-checks in
 *     `tests/term-normalizer.test.ts`.
 */
export const DEFAULT_MATCH_TERMS: MatchTermEntry[] = [
  // ── Frameworks / UI ──
  { canonical: 'react', matchTerms: ['jsx', 'component', 'hook', 'useState', 'useEffect', '컴포넌트'] },

  // ── Persistence ──
  { canonical: 'database', matchTerms: ['db', 'sql', 'schema', 'migration', 'query', '데이터베이스', '스키마'] },
  { canonical: 'migration', matchTerms: ['migrate', 'upgrade', '마이그레이션', '업그레이드'] },

  // ── Testing ──
  { canonical: 'test', matchTerms: ['testing', 'spec', 'vitest', 'jest', 'mocha', '테스트', '단위테스트'] },

  // ── Languages ──
  { canonical: 'typescript', matchTerms: ['ts', 'type', 'interface', 'generic'] },

  // ── API / Network ──
  { canonical: 'api', matchTerms: ['rest', 'graphql', 'endpoint', 'route'] },
  { canonical: 'auth', matchTerms: ['authentication', 'authorization', 'login', 'session', 'jwt', '인증'] },

  // ── DevOps ──
  { canonical: 'docker', matchTerms: ['container', 'dockerfile', 'compose'] },
  { canonical: 'ci', matchTerms: ['pipeline', 'workflow', 'actions'] },
  { canonical: 'deploy', matchTerms: ['deployment', 'release', 'publish', '배포'] },

  // ── Error / Debug ──
  //
  // Two canonicals kept distinct — debug tooling ≠ the error condition
  // itself. Merging them pulled `디버깅`/`debugger`/`breakpoint` into query
  // expansions of `error`, which inflated `starter-debugging-systematic`'s
  // relevance on any generic error-handling query and flipped the ranking
  // of `"proper error handling pattern"` to the wrong solution (baseline
  // mrrAt5 dropped from 1.0 → 0.988). Splitting them back restores the
  // old SYNONYM_MAP semantic: `error` includes `debug` (the verb/general
  // concept) but NOT the debugging toolchain terms.
  //
  // Query-side impact: `"에러 핸들링"` still expands densely via the
  // `error` + `handling` families; `"디버깅"` queries now expand via the
  // dedicated `debug` family and no longer cross-contaminate error matches.
  { canonical: 'error', matchTerms: ['bug', 'fix', 'debug', 'crash', 'exception', '에러', '오류', '버그', '예외'] },
  { canonical: 'debug', matchTerms: ['debugger', 'breakpoint', '디버깅', '디버그'] },

  // Handling is kept distinct from `error`: not every "handling" query is
  // about errors (event handling, request handling), but they often co-occur.
  { canonical: 'handling', matchTerms: ['handler', 'catch', 'try', 'recovery', '핸들링', '처리', '대응'] },

  // ── Performance / Cache ──
  //
  // Merged `performance` + `성능` + `최적화` into one family — all three
  // pulled overlapping `optimize`/`profiling`/`bottleneck` terms.
  { canonical: 'performance', matchTerms: ['optimize', 'profiling', 'bottleneck', 'latency', '성능', '최적화', '프로파일링', '병목'] },
  { canonical: 'cache', matchTerms: ['caching', 'memoize', 'invalidate', '캐시', '캐싱'] },

  // ── Security ──
  //
  // Merged `security` + `보안` + `인증` overlap is handled by the `auth`
  // canonical above. Security keeps the vulnerability family.
  { canonical: 'security', matchTerms: ['vulnerability', 'injection', 'xss', 'csrf', '보안', '취약점'] },

  // ── Refactoring / Architecture ──
  //
  // Merged `refactor` + `리팩토링`.
  { canonical: 'refactor', matchTerms: ['cleanup', 'restructure', 'simplify', 'decompose', '리팩토링', '정리', '개선', '분리'] },

  // ── Validation ──
  { canonical: 'validation', matchTerms: ['validate', 'check', 'sanitize', '검증', '유효성'] },

  // ── Logging ──
  { canonical: 'logging', matchTerms: ['log', 'trace', 'monitor', '로깅', '로그'] },
];

/**
 * Pre-built normalizer for the default registry. Modules that need the
 * default behaviour should import this directly rather than calling
 * `buildTermNormalizer(DEFAULT_MATCH_TERMS)` on every query.
 */
export const defaultNormalizer: TermNormalizer = buildTermNormalizer(DEFAULT_MATCH_TERMS);
