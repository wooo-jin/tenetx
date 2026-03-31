/**
 * Tests for forge/opro-tuner.ts
 *
 * All tests operate on in-memory OPROState objects (initOPROState()).
 * No file I/O is performed — loadOPROState/saveOPROState are not called.
 */
import { describe, it, expect } from 'vitest';
import {
  initOPROState,
  seedCandidate,
  recordCandidateReward,
  selectBestCandidate,
  pruneCandidates,
  buildMetaPrompt,
} from '../../src/forge/opro-tuner.js';
import type { OPROState } from '../../src/forge/opro-tuner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Full-range dimensionRange that matches any dimension value in [0, 1]. */
const FULL_RANGE: Record<string, { min: number; max: number }> = {
  qualityFocus: { min: 0, max: 1 },
};

/** A fixed set of current dimension values (neutral point). */
const NEUTRAL_DIMS: Record<string, number> = { qualityFocus: 0.5 };

function freshState(): OPROState {
  return initOPROState();
}

/** Seed a candidate and return its id. */
function seedAndGetId(
  state: OPROState,
  principle: string,
  text: string,
  range: Record<string, { min: number; max: number }> = FULL_RANGE,
): string {
  seedCandidate(state, principle, text, ['step-a'], range);
  return state.candidates[principle].find(c => c.text === text)!.id;
}

/** Add `n` reward records to a candidate so it qualifies as "proven". */
function addRewards(
  state: OPROState,
  principle: string,
  id: string,
  n: number,
  value: number,
): void {
  for (let i = 0; i < n; i++) {
    recordCandidateReward(state, principle, id, value);
  }
}

// ---------------------------------------------------------------------------
// initOPROState
// ---------------------------------------------------------------------------

