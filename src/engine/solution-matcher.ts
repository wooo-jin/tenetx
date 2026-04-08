import * as path from 'node:path';
import { ME_SOLUTIONS, PACKS_DIR } from '../core/paths.js';
import type { ScopeInfo } from '../core/types.js';
import { extractTags, expandCompoundTags, expandQueryBigrams } from './solution-format.js';
import { getOrBuildIndex } from './solution-index.js';
import type { SolutionDirConfig } from './solution-index.js';
import type { SolutionStatus, SolutionType } from './solution-format.js';
import { defaultNormalizer } from './term-normalizer.js';

// ── Synonym expansion (delegates to term-normalizer) ──
//
// The old `SYNONYM_MAP` + `expandTagsWithSynonyms` pair had two problems:
//   1. The reverse-lookup `Object.entries(SYNONYM_MAP).filter(v => v.includes(tag))`
//      was O(N) per term and ran once per (query, solution) pair — quadratic
//      on the solution count.
//   2. Korean↔English cross-mapping was maintained as two separate map entries
//      that drifted (fixed in 5.1.2 but fragile).
//
// Both are now handled by `src/engine/term-normalizer.ts`. See that file for
// the canonical registry (`DEFAULT_MATCH_TERMS`) and the `buildTermNormalizer`
// implementation. Reverse lookup is an O(1) `Map<term, canonicals>` fetch.
//
// The export below is kept as a thin backwards-compatible wrapper so
// downstream callers (and the existing `synonym-tfidf.test.ts` spot-checks)
// continue to work — but the hot path in this module now passes
// pre-normalized query tags via the new `calculateRelevance` options arg
// and skips the wrapper entirely.

/**
 * @deprecated Use `defaultNormalizer.normalizeTerms` from
 * `./term-normalizer.js` directly. Kept as a thin wrapper for the existing
 * `synonym-tfidf.test.ts` and any external consumers.
 */
export function expandTagsWithSynonyms(tags: string[]): string[] {
  return defaultNormalizer.normalizeTerms(tags);
}

// ── TF-IDF weighting for common tags ──

/** High-frequency tags that should be weighted lower */
const COMMON_TAGS = new Set([
  'typescript', 'ts', 'javascript', 'js', 'fix', 'update', 'add', 'change',
  'file', 'code', 'function', 'import', 'export', 'error', 'type', 'string',
  'number', 'object', 'array', 'return', 'const', 'class', 'module',
  '코드', '파일', '함수', '수정', '추가', '변경', '에러', '타입',
]);

/** Apply IDF-like weight: common tags get reduced weight */
export function tagWeight(tag: string): number {
  return COMMON_TAGS.has(tag) ? 0.5 : 1.0;
}

export interface SolutionMatch {
  name: string;
  path: string;
  scope: 'me' | 'team' | 'project';
  relevance: number;
  summary: string;
  // v3 fields
  status: SolutionStatus;
  confidence: number;
  type: SolutionType;
  tags: string[];
  identifiers: string[];
  matchedTags: string[];
}

/** Internal loaded solution with scope from directory config */
interface LoadedSolution {
  name: string;
  status: SolutionStatus;
  confidence: number;
  type: SolutionType;
  tags: string[];
  identifiers: string[];
  filePath: string;
  scope: 'me' | 'team' | 'project';
}

/**
 * Optional hints for the v3 `calculateRelevance` path. Used by hot-path
 * callers (matchSolutions, searchSolutions) to avoid re-normalizing the
 * same query tags on every solution.
 */
export interface CalculateRelevanceOptions {
  /**
   * Pre-normalized prompt tags (produced by `defaultNormalizer.normalizeTerms`).
   * If provided, skips the per-call expansion. Callers loop-running against
   * many solutions should compute this once outside the loop and pass it in.
   */
  normalizedPromptTags?: string[];
  /**
   * R4-T1: solution tags expanded with compound-split alternatives
   * (`expandCompoundTags`). When supplied, the intersection/partial-match
   * step uses this set INSTEAD of `solutionTags`, but the Jaccard union
   * denominator still uses `solutionTags` (raw) so the score normalization
   * stays semantically stable. Caller responsibility to pass the matching
   * pair — `solutionTagsExpanded` MUST be a superset of `solutionTags`.
   */
  solutionTagsExpanded?: string[];
}

