import { describe, it, expect } from 'vitest';
import { generateTunedPrinciples } from '../../src/forge/philosophy-tuner.js';
import { defaultDimensionVector } from '../../src/forge/dimensions.js';
import type { DimensionVector } from '../../src/forge/types.js';

function makeVector(overrides: Partial<Record<string, number>> = {}): DimensionVector {
  return { ...defaultDimensionVector(), ...overrides } as DimensionVector;
}

describe('generateTunedPrinciples', () => {
  // ── Structure ──────────────────────────────────────

  it('returns an object with string keys and TunedPrinciple values', () => {
    const result = generateTunedPrinciples(defaultDimensionVector());
    expect(typeof result).toBe('object');
    for (const [key, principle] of Object.entries(result)) {
      expect(typeof key).toBe('string');
      expect(typeof principle.belief).toBe('string');
      expect(Array.isArray(principle.generates)).toBe(true);
      expect(typeof principle.intensity).toBe('number');
    }
  });

  it('always includes incremental-shipping principle', () => {
    const result = generateTunedPrinciples(defaultDimensionVector());
    expect(result['incremental-shipping']).toBeDefined();
    expect(result['incremental-shipping'].belief).toBe('Ship small, ship often');
    expect(result['incremental-shipping'].intensity).toBe(0.5);
  });

  it('returns only incremental-shipping for fully neutral vector', () => {
    const result = generateTunedPrinciples(defaultDimensionVector());
    // All dimensions at 0.5 -> deviation < 0.1 for all -> only incremental-shipping
    expect(Object.keys(result)).toEqual(['incremental-shipping']);
  });

  // ── Risk Tolerance ─────────────────────────────────

  it('generates defensive-development for low risk tolerance', () => {
    const result = generateTunedPrinciples(makeVector({ riskTolerance: 0.2 }));
    expect(result['defensive-development']).toBeDefined();
    expect(result['defensive-development'].belief).toContain('risk');
  });

  it('generates move-fast for high risk tolerance', () => {
    const result = generateTunedPrinciples(makeVector({ riskTolerance: 0.8 }));
    expect(result['move-fast']).toBeDefined();
    expect(result['move-fast'].belief).toContain('Speed');
  });

  it('defensive-development intensity increases with deviation from neutral', () => {
    const moderate = generateTunedPrinciples(makeVector({ riskTolerance: 0.35 }));
    const extreme = generateTunedPrinciples(makeVector({ riskTolerance: 0.1 }));
    expect(extreme['defensive-development'].intensity)
      .toBeGreaterThan(moderate['defensive-development'].intensity);
  });

  it('defensive-development has different belief text at different risk levels', () => {
    const veryLow = generateTunedPrinciples(makeVector({ riskTolerance: 0.1 }));
    const moderate = generateTunedPrinciples(makeVector({ riskTolerance: 0.35 }));
    expect(veryLow['defensive-development'].belief)
      .not.toBe(moderate['defensive-development'].belief);
  });

  // ── Quality Focus ──────────────────────────────────

  it('generates thorough-quality for high quality focus', () => {
    const result = generateTunedPrinciples(makeVector({ qualityFocus: 0.8 }));
    expect(result['thorough-quality']).toBeDefined();
    expect(result['thorough-quality'].generates.length).toBeGreaterThan(0);
  });

  it('generates pragmatic-speed for low quality focus', () => {
    const result = generateTunedPrinciples(makeVector({ qualityFocus: 0.2 }));
    expect(result['pragmatic-speed']).toBeDefined();
  });

  it('thorough-quality includes hook reference in generates', () => {
    const result = generateTunedPrinciples(makeVector({ qualityFocus: 0.8 }));
    const generates = result['thorough-quality'].generates;
    const hasHook = generates.some(
      g => typeof g === 'object' && g !== null && 'hook' in g,
    );
    expect(hasHook).toBe(true);
  });

  it('thorough-quality has higher coverage threshold for higher quality', () => {
    const medium = generateTunedPrinciples(makeVector({ qualityFocus: 0.65 }));
    const high = generateTunedPrinciples(makeVector({ qualityFocus: 0.9 }));
    // Extract threshold from hook generate
    const findThreshold = (principle: typeof medium['thorough-quality']) => {
      for (const g of principle.generates) {
        if (typeof g === 'object' && g !== null && 'threshold' in g) {
          return (g as { threshold: number }).threshold;
        }
      }
      return 0;
    };
    expect(findThreshold(high['thorough-quality'])).toBeGreaterThan(
      findThreshold(medium['thorough-quality']),
    );
  });

  // ── Autonomy Preference ────────────────────────────

  it('generates supervised-execution for low autonomy', () => {
    const result = generateTunedPrinciples(makeVector({ autonomyPreference: 0.2 }));
    expect(result['supervised-execution']).toBeDefined();
    expect(result['supervised-execution'].belief).toContain('human');
  });

  it('generates autonomous-execution for high autonomy', () => {
    const result = generateTunedPrinciples(makeVector({ autonomyPreference: 0.8 }));
    expect(result['autonomous-execution']).toBeDefined();
  });

  it('autonomous-execution belief differs at extreme vs moderate levels', () => {
    const moderate = generateTunedPrinciples(makeVector({ autonomyPreference: 0.65 }));
    const extreme = generateTunedPrinciples(makeVector({ autonomyPreference: 0.9 }));
    expect(extreme['autonomous-execution'].belief)
      .not.toBe(moderate['autonomous-execution'].belief);
  });

  // ── Abstraction Level ──────────────────────────────

  it('generates design-first for high abstraction', () => {
    const result = generateTunedPrinciples(makeVector({ abstractionLevel: 0.8 }));
    expect(result['design-first']).toBeDefined();
    expect(result['design-first'].belief).toContain('architecture');
  });

  it('generates pragmatic-implementation for low abstraction', () => {
    const result = generateTunedPrinciples(makeVector({ abstractionLevel: 0.2 }));
    expect(result['pragmatic-implementation']).toBeDefined();
  });

  // ── Communication Style ────────────────────────────

  it('generates concise-communication for high communication style', () => {
    const result = generateTunedPrinciples(makeVector({ communicationStyle: 0.8 }));
    expect(result['concise-communication']).toBeDefined();
  });

  it('generates detailed-communication for low communication style', () => {
    const result = generateTunedPrinciples(makeVector({ communicationStyle: 0.2 }));
    expect(result['detailed-communication']).toBeDefined();
  });

  // ── Cross-Dimension: fortress-mode ─────────────────

  it('generates fortress-mode when high quality + low risk', () => {
    const result = generateTunedPrinciples(makeVector({
      qualityFocus: 0.8,
      riskTolerance: 0.2,
    }));
    expect(result['fortress-mode']).toBeDefined();
    expect(result['fortress-mode'].belief).toContain('Correctness');
  });

  it('fortress-mode generates include opus routing', () => {
    const result = generateTunedPrinciples(makeVector({
      qualityFocus: 0.9,
      riskTolerance: 0.1,
    }));
    const generates = result['fortress-mode'].generates;
    const hasOpusRouting = generates.some(
      g => typeof g === 'object' && g !== null && 'routing' in g && String((g as { routing: string }).routing).includes('opus'),
    );
    expect(hasOpusRouting).toBe(true);
  });

  // ── Cross-Dimension: blitz-mode ────────────────────

  it('generates blitz-mode when low quality + high risk + high autonomy', () => {
    const result = generateTunedPrinciples(makeVector({
      qualityFocus: 0.2,
      riskTolerance: 0.8,
      autonomyPreference: 0.8,
    }));
    expect(result['blitz-mode']).toBeDefined();
    expect(result['blitz-mode'].belief).toContain('Ship first');
  });

  it('does not generate blitz-mode when autonomy is low', () => {
    const result = generateTunedPrinciples(makeVector({
      qualityFocus: 0.2,
      riskTolerance: 0.8,
      autonomyPreference: 0.3,
    }));
    expect(result['blitz-mode']).toBeUndefined();
  });

  // ── Multiple Principles ────────────────────────────

  it('generates multiple principles when multiple dimensions deviate', () => {
    const result = generateTunedPrinciples(makeVector({
      riskTolerance: 0.1,
      qualityFocus: 0.9,
      autonomyPreference: 0.8,
      abstractionLevel: 0.8,
      communicationStyle: 0.8,
    }));
    // Should have: fortress-mode (cross), autonomous-execution, design-first,
    // concise-communication, incremental-shipping (always)
    expect(Object.keys(result).length).toBeGreaterThanOrEqual(4);
  });

  it('all intensity values are between 0 and 1', () => {
    const extremes = [
      makeVector({ riskTolerance: 0.0 }),
      makeVector({ qualityFocus: 1.0 }),
      makeVector({ autonomyPreference: 0.0 }),
      makeVector({ communicationStyle: 1.0 }),
    ];
    for (const dims of extremes) {
      const result = generateTunedPrinciples(dims);
      for (const principle of Object.values(result)) {
        expect(principle.intensity).toBeGreaterThanOrEqual(0);
        expect(principle.intensity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('generates array entries are non-empty', () => {
    const result = generateTunedPrinciples(makeVector({ qualityFocus: 0.9 }));
    for (const principle of Object.values(result)) {
      expect(principle.generates.length).toBeGreaterThan(0);
      for (const g of principle.generates) {
        if (typeof g === 'string') {
          expect(g.length).toBeGreaterThan(0);
        } else {
          expect(Object.keys(g).length).toBeGreaterThan(0);
        }
      }
    }
  });
});
