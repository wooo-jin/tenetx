import { describe, it, expect } from 'vitest';
import {
  defaultDimensionVector,
  applyDeltas,
  clampDimension,
  dimensionDistance,
  dimensionLabel,
  CORE_DIMENSIONS,
} from '../../src/forge/dimensions.js';

describe('defaultDimensionVector', () => {
  it('returns an object with all 5 core dimensions', () => {
    const v = defaultDimensionVector();
    expect(Object.keys(v)).toHaveLength(CORE_DIMENSIONS.length);
  });

  it('sets every dimension to 0.5', () => {
    const v = defaultDimensionVector();
    for (const dim of CORE_DIMENSIONS) {
      expect(v[dim]).toBe(0.5);
    }
  });

  it('returns a new object each call (no shared reference)', () => {
    const a = defaultDimensionVector();
    const b = defaultDimensionVector();
    a.riskTolerance = 0.9;
    expect(b.riskTolerance).toBe(0.5);
  });
});

describe('clampDimension', () => {
  it('returns value unchanged when within 0-1 range', () => {
    expect(clampDimension(0.5)).toBe(0.5);
    expect(clampDimension(0)).toBe(0);
    expect(clampDimension(1)).toBe(1);
  });

  it('clamps values below 0 to 0', () => {
    expect(clampDimension(-0.1)).toBe(0);
    expect(clampDimension(-10)).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    expect(clampDimension(1.1)).toBe(1);
    expect(clampDimension(100)).toBe(1);
  });
});

describe('applyDeltas', () => {
  it('adds positive deltas to the base vector', () => {
    const base = defaultDimensionVector();
    const result = applyDeltas(base, { riskTolerance: 0.2 });
    expect(result.riskTolerance).toBeCloseTo(0.7);
  });

  it('adds negative deltas to the base vector', () => {
    const base = defaultDimensionVector();
    const result = applyDeltas(base, { qualityFocus: -0.2 });
    expect(result.qualityFocus).toBeCloseTo(0.3);
  });

  it('clamps the result to 0 when delta would go below 0', () => {
    const base = defaultDimensionVector();
    const result = applyDeltas(base, { riskTolerance: -1.0 });
    expect(result.riskTolerance).toBe(0);
  });

  it('clamps the result to 1 when delta would exceed 1', () => {
    const base = defaultDimensionVector();
    const result = applyDeltas(base, { autonomyPreference: 1.0 });
    expect(result.autonomyPreference).toBe(1);
  });

  it('does not mutate the original vector', () => {
    const base = defaultDimensionVector();
    applyDeltas(base, { riskTolerance: 0.3 });
    expect(base.riskTolerance).toBe(0.5);
  });

  it('applies deltas to multiple dimensions simultaneously', () => {
    const base = defaultDimensionVector();
    const result = applyDeltas(base, { riskTolerance: 0.1, qualityFocus: -0.1 });
    expect(result.riskTolerance).toBeCloseTo(0.6);
    expect(result.qualityFocus).toBeCloseTo(0.4);
  });

  it('leaves dimensions without deltas unchanged', () => {
    const base = defaultDimensionVector();
    const result = applyDeltas(base, { riskTolerance: 0.1 });
    expect(result.communicationStyle).toBe(0.5);
    expect(result.abstractionLevel).toBe(0.5);
  });

  it('ignores unknown dimension keys silently', () => {
    const base = defaultDimensionVector();
    const result = applyDeltas(base, { unknownDim: 0.5 } as any);
    for (const dim of CORE_DIMENSIONS) {
      expect(result[dim]).toBe(0.5);
    }
  });
});

describe('dimensionDistance', () => {
  it('returns 0 for identical vectors', () => {
    const a = defaultDimensionVector();
    const b = defaultDimensionVector();
    expect(dimensionDistance(a, b)).toBe(0);
  });

  it('returns a positive value for different vectors', () => {
    const a = defaultDimensionVector();
    const b = defaultDimensionVector();
    b.riskTolerance = 1.0;
    expect(dimensionDistance(a, b)).toBeGreaterThan(0);
  });

  it('computes Euclidean distance correctly for single-dimension difference', () => {
    const a = defaultDimensionVector();
    const b = defaultDimensionVector();
    b.riskTolerance = 1.0; // diff = 0.5
    // sqrt(0.5^2) = 0.5
    expect(dimensionDistance(a, b)).toBeCloseTo(0.5);
  });

  it('is symmetric: distance(a,b) === distance(b,a)', () => {
    const a = defaultDimensionVector();
    const b = { ...defaultDimensionVector(), riskTolerance: 0.1, qualityFocus: 0.8 };
    expect(dimensionDistance(a, b)).toBeCloseTo(dimensionDistance(b, a));
  });

  it('increases as vectors become more different', () => {
    const base = defaultDimensionVector();
    const close = { ...base, riskTolerance: 0.6 };
    const far = { ...base, riskTolerance: 0.9 };
    expect(dimensionDistance(base, close)).toBeLessThan(dimensionDistance(base, far));
  });
});

describe('dimensionLabel', () => {
  it('returns the lowLabel for values <= 0.25', () => {
    expect(dimensionLabel('riskTolerance', 0.0)).toBe('conservative');
    expect(dimensionLabel('riskTolerance', 0.25)).toBe('conservative');
  });

  it('returns "leaning <lowLabel>" for values in 0.26-0.45 range', () => {
    expect(dimensionLabel('riskTolerance', 0.3)).toBe('leaning conservative');
    expect(dimensionLabel('riskTolerance', 0.45)).toBe('leaning conservative');
  });

  it('returns "balanced" for values in 0.46-0.55 range', () => {
    expect(dimensionLabel('riskTolerance', 0.5)).toBe('balanced');
    expect(dimensionLabel('riskTolerance', 0.55)).toBe('balanced');
  });

  it('returns "leaning <highLabel>" for values in 0.56-0.75 range', () => {
    expect(dimensionLabel('riskTolerance', 0.6)).toBe('leaning aggressive');
    expect(dimensionLabel('riskTolerance', 0.75)).toBe('leaning aggressive');
  });

  it('returns the highLabel for values > 0.75', () => {
    expect(dimensionLabel('riskTolerance', 0.76)).toBe('aggressive');
    expect(dimensionLabel('riskTolerance', 1.0)).toBe('aggressive');
  });

  it('returns correct labels for autonomyPreference dimension', () => {
    expect(dimensionLabel('autonomyPreference', 0.1)).toBe('supervised');
    expect(dimensionLabel('autonomyPreference', 0.9)).toBe('autonomous');
  });

  it('returns correct labels for qualityFocus dimension', () => {
    expect(dimensionLabel('qualityFocus', 0.1)).toBe('speed');
    expect(dimensionLabel('qualityFocus', 0.9)).toBe('thoroughness');
  });

  it('returns numeric fallback for unknown dimension key', () => {
    const result = dimensionLabel('unknownDim' as any, 0.42);
    expect(result).toBe('0.42');
  });
});