export function calculateRelevance(
  promptTags: string[],
  solutionTags: string[],
  confidence: number,
  options?: CalculateRelevanceOptions,
): { relevance: number; matchedTags: string[] };
/** @deprecated */
export function calculateRelevance(prompt: string, keywords: string[]): number;
export function calculateRelevance(
  promptOrTags: string | string[],
  keywordsOrTags: string[],
  confidence?: number,
  options?: CalculateRelevanceOptions,
): number | { relevance: number; matchedTags: string[] } {
  if (typeof promptOrTags === 'string') {
    // Legacy mode: substring matching for backwards compatibility.
    // Not a hot path — only hit by the (old) solution-matcher.test.ts cases.
    const promptTags = extractTags(promptOrTags);
    const intersection = keywordsOrTags.filter(kw =>
      promptTags.some(pt => pt === kw || (pt.length > 3 && kw.length > 3 && (pt.startsWith(kw) || kw.startsWith(pt)))),
    );
    return Math.min(1, intersection.length / Math.max(promptTags.length * 0.5, 1));
  }
  // v3 mode: tag matching with synonym expansion + TF-IDF weighting.
  //
  // T2: the synonym expansion is now a hash-indexed lookup via
  // `defaultNormalizer.normalizeTerms` (see term-normalizer.ts). Callers in
  // the hot path pre-compute the expansion once per query and pass it via
  // `options.normalizedPromptTags`, so this function no longer repeats the
  // work per solution.
  const expandedPromptTags = options?.normalizedPromptTags
    ?? defaultNormalizer.normalizeTerms(promptOrTags);

  // R4-T1: when the caller supplies a compound-expanded solution tag set,
  // intersection and partial matching run against the expanded set (so
  // `api-key` matches `api`/`key` queries via the split parts), but the
  // Jaccard union denominator below still uses the RAW `keywordsOrTags`
  // for normalization stability.
  const matchTags = options?.solutionTagsExpanded ?? keywordsOrTags;

  const intersection = matchTags.filter(t => expandedPromptTags.includes(t));

  // partial/substring matches for longer tags (>3 chars)
  const partialMatches = matchTags.filter(t =>
    t.length > 3 && !intersection.includes(t)
    && expandedPromptTags.some(pt => pt.length > 3 && (pt.includes(t) || t.includes(pt))),
  );

  // Apply TF-IDF weighting: common tags count less
  const weightedMatched = intersection.reduce((sum, t) => sum + tagWeight(t), 0)
    + partialMatches.reduce((sum, t) => sum + tagWeight(t) * 0.5, 0);
  // 완화된 임계값: 가중 점수 0.5 이상이면 후보
  if (weightedMatched < 0.5) return { relevance: 0, matchedTags: [] };

  // Jaccard-like: weighted matched / union.
  // Union uses RAW promptTags and RAW solutionTags — not the expanded set —
  // so that the denominator semantics are unchanged from pre-T2 behaviour.
  // This is intentional: expanding both sides of the Jaccard would
  // asymmetrically inflate recall and silently shift all baseline metrics.
  // R4-T1 explicitly preserves this: `keywordsOrTags` is the raw solution
  // tag list, not the compound-expanded `matchTags` used above.
  const union = new Set([...promptOrTags, ...keywordsOrTags]).size;
  const tagScore = weightedMatched / Math.max(union, 1);
  return {
    relevance: tagScore * (confidence ?? 1),
    matchedTags: [...intersection, ...partialMatches],
  };
}

/**
 * Match solutions relevant to the given prompt.
 * knowledge-comes-to-you principle: knowledge should come to you.
 */
// ── Shared ranking core (used by matchSolutions + evaluator) ──

/**
 * Narrow input shape for the shared ranking pipeline. `matchSolutions` and the
 * bootstrap evaluator both reduce to this contract — `LoadedSolution` is
 * structurally compatible (it has more fields), and `EvalSolution` mirrors it
 * exactly. Keeping the input narrow prevents the evaluator from leaking onto
 * prod types and vice versa.
 */
interface RankableSolution {
  name: string;
  tags: string[];
  identifiers?: string[];
  confidence: number;
}

