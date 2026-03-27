import { describe, it, expect } from 'vitest';
import { generateTunedRules } from '../../src/forge/rule-tuner.js';
import { defaultDimensionVector } from '../../src/forge/dimensions.js';
import type { DimensionVector } from '../../src/forge/types.js';

function makeVector(overrides: Partial<Record<string, number>> = {}): DimensionVector {
  return { ...defaultDimensionVector(), ...overrides } as DimensionVector;
}

const KNOWN_FILENAMES = [
  'forge-communication.md',
  'forge-autonomy.md',
  'forge-quality.md',
  'forge-risk.md',
  'forge-abstraction.md',
];

describe('generateTunedRules', () => {
  // ── Structure ──────────────────────────────────────

  it('returns an array', () => {
    expect(Array.isArray(generateTunedRules(defaultDimensionVector()))).toBe(true);
  });

  it('returns empty array for fully neutral vector', () => {
    const result = generateTunedRules(defaultDimensionVector());
    // All dimensions at 0.5 -> deviation < 0.1 for all -> no rules
    expect(result).toHaveLength(0);
  });

  it('each rule has filename and content fields', () => {
    const result = generateTunedRules(makeVector({ qualityFocus: 0.9 }));
    for (const rule of result) {
      expect(typeof rule.filename).toBe('string');
      expect(typeof rule.content).toBe('string');
    }
  });

  it('filenames come from the known set', () => {
    const result = generateTunedRules(makeVector({
      qualityFocus: 0.9,
      riskTolerance: 0.1,
      autonomyPreference: 0.8,
      communicationStyle: 0.2,
      abstractionLevel: 0.8,
    }));
    for (const rule of result) {
      expect(KNOWN_FILENAMES).toContain(rule.filename);
    }
  });

  // ── Communication Rule ─────────────────────────────

  it('generates communication rule for terse style (high communicationStyle)', () => {
    const result = generateTunedRules(makeVector({ communicationStyle: 0.8 }));
    const comm = result.find(r => r.filename === 'forge-communication.md');
    expect(comm).toBeDefined();
    expect(comm!.content).toContain('Response Format');
    expect(comm!.content).toContain('Code over explanation');
  });

  it('generates communication rule for verbose style (low communicationStyle)', () => {
    const result = generateTunedRules(makeVector({ communicationStyle: 0.2 }));
    const comm = result.find(r => r.filename === 'forge-communication.md');
    expect(comm).toBeDefined();
    expect(comm!.content).toContain('Explain the reasoning');
  });

  it('terse communication includes severity format for high values', () => {
    const result = generateTunedRules(makeVector({ communicationStyle: 0.75 }));
    const comm = result.find(r => r.filename === 'forge-communication.md')!;
    expect(comm.content).toContain('[SEVERITY]');
  });

  it('verbose communication includes examples for very low values', () => {
    const result = generateTunedRules(makeVector({ communicationStyle: 0.15 }));
    const comm = result.find(r => r.filename === 'forge-communication.md')!;
    expect(comm.content).toContain('alternatives');
    expect(comm.content).toContain('assumptions');
  });

  it('communication rule content includes forge-tuned marker', () => {
    const result = generateTunedRules(makeVector({ communicationStyle: 0.8 }));
    const comm = result.find(r => r.filename === 'forge-communication.md')!;
    expect(comm.content).toContain('forge-tuned');
  });

  // ── Autonomy Rule ──────────────────────────────────

  it('generates autonomy rule for high autonomy', () => {
    const result = generateTunedRules(makeVector({ autonomyPreference: 0.8 }));
    const autonomy = result.find(r => r.filename === 'forge-autonomy.md');
    expect(autonomy).toBeDefined();
    expect(autonomy!.content).toContain('Execute without asking');
  });

  it('generates autonomy rule for low autonomy', () => {
    const result = generateTunedRules(makeVector({ autonomyPreference: 0.2 }));
    const autonomy = result.find(r => r.filename === 'forge-autonomy.md');
    expect(autonomy).toBeDefined();
    expect(autonomy!.content).toContain('Show plan before');
  });

  it('high autonomy includes auto-fix for >= 0.75', () => {
    const result = generateTunedRules(makeVector({ autonomyPreference: 0.8 }));
    const autonomy = result.find(r => r.filename === 'forge-autonomy.md')!;
    expect(autonomy.content).toContain('Auto-fix');
  });

  it('very low autonomy requires explicit approval', () => {
    const result = generateTunedRules(makeVector({ autonomyPreference: 0.15 }));
    const autonomy = result.find(r => r.filename === 'forge-autonomy.md')!;
    expect(autonomy.content).toContain('Present alternatives');
  });

  // ── Quality Rule ───────────────────────────────────

  it('generates quality rule for high quality focus', () => {
    const result = generateTunedRules(makeVector({ qualityFocus: 0.8 }));
    const quality = result.find(r => r.filename === 'forge-quality.md');
    expect(quality).toBeDefined();
    expect(quality!.content).toContain('Quality Gates');
  });

  it('quality rule includes coverage target', () => {
    const result = generateTunedRules(makeVector({ qualityFocus: 0.8 }));
    const quality = result.find(r => r.filename === 'forge-quality.md')!;
    expect(quality.content).toMatch(/Target test coverage: \d+%/);
  });

  it('quality rule coverage target increases with quality', () => {
    const medium = generateTunedRules(makeVector({ qualityFocus: 0.65 }));
    const high = generateTunedRules(makeVector({ qualityFocus: 0.95 }));
    const extractCoverage = (rules: typeof medium) => {
      const q = rules.find(r => r.filename === 'forge-quality.md')!;
      const match = q.content.match(/Target test coverage: (\d+)%/);
      return parseInt(match![1], 10);
    };
    expect(extractCoverage(high)).toBeGreaterThan(extractCoverage(medium));
  });

  it('generates quality rule for low quality focus', () => {
    const result = generateTunedRules(makeVector({ qualityFocus: 0.2 }));
    const quality = result.find(r => r.filename === 'forge-quality.md');
    expect(quality).toBeDefined();
    expect(quality!.content).toContain('Working code is the priority');
  });

  it('very low quality skips test boilerplate', () => {
    const result = generateTunedRules(makeVector({ qualityFocus: 0.15 }));
    const quality = result.find(r => r.filename === 'forge-quality.md')!;
    expect(quality.content).toContain('Skip test boilerplate');
  });

  // ── Risk Rule ──────────────────────────────────────

  it('generates risk rule for low risk tolerance', () => {
    const result = generateTunedRules(makeVector({ riskTolerance: 0.2 }));
    const risk = result.find(r => r.filename === 'forge-risk.md');
    expect(risk).toBeDefined();
    expect(risk!.content).toContain('Safety Requirements');
  });

  it('generates risk rule for high risk tolerance', () => {
    const result = generateTunedRules(makeVector({ riskTolerance: 0.8 }));
    const risk = result.find(r => r.filename === 'forge-risk.md');
    expect(risk).toBeDefined();
    expect(risk!.content).toContain('Execution Speed');
  });

  it('low risk requires backup before destructive operations', () => {
    const result = generateTunedRules(makeVector({ riskTolerance: 0.15 }));
    const risk = result.find(r => r.filename === 'forge-risk.md')!;
    expect(risk.content).toContain('backup');
  });

  it('high risk trusts CI pipeline', () => {
    const result = generateTunedRules(makeVector({ riskTolerance: 0.8 }));
    const risk = result.find(r => r.filename === 'forge-risk.md')!;
    expect(risk.content).toContain('CI pipeline');
  });

  it('very low risk requires rollback for migrations', () => {
    const result = generateTunedRules(makeVector({ riskTolerance: 0.2 }));
    const risk = result.find(r => r.filename === 'forge-risk.md')!;
    expect(risk.content).toContain('rollback');
  });

  // ── Abstraction Rule ───────────────────────────────

  it('generates abstraction rule for high abstraction level', () => {
    const result = generateTunedRules(makeVector({ abstractionLevel: 0.8 }));
    const abstraction = result.find(r => r.filename === 'forge-abstraction.md');
    expect(abstraction).toBeDefined();
    expect(abstraction!.content).toContain('Design Standards');
  });

  it('generates abstraction rule for low abstraction level', () => {
    const result = generateTunedRules(makeVector({ abstractionLevel: 0.2 }));
    const abstraction = result.find(r => r.filename === 'forge-abstraction.md');
    expect(abstraction).toBeDefined();
    expect(abstraction!.content).toContain('No speculative abstractions');
  });

  it('high abstraction includes SOLID principles for >= 0.7', () => {
    const result = generateTunedRules(makeVector({ abstractionLevel: 0.75 }));
    const abstraction = result.find(r => r.filename === 'forge-abstraction.md')!;
    expect(abstraction.content).toContain('SOLID');
  });

  it('very low abstraction inlines small utilities', () => {
    const result = generateTunedRules(makeVector({ abstractionLevel: 0.15 }));
    const abstraction = result.find(r => r.filename === 'forge-abstraction.md')!;
    expect(abstraction.content).toContain('Inline');
  });

  // ── Multiple Rules at Once ─────────────────────────

  it('generates all 5 rules when all dimensions deviate significantly', () => {
    const result = generateTunedRules(makeVector({
      communicationStyle: 0.9,
      autonomyPreference: 0.9,
      qualityFocus: 0.9,
      riskTolerance: 0.1,
      abstractionLevel: 0.9,
    }));
    expect(result).toHaveLength(5);
  });

  it('no duplicate filenames in results', () => {
    const result = generateTunedRules(makeVector({
      communicationStyle: 0.2,
      autonomyPreference: 0.2,
      qualityFocus: 0.2,
      riskTolerance: 0.2,
      abstractionLevel: 0.2,
    }));
    const filenames = result.map(r => r.filename);
    expect(new Set(filenames).size).toBe(filenames.length);
  });
});