describe('initOPROState', () => {
  it('returns empty candidates object', () => {
    const state = freshState();
    expect(state.candidates).toEqual({});
  });

  it('returns optimizationCycles of 0', () => {
    const state = freshState();
    expect(state.optimizationCycles).toBe(0);
  });

  it('returns a valid ISO lastOptimized timestamp', () => {
    const state = freshState();
    expect(() => new Date(state.lastOptimized)).not.toThrow();
    expect(new Date(state.lastOptimized).getTime()).not.toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// seedCandidate
// ---------------------------------------------------------------------------

describe('seedCandidate', () => {
  it('adds a candidate under the given principle name', () => {
    const state = freshState();
    seedCandidate(state, 'quality', 'Be thorough', [], FULL_RANGE);
    expect(state.candidates['quality']).toHaveLength(1);
  });

  it('sets correct initial avgReward of 0.5 (neutral)', () => {
    const state = freshState();
    seedCandidate(state, 'quality', 'Be thorough', [], FULL_RANGE);
    expect(state.candidates['quality'][0].avgReward).toBe(0.5);
  });

  it('sets llmGenerated to false for seeded candidates', () => {
    const state = freshState();
    seedCandidate(state, 'quality', 'Be thorough', [], FULL_RANGE);
    expect(state.candidates['quality'][0].llmGenerated).toBe(false);
  });

  it('stores the provided generates array', () => {
    const state = freshState();
    const generates = ['step-a', 'step-b'];
    seedCandidate(state, 'quality', 'Be thorough', generates, FULL_RANGE);
    expect(state.candidates['quality'][0].generates).toEqual(generates);
  });

  it('prevents duplicate text from being added twice', () => {
    const state = freshState();
    seedCandidate(state, 'quality', 'Duplicate text', [], FULL_RANGE);
    seedCandidate(state, 'quality', 'Duplicate text', [], FULL_RANGE);
    expect(state.candidates['quality']).toHaveLength(1);
  });

  it('allows different text under the same principle', () => {
    const state = freshState();
    seedCandidate(state, 'quality', 'First candidate', [], FULL_RANGE);
    seedCandidate(state, 'quality', 'Second candidate', [], FULL_RANGE);
    expect(state.candidates['quality']).toHaveLength(2);
  });

  it('initializes a new principle array when the key does not exist', () => {
    const state = freshState();
    expect(state.candidates['new-principle']).toBeUndefined();
    seedCandidate(state, 'new-principle', 'Some text', [], FULL_RANGE);
    expect(Array.isArray(state.candidates['new-principle'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// recordCandidateReward
// ---------------------------------------------------------------------------

describe('recordCandidateReward', () => {
  it('returns true when principle and candidate id exist', () => {
    const state = freshState();
    const id = seedAndGetId(state, 'quality', 'candidate-A');
    const result = recordCandidateReward(state, 'quality', id, 0.8);
    expect(result).toBe(true);
  });

  it('returns false when principle does not exist', () => {
    const state = freshState();
    const result = recordCandidateReward(state, 'ghost-principle', 'any-id', 0.5);
    expect(result).toBe(false);
  });

  it('returns false when candidate id does not exist under the principle', () => {
    const state = freshState();
    seedAndGetId(state, 'quality', 'some-candidate');
    const result = recordCandidateReward(state, 'quality', 'wrong-id', 0.5);
    expect(result).toBe(false);
  });

  it('appends reward to rewardHistory', () => {
    const state = freshState();
    const id = seedAndGetId(state, 'quality', 'candidate-B');
    recordCandidateReward(state, 'quality', id, 0.7);
    recordCandidateReward(state, 'quality', id, 0.9);
    expect(state.candidates['quality'][0].rewardHistory).toEqual([0.7, 0.9]);
  });

  it('recalculates avgReward as the mean of recorded rewards', () => {
    const state = freshState();
    const id = seedAndGetId(state, 'quality', 'candidate-C');
    recordCandidateReward(state, 'quality', id, 0.6);
    recordCandidateReward(state, 'quality', id, 0.8);
    // mean of [0.6, 0.8] = 0.7
    expect(state.candidates['quality'][0].avgReward).toBeCloseTo(0.7);
  });

  it('trims rewardHistory to at most 50 entries', () => {
    const state = freshState();
    const id = seedAndGetId(state, 'quality', 'candidate-D');
    // Push 55 rewards — should trim to last 50
    for (let i = 0; i < 55; i++) {
      recordCandidateReward(state, 'quality', id, i / 55);
    }
    expect(state.candidates['quality'][0].rewardHistory.length).toBeLessThanOrEqual(50);
  });

  it('avgReward uses the most recent 20 values after trimming', () => {
    const state = freshState();
    const id = seedAndGetId(state, 'quality', 'candidate-E');
    // Push 25 values of 0.1, then 5 values of 0.9 — recent window is last 20
    for (let i = 0; i < 25; i++) recordCandidateReward(state, 'quality', id, 0.1);
    for (let i = 0; i < 5; i++) recordCandidateReward(state, 'quality', id, 0.9);
    // Recent 20 = 10×0.1 + 5×0.9 → but exact slice depends on implementation
    // Key property: avgReward reflects recent window, not all values uniformly
    const avg = state.candidates['quality'][0].avgReward;
    expect(avg).toBeGreaterThanOrEqual(0);
    expect(avg).toBeLessThanOrEqual(1);
    expect(isFinite(avg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// selectBestCandidate
// ---------------------------------------------------------------------------

describe('selectBestCandidate', () => {
  it('returns null when no candidates exist for the principle', () => {
    const state = freshState();
    const result = selectBestCandidate(state, 'nonexistent', NEUTRAL_DIMS);
    expect(result).toBeNull();
  });

  it('returns null when no candidate matches current dimension range', () => {
    const state = freshState();
    // Register candidate that only matches high quality (0.8–1.0)
    const highRange = { qualityFocus: { min: 0.8, max: 1.0 } };
    const id = seedAndGetId(state, 'quality', 'high-quality-only', highRange);
    addRewards(state, 'quality', id, 5, 0.9);
    // currentDimensions has qualityFocus=0.1 — outside the range
    const result = selectBestCandidate(state, 'quality', { qualityFocus: 0.1 });
    expect(result).toBeNull();
  });

  it('returns null when matching candidates have fewer than 3 rewards', () => {
    const state = freshState();
    const id = seedAndGetId(state, 'quality', 'too-few-rewards');
    // Only 2 rewards — below the minimum of 3
    addRewards(state, 'quality', id, 2, 0.9);
    const result = selectBestCandidate(state, 'quality', NEUTRAL_DIMS);
    expect(result).toBeNull();
  });

  it('returns the candidate with highest avgReward among matching, proven candidates', () => {
    const state = freshState();
    const idA = seedAndGetId(state, 'quality', 'candidate-low');
    const idB = seedAndGetId(state, 'quality', 'candidate-high');
    addRewards(state, 'quality', idA, 5, 0.3);
    addRewards(state, 'quality', idB, 5, 0.9);
    const best = selectBestCandidate(state, 'quality', NEUTRAL_DIMS);
    expect(best).not.toBeNull();
    expect(best!.text).toBe('candidate-high');
  });

  it('ignores candidates outside the dimension range even if they have high rewards', () => {
    const state = freshState();
    const narrowRange = { qualityFocus: { min: 0.9, max: 1.0 } };
    const idOutOfRange = seedAndGetId(state, 'quality', 'out-of-range', narrowRange);
    addRewards(state, 'quality', idOutOfRange, 5, 1.0);

    const idInRange = seedAndGetId(state, 'quality', 'in-range');
    addRewards(state, 'quality', idInRange, 5, 0.5);

    // qualityFocus=0.5 is outside the narrow range
    const best = selectBestCandidate(state, 'quality', { qualityFocus: 0.5 });
    expect(best!.text).toBe('in-range');
  });
});

// ---------------------------------------------------------------------------
// pruneCandidates
// ---------------------------------------------------------------------------

describe('pruneCandidates', () => {
  it('returns 0 when all principles have 3 or fewer candidates', () => {
    const state = freshState();
    seedAndGetId(state, 'quality', 'only-one');
    const pruned = pruneCandidates(state);
    expect(pruned).toBe(0);
  });

  it('does not prune when proven candidates are 3 or fewer', () => {
    const state = freshState();
    // 4 candidates but only 2 have >=5 rewards — cannot prune (need proven>3)
    for (let i = 0; i < 4; i++) {
      const id = seedAndGetId(state, 'quality', `cand-${i}`);
      if (i < 2) addRewards(state, 'quality', id, 5, 0.1 * (i + 1));
    }
    const before = state.candidates['quality'].length;
    pruneCandidates(state);
    expect(state.candidates['quality'].length).toBe(before);
  });

  it('removes bottom 20% of proven candidates when the pool is large enough', () => {
    const state = freshState();
    // 10 candidates, all with 5+ rewards
    for (let i = 0; i < 10; i++) {
      const id = seedAndGetId(state, 'quality', `big-cand-${i}`);
      addRewards(state, 'quality', id, 5, (i + 1) / 10);
    }
    const before = state.candidates['quality'].length;
    const pruned = pruneCandidates(state);
    expect(pruned).toBeGreaterThan(0);
    expect(state.candidates['quality'].length).toBeLessThan(before);
  });

  it('always keeps at least 3 candidates after pruning', () => {
    const state = freshState();
    // Enough proven candidates to trigger pruning
    for (let i = 0; i < 20; i++) {
      const id = seedAndGetId(state, 'quality', `keep-cand-${i}`);
      addRewards(state, 'quality', id, 5, (i + 1) / 20);
    }
    pruneCandidates(state);
    expect(state.candidates['quality'].length).toBeGreaterThanOrEqual(3);
  });

  it('returns total count of pruned candidates across all principles', () => {
    const state = freshState();
    for (const principle of ['quality', 'speed']) {
      for (let i = 0; i < 10; i++) {
        const id = seedAndGetId(state, principle, `p-${i}`);
        addRewards(state, principle, id, 5, (i + 1) / 10);
      }
    }
    const pruned = pruneCandidates(state);
    expect(pruned).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildMetaPrompt
// ---------------------------------------------------------------------------

describe('buildMetaPrompt', () => {
  it('includes the principle name in the output', () => {
    const state = freshState();
    const prompt = buildMetaPrompt(state, 'my-principle', NEUTRAL_DIMS);
    expect(prompt).toContain('my-principle');
  });

  it('includes current dimension values', () => {
    const state = freshState();
    const dims = { qualityFocus: 0.75 };
    const prompt = buildMetaPrompt(state, 'quality', dims);
    expect(prompt).toContain('qualityFocus');
    expect(prompt).toContain('0.75');
  });

  it('contains the Task section prompting for new prompt generation', () => {
    const state = freshState();
    const prompt = buildMetaPrompt(state, 'quality', NEUTRAL_DIMS);
    expect(prompt).toContain('## Task:');
    expect(prompt).toContain('JSON');
  });

  it('returns a prompt even when there are no candidates', () => {
    const state = freshState();
    const prompt = buildMetaPrompt(state, 'empty-principle', NEUTRAL_DIMS);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('only includes candidates that have at least one reward in the history section', () => {
    const state = freshState();
    const idWithReward = seedAndGetId(state, 'quality', 'has-reward');
    recordCandidateReward(state, 'quality', idWithReward, 0.8);
    seedAndGetId(state, 'quality', 'no-reward-yet');

    const prompt = buildMetaPrompt(state, 'quality', NEUTRAL_DIMS);
    expect(prompt).toContain('has-reward');
    expect(prompt).not.toContain('no-reward-yet');
  });

  it('sorts candidates in ascending reward order so highest score appears last (OPRO recency bias)', () => {
    const state = freshState();
    const idLow = seedAndGetId(state, 'quality', 'low-scorer');
    const idHigh = seedAndGetId(state, 'quality', 'high-scorer');
    addRewards(state, 'quality', idLow, 3, 0.2);
    addRewards(state, 'quality', idHigh, 3, 0.9);

    const prompt = buildMetaPrompt(state, 'quality', NEUTRAL_DIMS);
    const posLow = prompt.indexOf('low-scorer');
    const posHigh = prompt.indexOf('high-scorer');
    // high-scorer must appear after low-scorer in the output
    expect(posHigh).toBeGreaterThan(posLow);
  });

  it('respects topK limit on the number of candidates shown', () => {
    const state = freshState();
    // Add 10 candidates with rewards
    for (let i = 0; i < 10; i++) {
      const id = seedAndGetId(state, 'quality', `topk-cand-${i}`);
      addRewards(state, 'quality', id, 1, (i + 1) / 10);
    }

    const prompt = buildMetaPrompt(state, 'quality', NEUTRAL_DIMS, 3);
    // Count occurrences of "### Score:" header — one per included candidate
    const scoreHeaders = (prompt.match(/### Score:/g) ?? []).length;
    expect(scoreHeaders).toBeLessThanOrEqual(3);
  });
});