/**
 * Intermediate ranked candidate. Generic over the source solution type so the
 * caller can get back the exact object they passed in — this matters for
 * `matchSolutions`, which needs to re-hydrate scope/filePath from the
 * original `LoadedSolution` without a name-based Map lookup.
 *
 * A name-based Map was tried in Round 2 and caused a scope precedence bug:
 * when two scopes had solutions with the same name (legitimate: user-level
 * `me/foo` and project-level `foo`), the Map was last-wins and produced
 * duplicate entries all pointing at the project copy. Carrying the source
 * reference straight through ranking fixes this by construction.
 */
interface RankedCandidate<T extends RankableSolution = RankableSolution> {
  solution: T;
  relevance: number;
  matchedTags: string[];
  matchedIdentifiers: string[];
}

/**
 * Shared ranking core: tag-based relevance + identifier boost + top-5 sort.
 *
 * Single source of truth for the matcher's ranking behaviour. Both
 * `matchSolutions` (production, reads from the index) and
 * `evaluateSolutionMatcher` (bootstrap eval, reads from an in-memory fixture)
 * call through here so the eval metrics track reality — any future
 * ranking-logic change only needs to happen in one place.
 *
 * Contract:
 *   - identifier boost requires `id.length >= 4` (STRONG_ID_MIN_LENGTH mirror)
 *     and substring presence in the prompt (case-insensitive).
 *   - candidates with zero matched tags AND zero matched identifiers are dropped.
 *   - top-5 by `relevance` descending.
 *   - duplicate names are NOT deduplicated — that matches the pre-refactor
 *     `matchSolutions` behaviour (both scopes could rank). Callers that want
 *     first-wins scope precedence must dedupe on their side.
 */
function rankCandidates<T extends RankableSolution>(
  promptTags: string[],
  promptLower: string,
  solutions: readonly T[],
): RankedCandidate<T>[] {
  // T2: normalize prompt tags ONCE per query (not once per solution).
  // Pre-T2 this expansion happened inside calculateRelevance and was
  // repeated N times for N solutions — the plan's primary hot-path win.
  //
  // R4-T1: also expand the prompt tags with adjacent-token bigrams BEFORE
  // running the canonical normalizer. `expandQueryBigrams` produces compound
  // forms like `api-key`, `apikey`, `api-keys`, `apikeys` from the raw
  // ['api', 'keys'] token pair, so a query "api keys" can hit a solution
  // tag `api-key` via direct intersection — without depending on the
  // partialMatches half-weight fallback. The bigram expansion is layered
  // BEFORE normalization so that `apikey → api` (via the api canonical
  // family) still works.
  //
  // Note: we intentionally do NOT use `sol.normalizedTags` (if present) for
  // the intersection. Using normalized on BOTH sides is bidirectional
  // expansion that inflates Jaccard intersection 5-10× and silently shifts
  // every baseline metric. `entry.normalizedTags` is populated by the
  // index but reserved for log explainability. If a future change uses it
  // in scoring, it must update ROUND3_BASELINE in the same PR.
  const promptTagsWithBigrams = expandQueryBigrams(promptTags);
  const normalizedPromptTags = defaultNormalizer.normalizeTerms(promptTagsWithBigrams);

  return solutions
    .map(sol => {
      // R4-T1: solution-side compound-tag expansion. `api-key` becomes
      // {api-key, api, key} so a query token `api` (from "api keys") hits
      // it directly. Computed per solution because each sol.tags is
      // independent — caching across the rank loop is not worth the
      // bookkeeping for the corpus sizes Tenetx targets (N ≤ 200).
      const solTagsExpanded = expandCompoundTags(sol.tags);

      const result = calculateRelevance(
        promptTags,
        sol.tags,
        sol.confidence,
        { normalizedPromptTags, solutionTagsExpanded: solTagsExpanded },
      ) as { relevance: number; matchedTags: string[] };

      let identifierBoost = 0;
      const matchedIdentifiers: string[] = [];
      for (const id of sol.identifiers ?? []) {
        if (id.length >= 4 && promptLower.includes(id.toLowerCase())) {
          identifierBoost += 0.15;
          matchedIdentifiers.push(id);
        }
      }

      return {
        solution: sol,
        relevance: result.relevance + identifierBoost,
        matchedTags: result.matchedTags,
        matchedIdentifiers,
      };
    })
    .filter(c => c.matchedTags.length + c.matchedIdentifiers.length >= 1)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);
}

