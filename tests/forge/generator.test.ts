import { describe, it, expect } from 'vitest';
import { generateConfig } from '../../src/forge/generator.js';
import { defaultDimensionVector } from '../../src/forge/dimensions.js';
import type { DimensionVector } from '../../src/forge/types.js';

function makeVector(overrides: Partial<DimensionVector> = {}): DimensionVector {
  return { ...defaultDimensionVector(), ...overrides };
}

describe('generateConfig', () => {
  it('returns all required top-level fields', () => {
    const config = generateConfig(defaultDimensionVector());
    expect(config).toHaveProperty('agents');
    expect(config).toHaveProperty('agentOverlays');
    expect(config).toHaveProperty('skillOverlays');
    expect(config).toHaveProperty('tunedRules');
    expect(config).toHaveProperty('hookTuning');
    expect(config).toHaveProperty('principles');
    expect(config).toHaveProperty('hookSeverity');
    expect(config).toHaveProperty('routingPreset');
    expect(config).toHaveProperty('verbosity');
  });

  it('returns agents as an array with at least one entry', () => {
    const config = generateConfig(defaultDimensionVector());
    expect(Array.isArray(config.agents)).toBe(true);
    expect(config.agents.length).toBeGreaterThan(0);
  });

  it('each agent has name, enabled, and strictness fields', () => {
    const config = generateConfig(defaultDimensionVector());
    for (const agent of config.agents) {
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.enabled).toBe('boolean');
      expect(typeof agent.strictness).toBe('number');
    }
  });

  it('hookSeverity is one of the valid enum values', () => {
    const config = generateConfig(defaultDimensionVector());
    expect(['relaxed', 'balanced', 'strict']).toContain(config.hookSeverity);
  });

  it('routingPreset is one of the valid enum values', () => {
    const config = generateConfig(defaultDimensionVector());
    expect(['cost-saving', 'default', 'max-quality']).toContain(config.routingPreset);
  });

  it('verbosity is one of the valid enum values', () => {
    const config = generateConfig(defaultDimensionVector());
    expect(['terse', 'balanced', 'verbose']).toContain(config.verbosity);
  });

  it('high qualityFocus and low riskTolerance produces strict hookSeverity', () => {
    const dims = makeVector({ qualityFocus: 0.9, riskTolerance: 0.1 });
    const config = generateConfig(dims);
    expect(config.hookSeverity).toBe('strict');
  });

  it('low qualityFocus and high riskTolerance produces relaxed hookSeverity', () => {
    const dims = makeVector({ qualityFocus: 0.1, riskTolerance: 0.9 });
    const config = generateConfig(dims);
    expect(config.hookSeverity).toBe('relaxed');
  });

  it('high autonomyPreference enables test-engineer agent when qualityFocus is high', () => {
    const dims = makeVector({ qualityFocus: 0.8, autonomyPreference: 0.8 });
    const config = generateConfig(dims);
    const testEngineer = config.agents.find(a => a.name === 'test-engineer');
    expect(testEngineer?.enabled).toBe(true);
  });

  it('config changes meaningfully with extreme dimensions vs neutral', () => {
    const neutral = generateConfig(defaultDimensionVector());
    const aggressive = generateConfig(makeVector({ qualityFocus: 1.0, riskTolerance: 0.0 }));
    // hookSeverity should differ
    expect(neutral.hookSeverity).not.toBe(aggressive.hookSeverity);
  });

  it('high qualityFocus and high abstractionLevel produces max-quality routing preset', () => {
    const dims = makeVector({ qualityFocus: 0.9, abstractionLevel: 0.9 });
    const config = generateConfig(dims);
    expect(config.routingPreset).toBe('max-quality');
  });

  it('low qualityFocus and low abstractionLevel produces cost-saving routing preset', () => {
    const dims = makeVector({ qualityFocus: 0.1, abstractionLevel: 0.1 });
    const config = generateConfig(dims);
    expect(config.routingPreset).toBe('cost-saving');
  });

  it('high communicationStyle produces terse verbosity', () => {
    const dims = makeVector({ communicationStyle: 0.9 });
    const config = generateConfig(dims);
    expect(config.verbosity).toBe('terse');
  });

  it('low communicationStyle produces verbose verbosity', () => {
    const dims = makeVector({ communicationStyle: 0.1 });
    const config = generateConfig(dims);
    expect(config.verbosity).toBe('verbose');
  });

  it('agentOverlays is an array', () => {
    const config = generateConfig(defaultDimensionVector());
    expect(Array.isArray(config.agentOverlays)).toBe(true);
  });

  it('skillOverlays is an array', () => {
    const config = generateConfig(defaultDimensionVector());
    expect(Array.isArray(config.skillOverlays)).toBe(true);
  });

  it('tunedRules is an array of objects with filename and content', () => {
    const config = generateConfig(makeVector({ qualityFocus: 0.8 }));
    expect(Array.isArray(config.tunedRules)).toBe(true);
    for (const rule of config.tunedRules) {
      expect(typeof rule.filename).toBe('string');
      expect(typeof rule.content).toBe('string');
    }
  });

  it('hookTuning is an array of objects with hookName and enabled', () => {
    const config = generateConfig(defaultDimensionVector());
    expect(Array.isArray(config.hookTuning)).toBe(true);
    for (const hook of config.hookTuning) {
      expect(typeof hook.hookName).toBe('string');
      expect(typeof hook.enabled).toBe('boolean');
    }
  });
});
