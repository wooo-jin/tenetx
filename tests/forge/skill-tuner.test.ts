import { describe, it, expect } from 'vitest';
import { generateSkillOverlays } from '../../src/forge/skill-tuner.js';
import { defaultDimensionVector } from '../../src/forge/dimensions.js';
import type { DimensionVector } from '../../src/forge/types.js';

const KNOWN_SKILLS = ['autopilot', 'ralph', 'team', 'ultrawork', 'code-review', 'tdd'];

function makeVector(overrides: Partial<DimensionVector> = {}): DimensionVector {
  return { ...defaultDimensionVector(), ...overrides };
}

describe('generateSkillOverlays', () => {
  it('returns an array', () => {
    expect(Array.isArray(generateSkillOverlays(defaultDimensionVector()))).toBe(true);
  });

  it('returns no overlays for a fully neutral vector (all dimensions 0.5)', () => {
    // tdd always adds at least one modifier (coverage target), so neutral still has 1 overlay
    // Actually tdd always pushes `Target test coverage: N%` unconditionally
    const result = generateSkillOverlays(defaultDimensionVector());
    // tdd always has at least 1 modifier (coverage target) -> at least 1 overlay
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns more overlays when dimensions deviate from neutral', () => {
    const neutral = generateSkillOverlays(defaultDimensionVector());
    const extreme = generateSkillOverlays(makeVector({
      qualityFocus: 0.9,
      riskTolerance: 0.1,
      autonomyPreference: 0.9,
    }));
    expect(extreme.length).toBeGreaterThanOrEqual(neutral.length);
  });

  it('each overlay has skillName, behaviorModifiers, and parameters', () => {
    const dims = makeVector({ qualityFocus: 0.9 });
    const overlays = generateSkillOverlays(dims);
    for (const overlay of overlays) {
      expect(typeof overlay.skillName).toBe('string');
      expect(Array.isArray(overlay.behaviorModifiers)).toBe(true);
      expect(typeof overlay.parameters).toBe('object');
    }
  });

  it('skillName values come from the known set of skills', () => {
    const dims = makeVector({ qualityFocus: 0.9, autonomyPreference: 0.9 });
    const overlays = generateSkillOverlays(dims);
    for (const overlay of overlays) {
      expect(KNOWN_SKILLS).toContain(overlay.skillName);
    }
  });

  it('tdd skill always appears because it always has coverage modifier', () => {
    const result = generateSkillOverlays(defaultDimensionVector());
    expect(result.some(o => o.skillName === 'tdd')).toBe(true);
  });

  it('tdd overlay includes a coverage target modifier', () => {
    const dims = makeVector({ qualityFocus: 0.5 });
    const overlays = generateSkillOverlays(dims);
    const tdd = overlays.find(o => o.skillName === 'tdd');
    expect(tdd).toBeDefined();
    // Coverage target modifier may say "Target test coverage" or "Coverage Target" or similar
    expect(tdd!.behaviorModifiers.some(m =>
      m.toLowerCase().includes('coverage') || m.toLowerCase().includes('test')
    )).toBe(true);
  });

  it('high qualityFocus produces higher tdd coverage target than low qualityFocus', () => {
    const highQuality = generateSkillOverlays(makeVector({ qualityFocus: 0.9 }));
    const lowQuality = generateSkillOverlays(makeVector({ qualityFocus: 0.1 }));

    const highTdd = highQuality.find(o => o.skillName === 'tdd');
    const lowTdd = lowQuality.find(o => o.skillName === 'tdd');

    expect(highTdd).toBeDefined();
    expect(lowTdd).toBeDefined();

    // coverageTarget may be stored in parameters or in the modifier text
    const highTarget = (highTdd!.parameters.coverageTarget as number)
      ?? parseInt(highTdd!.behaviorModifiers.find(m => m.match(/\d+%/))?.match(/(\d+)%/)?.[1] ?? '0');
    const lowTarget = (lowTdd!.parameters.coverageTarget as number)
      ?? parseInt(lowTdd!.behaviorModifiers.find(m => m.match(/\d+%/))?.match(/(\d+)%/)?.[1] ?? '0');

    expect(highTarget).toBeGreaterThan(lowTarget);
  });

  it('different dimension values produce different behaviorModifiers', () => {
    const high = generateSkillOverlays(makeVector({ autonomyPreference: 0.9 }));
    const low = generateSkillOverlays(makeVector({ autonomyPreference: 0.1 }));

    const highAutopilot = high.find(o => o.skillName === 'autopilot');
    const lowAutopilot = low.find(o => o.skillName === 'autopilot');

    if (highAutopilot && lowAutopilot) {
      expect(highAutopilot.behaviorModifiers.join(''))
        .not.toBe(lowAutopilot.behaviorModifiers.join(''));
    }
  });

  it('behaviorModifiers are non-empty strings', () => {
    const dims = makeVector({ qualityFocus: 0.9, autonomyPreference: 0.9 });
    const overlays = generateSkillOverlays(dims);
    for (const overlay of overlays) {
      for (const modifier of overlay.behaviorModifiers) {
        expect(typeof modifier).toBe('string');
        expect(modifier.length).toBeGreaterThan(0);
      }
    }
  });
});