// ── Bootstrap evaluator (T1 / PR4) ──

/**
 * In-memory solution shape for the bootstrap evaluator. Mirrors the index
 * entry fields that `matchSolutions` consumes (tags, identifiers, confidence)
 * but without any filesystem dependency — the evaluator is pure so CI can run
 * it without mounting a starter pack.
 */
export interface EvalSolution {
  name: string;
  tags: string[];
  identifiers?: string[];
  confidence: number;
}

export interface EvalQuery {
  query: string;
  /** Names that should appear in the top-5. Empty array = expect no match (negative case). */
  expectAnyOf: string[];
}

export interface EvalFixture {
  solutions: EvalSolution[];
  positive: EvalQuery[];
  /** Bilingual or compound-word variants that exercise synonym expansion. */
  paraphrase: EvalQuery[];
  /** Unrelated queries that should not return a top-1 hit. */
  negative: EvalQuery[];
}

/** Per-bucket metrics. Paraphrase and positive are reported separately so a
 *  bilingual regression (T2 synonym change) can't hide inside the aggregate. */
export interface BucketMetrics {
  /** |{q : ∃i≤5, ranked[i] ∈ q.expectAnyOf}| / |q| */
  recallAt5: number;
  /** Σ (1 / firstMatchRank) / |q|; rank > 5 contributes 0. */
  mrrAt5: number;
  /** |{q : ranked is empty}| / |q| */
  noResultRate: number;
  /** Number of queries in this bucket. */
  total: number;
}

export interface EvalResult {
  /** Combined (positive ∪ paraphrase) metrics — backwards-compatible headline numbers. */
  recallAt5: number;
  mrrAt5: number;
  noResultRate: number;
  /**
   * Fraction of negative queries where the matcher returned ≥ 1 candidate
   * (regardless of rank). Name is honest: this is the "any result" rate on
   * the negative bucket, not a rank-1 precision metric. It's the correct
   * baseline for "did synonym/stemming leak into unrelated queries?".
   */
  negativeAnyResultRate: number;
  /** Per-bucket breakdown — use these to catch paraphrase-only regressions. */
  byBucket: {
    positive: BucketMetrics;
    paraphrase: BucketMetrics;
  };
  total: {
    positive: number;
    paraphrase: number;
    negative: number;
  };
}

