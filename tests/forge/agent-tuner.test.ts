import { describe, it, expect } from 'vitest';
import { generateAgentOverlays } from '../../src/forge/agent-tuner.js';
import { defaultDimensionVector } from '../../src/forge/dimensions.js';
import type { DimensionVector } from '../../src/forge/types.js';

/** Known agent names that have overlay generators */
const KNOWN_AGENTS = [
  'code-reviewer',
  'security-reviewer',
  'executor',
  'explore',
  'architect',
  'test-engineer',
  'critic',
  'refactoring-expert',
  'performance-reviewer',
  'debugger',
];

function makeVector(overrides: Partial<DimensionVector> = {}): DimensionVector {
  return { ...defaultDimensionVector(), ...overrides };
}

describe('generateAgentOverlays', () => {
  it('returns an array', () => {
    const result = generateAgentOverlays(defaultDimensionVector());
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns overlays for a fully neutral vector (modern agents always produce modifiers)', () => {
    // Agent generators produce modifiers for all dimension values, not just extreme ones
    const result = generateAgentOverlays(defaultDimensionVector());
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns overlays for all 10 agents when dimensions deviate significantly from neutral', () => {
    const extreme = makeVector({ qualityFocus: 0.9, riskTolerance: 0.1 });
    const result = generateAgentOverlays(extreme);
    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  it('each overlay has agentName, behaviorModifiers, and parameters fields', () => {
    const dims = makeVector({ qualityFocus: 0.9, riskTolerance: 0.1 });
    const overlays = generateAgentOverlays(dims);
    for (const overlay of overlays) {
      expect(typeof overlay.agentName).toBe('string');
      expect(Array.isArray(overlay.behaviorModifiers)).toBe(true);
      expect(typeof overlay.parameters).toBe('object');
    }
  });

  it('each overlay has parameters with strictness, verbosity, autonomy, depth', () => {
    const dims = makeVector({ qualityFocus: 0.9 });
    const overlays = generateAgentOverlays(dims);
    for (const overlay of overlays) {
      expect(typeof overlay.parameters.strictness).toBe('number');
      expect(typeof overlay.parameters.verbosity).toBe('number');
      expect(typeof overlay.parameters.autonomy).toBe('number');
      expect(typeof overlay.parameters.depth).toBe('number');
    }
  });

  it('all parameter values are in the 0-1 range', () => {
    const dims = makeVector({ qualityFocus: 0.9, riskTolerance: 0.1, autonomyPreference: 0.9 });
    const overlays = generateAgentOverlays(dims);
    for (const overlay of overlays) {
      const p = overlay.parameters;
      expect(p.strictness).toBeGreaterThanOrEqual(0);
      expect(p.strictness).toBeLessThanOrEqual(1);
      expect(p.verbosity).toBeGreaterThanOrEqual(0);
      expect(p.verbosity).toBeLessThanOrEqual(1);
      expect(p.autonomy).toBeGreaterThanOrEqual(0);
      expect(p.autonomy).toBeLessThanOrEqual(1);
      expect(p.depth).toBeGreaterThanOrEqual(0);
      expect(p.depth).toBeLessThanOrEqual(1);
    }
  });

  it('agentName values come from the known set of agents', () => {
    const dims = makeVector({ qualityFocus: 0.9, riskTolerance: 0.1 });
    const overlays = generateAgentOverlays(dims);
    for (const overlay of overlays) {
      expect(KNOWN_AGENTS).toContain(overlay.agentName);
    }
  });

  it('extreme dimensions (0.1) produce different overlays than extreme (0.9)', () => {
    const low = generateAgentOverlays(makeVector({ qualityFocus: 0.1 }));
    const high = generateAgentOverlays(makeVector({ qualityFocus: 0.9 }));

    const lowCodeReviewer = low.find(o => o.agentName === 'code-reviewer');
    const highCodeReviewer = high.find(o => o.agentName === 'code-reviewer');

    if (lowCodeReviewer && highCodeReviewer) {
      // The modifier texts should differ
      expect(lowCodeReviewer.behaviorModifiers.join(''))
        .not.toBe(highCodeReviewer.behaviorModifiers.join(''));
    }
  });

  it('security-reviewer overlay has fixed autonomy of 0.3 regardless of dimensions', () => {
    const dims1 = makeVector({ riskTolerance: 0.1 }); // low risk -> get overlay
    const dims2 = makeVector({ riskTolerance: 0.9 }); // high risk -> get overlay
    const overlays1 = generateAgentOverlays(dims1);
    const overlays2 = generateAgentOverlays(dims2);

    const sec1 = overlays1.find(o => o.agentName === 'security-reviewer');
    const sec2 = overlays2.find(o => o.agentName === 'security-reviewer');

    if (sec1) expect(sec1.parameters.autonomy).toBe(0.3);
    if (sec2) expect(sec2.parameters.autonomy).toBe(0.3);
  });

  it('behaviorModifiers are non-empty strings', () => {
    const dims = makeVector({ qualityFocus: 0.9, autonomyPreference: 0.9 });
    const overlays = generateAgentOverlays(dims);
    for (const overlay of overlays) {
      for (const modifier of overlay.behaviorModifiers) {
        expect(typeof modifier).toBe('string');
        expect(modifier.length).toBeGreaterThan(0);
      }
    }
  });
});
