/**
 * Thompson Sampling 수학적 검증 테스트
 *
 * 검증 대상:
 * 1. REINFORCE credit assignment의 방향 정합성
 * 2. σ² 수렴 보장 (유한 범위 내 유지)
 * 3. posterior 초기화 정확성
 * 4. NaN/Infinity 방어
 * 5. 차원별 독립 학습 가능 증명
 */

import { describe, it, expect } from 'vitest';
import {
  initThompsonState,
  sampleFromPosteriors,
  updatePosterior,
  adjustSigmaWithBKT,
  getUncertaintyLevel,
  summarizePosteriors,
} from '../../src/lab/thompson-sampling.js';
import type { SessionReward } from '../../src/lab/types.js';

function makeReward(reward: number, snapshot: Record<string, number> = {}): SessionReward {
  return {
    sessionId: 'test',
    timestamp: new Date().toISOString(),
    dimensionSnapshot: snapshot,
    components: { nonOverrideRate: reward, successRate: reward, costEfficiency: 0.5, durationScore: 0.5, lowBlockRate: 1 },
    reward,
  };
}

describe('Thompson Sampling', () => {
  const dims = { riskTolerance: 0.4, autonomyPreference: 0.6, qualityFocus: 0.7, abstractionLevel: 0.5, communicationStyle: 0.3 };

  describe('initThompsonState', () => {
    it('각 차원의 mu가 초기값과 일치한다', () => {
      const state = initThompsonState(dims);
      for (const [dim, val] of Object.entries(dims)) {
        expect(state.posteriors[dim].mu).toBe(val);
        expect(state.posteriors[dim].sigma2).toBe(0.04);
        expect(state.posteriors[dim].n).toBe(0);
      }
    });
  });

  describe('sampleFromPosteriors', () => {
    it('샘플이 [0, 1] 범위 내에 있다', () => {
      const state = initThompsonState(dims);
      for (let i = 0; i < 100; i++) {
        const sample = sampleFromPosteriors(state);
        for (const val of Object.values(sample)) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(1);
        }
      }
    });

    it('totalSamples가 증가한다', () => {
      const state = initThompsonState(dims);
      sampleFromPosteriors(state);
      sampleFromPosteriors(state);
      expect(state.totalSamples).toBe(2);
    });
  });

  describe('REINFORCE credit assignment', () => {
    it('보상이 높고 샘플이 mu 위에 있으면 mu가 상승한다', () => {
      const state = initThompsonState({ testDim: 0.5 });
      // 첫 관측을 baseline으로 쌓기 위해 중립 보상 추가
      updatePosterior(state, makeReward(0.5, { testDim: 0.5 }));

      const muBefore = state.posteriors['testDim'].mu;
      // 높은 보상 + mu보다 높은 샘플 → mu 상승
      updatePosterior(state, makeReward(0.9, { testDim: 0.7 }));
      expect(state.posteriors['testDim'].mu).toBeGreaterThan(muBefore);
    });

    it('보상이 높고 샘플이 mu 아래에 있으면 mu가 하락한다', () => {
      const state = initThompsonState({ testDim: 0.5 });
      updatePosterior(state, makeReward(0.5, { testDim: 0.5 }));

      const muBefore = state.posteriors['testDim'].mu;
      // 높은 보상 + mu보다 낮은 샘플 → mu 하락
      updatePosterior(state, makeReward(0.9, { testDim: 0.3 }));
      expect(state.posteriors['testDim'].mu).toBeLessThan(muBefore);
    });

    it('보상이 baseline과 같으면 mu가 변하지 않는다 (advantage=0)', () => {
      const state = initThompsonState({ testDim: 0.5 });
      // baseline = 0.6이 되도록 여러 관측
      for (let i = 0; i < 5; i++) {
        updatePosterior(state, makeReward(0.6, { testDim: 0.5 }));
      }
      const muBefore = state.posteriors['testDim'].mu;
      // 보상 = baseline → advantage ≈ 0 → 변화 미미
      updatePosterior(state, makeReward(0.6, { testDim: 0.8 }));
      expect(Math.abs(state.posteriors['testDim'].mu - muBefore)).toBeLessThan(0.001);
    });

    it('차원별 독립 학습: 한 차원의 변화가 다른 차원에 영향주지 않는다', () => {
      const state = initThompsonState({ dimA: 0.3, dimB: 0.7 });
      updatePosterior(state, makeReward(0.5, { dimA: 0.3, dimB: 0.7 }));

      // dimA만 mu에서 크게 벗어난 샘플 + 높은 보상
      updatePosterior(state, makeReward(0.9, { dimA: 0.8, dimB: 0.7 }));

      // dimA는 크게 변했지만 dimB는 거의 변하지 않아야 함 (z ≈ 0)
      const deltaA = Math.abs(state.posteriors['dimA'].mu - 0.3);
      const deltaB = Math.abs(state.posteriors['dimB'].mu - 0.7);
      expect(deltaA).toBeGreaterThan(deltaB * 5); // dimA 변화가 dimB의 5배 이상
    });
  });

  describe('σ² 수렴 보장', () => {
    it('σ²는 항상 [MIN_SIGMA2, 초기값] 범위에 있다', () => {
      const state = initThompsonState({ d: 0.5 });
      for (let i = 0; i < 100; i++) {
        updatePosterior(state, makeReward(Math.random(), { d: Math.random() }));
      }
      expect(state.posteriors['d'].sigma2).toBeGreaterThanOrEqual(0.001);
      expect(state.posteriors['d'].sigma2).toBeLessThanOrEqual(0.04);
    });

    it('BKT 조절 후에도 σ²는 유한 범위 [MIN, MAX] 내에 있다', () => {
      const state = initThompsonState({ d: 0.5 });
      // P(known)=0 (최대 탐색) 반복 적용
      for (let i = 0; i < 50; i++) {
        adjustSigmaWithBKT(state, { d: 0.0 });
      }
      expect(state.posteriors['d'].sigma2).toBeLessThanOrEqual(0.1); // MAX_SIGMA2
      expect(state.posteriors['d'].sigma2).toBeGreaterThanOrEqual(0.001);

      // P(known)=1 (최소 탐색) 반복 적용
      for (let i = 0; i < 50; i++) {
        adjustSigmaWithBKT(state, { d: 1.0 });
      }
      expect(state.posteriors['d'].sigma2).toBeGreaterThanOrEqual(0.001);
    });
  });

  describe('NaN 방어', () => {
    it('NaN 보상은 무시된다', () => {
      const state = initThompsonState({ d: 0.5 });
      const muBefore = state.posteriors['d'].mu;
      updatePosterior(state, makeReward(NaN, { d: 0.6 }));
      expect(state.posteriors['d'].mu).toBe(muBefore);
    });

    it('Infinity 보상은 무시된다', () => {
      const state = initThompsonState({ d: 0.5 });
      const muBefore = state.posteriors['d'].mu;
      updatePosterior(state, makeReward(Infinity, { d: 0.6 }));
      expect(state.posteriors['d'].mu).toBe(muBefore);
    });

    it('빈 posterior에서 getUncertaintyLevel은 0을 반환한다', () => {
      const state = { posteriors: {}, observations: [], lastSample: null, totalSamples: 0 };
      expect(getUncertaintyLevel(state)).toBe(0);
    });
  });
});