/**
 * Round 3 baseline metrics, recorded against the current `term-normalizer`
 * + `calculateRelevance` + fixture `solution-match-bootstrap.json`. Used as
 * a relative regression guard in `tests/solution-matcher-eval.test.ts` —
 * downstream PRs must not regress any field by more than `BASELINE_TOLERANCE`.
 *
 * History:
 *   - v1 (2026-04-08, fixture v1, 41+10+10 queries): 1.0 / 1.0 / 0.0 / 0.1
 *     Recorded against the original 61-query fixture, all positive queries
 *     PASS@1. Indicated a measurement plateau but masked the matcher's true
 *     ranking and false-positive weaknesses because the fixture queries were
 *     too tag-aligned.
 *   - v3 (2026-04-08, fixture v2 + R4-T1 compound-tag fix): 1.0 / 0.986 / 0.0 / 0.357
 *     R4-T1 added `expandCompoundTags` (solution-side) and
 *     `expandQueryBigrams` (query-side) so hyphenated solution tags like
 *     `api-key`, `code-review`, `red-green-refactor` participate in direct
 *     intersection rather than relying on the half-weight partialMatches
 *     fallback. positive `mrrAt5` improved 0.959 → 0.981 (+0.022). 2 of
 *     the 4 v2 hard positive cases were resolved (`managing api keys and
 *     credentials safely` and `red green refactor cycle for new features`
 *     now rank @1). The remaining 2 (`avoiding hardcoded credentials …`
 *     and `writing unit tests for a function with side effects`) require
 *     R4-T2 (phrase matcher) or R4-T3 (specificity classifier) — they're
 *     about query-side English semantics, not compound-tag tokenization.
 *     `negativeAnyResultRate` is unchanged at 0.357 because R4-T1 is a
 *     ranking-quality fix, not a false-positive filter.
 *
 *   - v2 (2026-04-08, fixture v2, 53+16+14 queries): 1.0 / 0.969 / 0.0 / 0.357
 *     Expanded with 12 hard positive (multi-canonical / compound-tag tug-of-
 *     war), 6 Korean subtle paraphrase, and 4 tricky negative queries. The
 *     drops are intentional and represent genuine matcher behaviour:
 *       * positive mrrAt5 1.0 → 0.959: 4 of 12 added positives rank #2-3:
 *         (1) "managing api keys and credentials safely" → secret @3 vs
 *             api-error-responses @1 — the `api` canonical in
 *             DEFAULT_MATCH_TERMS expands to {api, rest, graphql, endpoint,
 *             route}, so query `api` hits BOTH `api` AND `rest` on
 *             starter-api-error-responses (matched=['api','rest']) — a
 *             double-count numerator. starter-secret-management only scores
 *             a single weak partial match on `credential`. The compound
 *             `api-key` tag on secret-management is never reached because
 *             extractTags strips the query-side hyphen and yields
 *             ['api','keys'] (the solution-side tag remains hyphenated in
 *             the index but has no query token to intersect with). T4 IDF
 *             would down-weight both `api` and `rest`, neutralising the
 *             double-count and letting `credential` outscore the noise.
 *         (2) "avoiding hardcoded credentials in source code" → secret @2
 *             vs code-review @1 — `code` partial-matches `code-review`
 *             (len>3, code-review.includes('code')=true) at half weight.
 *             secret-management's `credential` matches by partial too but
 *             the union size differs.
 *         (3) "red green refactor cycle for new features" → tdd @2 vs
 *             refactor-safely @1 — `refactor` is a full-weight intersection
 *             with both refactor-safely's `refactor` and `리팩토링` (via
 *             the refactor canonical), giving 2 hits at 1.0 each. tdd-red-
 *             green-refactor only matches the literal compound tag
 *             `red-green-refactor` (one weighted hit) — the full-weight
 *             generic `refactor` term overpowers the compound-tag specifity.
 *         (4) "writing unit tests for a function with side effects" → tdd
 *             @2 vs separation-of-concerns @1 — both solutions have a
 *             SINGLE matching tag with weighted score 0.5: separation gets
 *             `function` (COMMON_TAG, exact intersection, weight 0.5);
 *             tdd-red-green-refactor gets `tests` partial-matching `test`
 *             (len>3, partial weight 1.0 × 0.5 = 0.5). Both numerators are
 *             identical. Separation wins because the `function` co-occurs
 *             in both promptTags and solution.tags, shrinking its Jaccard
 *             union by one element vs tdd's — a 1-element union-size
 *             advantage drives the entire ranking. starter-dependency-
 *             injection is *not* in top-5 despite having `testing`/`mock`/
 *             `dependency` tags (`tests` does not partial-match `testing`
 *             — neither is a substring of the other), so listing `di` in
 *             expectAnyOf is purely defensive recall, not a live candidate.
 *             T4 BM25 with proper length normalization would attack the
 *             union-size tie-breaker more rigorously than current Jaccard.
 *       * paraphrase mrrAt5 stays at 1.0: all 6 added Korean paraphrases
 *         rank @1 (the originally hard "테스트 먼저 작성하고 리팩토링" is
 *         documented in the fixture as legitimately matching either tdd
 *         OR refactor-safely, since starter-refactor-safely's README also
 *         covers test-first workflows — both are defensible answers).
 *       * negativeAnyResultRate 0.1 → 0.357: 4 added tricky negatives all
 *         trigger false positives via single common dev-adjacent words —
 *         "performance review meeting notes" → caching (matches
 *         `performance`), "system architecture overview document" →
 *         separation-of-concerns (matches `architecture`), "database backup
 *         recovery procedure" → n-plus-one-queries (matches `database`,
 *         `query`, `데이터베이스`), "validation of insurance claims" →
 *         error-handling (matches `validation`).
 *     The original Round 3 plan staged these for T4 (BM25 + IDF). T4 was
 *     EMPIRICALLY SKIPPED on 2026-04-08 — see
 *     `docs/plans/2026-04-08-t4-bm25-skip-adr.md` for the full decision
 *     record. Summary: BM25 prototypes (naive, hybrid Jaccard×IDF,
 *     precision filter, soft penalty) all matched or underperformed the
 *     current scorer on every metric. The starter corpus (N=15) is too
 *     small for IDF to be informative, and the false positives are
 *     semantic ("performance" is both a dev tag and an English noun) — not
 *     statistical, so no frequency-based weighting can fix them. The real
 *     follow-up candidates are tokenizer fix for compound tags, an n-gram
 *     phrase matcher, and corpus growth — all deferred to Round 4 per the
 *     ADR.
 *
 * Known matcher quirks (separate from the T4 BM25 investigation):
 *   - `term-normalizer.ts` `error` canonical contains `debug` as a matchTerm
 *     (intentional for `bug → error` recall), which causes any prompt
 *     containing `error` to expand to `debug` and over-rank
 *     `starter-debugging-systematic` on otherwise unrelated queries. This
 *     is why `async await error propagation` could not be added as a hard
 *     case — the matcher returns debugging-systematic at #1, which is
 *     defensible-but-noisy. The fix is at the normalizer level (split
 *     `debug` out of the `error` family or remove the `error → debug`
 *     edge entirely) and is queued as a Round 4 follow-up. T4 BM25 was
 *     considered as a partial mitigation but the T4 skip ADR (referenced
 *     in the Round 3 outcome paragraph above) shows it does not help.
 *
 * Long-tail caveat:
 *   - `"trying to handle authentication errors gracefully when our backend
 *     api returns inconsistent response formats from different
 *     microservices"` is a 17-word query intentionally added to exercise
 *     long-tail behaviour. Currently PASS@1. Originally flagged as BM25
 *     length-normalization sensitive, but since T4 BM25 was skipped this
 *     caveat is now informational only — no length-norm code path is
 *     planned in Round 3.
 *
 * If a PR legitimately improves a metric, update this constant in the same
 * commit so future PRs guard against the new floor.
 */
