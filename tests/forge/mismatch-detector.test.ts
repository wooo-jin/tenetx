import { describe, it, expect } from 'vitest';
import { computeSessionSignals, detectMismatch } from '../../src/forge/mismatch-detector.js';
import type { Evidence, Rule } from '../../src/store/types.js';

function mockEvidence(overrides: Partial<Evidence>): Evidence {
  return {
    evidence_id: 'ev-1', type: 'explicit_correction', session_id: 's1',
    timestamp: '2026-04-03T00:00:00Z', source_component: 'Hooks',
    summary: 'test', axis_refs: [], candidate_rule_refs: [],
    confidence: 0.8, raw_payload: {},
    ...overrides,
  };
}

describe('computeSessionSignals', () => {
  it('opposite correction yields +2', () => {
    const correction = mockEvidence({
      axis_refs: ['quality_safety'],
      raw_payload: { direction: 'opposite' },
    });
    const signals = computeSessionSignals('s1', [correction], [], [], '균형형', '균형형');
    expect(signals).toHaveLength(1);
    expect(signals[0].score).toBe(2);
    expect(signals[0].axis).toBe('quality_safety');
  });

  it('opposite session summary yields +1', () => {
    const summary = mockEvidence({
      type: 'session_summary',
      raw_payload: { pack_direction: 'opposite_autonomy' },
    });
    const signals = computeSessionSignals('s1', [], [summary], [], '균형형', '균형형');
    expect(signals).toHaveLength(1);
    expect(signals[0].score).toBe(1);
    expect(signals[0].axis).toBe('autonomy');
  });

  it('2+ strong rules yields +1', () => {
    const rules: Rule[] = [
      { rule_id: 'r1', category: 'quality', scope: 'me', trigger: 't', policy: 'p1', strength: 'strong', source: 'explicit_correction', status: 'active', evidence_refs: [], render_key: 'quality.p1', created_at: '', updated_at: '' },
      { rule_id: 'r2', category: 'quality', scope: 'me', trigger: 't', policy: 'p2', strength: 'strong', source: 'explicit_correction', status: 'active', evidence_refs: [], render_key: 'quality.p2', created_at: '', updated_at: '' },
    ];
    const signals = computeSessionSignals('s1', [], [], rules, '균형형', '균형형');
    expect(signals).toHaveLength(1);
    expect(signals[0].score).toBe(1);
  });
});

describe('detectMismatch', () => {
  it('score >= 4 triggers mismatch', () => {
    const signals = [
      { session_id: 's1', axis: 'quality_safety' as const, score: 2, reason: 'a' },
      { session_id: 's2', axis: 'quality_safety' as const, score: 2, reason: 'b' },
    ];
    const result = detectMismatch(signals);
    expect(result.quality_mismatch).toBe(true);
    expect(result.quality_score).toBe(4);
  });

  it('2+ corrections triggers mismatch', () => {
    const signals = [
      { session_id: 's1', axis: 'autonomy' as const, score: 2, reason: 'a' },
      { session_id: 's2', axis: 'autonomy' as const, score: 2, reason: 'b' },
    ];
    const result = detectMismatch(signals);
    expect(result.autonomy_mismatch).toBe(true);
  });

  it('score < 4 and < 2 corrections → no mismatch', () => {
    const signals = [
      { session_id: 's1', axis: 'quality_safety' as const, score: 1, reason: 'a' },
      { session_id: 's2', axis: 'quality_safety' as const, score: 1, reason: 'b' },
    ];
    const result = detectMismatch(signals);
    expect(result.quality_mismatch).toBe(false);
    expect(result.quality_score).toBe(2);
  });
});
