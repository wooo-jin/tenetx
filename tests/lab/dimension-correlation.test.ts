/**
 * Dimension Correlation (Welford) 수학적 검증 테스트
 *
 * 검증 대상:
 * 1. Welford 온라인 알고리즘 정확성 (Pebay 2008)
 * 2. 상관 행렬 범위 [-1, 1]
 * 3. Ridge 정규화 안정성
 * 4. Coupled delta 방향 정합성
 */

import { describe, it, expect } from 'vitest';
import {
  initCovarianceState,
  updateCovariance,
  getCorrelationMatrix,
  computeCoupledDeltas,
  summarizeCorrelations,
} from '../../src/lab/dimension-correlation.js';

describe('Dimension Correlation', () => {
  const dims = ['riskTolerance', 'qualityFocus'];

  describe('Welford 알고리즘', () => {
    it('관측 1개에서 공분산 행렬이 0이다 (n-1 분모)', () => {
      const state = initCovarianceState(dims);
      updateCovariance(state, { riskTolerance: 0.3, qualityFocus: 0.8 });
      expect(state.matrix[0][1]).toBe(0);
      expect(state.n).toBe(1);
    });

    it('완전 양의 상관 데이터에서 상관계수 ≈ 1.0', () => {
      const state = initCovarianceState(dims);
      // 완전 양의 상관: risk↑ = quality↑
      for (let i = 0; i < 50; i++) {
        const v = i / 50;
        updateCovariance(state, { riskTolerance: v, qualityFocus: v });
      }
      const corr = getCorrelationMatrix(state);
      expect(corr[0][1]).toBeGreaterThan(0.98); // ridge 정규화로 약간 축소
    });

    it('완전 음의 상관 데이터에서 상관계수 ≈ -1.0', () => {
      const state = initCovarianceState(dims);
      for (let i = 0; i < 50; i++) {
        const v = i / 50;
        updateCovariance(state, { riskTolerance: v, qualityFocus: 1 - v });
      }
      const corr = getCorrelationMatrix(state);
      expect(corr[0][1]).toBeLessThan(-0.98); // ridge 정규화로 약간 축소
    });

    it('무상관 데이터에서 상관계수 ≈ 0', () => {
      const state = initCovarianceState(dims);
      // 독립 랜덤 데이터 (시드 고정 대신 충분한 표본)
      const rng = mulberry32(42);
      for (let i = 0; i < 1000; i++) {
        updateCovariance(state, { riskTolerance: rng(), qualityFocus: rng() });
      }
      const corr = getCorrelationMatrix(state);
      expect(Math.abs(corr[0][1])).toBeLessThan(0.1);
    });

    it('상관 행렬의 대각 원소는 항상 ≈ 1.0', () => {
      const state = initCovarianceState(dims);
      for (let i = 0; i < 30; i++) {
        updateCovariance(state, { riskTolerance: Math.random(), qualityFocus: Math.random() });
      }
      const corr = getCorrelationMatrix(state);
      expect(corr[0][0]).toBeCloseTo(1.0, 1);
      expect(corr[1][1]).toBeCloseTo(1.0, 1);
    });
  });

  describe('coupled delta', () => {
    it('n < 20이면 coupled delta는 빈 객체', () => {
      const state = initCovarianceState(dims);
      for (let i = 0; i < 15; i++) {
        updateCovariance(state, { riskTolerance: i / 15, qualityFocus: i / 15 });
      }
      const coupled = computeCoupledDeltas(state, { riskTolerance: 0.1 });
      expect(Object.keys(coupled).length).toBe(0);
    });

    it('양의 상관이면 같은 방향으로 coupled delta', () => {
      const state = initCovarianceState(dims);
      for (let i = 0; i < 50; i++) {
        const v = i / 50;
        updateCovariance(state, { riskTolerance: v, qualityFocus: v });
      }
      const coupled = computeCoupledDeltas(state, { riskTolerance: 0.1 });
      // risk↑ → quality도 ↑ (양의 상관)
      expect(coupled['qualityFocus']).toBeGreaterThan(0);
    });

    it('음의 상관이면 반대 방향으로 coupled delta', () => {
      const state = initCovarianceState(dims);
      for (let i = 0; i < 50; i++) {
        const v = i / 50;
        updateCovariance(state, { riskTolerance: v, qualityFocus: 1 - v });
      }
      const coupled = computeCoupledDeltas(state, { riskTolerance: 0.1 });
      expect(coupled['qualityFocus']).toBeLessThan(0);
    });

    it('coupling_strength ≤ 0.5 (최대 50% 간접 조정)', () => {
      const state = initCovarianceState(dims);
      for (let i = 0; i < 200; i++) {
        const v = i / 200;
        updateCovariance(state, { riskTolerance: v, qualityFocus: v });
      }
      const coupled = computeCoupledDeltas(state, { riskTolerance: 0.2 });
      // 상관=1.0, coupling_strength=0.5 → coupled ≤ 0.2 * 0.5 = 0.1
      expect(Math.abs(coupled['qualityFocus'] ?? 0)).toBeLessThanOrEqual(0.11);
    });
  });
});

// Deterministic PRNG for reproducible tests (Mulberry32)
function mulberry32(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