export const ROUND3_BASELINE: EvalResult = {
  recallAt5: 1.0,
  mrrAt5: 0.986,
  noResultRate: 0.0,
  negativeAnyResultRate: 0.357,
  byBucket: {
    positive: { recallAt5: 1.0, mrrAt5: 0.981, noResultRate: 0.0, total: 53 },
    paraphrase: { recallAt5: 1.0, mrrAt5: 1.0, noResultRate: 0.0, total: 16 },
  },
  total: { positive: 53, paraphrase: 16, negative: 14 },
};

/** Maximum allowed absolute regression per metric. 5% is tight enough to catch
 *  ~3-4 query regressions in a 69-query combined bucket (positive+paraphrase)
 *  but lenient enough that a single fixture edit won't spuriously fail the
 *  guard. */
export const BASELINE_TOLERANCE = 0.05;

/** Run a single bucket through the ranking pipeline and aggregate IR metrics. */
function computeBucketMetrics(queries: EvalQuery[], solutions: EvalSolution[]): BucketMetrics {
  let recallHits = 0;
  let reciprocalSum = 0;
  let noResultCount = 0;

  for (const q of queries) {
    const promptTags = extractTags(q.query);
    const ranked = rankCandidates(promptTags, q.query.toLowerCase(), solutions);
    if (ranked.length === 0) {
      noResultCount++;
      continue;
    }
    for (let i = 0; i < ranked.length; i++) {
      if (q.expectAnyOf.includes(ranked[i].solution.name)) {
        recallHits++;
        reciprocalSum += 1 / (i + 1);
        break;
      }
    }
  }

  const total = queries.length;
  return {
    recallAt5: total > 0 ? recallHits / total : 0,
    mrrAt5: total > 0 ? reciprocalSum / total : 0,
    noResultRate: total > 0 ? noResultCount / total : 0,
    total,
  };
}

/**
 * Test/diagnostic helper: evaluate one query against a fixture solution set
 * and return the top-5 ranked candidates with their relevance + matched tags.
 *
 * Exists so per-query regression tests (e.g. the R4-T1 hard-positive guards
 * in `tests/solution-matcher-eval.test.ts`) can assert specific ranking
 * outcomes without scraping aggregate metrics. Wraps `rankCandidates` so
 * the test path stays in sync with the production ranker.
 *
 * Returns the same shape as `rankCandidates` minus the generic carrier:
 * `{name, relevance, matchedTags}`. Use the names to assert "expected
 * solution at rank 1".
 */
