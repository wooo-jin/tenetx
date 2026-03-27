import { describe, it, expect } from 'vitest';
import { generateHookTuning } from '../../src/forge/hook-tuner.js';
import { defaultDimensionVector } from '../../src/forge/dimensions.js';
import type { DimensionVector } from '../../src/forge/types.js';

function makeVector(overrides: Partial<Record<string, number>> = {}): DimensionVector {
  return { ...defaultDimensionVector(), ...overrides } as DimensionVector;
}

const KNOWN_HOOKS = [
  'secret-filter',
  'slop-detector',
  'context-guard',
  'pre-commit-validation',
  'db-guard',
  'rate-limiter',
];

describe('generateHookTuning', () => {
  it('returns an array of 6 hook tunings for any vector', () => {
    const result = generateHookTuning(defaultDimensionVector());
    expect(result).toHaveLength(6);
  });

  it('each tuning has hookName, enabled, and parameters fields', () => {
    const result = generateHookTuning(defaultDimensionVector());
    for (const hook of result) {
      expect(typeof hook.hookName).toBe('string');
      expect(typeof hook.enabled).toBe('boolean');
      expect(typeof hook.parameters).toBe('object');
    }
  });

  it('hookName values come from the known set', () => {
    const result = generateHookTuning(defaultDimensionVector());
    for (const hook of result) {
      expect(KNOWN_HOOKS).toContain(hook.hookName);
    }
  });

  // ── secret-filter ──────────────────────────────────

  it('secret-filter is always enabled regardless of dimensions', () => {
    const low = generateHookTuning(makeVector({ qualityFocus: 0.1, riskTolerance: 0.9 }));
    const high = generateHookTuning(makeVector({ qualityFocus: 0.9, riskTolerance: 0.1 }));
    const secretLow = low.find(h => h.hookName === 'secret-filter');
    const secretHigh = high.find(h => h.hookName === 'secret-filter');
    expect(secretLow!.enabled).toBe(true);
    expect(secretHigh!.enabled).toBe(true);
  });

  it('secret-filter uses broad pattern breadth when risk is low', () => {
    const result = generateHookTuning(makeVector({ riskTolerance: 0.2 }));
    const secret = result.find(h => h.hookName === 'secret-filter')!;
    expect(secret.parameters.patternBreadth).toBe('broad');
  });

  it('secret-filter uses narrow pattern breadth when risk is high', () => {
    const result = generateHookTuning(makeVector({ riskTolerance: 0.8 }));
    const secret = result.find(h => h.hookName === 'secret-filter')!;
    expect(secret.parameters.patternBreadth).toBe('narrow');
  });

  it('secret-filter uses standard pattern breadth at neutral risk', () => {
    const result = generateHookTuning(makeVector({ riskTolerance: 0.5 }));
    const secret = result.find(h => h.hookName === 'secret-filter')!;
    expect(secret.parameters.patternBreadth).toBe('standard');
  });

  it('secret-filter blocks on warning when quality >= 0.6', () => {
    const result = generateHookTuning(makeVector({ qualityFocus: 0.7 }));
    const secret = result.find(h => h.hookName === 'secret-filter')!;
    expect(secret.parameters.blockOnWarning).toBe(true);
  });

  it('secret-filter does not block on warning when quality < 0.6', () => {
    const result = generateHookTuning(makeVector({ qualityFocus: 0.4 }));
    const secret = result.find(h => h.hookName === 'secret-filter')!;
    expect(secret.parameters.blockOnWarning).toBe(false);
  });

  it('secret-filter scanLines increases with quality', () => {
    const low = generateHookTuning(makeVector({ qualityFocus: 0.1 }));
    const high = generateHookTuning(makeVector({ qualityFocus: 0.9 }));
    const scanLow = low.find(h => h.hookName === 'secret-filter')!.parameters.scanLines as number;
    const scanHigh = high.find(h => h.hookName === 'secret-filter')!.parameters.scanLines as number;
    expect(scanHigh).toBeGreaterThan(scanLow);
  });

  // ── slop-detector ──────────────────────────────────

  it('slop-detector is disabled when quality < 0.35', () => {
    const result = generateHookTuning(makeVector({ qualityFocus: 0.2 }));
    const slop = result.find(h => h.hookName === 'slop-detector')!;
    expect(slop.enabled).toBe(false);
  });

  it('slop-detector is enabled when quality >= 0.35', () => {
    const result = generateHookTuning(makeVector({ qualityFocus: 0.5 }));
    const slop = result.find(h => h.hookName === 'slop-detector')!;
    expect(slop.enabled).toBe(true);
  });

  it('slop-detector threshold decreases as quality increases (stricter)', () => {
    const low = generateHookTuning(makeVector({ qualityFocus: 0.2 }));
    const high = generateHookTuning(makeVector({ qualityFocus: 0.9 }));
    const threshLow = low.find(h => h.hookName === 'slop-detector')!.parameters.threshold as number;
    const threshHigh = high.find(h => h.hookName === 'slop-detector')!.parameters.threshold as number;
    expect(threshHigh).toBeLessThan(threshLow);
  });

  it('slop-detector verbosityPenalty is true when communication >= 0.6', () => {
    const result = generateHookTuning(makeVector({ communicationStyle: 0.7 }));
    const slop = result.find(h => h.hookName === 'slop-detector')!;
    expect(slop.parameters.verbosityPenalty).toBe(true);
  });

  it('slop-detector verbosityPenalty is false when communication < 0.6', () => {
    const result = generateHookTuning(makeVector({ communicationStyle: 0.3 }));
    const slop = result.find(h => h.hookName === 'slop-detector')!;
    expect(slop.parameters.verbosityPenalty).toBe(false);
  });

  // ── context-guard ──────────────────────────────────

  it('context-guard is always enabled', () => {
    const result = generateHookTuning(makeVector({ qualityFocus: 0.1 }));
    const guard = result.find(h => h.hookName === 'context-guard')!;
    expect(guard.enabled).toBe(true);
  });

  it('context-guard autoCompact is true when autonomy >= 0.6', () => {
    const result = generateHookTuning(makeVector({ autonomyPreference: 0.8 }));
    const guard = result.find(h => h.hookName === 'context-guard')!;
    expect(guard.parameters.autoCompact).toBe(true);
  });

  it('context-guard autoCompact is false when autonomy < 0.6', () => {
    const result = generateHookTuning(makeVector({ autonomyPreference: 0.3 }));
    const guard = result.find(h => h.hookName === 'context-guard')!;
    expect(guard.parameters.autoCompact).toBe(false);
  });

  // ── pre-commit-validation ──────────────────────────

  it('pre-commit-validation is enabled when quality >= 0.3', () => {
    const result = generateHookTuning(makeVector({ qualityFocus: 0.5 }));
    const precommit = result.find(h => h.hookName === 'pre-commit-validation')!;
    expect(precommit.enabled).toBe(true);
  });

  it('pre-commit-validation is enabled when risk <= 0.4 even with low quality', () => {
    const result = generateHookTuning(makeVector({ qualityFocus: 0.1, riskTolerance: 0.3 }));
    const precommit = result.find(h => h.hookName === 'pre-commit-validation')!;
    expect(precommit.enabled).toBe(true);
  });

  it('pre-commit-validation runTests only when quality >= 0.7', () => {
    const lowQ = generateHookTuning(makeVector({ qualityFocus: 0.5 }));
    const highQ = generateHookTuning(makeVector({ qualityFocus: 0.8 }));
    expect(lowQ.find(h => h.hookName === 'pre-commit-validation')!.parameters.runTests).toBe(false);
    expect(highQ.find(h => h.hookName === 'pre-commit-validation')!.parameters.runTests).toBe(true);
  });

  it('pre-commit-validation runTypeCheck only when quality >= 0.6', () => {
    const low = generateHookTuning(makeVector({ qualityFocus: 0.4 }));
    const high = generateHookTuning(makeVector({ qualityFocus: 0.7 }));
    expect(low.find(h => h.hookName === 'pre-commit-validation')!.parameters.runTypeCheck).toBe(false);
    expect(high.find(h => h.hookName === 'pre-commit-validation')!.parameters.runTypeCheck).toBe(true);
  });

  it('pre-commit-validation maxDiffLines increases with risk tolerance', () => {
    const low = generateHookTuning(makeVector({ riskTolerance: 0.1 }));
    const high = generateHookTuning(makeVector({ riskTolerance: 0.9 }));
    const diffLow = low.find(h => h.hookName === 'pre-commit-validation')!.parameters.maxDiffLines as number;
    const diffHigh = high.find(h => h.hookName === 'pre-commit-validation')!.parameters.maxDiffLines as number;
    expect(diffHigh).toBeGreaterThan(diffLow);
  });

  // ── db-guard ───────────────────────────────────────

  it('db-guard is always enabled', () => {
    const result = generateHookTuning(defaultDimensionVector());
    const db = result.find(h => h.hookName === 'db-guard')!;
    expect(db.enabled).toBe(true);
  });

  it('db-guard uses all-mutations blockLevel when risk <= 0.3', () => {
    const result = generateHookTuning(makeVector({ riskTolerance: 0.2 }));
    const db = result.find(h => h.hookName === 'db-guard')!;
    expect(db.parameters.blockLevel).toBe('all-mutations');
  });

  it('db-guard uses destructive-only blockLevel when risk >= 0.7', () => {
    const result = generateHookTuning(makeVector({ riskTolerance: 0.8 }));
    const db = result.find(h => h.hookName === 'db-guard')!;
    expect(db.parameters.blockLevel).toBe('destructive-only');
  });

  it('db-guard uses write-operations blockLevel at neutral risk', () => {
    const result = generateHookTuning(makeVector({ riskTolerance: 0.5 }));
    const db = result.find(h => h.hookName === 'db-guard')!;
    expect(db.parameters.blockLevel).toBe('write-operations');
  });

  it('db-guard forceReadOnly when risk <= 0.2', () => {
    const result = generateHookTuning(makeVector({ riskTolerance: 0.15 }));
    const db = result.find(h => h.hookName === 'db-guard')!;
    expect(db.parameters.forceReadOnly).toBe(true);
  });

  it('db-guard logQueries when risk <= 0.4', () => {
    const lowRisk = generateHookTuning(makeVector({ riskTolerance: 0.3 }));
    const highRisk = generateHookTuning(makeVector({ riskTolerance: 0.6 }));
    expect(lowRisk.find(h => h.hookName === 'db-guard')!.parameters.logQueries).toBe(true);
    expect(highRisk.find(h => h.hookName === 'db-guard')!.parameters.logQueries).toBe(false);
  });

  // ── rate-limiter ───────────────────────────────────

  it('rate-limiter is always enabled', () => {
    const result = generateHookTuning(defaultDimensionVector());
    const rl = result.find(h => h.hookName === 'rate-limiter')!;
    expect(rl.enabled).toBe(true);
  });

  it('rate-limiter maxCallsPerMinute increases with autonomy', () => {
    const low = generateHookTuning(makeVector({ autonomyPreference: 0.1 }));
    const high = generateHookTuning(makeVector({ autonomyPreference: 0.9 }));
    const callsLow = low.find(h => h.hookName === 'rate-limiter')!.parameters.maxCallsPerMinute as number;
    const callsHigh = high.find(h => h.hookName === 'rate-limiter')!.parameters.maxCallsPerMinute as number;
    expect(callsHigh).toBeGreaterThan(callsLow);
  });

  it('rate-limiter maxConcurrentAgents increases with autonomy', () => {
    const low = generateHookTuning(makeVector({ autonomyPreference: 0.1 }));
    const high = generateHookTuning(makeVector({ autonomyPreference: 0.9 }));
    const agentsLow = low.find(h => h.hookName === 'rate-limiter')!.parameters.maxConcurrentAgents as number;
    const agentsHigh = high.find(h => h.hookName === 'rate-limiter')!.parameters.maxConcurrentAgents as number;
    expect(agentsHigh).toBeGreaterThan(agentsLow);
  });
});
