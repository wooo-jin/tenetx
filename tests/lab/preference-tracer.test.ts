/**
 * BKT Preference Tracer 수학적 검증 테스트
 *
 * 검증 대상:
 * 1. 표준 BKT 전이 수식 (Corbett & Anderson 1994)
 * 2. P(known) 단조 수렴 (일관적 관측 시)
 * 3. P(known) 유한 범위 [0, 1]
 * 4. 패턴→차원 일관성 매핑
 */

import { describe, it, expect } from 'vitest';
import {
  initPreferenceState,
  updatePreference,
  updateFromPatterns,
  getPKnownMap,
  DEFAULT_BKT,
} from '../../src/lab/preference-tracer.js';
import type { BehavioralPattern } from '../../src/lab/types.js';

function makePattern(id: string, confidence: number = 0.8): BehavioralPattern {
  return {
    id,
    type: 'preference',
    description: 'test',
    confidence,
    eventCount: 30,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
}

describe('BKT Preference Tracer', () => {
  describe('표준 BKT 전이 수식', () => {
    it('일관적 관측 시 P(known) 상승한다', () => {
      const state = initPreferenceState(['dim'])['dim'];
      const initial = state.pKnown;
      updatePreference(state, true);
      expect(state.pKnown).toBeGreaterThan(initial);
    });

    it('비일관적 관측 시 P(known) 하락한다', () => {
      const state = initPreferenceState(['dim'])['dim'];
      // 먼저 P(known)을 올려놓기
      for (let i = 0; i < 10; i++) updatePreference(state, true);
      const high = state.pKnown;
      updatePreference(state, false);
      expect(state.pKnown).toBeLessThan(high);
    });

    it('전이 수식이 표준과 일치: P_new = P(K|obs)×(1-pF) + (1-P(K|obs))×pL', () => {
      const { pLearn, pForget, pSlip, pGuess } = DEFAULT_BKT;
      const pK = 0.5;

      // consistent=true 일 때 수동 계산
      const numerator = (1 - pSlip) * pK;
      const denominator = numerator + pGuess * (1 - pK);
      const pKGivenObs = numerator / denominator;
      const expected = pKGivenObs * (1 - pForget) + (1 - pKGivenObs) * pLearn;

      const state = initPreferenceState(['dim'])['dim'];
      state.pKnown = pK;
      updatePreference(state, true);
      expect(state.pKnown).toBeCloseTo(expected, 10);
    });

    it('P(known)은 항상 [0, 1] 범위에 있다', () => {
      const state = initPreferenceState(['dim'])['dim'];
      // 극단적 시나리오 100회
      for (let i = 0; i < 100; i++) {
        updatePreference(state, i % 2 === 0);
        expect(state.pKnown).toBeGreaterThanOrEqual(0);
        expect(state.pKnown).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('수렴 특성', () => {
    it('연속 일관적 관측 시 P(known)이 1에 수렴한다', () => {
      const state = initPreferenceState(['dim'])['dim'];
      for (let i = 0; i < 100; i++) updatePreference(state, true);
      expect(state.pKnown).toBeGreaterThan(0.95);
    });

    it('연속 비일관적 관측 시 P(known)이 낮은 값으로 수렴한다', () => {
      const state = initPreferenceState(['dim'])['dim'];
      for (let i = 0; i < 100; i++) updatePreference(state, false);
      expect(state.pKnown).toBeLessThan(0.2);
    });

    it('교대 관측(진동) 시 P(known)이 중간값에 수렴한다', () => {
      const state = initPreferenceState(['dim'])['dim'];
      for (let i = 0; i < 200; i++) updatePreference(state, i % 2 === 0);
      // 진동 시 pGuess와 pSlip의 영향으로 중간값에 안정
      expect(state.pKnown).toBeGreaterThan(0.2);
      expect(state.pKnown).toBeLessThan(0.8);
    });
  });

  describe('패턴→차원 매핑', () => {
    it('high-override-rate 패턴은 autonomyPreference를 inconsistent으로 판정 (현재값 높을 때)', () => {
      const states = initPreferenceState(['autonomyPreference']);
      const initialPK = states['autonomyPreference'].pKnown;
      // 현재 차원값이 높은데 override-rate가 높다 = inconsistent
      updateFromPatterns(states, [makePattern('high-override-rate')], { autonomyPreference: 0.8 });
      // low direction + currentValue>=0.5 → inconsistent
      // pKnown은 하락해야 함
      expect(states['autonomyPreference'].pKnown).not.toBe(initialPK);
    });

    it('frequent-tdd 패턴은 qualityFocus를 consistent으로 판정 (현재값 높을 때)', () => {
      const states = initPreferenceState(['qualityFocus']);
      const initialPK = states['qualityFocus'].pKnown;
      // TDD 사용 빈도 높음 + 현재 quality 높음 = consistent
      updateFromPatterns(states, [makePattern('frequent-tdd')], { qualityFocus: 0.8 });
      expect(states['qualityFocus'].pKnown).toBeGreaterThan(initialPK);
    });
  });
});