export function evaluateQuery(
  query: string,
  solutions: readonly EvalSolution[],
): Array<{ name: string; relevance: number; matchedTags: string[] }> {
  const promptTags = extractTags(query);
  return rankCandidates(promptTags, query.toLowerCase(), solutions).map(c => ({
    name: c.solution.name,
    relevance: c.relevance,
    matchedTags: c.matchedTags,
  }));
}

/**
 * Evaluate the current matcher against a labeled fixture and return IR
 * metrics. This is the Round 3 baseline — each downstream PR (T2/T3/T4) must
 * not regress any of the thresholds asserted in `solution-matcher-eval.test.ts`.
 *
 * Uses `rankCandidates` (shared with `matchSolutions`) so the evaluator can't
 * silently drift from production ranking behaviour.
 *
 * Metrics are reported both aggregated (positive ∪ paraphrase) and per-bucket,
 * so paraphrase-only regressions surface in `byBucket.paraphrase` even if the
 * aggregate looks fine.
 */
export function evaluateSolutionMatcher(fixture: EvalFixture): EvalResult {
  const positiveM = computeBucketMetrics(fixture.positive, fixture.solutions);
  const paraphraseM = computeBucketMetrics(fixture.paraphrase, fixture.solutions);

  const combinedTotal = positiveM.total + paraphraseM.total;
  // Weighted aggregation: counts, not means — so a large positive bucket
  // doesn't drown a small paraphrase bucket but also a single-query bucket
  // doesn't dominate.
  const recallAt5 = combinedTotal > 0
    ? (positiveM.recallAt5 * positiveM.total + paraphraseM.recallAt5 * paraphraseM.total) / combinedTotal
    : 0;
  const mrrAt5 = combinedTotal > 0
    ? (positiveM.mrrAt5 * positiveM.total + paraphraseM.mrrAt5 * paraphraseM.total) / combinedTotal
    : 0;
  const noResultRate = combinedTotal > 0
    ? (positiveM.noResultRate * positiveM.total + paraphraseM.noResultRate * paraphraseM.total) / combinedTotal
    : 0;

  let negAnyResult = 0;
  for (const q of fixture.negative) {
    const promptTags = extractTags(q.query);
    const ranked = rankCandidates(promptTags, q.query.toLowerCase(), fixture.solutions);
    if (ranked.length >= 1) negAnyResult++;
  }
  const negTotal = fixture.negative.length;

  return {
    recallAt5,
    mrrAt5,
    noResultRate,
    negativeAnyResultRate: negTotal > 0 ? negAnyResult / negTotal : 0,
    byBucket: {
      positive: positiveM,
      paraphrase: paraphraseM,
    },
    total: {
      positive: fixture.positive.length,
      paraphrase: fixture.paraphrase.length,
      negative: fixture.negative.length,
    },
  };
}

export function matchSolutions(prompt: string, scope: ScopeInfo, cwd: string): SolutionMatch[] {
  // Build solution dirs for index cache
  const dirs: SolutionDirConfig[] = [
    { dir: ME_SOLUTIONS, scope: 'me' },
  ];
  if (scope.team) {
    dirs.push({ dir: path.join(PACKS_DIR, scope.team.name, 'solutions'), scope: 'team' });
  }
  dirs.push({ dir: path.join(cwd, '.compound', 'solutions'), scope: 'project' });

  // Use cached index (rebuilt only when dirs change)
  const index = getOrBuildIndex(dirs);
  const allSolutions: LoadedSolution[] = index.entries.map(e => ({ ...e }));

  const promptTags = extractTags(prompt);
  const promptLower = prompt.toLowerCase();

  // Delegate to shared ranking core. `rankCandidates` is generic so each
  // ranked candidate carries the original `LoadedSolution` reference — no
  // name-based re-lookup, so two scopes sharing a name (e.g. me/foo and
  // project/foo) can both appear in the result without a Map last-wins
  // scope-precedence bug.
  const ranked = rankCandidates(promptTags, promptLower, allSolutions);

  return ranked.map(c => ({
    name: c.solution.name,
    path: c.solution.filePath,
    scope: c.solution.scope,
    relevance: c.relevance,
    summary: c.solution.name,
    status: c.solution.status,
    confidence: c.solution.confidence,
    type: c.solution.type,
    tags: c.solution.tags,
    identifiers: c.solution.identifiers,
    matchedTags: [...c.matchedTags, ...c.matchedIdentifiers],
  }));
}
