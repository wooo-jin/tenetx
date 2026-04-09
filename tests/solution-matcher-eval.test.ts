import { describe, it, expect } from 'vitest';
import fixture from './fixtures/solution-match-bootstrap.json' with { type: 'json' };
import {
  evaluateQuery,
  evaluateSolutionMatcher,
  ROUND3_BASELINE,
  BASELINE_TOLERANCE,
  type EvalFixture,
} from '../src/engine/solution-matcher.js';

describe('solution matcher bootstrap eval', () => {
  const result = evaluateSolutionMatcher(fixture as EvalFixture);

  // ── Absolute floor thresholds ──
  // These are the plan's conservative floors. Any PR that drops below them
  // is catastrophic — assert them first so a regression fails with the most
  // obvious message.
  //
  // negativeAnyResultRate floor history:
  //   v2 fixture (2026-04-08): 0.45 — loose because v2 added tricky negatives
  //     and the matcher had no IDF down-weighting (baseline 0.357, floor +0.092)
  //   R4-T2 phrase blocklist (2026-04-08): 0.20 — tightened after the
  //     blocklist dropped baseline to 0.143, floor at +0.057 headroom
  //   R4-T3 specificity guards (2026-04-08): 0.10 — every fixture v2
  //     negative now produces zero candidates (baseline 0.000, floor at
  //     +0.10 catastrophic-only safety). The two narrow rules (single-
  //     token query + single-tag match → reject; all-expansion + single-
  //     tag → reject) close the residual gap from R4-T2.
  it('meets absolute floor thresholds', () => {
    expect(result.recallAt5).toBeGreaterThanOrEqual(0.8);
    expect(result.mrrAt5).toBeGreaterThanOrEqual(0.6);
    expect(result.noResultRate).toBeLessThanOrEqual(0.15);
    expect(result.negativeAnyResultRate).toBeLessThanOrEqual(0.10);
  });

  // ── Baseline-relative regression guard ──
  // Absolute floors are generous (0.8 when baseline is 1.0). This catches
  // smaller regressions: a 5% drop in recallAt5 means ~3 queries broke.
  // When a PR legitimately improves a metric, update ROUND3_BASELINE in the
  // same commit so future PRs guard against the new floor.
  it('does not regress ≥ 5% vs ROUND3_BASELINE', () => {
    expect(result.recallAt5).toBeGreaterThanOrEqual(ROUND3_BASELINE.recallAt5 - BASELINE_TOLERANCE);
    expect(result.mrrAt5).toBeGreaterThanOrEqual(ROUND3_BASELINE.mrrAt5 - BASELINE_TOLERANCE);
    expect(result.noResultRate).toBeLessThanOrEqual(ROUND3_BASELINE.noResultRate + BASELINE_TOLERANCE);
    expect(result.negativeAnyResultRate).toBeLessThanOrEqual(ROUND3_BASELINE.negativeAnyResultRate + BASELINE_TOLERANCE);
  });

  // ── Per-bucket regression guard ──
  // Aggregating positive + paraphrase hides paraphrase-only regressions: if
  // T2 breaks all 10 paraphrase queries but positive stays perfect, aggregate
  // recall is still 41/51 = 0.80 — right on the floor. Assert each bucket
  // separately so a paraphrase-only break fails loudly.
  it('paraphrase bucket does not regress ≥ 5% vs baseline', () => {
    expect(result.byBucket.paraphrase.recallAt5).toBeGreaterThanOrEqual(
      ROUND3_BASELINE.byBucket.paraphrase.recallAt5 - BASELINE_TOLERANCE,
    );
    expect(result.byBucket.paraphrase.mrrAt5).toBeGreaterThanOrEqual(
      ROUND3_BASELINE.byBucket.paraphrase.mrrAt5 - BASELINE_TOLERANCE,
    );
    expect(result.byBucket.paraphrase.noResultRate).toBeLessThanOrEqual(
      ROUND3_BASELINE.byBucket.paraphrase.noResultRate + BASELINE_TOLERANCE,
    );
  });

  it('positive bucket does not regress ≥ 5% vs baseline', () => {
    expect(result.byBucket.positive.recallAt5).toBeGreaterThanOrEqual(
      ROUND3_BASELINE.byBucket.positive.recallAt5 - BASELINE_TOLERANCE,
    );
    expect(result.byBucket.positive.mrrAt5).toBeGreaterThanOrEqual(
      ROUND3_BASELINE.byBucket.positive.mrrAt5 - BASELINE_TOLERANCE,
    );
    expect(result.byBucket.positive.noResultRate).toBeLessThanOrEqual(
      ROUND3_BASELINE.byBucket.positive.noResultRate + BASELINE_TOLERANCE,
    );
  });

  // ── Fixture shape sanity ──
  it('fixture shape is valid (positive ≥ 50, paraphrase ≥ 14, negative ≥ 12)', () => {
    // v2 fixture (2026-04-08) bumped positive 41→53, paraphrase 10→16,
    // negative 10→14. Hard floors raised so an accidental fixture
    // truncation fails loudly even before the sync guard catches it.
    const fx = fixture as EvalFixture;
    expect(fx.solutions.length).toBeGreaterThanOrEqual(15);
    expect(fx.positive.length).toBeGreaterThanOrEqual(50);
    expect(fx.paraphrase.length).toBeGreaterThanOrEqual(14);
    expect(fx.negative.length).toBeGreaterThanOrEqual(12);
    // Every expected solution must exist in fixture.solutions
    const names = new Set(fx.solutions.map(s => s.name));
    for (const q of [...fx.positive, ...fx.paraphrase]) {
      for (const expectedName of q.expectAnyOf) {
        expect(names.has(expectedName)).toBe(true);
      }
    }
  });

  it('reports totals matching fixture counts', () => {
    const fx = fixture as EvalFixture;
    expect(result.total.positive).toBe(fx.positive.length);
    expect(result.total.paraphrase).toBe(fx.paraphrase.length);
    expect(result.total.negative).toBe(fx.negative.length);
    expect(result.byBucket.positive.total).toBe(fx.positive.length);
    expect(result.byBucket.paraphrase.total).toBe(fx.paraphrase.length);
  });

  // Mechanical guard: if someone edits the fixture without updating
  // ROUND3_BASELINE, the relative-regression tests above would silently
  // compare against wrong totals. This asserts the baseline's total fields
  // track the fixture so any drift fails loudly.
  it('ROUND3_BASELINE totals are in sync with fixture counts', () => {
    const fx = fixture as EvalFixture;
    expect(ROUND3_BASELINE.byBucket.positive.total).toBe(fx.positive.length);
    expect(ROUND3_BASELINE.byBucket.paraphrase.total).toBe(fx.paraphrase.length);
    expect(ROUND3_BASELINE.total.positive).toBe(fx.positive.length);
    expect(ROUND3_BASELINE.total.paraphrase).toBe(fx.paraphrase.length);
    expect(ROUND3_BASELINE.total.negative).toBe(fx.negative.length);
  });

  // ── R4-T1: per-query regression guard for compound-tag hard positives ──
  //
  // Two of the v2 fixture's hard positives flipped from rank 2-3 to rank 1
  // when R4-T1 (compound-tag tokenizer fix) shipped. The aggregate mrrAt5
  // floor (0.969 - 0.05 = 0.919) is too lax to catch a silent flip back —
  // a future change to term-normalizer or stopwords could regress these
  // two queries while the aggregate still passes. Assert each one
  // explicitly so the regression fails loudly with the offending query
  // name in the message.
  //
  // The third hard positive (`writing unit tests for a function with side
  // effects`) is INTENTIONALLY NOT asserted at @1 here — R4-T1 cannot
  // resolve it (the win is decided by Jaccard union size, not compound
  // tags), and it remains a Round 4 R4-T2/R4-T3 target. The fourth
  // (`avoiding hardcoded credentials in source code`) is the same: query-
  // side English semantics, not compound tokenization.
  it('R4-T1: compound-tag hard positives reach rank 1', () => {
    const fx = fixture as EvalFixture;
    const hardPositives: Array<{ query: string; expected: string }> = [
      { query: 'managing api keys and credentials safely', expected: 'starter-secret-management' },
      { query: 'red green refactor cycle for new features', expected: 'starter-tdd-red-green-refactor' },
    ];
    for (const { query, expected } of hardPositives) {
      const ranked = evaluateQuery(query, fx.solutions);
      expect(
        ranked[0]?.name,
        `R4-T1 regression: expected '${expected}' @1 for query "${query}", got '${ranked[0]?.name ?? '<no result>'}' (full top-5: ${ranked.map(r => r.name).join(', ')})`,
      ).toBe(expected);
    }
  });

  // ── R4-T2: per-query regression guard for phrase-blocked negatives ──
  //
  // Four of the five v2 trigger negatives are blocked by R4-T2's phrase
  // blocklist via specific 2-word English compounds. Aggregate
  // negativeAnyResultRate (currently 0.071 floor) catches "blocklist
  // entirely deleted" but doesn't catch "one specific phrase quietly
  // removed". Each blocked query asserts an empty result list explicitly
  // so a future blocklist edit fails loudly with the offending phrase.
  //
  // The fifth negative (`validation of insurance claims`) is intentionally
  // NOT in this list — it's the R4-T3 target. Adding it here would create
  // a test that R4-T3 must change rather than augment.
  it('R4-T2: phrase-blocked negatives produce zero candidates', () => {
    const fx = fixture as EvalFixture;
    // Only the 3 negatives whose ENTIRE prompt-tag set is masked by the
    // blocklist appear here. `database backup recovery procedure` is
    // intentionally excluded — `database backup` masks the database/backup
    // tokens, but the residual `recovery procedure` survives via the
    // term-normalizer's `recovery → handling` expansion (legitimate for
    // "error recovery handler" queries). It's an R4-T3 target, not a
    // phrase-blocking case.
    const blockedNegatives = [
      'performance review meeting notes',
      'system architecture overview document',
      'solar system planets astronomy',
    ];
    for (const query of blockedNegatives) {
      const ranked = evaluateQuery(query, fx.solutions);
      expect(
        ranked.length,
        `R4-T2 regression: phrase-blocked query "${query}" should return zero candidates, got ${ranked.length} (top: ${ranked.slice(0, 3).map(r => r.name).join(', ')})`,
      ).toBe(0);
    }
  });

  // ── R4-T3: per-query regression guards for the two specificity rules ──
  //
  // The two rules are narrow precision filters applied at the orchestration
  // layer (rankCandidates / searchSolutions) via shouldRejectByR4T3Rules.
  // Aggregate negativeAnyResultRate floor (currently 0.10) catches "all
  // rules deleted", but doesn't catch "one rule quietly removed" — each
  // rule fixes exactly one residual, so they need individual asserts.
  it('R4-T3 Rule A (single-token query + single-tag match): validation of insurance claims rejected', () => {
    const fx = fixture as EvalFixture;
    const ranked = evaluateQuery('validation of insurance claims', fx.solutions);
    expect(
      ranked.length,
      `R4-T3 Rule A regression: query masks to [validation], single-tag match should be rejected. Got ${ranked.length} (top: ${ranked.slice(0, 3).map(r => r.name).join(', ')})`,
    ).toBe(0);
  });

  it('R4-T3 Rule B (all-expansion + single-tag match): database backup recovery procedure rejected', () => {
    const fx = fixture as EvalFixture;
    const ranked = evaluateQuery('database backup recovery procedure', fx.solutions);
    expect(
      ranked.length,
      `R4-T3 Rule B regression: query masks to [recovery, procedure], "handling" matches via expansion only (recovery → handling family), single-tag match should be rejected. Got ${ranked.length} (top: ${ranked.slice(0, 3).map(r => r.name).join(', ')})`,
    ).toBe(0);
  });

  // ── R4-T2 mixed-query safety guard ──
  // The phrase blocklist is supposed to mask only the *constituent
  // tokens* of the blocked phrase, leaving other dev tokens intact. A
  // query like "performance review of caching strategy" must still
  // surface the caching solution because `caching` and `strategy`
  // survive the mask. Without this assertion, a future change that
  // accidentally masks the entire query would still pass the
  // R4-T2-blocked-negatives test (because that test only checks the
  // blocked queries) and pass aggregate metrics (because the mixed
  // case isn't in the fixture). Lock it in here.
  it('R4-T2: mixed query (blocked phrase + dev signal) still surfaces dev solution', () => {
    const fx = fixture as EvalFixture;
    const ranked = evaluateQuery('performance review of caching strategy', fx.solutions);
    expect(
      ranked.length,
      'R4-T2 regression: mixed query should still produce results — caching/strategy tokens survive the mask',
    ).toBeGreaterThan(0);
    expect(
      ranked[0]?.name,
      `R4-T2 regression: expected starter-caching-strategy at @1, got '${ranked[0]?.name ?? '<no result>'}' (top-5: ${ranked.map(r => r.name).join(', ')})`,
    ).toBe('starter-caching-strategy');
  });

  // ── Confidence multiplier sensitivity (LOW #3 coverage) ──
  // The main fixture holds confidence constant at 0.7 for all starter
  // solutions, so a regression that broke the `tagScore * confidence`
  // multiplier would not surface in the top-level metrics. This tiny
  // synthetic fixture exercises the multiplier directly: two solutions with
  // identical tags but different confidences — the higher-confidence one
  // must rank first.
  it('confidence multiplier changes ranking order', () => {
    const synthetic: EvalFixture = {
      solutions: [
        { name: 'low-confidence', tags: ['alpha', 'beta', 'gamma'], identifiers: [], confidence: 0.3 },
        { name: 'high-confidence', tags: ['alpha', 'beta', 'gamma'], identifiers: [], confidence: 0.9 },
      ],
      positive: [{ query: 'alpha beta gamma synthetic', expectAnyOf: ['high-confidence'] }],
      paraphrase: [],
      negative: [],
    };
    const r = evaluateSolutionMatcher(synthetic);
    // expectAnyOf says only 'high-confidence' counts, so recall==1 means
    // 'high-confidence' is ranked at some position; mrr==1 means position #1.
    expect(r.byBucket.positive.recallAt5).toBe(1);
    expect(r.byBucket.positive.mrrAt5).toBe(1);
  });
});
