import * as path from 'node:path';
import { ME_SOLUTIONS, PACKS_DIR } from '../core/paths.js';
import type { ScopeInfo } from '../core/types.js';
import { extractTags, expandCompoundTags, expandQueryBigrams } from './solution-format.js';
import { getOrBuildIndex } from './solution-index.js';
import type { SolutionDirConfig } from './solution-index.js';
import type { SolutionStatus, SolutionType } from './solution-format.js';
import { defaultNormalizer } from './term-normalizer.js';
import { maskBlockedTokens } from './phrase-blocklist.js';

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

// ── R4-T3: query-side specificity guards (orchestration layer) ──
//
// Two narrow precision rules applied AFTER `calculateRelevance` returns,
// at the orchestration layer (`rankCandidates`, `searchSolutions`).
// These rules fix the 2 surviving false positives from R4-T2 — the
// "validation of insurance claims" and "database backup recovery
// procedure" residuals — WITHOUT regressing any legitimate fixture
// positive or paraphrase.
//
// Why orchestration-level (not inside calculateRelevance):
//   `calculateRelevance` is a pure scoring function with a stable
//   contract: given (promptTags, solutionTags, confidence), return the
//   relevance and the matched tag set. Several internal tests
//   (synonym-tfidf.test.ts) call it directly with single-token inputs
//   to verify synonym expansion in isolation. Embedding precision
//   filters in the scoring path would break those tests AND break the
//   semantic of "scoring is a pure function". The two rules below are
//   policy-layer decisions about which scored candidates to surface,
//   so they belong at the caller — not at the scorer.
//
// Rule A — single-token query AND single-tag match → reject.
//   Rationale: a query that's been reduced to a single dev token (after
//   R4-T2 phrase masking) is unlikely to be a real dev question. Combined
//   with a single-tag match, this is the "validation of insurance
//   claims" shape: masked to `[validation]`, matched a single ambiguous
//   tag `validation` on error-handling-patterns. No legitimate fixture
//   positive or paraphrase has both promptTags.length === 1 AND
//   matchedTags.length === 1.
//
// Rule B — all matched tags came via SYNONYM EXPANSION (none appear
//   literally in the prompt tokens) AND match is single-tag → reject.
//   Rationale: the "database backup recovery procedure" shape. After
//   R4-T2 masks `database`/`backup`, the residual tokens are `[recovery,
//   procedure]`. The matched tag is `handling` — which appears nowhere
//   in the query. It only matches because the term-normalizer's
//   `handling` canonical includes `recovery` as a matchTerm (legitimate
//   for "error recovery handler" queries). The rule rejects this
//   expansion-only single-tag match because the query carries no
//   LITERAL signal that the matched solution is relevant. Multi-tag
//   expansion matches are NOT rejected — those indicate the canonical
//   family is being hit from multiple angles ("버그 재현 시스템적으로"
//   hits debugging-systematic via both `debug` and `debugging` — two
//   distinct matches survive).
//
// Literal hit: a matched tag is "literal" with respect to the query if
// any of the following holds for some prompt token `pt`:
//   1. `pt === tag` (exact verbatim match in the query)
//   2. `pt` is a substring of `tag` or vice versa, with both length > 3
//      (mirrors the partialMatches discovery rule in calculateRelevance —
//      e.g., `code` (query) ↔ `code-review` (matched tag))
//   3. `pt` and `tag` share a common prefix of length ≥ 4 (catches
//      morphological variants like `caching` ↔ `cache`, `cached` ↔
//      `cache`, `documents` ↔ `document` where neither is a substring
//      of the other but both clearly come from the same stem)
//
// Rule (3) is the defensive precision fix: without it, a query like
// "caching strategy" (which the term-normalizer expands `caching → cache`
// via the cache canonical) would have its single-tag `cache` match
// rejected by Rule B, even though `caching` is morphologically the same
// concept. The 4-char threshold is the same as the partialMatches rule
// to keep the literal-hit semantics consistent across the matcher.
//
// Returns true if the candidate should be rejected (caller filters
// it out), false if the candidate passes both rules.
export function shouldRejectByR4T3Rules(
  promptTags: readonly string[],
  matchedTags: readonly string[],
): boolean {
  // Rule A
  if (promptTags.length === 1 && matchedTags.length === 1) {
    return true;
  }
  // Rule B
  if (matchedTags.length === 1) {
    const tag = matchedTags[0];
    const literalHit = promptTags.includes(tag)
      || promptTags.some(pt => {
        if (pt.length <= 3 || tag.length <= 3) return false;
        if (pt.includes(tag) || tag.includes(pt)) return true;
        // Morphological stem: shared prefix of length ≥ 4
        let i = 0;
        const limit = Math.min(pt.length, tag.length);
        while (i < limit && pt[i] === tag[i]) i++;
        return i >= 4;
      });
    if (!literalHit) return true;
  }
  return false;
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
  // R4-T2: BEFORE any expansion or normalization, mask out tokens that
  // belong to blocked English phrases ("performance review", "system
  // architecture", etc.). This is a precision filter for non-dev-context
  // false positives. The mask runs first so neither bigram expansion nor
  // canonical normalization can re-introduce a masked token via synonyms
  // or compound recovery — the masked tokens are simply removed from the
  // matching pipeline. See `phrase-blocklist.ts` for the full rationale
  // and the `maskBlockedTokens` contract.
  const maskedPromptTags = maskBlockedTokens(promptLower, promptTags);
  if (maskedPromptTags.length === 0) return [];
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
  const promptTagsWithBigrams = expandQueryBigrams(maskedPromptTags);
  const normalizedPromptTags = defaultNormalizer.normalizeTerms(promptTagsWithBigrams);

  return solutions
    .map(sol => {
      // R4-T1: solution-side compound-tag expansion. `api-key` becomes
      // {api-key, api, key} so a query token `api` (from "api keys") hits
      // it directly. Computed per solution because each sol.tags is
      // independent — caching across the rank loop is not worth the
      // bookkeeping for the corpus sizes Tenetx targets (N ≤ 200).
      const solTagsExpanded = expandCompoundTags(sol.tags);

      // R4-T2: pass `maskedPromptTags` (not the original `promptTags`) as
      // the first arg so the Jaccard union denominator inside
      // calculateRelevance reflects the post-mask tag set. The matching
      // step (intersection/partialMatches) already uses the masked set
      // via `normalizedPromptTags` — the union must match for score
      // semantics to stay consistent.
      const result = calculateRelevance(
        maskedPromptTags,
        sol.tags,
        sol.confidence,
        { normalizedPromptTags, solutionTagsExpanded: solTagsExpanded },
      ) as { relevance: number; matchedTags: string[] };

      // Compute identifier boost FIRST — independent of tag scoring so
      // R4-T3's tag-evidence precision rules below cannot silently drop
      // a candidate that has strong identifier-level evidence.
      let identifierBoost = 0;
      const matchedIdentifiers: string[] = [];
      for (const id of sol.identifiers ?? []) {
        if (id.length >= 4 && promptLower.includes(id.toLowerCase())) {
          identifierBoost += 0.15;
          matchedIdentifiers.push(id);
        }
      }

      // R4-T3: orchestration-layer specificity guards. Reject single-tag
      // matches that lack a corroborating signal (single-token query OR
      // all-via-expansion match). See `shouldRejectByR4T3Rules` for the
      // full rule rationale.
      //
      // Identifier evidence is the escape hatch: if the query literally
      // mentioned one of the solution's identifiers (e.g. a function or
      // file name), the R4-T3 tag-precision rules are bypassed because
      // the identifier hit is itself a strong-specificity signal. Only
      // the tag evidence is zeroed out when R4-T3 fires; the identifier
      // boost and matched identifiers are preserved, so a candidate with
      // a single weak tag match but a valid identifier still survives
      // the `matchedTags.length + matchedIdentifiers.length >= 1` filter.
      let tagRelevance = result.relevance;
      let tagMatches = result.matchedTags;
      if (matchedIdentifiers.length === 0
        && tagMatches.length > 0
        && shouldRejectByR4T3Rules(maskedPromptTags, tagMatches)) {
        tagRelevance = 0;
        tagMatches = [];
      }

      return {
        solution: sol,
        relevance: tagRelevance + identifierBoost,
        matchedTags: tagMatches,
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
 * History (chronological ascending — v1 at top, latest at bottom):
 *   - v1 (2026-04-08, fixture v1, 41+10+10 queries): 1.0 / 1.0 / 0.0 / 0.1
 *     Recorded against the original 61-query fixture, all positive queries
 *     PASS@1. Indicated a measurement plateau but masked the matcher's true
 *     ranking and false-positive weaknesses because the fixture queries were
 *     too tag-aligned.
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
 *   - v4 (2026-04-08, fixture v2 + R4-T1 + R4-T2 phrase blocklist):
 *     1.0 / 0.986 / 0.0 / 0.143
 *     R4-T2 added `phrase-blocklist.ts` with 17 curated 2-word English
 *     non-dev compounds ("performance review", "system architecture",
 *     "database backup", etc.) and a `maskBlockedTokens` step at the
 *     top of `rankCandidates` and `searchSolutions`. When a query
 *     contains a blocked phrase, the constituent tokens are removed
 *     from the prompt tag list before bigram expansion / canonical
 *     normalization runs — so the false-positive evidence is removed
 *     at the source rather than demoted in scoring.
 *
 *     `negativeAnyResultRate` dropped 0.357 → 0.143 (3 of 5 v2 trigger
 *     negatives fully blocked):
 *       * "performance review meeting notes" — blocked via
 *         `performance review` + `meeting notes`
 *       * "system architecture overview document" — blocked via
 *         `system architecture` + `overview document`
 *       * "solar system planets astronomy" — blocked via `solar system`
 *
 *     2 false positives remain (both deferred to R4-T3 query-side
 *     specificity classifier — the residuals share a common shape:
 *     a single dev-tag homograph survives whatever masking is applied,
 *     and the term-normalizer expansion still surfaces a false match):
 *
 *       * "database backup recovery procedure" → error-handling-patterns:
 *         `database backup` is blocked, but the residual tokens
 *         {`recovery`, `procedure`} survive. `recovery` is in the
 *         `handling` canonical's matchTerms (intentional, for legitimate
 *         "error recovery handler" queries), so the masked query still
 *         hits `starter-error-handling-patterns` via the handling
 *         family. A 3-word `recovery procedure` blocklist entry was
 *         considered and rejected — it would silently mask legitimate
 *         dev SRE queries like "disaster recovery procedure" or
 *         "rollback recovery procedure" without a fixture-driven
 *         signal. The right fix is at the query-specificity layer
 *         (R4-T3): require ≥ 2 distinct dev-context signals before any
 *         match is returned, not at the phrase-blocklist layer.
 *
 *       * "validation of insurance claims" → error-handling-patterns:
 *         `insurance claim` is blocked, but the residual `validation`
 *         token IS a legitimate dev tag (input-validation,
 *         error-handling-patterns both have it). Same R4-T3 target.
 *
 *     positive/paraphrase mrrAt5 are unchanged from v3 because no
 *     legitimate dev query in the fixture contains a blocked phrase.
 *
 *   - v5 (2026-04-08, fixture v2 + R4-T1 + R4-T2 + R4-T3 specificity guards):
 *     1.0 / 0.986 / 0.0 / 0.000
 *     R4-T3 added two narrow precision rules at the ORCHESTRATION LAYER —
 *     NOT inside `calculateRelevance` (which remains a pure scoring
 *     function for test symmetry). The rules are implemented as the
 *     exported helper `shouldRejectByR4T3Rules(promptTags, matchedTags)`
 *     and called from both `rankCandidates` (hook path) and
 *     `searchSolutions` (MCP path) right after the per-solution
 *     `calculateRelevance` call:
 *       (Rule A) single-token query AND single-tag match → reject;
 *       (Rule B) single-tag match with no literal hit in the prompt
 *                (verbatim match, or substring partial length > 3, or
 *                shared prefix ≥ 4 for morphological stems) → reject.
 *     Both rules are scoped narrowly enough to fix exactly the 2 R4-T2
 *     residuals without recall regression — every fixture positive and
 *     paraphrase still ranks identically:
 *       * "validation of insurance claims" → masked to `[validation]`
 *         (length 1) with single-tag match `validation` → Rule A reject.
 *       * "database backup recovery procedure" → masked to
 *         `[recovery, procedure]` with single-tag match `handling`
 *         (zero literal hit; `handling` is reached via the `recovery`
 *         canonical-family expansion in term-normalizer) → Rule B reject.
 *     `negativeAnyResultRate` is now 0.000 — every fixture v2 negative
 *     produces zero candidates. positive/paraphrase metrics unchanged
 *     from v4 because no fixture positive matches the (single-token AND
 *     single-tag) or (all-expansion AND single-tag) shape.
 *
 *     Escape hatch: identifier-boost evidence (hook path) or name-match
 *     evidence (MCP path) BYPASSES the R4-T3 rules. A candidate with
 *     even a single weak tag match plus an identifier hit still
 *     surfaces — the precision rules only fire when the candidate's
 *     entire evidence pool is a single ambiguous tag.
 *
 *     Defensive precision note: Rule B's "shared prefix ≥ 4"
 *     morphological check is currently NOT fixture-driven (no fixture
 *     query masks down to the `caching/cache`-style morphological gap).
 *     It exists as a pre-emptive fix against silently rejecting
 *     legitimate future queries where the term-normalizer synonym
 *     expansion is the only bridge between the query token and the
 *     solution tag. If a production query surfaces a case the prefix
 *     check misses, extend it (e.g. by lowering the threshold or
 *     adding a Levenshtein-1 check) rather than removing it.
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
  negativeAnyResultRate: 0.0,
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
