import { describe, it, expect } from 'vitest';
import fixture from './fixtures/solution-match-bootstrap.json' with { type: 'json' };
import {
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
  it('meets absolute floor thresholds', () => {
    expect(result.recallAt5).toBeGreaterThanOrEqual(0.8);
    expect(result.mrrAt5).toBeGreaterThanOrEqual(0.6);
    expect(result.noResultRate).toBeLessThanOrEqual(0.15);
    expect(result.negativeAnyResultRate).toBeLessThanOrEqual(0.2);
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
  it('fixture shape is valid (positive ≥ 40, paraphrase ≥ 10, negative ≥ 10)', () => {
    const fx = fixture as EvalFixture;
    expect(fx.solutions.length).toBeGreaterThanOrEqual(15);
    expect(fx.positive.length).toBeGreaterThanOrEqual(40);
    expect(fx.paraphrase.length).toBeGreaterThanOrEqual(10);
    expect(fx.negative.length).toBeGreaterThanOrEqual(10);
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
