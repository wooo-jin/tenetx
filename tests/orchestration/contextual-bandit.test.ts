import { describe, it, expect, beforeEach } from 'vitest';
import {
  quantize,
  hashContext,
  sampleBeta,
  selectAgents,
  updateBandit,
  getBanditSummary,
} from '../../src/orchestration/contextual-bandit.js';
import type { BanditState, BanditContext } from '../../src/orchestration/contextual-bandit.js';

describe('quantize', () => {
  it('returns low for values < 0.4', () => {
    expect(quantize(0.0)).toBe('low');
    expect(quantize(0.39)).toBe('low');
  });

  it('returns mid for values 0.4-0.6', () => {
    expect(quantize(0.4)).toBe('mid');
    expect(quantize(0.5)).toBe('mid');
    expect(quantize(0.6)).toBe('mid');
  });

  it('returns high for values > 0.6', () => {
    expect(quantize(0.61)).toBe('high');
    expect(quantize(1.0)).toBe('high');
  });
});

describe('hashContext', () => {
  it('produces deterministic hash', () => {
    const ctx: BanditContext = { taskCategory: 'implement', qualityFocus: 'high', riskTolerance: 'low' };
    expect(hashContext(ctx)).toBe('implement:high:low');
    expect(hashContext(ctx)).toBe(hashContext(ctx)); // deterministic
  });

  it('different contexts produce different hashes', () => {
    const a: BanditContext = { taskCategory: 'implement', qualityFocus: 'high', riskTolerance: 'low' };
    const b: BanditContext = { taskCategory: 'debug-complex', qualityFocus: 'high', riskTolerance: 'low' };
    expect(hashContext(a)).not.toBe(hashContext(b));
  });
});

describe('sampleBeta', () => {
  it('returns values in [0, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const sample = sampleBeta(2, 3);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  it('high alpha produces samples biased toward 1', () => {
    const samples = Array.from({ length: 200 }, () => sampleBeta(50, 2));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.8);
  });

  it('high beta produces samples biased toward 0', () => {
    const samples = Array.from({ length: 200 }, () => sampleBeta(2, 50));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeLessThan(0.2);
  });

  it('handles edge case alpha=0 or beta=0', () => {
    const sample = sampleBeta(0, 0);
    expect(Number.isFinite(sample)).toBe(true);
  });
});

describe('selectAgents', () => {
  let state: BanditState;
  const ctx: BanditContext = { taskCategory: 'implement', qualityFocus: 'mid', riskTolerance: 'mid' };

  beforeEach(() => {
    state = { agents: {}, totalDecisions: 0, lastUpdated: '' };
  });

  it('returns fallback when decisions < 30', () => {
    const decision = selectAgents(ctx, state);
    expect(decision.source).toBe('fallback');
    expect(decision.includedAgents).toEqual(['architect', 'test-engineer', 'code-reviewer']);
  });

  it('returns empty for explore category (no candidates)', () => {
    const decision = selectAgents({ ...ctx, taskCategory: 'explore' }, state);
    expect(decision.includedAgents).toEqual([]);
    expect(decision.source).toBe('fallback');
  });

  it('uses thompson after warm threshold', () => {
    state.totalDecisions = 150;
    // 높은 alpha로 설정하여 포함 확률 높이기
    state.agents = {
      'architect': { agentName: 'architect', contexts: { 'implement:mid:mid': { alpha: 50, beta: 1 } } },
      'test-engineer': { agentName: 'test-engineer', contexts: { 'implement:mid:mid': { alpha: 50, beta: 1 } } },
      'code-reviewer': { agentName: 'code-reviewer', contexts: { 'implement:mid:mid': { alpha: 50, beta: 1 } } },
    };
    const decision = selectAgents(ctx, state);
    expect(decision.source).toBe('thompson');
    // 모든 에이전트가 높은 alpha를 가지므로 대부분 포함
    expect(decision.includedAgents.length).toBeGreaterThanOrEqual(2);
  });
});

describe('updateBandit', () => {
  it('increases alpha on success for included agents', () => {
    const state: BanditState = { agents: {}, totalDecisions: 50, lastUpdated: '' };
    const ctx: BanditContext = { taskCategory: 'implement', qualityFocus: 'mid', riskTolerance: 'mid' };

    updateBandit(ctx, ['architect', 'test-engineer'], 0.8, state);

    const archParams = state.agents['architect'].contexts['implement:mid:mid'];
    expect(archParams.alpha).toBeGreaterThan(1); // prior(1) + 1 success
  });

  it('increases beta on failure for included agents', () => {
    const state: BanditState = { agents: {}, totalDecisions: 50, lastUpdated: '' };
    const ctx: BanditContext = { taskCategory: 'implement', qualityFocus: 'mid', riskTolerance: 'mid' };

    updateBandit(ctx, ['architect'], 0.2, state);

    const archParams = state.agents['architect'].contexts['implement:mid:mid'];
    expect(archParams.beta).toBeGreaterThan(1); // prior(1) + 1 failure
  });

  it('increments totalDecisions', () => {
    const state: BanditState = { agents: {}, totalDecisions: 5, lastUpdated: '' };
    const ctx: BanditContext = { taskCategory: 'implement', qualityFocus: 'mid', riskTolerance: 'mid' };

    updateBandit(ctx, ['architect'], 0.5, state);
    expect(state.totalDecisions).toBe(6);
  });
});

describe('getBanditSummary', () => {
  it('shows cold start phase for new state', () => {
    const state: BanditState = { agents: {}, totalDecisions: 5, lastUpdated: '' };
    const summary = getBanditSummary(state);
    expect(summary).toContain('Cold Start');
    expect(summary).toContain('5');
  });

  it('shows warming phase', () => {
    const state: BanditState = { agents: {}, totalDecisions: 50, lastUpdated: '' };
    expect(getBanditSummary(state)).toContain('Warming Up');
  });

  it('shows thompson phase', () => {
    const state: BanditState = { agents: {}, totalDecisions: 150, lastUpdated: '' };
    expect(getBanditSummary(state)).toContain('Thompson Sampling');
  });
});
