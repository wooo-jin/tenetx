/**
 * Tenetx Lab — BKT Preference Tracer (Forge v2)
 *
 * Bayesian Knowledge Tracing의 4-파라미터 모델을 차원 선호 학습에 적용.
 * 사용자가 특정 차원에 안정적 선호를 형성했는지를 확률적으로 추적합니다.
 *
 * Thompson Sampling의 σ² 조절기 역할:
 * - P(known) 높음 → exploitation 모드 (안정적 선호 존중)
 * - P(known) 낮음 → exploration 모드 (아직 학습 중)
 *
 * 학술 근거:
 * - Knowledge Tracing → Preference Tracing (2025, ECRA)
 * - 4파라미터: P(learn), P(forget), P(slip), P(guess)
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';
import type { BKTParameters, PreferenceState, BehavioralPattern } from './types.js';

const log = createLogger('preference-tracer');

const STATE_PATH = path.join(os.homedir(), '.compound', 'lab', 'preference-state.json');
const MAX_OBSERVATIONS = 100;
const MIN_OBSERVATIONS_FOR_EM = 50;

/** 기본 BKT 파라미터 */
export const DEFAULT_BKT: BKTParameters = {
  pLearn: 0.1,    // 10세션에 1번 선호 형성
  pForget: 0.02,  // 50세션에 1번 선호 변화
  pSlip: 0.1,     // 10% 실수율
  pGuess: 0.5,    // 50% 우연 일치율 (binary consistent/inconsistent의 base rate)
};

// ── 패턴 → 차원 매핑 (일관성 판정에 사용) ──

/** 각 패턴이 어떤 차원의 어떤 방향을 의미하는지 */
const PATTERN_DIMENSION_MAP: Record<string, { dimension: string; direction: 'high' | 'low' }> = {
  'high-override-rate': { dimension: 'autonomyPreference', direction: 'low' },
  'low-intervention': { dimension: 'autonomyPreference', direction: 'high' },
  'low-review-acceptance': { dimension: 'qualityFocus', direction: 'low' },
  'frequent-tdd': { dimension: 'qualityFocus', direction: 'high' },
  'frequent-escalation': { dimension: 'qualityFocus', direction: 'high' },
  'verbose-override': { dimension: 'communicationStyle', direction: 'high' },
  'frequent-architect': { dimension: 'abstractionLevel', direction: 'high' },
  'frequent-security-blocks': { dimension: 'riskTolerance', direction: 'low' },
  // v2 양방향 패턴
  'risk-tolerance-up': { dimension: 'riskTolerance', direction: 'high' },
  'communication-verbose': { dimension: 'communicationStyle', direction: 'low' },
  'abstraction-pragmatic': { dimension: 'abstractionLevel', direction: 'low' },
};

// ── Initialization ──

/** 차원별 BKT 초기 상태 생성 */
export function initPreferenceState(dimensions: string[]): Record<string, PreferenceState> {
  const states: Record<string, PreferenceState> = {};
  for (const dim of dimensions) {
    states[dim] = {
      pKnown: 0.3, // 초기: 아직 선호를 잘 모름
      observations: [],
      params: { ...DEFAULT_BKT },
    };
  }
  return states;
}

// ── Core BKT Update ──

/**
 * 관측 결과로 P(known) 업데이트.
 *
 * consistent = true: 현재 차원 설정과 일치하는 행동 관측
 * consistent = false: 현재 차원 설정과 반대되는 행동 관측
 */
export function updatePreference(
  state: PreferenceState,
  consistent: boolean,
): void {
  const { pSlip, pGuess, pLearn, pForget } = state.params;
  const pK = state.pKnown;

  // Bayes update
  let pKnownGivenObs: number;
  if (consistent) {
    // P(known|correct) = (1-pSlip)*P(known) / ((1-pSlip)*P(known) + pGuess*(1-P(known)))
    const numerator = (1 - pSlip) * pK;
    const denominator = numerator + pGuess * (1 - pK);
    pKnownGivenObs = denominator > 0 ? numerator / denominator : pK;
  } else {
    // P(known|incorrect) = pSlip*P(known) / (pSlip*P(known) + (1-pGuess)*(1-P(known)))
    const numerator = pSlip * pK;
    const denominator = numerator + (1 - pGuess) * (1 - pK);
    pKnownGivenObs = denominator > 0 ? numerator / denominator : pK;
  }

  // 표준 BKT 전이 (Corbett & Anderson 1994, Yudelson et al. 2013):
  // P(K_t) = P(K|obs) × (1 - pForget) + (1 - P(K|obs)) × pLearn
  // learn과 forget이 독립 전이 — 곱셈 상호작용 방지
  state.pKnown = Math.max(0, Math.min(1,
    pKnownGivenObs * (1 - pForget) + (1 - pKnownGivenObs) * pLearn,
  ));

  // 관측 이력 (FIFO)
  state.observations.push({ consistent, timestamp: new Date().toISOString() });
  if (state.observations.length > MAX_OBSERVATIONS) {
    state.observations = state.observations.slice(-MAX_OBSERVATIONS);
  }
}

