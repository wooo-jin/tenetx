import { describe, it, expect } from 'vitest';
import { recommendPipeline, formatPipelineSuggestions } from '../../src/orchestration/pipeline-recommender.js';
import type { OrchestrationContext } from '../../src/orchestration/types.js';

const BASE_CTX: Omit<OrchestrationContext, 'taskCategory'> = {
  qualityFocus: 0.5,
  riskTolerance: 0.5,
  autonomyPreference: 0.5,
};

describe('recommendPipeline', () => {
  it('returns Feature Pipeline for implement category', () => {
    const rec = recommendPipeline({ ...BASE_CTX, taskCategory: 'implement' });
    expect(rec.name).toBe('Feature Pipeline');
    expect(rec.steps.some(s => s.agentName === 'executor')).toBe(true);
  });

  it('returns Bug Fix Pipeline for debug-complex', () => {
    const rec = recommendPipeline({ ...BASE_CTX, taskCategory: 'debug-complex' });
    expect(rec.name).toBe('Bug Fix Pipeline');
    expect(rec.steps[0].agentName).toBe('debugger');
  });

  it('returns Quick Pipeline for explore', () => {
    const rec = recommendPipeline({ ...BASE_CTX, taskCategory: 'explore' });
    expect(rec.name).toBe('Quick Pipeline');
    expect(rec.steps.length).toBe(1);
  });

  it('falls back to simple-qa pipeline for unknown category', () => {
    const rec = recommendPipeline({ ...BASE_CTX, taskCategory: 'unknown' as never });
    expect(rec.steps.length).toBeGreaterThan(0);
  });

  // Dimension adjustments
  it('qualityFocus >= 0.7 promotes optional steps to required', () => {
    const rec = recommendPipeline({ ...BASE_CTX, qualityFocus: 0.8, taskCategory: 'implement' });
    const testEngineer = rec.steps.find(s => s.agentName === 'test-engineer');
    const reviewer = rec.steps.find(s => s.agentName === 'code-reviewer');
    expect(testEngineer?.isRequired).toBe(true);
    expect(reviewer?.isRequired).toBe(true);
    expect(rec.reasoning).toContain('qualityFocus');
  });

  it('qualityFocus < 0.4 removes optional steps', () => {
    const rec = recommendPipeline({ ...BASE_CTX, qualityFocus: 0.3, taskCategory: 'implement' });
    const hasOptional = rec.steps.some(s => !s.isRequired);
    expect(hasOptional).toBe(false);
    expect(rec.reasoning).toContain('선택 단계 제거');
  });

  it('riskTolerance < 0.3 adds security-reviewer', () => {
    const rec = recommendPipeline({ ...BASE_CTX, riskTolerance: 0.2, taskCategory: 'implement' });
    expect(rec.steps.some(s => s.agentName === 'security-reviewer')).toBe(true);
    expect(rec.reasoning).toContain('security-reviewer');
  });

  it('riskTolerance < 0.3 does NOT duplicate security-reviewer on review pipeline', () => {
    const rec = recommendPipeline({ ...BASE_CTX, riskTolerance: 0.2, taskCategory: 'code-review' });
    const secCount = rec.steps.filter(s => s.agentName === 'security-reviewer').length;
    expect(secCount).toBe(1);
  });

  it('autonomyPreference >= 0.7 reduces to executor only', () => {
    const rec = recommendPipeline({ ...BASE_CTX, autonomyPreference: 0.8, taskCategory: 'implement' });
    expect(rec.steps.length).toBe(1);
    expect(rec.steps[0].agentName).toBe('executor');
    expect(rec.reasoning).toContain('자율 모드');
  });

  it('autonomyPreference >= 0.7 does NOT apply to code-review', () => {
    const rec = recommendPipeline({ ...BASE_CTX, autonomyPreference: 0.8, taskCategory: 'code-review' });
    expect(rec.steps.length).toBeGreaterThan(1);
  });

  // 차원 충돌 시나리오
  it('qualityFocus < 0.4 + riskTolerance < 0.3 → security-reviewer is preserved', () => {
    const rec = recommendPipeline({
      qualityFocus: 0.3, riskTolerance: 0.2, autonomyPreference: 0.5, taskCategory: 'implement',
    });
    expect(rec.steps.some(s => s.agentName === 'security-reviewer')).toBe(true);
    expect(rec.reasoning).toContain('security-reviewer');
  });

  it('qualityFocus < 0.4 + autonomyPreference >= 0.7 → executor + security if risk low', () => {
    const rec = recommendPipeline({
      qualityFocus: 0.3, riskTolerance: 0.2, autonomyPreference: 0.8, taskCategory: 'implement',
    });
    // 자율 모드지만 보안은 유지
    expect(rec.steps.some(s => s.agentName === 'security-reviewer')).toBe(true);
    expect(rec.steps.some(s => s.agentName === 'executor')).toBe(true);
    expect(rec.reasoning).toContain('자율 모드');
  });

  it('all three adjustments combine correctly', () => {
    const rec = recommendPipeline({
      qualityFocus: 0.3, riskTolerance: 0.2, autonomyPreference: 0.8, taskCategory: 'implement',
    });
    // riskTolerance adds security, qualityFocus removes optional, autonomy keeps executor+security
    expect(rec.steps.length).toBe(2); // executor + security-reviewer
    const names = rec.steps.map(s => s.agentName).sort();
    expect(names).toEqual(['executor', 'security-reviewer']);
  });
});

describe('formatPipelineSuggestions', () => {
  it('returns formatted string with all categories', () => {
    const output = formatPipelineSuggestions(BASE_CTX);
    expect(output).toContain('implement');
    expect(output).toContain('debug-complex');
    expect(output).toContain('Pipeline Suggestions');
  });
});