/**
 * 감지된 패턴으로부터 각 차원의 일관성 관측을 수행합니다.
 * 현재 차원값과 패턴이 가리키는 방향을 비교하여 consistent 여부를 결정.
 */
export function updateFromPatterns(
  states: Record<string, PreferenceState>,
  patterns: BehavioralPattern[],
  currentDimensions: Record<string, number>,
): void {
  for (const pattern of patterns) {
    const mapping = PATTERN_DIMENSION_MAP[pattern.id];
    if (!mapping) continue;

    const state = states[mapping.dimension];
    if (!state) continue;

    const currentValue = currentDimensions[mapping.dimension] ?? 0.5;
    // Dead zone: 0.4~0.6에서는 방향이 불확실하므로 관측 건너뛰기
    // 경계 근처의 무의미한 flip으로 BKT 진동 방지
    if (currentValue >= 0.4 && currentValue <= 0.6) continue;
    // 현재 차원값이 패턴 방향과 일치하는지 판정
    const consistent = mapping.direction === 'high'
      ? currentValue > 0.6
      : currentValue < 0.4;

    updatePreference(state, consistent);
  }
}

/**
 * 모든 차원의 P(known) 맵을 반환합니다.
 * Thompson Sampling의 sigma 조절에 사용.
 */
export function getPKnownMap(
  states: Record<string, PreferenceState>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [dim, state] of Object.entries(states)) {
    result[dim] = state.pKnown;
  }
  return result;
}

// ── EM Algorithm for Parameter Re-estimation ──

/**
 * 축적된 관측 데이터로 BKT 파라미터를 재추정합니다.
 * 관측 50+ 이후에만 실행.
 */
export function reEstimateParameters(state: PreferenceState): void {
  if (state.observations.length < MIN_OBSERVATIONS_FOR_EM) return;

  const obs = state.observations;
  const n = obs.length;
  const consistentCount = obs.filter(o => o.consistent).length;
  const consistentRate = consistentCount / n;

  // Simplified moment matching (full EM은 구현 복잡도가 높으므로)
  // P(guess) ≈ inconsistent rate when pKnown is low
  // P(slip) ≈ inconsistent rate when pKnown is high
  const recentObs = obs.slice(-20);
  const recentConsistentRate = recentObs.filter(o => o.consistent).length / recentObs.length;

  // 전체 일관성이 높으면 pLearn 증가, 낮으면 감소
  state.params.pLearn = clamp(0.01, 0.3, consistentRate * 0.2);

  // 최근 일관성이 전체보다 낮으면 pForget 증가 (선호 변화 감지)
  if (recentConsistentRate < consistentRate - 0.1) {
    state.params.pForget = clamp(0.01, 0.1, state.params.pForget + 0.01);
  }

  // pSlip은 높은 pKnown 상태에서의 비일관 비율로 추정
  if (state.pKnown > 0.7) {
    state.params.pSlip = clamp(0.01, 0.3, 1 - recentConsistentRate);
  }

  // pGuess는 낮은 pKnown 상태에서의 일관 비율로 추정
  if (state.pKnown < 0.3) {
    state.params.pGuess = clamp(0.1, 0.5, recentConsistentRate);
  }
}

// ── Persistence ──

export function loadPreferenceStates(): Record<string, PreferenceState> | null {
  return safeReadJSON<Record<string, PreferenceState> | null>(STATE_PATH, null);
}

export function savePreferenceStates(states: Record<string, PreferenceState>): void {
  try {
    atomicWriteJSON(STATE_PATH, states, { pretty: true });
  } catch (e) {
    log.debug('preference state 저장 실패', e);
  }
}

// ── Utilities ──

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}
