/**
 * Tenetx Lab — Gaussian Thompson Sampling Engine (Forge v2)
 *
 * 각 차원에 Normal(μ, σ²) 사후 분포를 유지하고,
 * 세션 시작 시 샘플링, 세션 종료 시 보상으로 업데이트합니다.
 *
 * 학술 근거:
 * - Desai et al. 2025: Thompson Sampling + contextual bandit → 15-30% 개선, 20-30 쿼리 수렴
 * - Agrawal & Goyal 2013: Thompson Sampling regret bound O(√T)
 *
 * 이산 MAB 대신 Gaussian TS를 선택한 이유:
 * 5차원 × 10구간 = 50 arms는 데이터 효율이 나쁨.
 * Gaussian TS는 연속 공간에서 직접 작동하여 20-30 세션이면 수렴 가능.
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';
import type { GaussianPosterior, SessionReward } from './types.js';

const log = createLogger('thompson-sampling');

const STATE_PATH = path.join(os.homedir(), '.compound', 'lab', 'thompson-state.json');

/** 관측 노이즈 분산 (보상 신호의 본질적 노이즈) */
const SIGMA2_OBS = 0.05;

/** 최소 분산 (과적합 방지 — 완전 수렴 후에도 약간의 탐색 유지) */
const MIN_SIGMA2 = 0.001;

/** 최대 관측 이력 */
const MAX_OBSERVATIONS = 200;

// ── Types ──

export interface ThompsonState {
  posteriors: Record<string, GaussianPosterior>;
  observations: Array<{
    dimensionValues: Record<string, number>;
    reward: number;
    timestamp: string;
  }>;
  lastSample: Record<string, number> | null;
  totalSamples: number;
}

// ── Initialization ──

/** 현재 차원 벡터에서 Thompson Sampling 초기 상태 생성 */
export function initThompsonState(
  currentDimensions: Record<string, number>,
): ThompsonState {
  const posteriors: Record<string, GaussianPosterior> = {};
  for (const [dim, value] of Object.entries(currentDimensions)) {
    posteriors[dim] = {
      mu: value,
      sigma2: 0.04, // σ = 0.2 → 95% CI = ±0.4 (넓은 초기 탐색)
      n: 0,
      rewardSum: 0,
      rewardSumSq: 0,
    };
  }
  return { posteriors, observations: [], lastSample: null, totalSamples: 0 };
}

// ── Core Algorithm ──

/**
 * Gaussian posterior에서 샘플링하여 차원 벡터 생성.
 * Box-Muller transform으로 정규분포 샘플링.
 */
export function sampleFromPosteriors(
  state: ThompsonState,
): Record<string, number> {
  const sample: Record<string, number> = {};
  for (const [dim, post] of Object.entries(state.posteriors)) {
    const raw = post.mu + Math.sqrt(post.sigma2) * boxMullerSample();
    sample[dim] = clamp01(raw);
  }
  state.lastSample = sample;
  state.totalSamples++;
  return sample;
}

/**
 * 세션 보상으로 사후 분포를 업데이트합니다.
 *
 * REINFORCE-style credit assignment:
 * 각 차원의 기여도를 (sample_i - μ_i) / σ_i 방향으로 분리합니다.
 * 보상이 높고 해당 차원이 mu에서 벗어난 방향이면 그 방향을 강화.
 *
 * Δμ_i = α × (r - baseline) × z_i  where z_i = (sample_i - μ_i) / σ_i
 * σ²_i는 관측 수에 따라 shrink (Normal-Normal conjugate)
 *
 * 학술 근거: Williams (1992) REINFORCE, Xu et al. (2021) Meta-Thompson Sampling
 */
export function updatePosterior(
  state: ThompsonState,
  reward: SessionReward,
): void {
  const r = reward.reward;
  if (!isFinite(r)) return; // NaN/Infinity 방어

  // baseline: 최근 관측의 이동 평균 (variance reduction)
  const recentRewards = state.observations.slice(-20).map(o => o.reward);
  const baseline = recentRewards.length > 0
    ? recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length
    : 0.5; // 중립 baseline

  const advantage = r - baseline; // positive = 이번 설정이 평균보다 좋았음
  const snapshot = reward.dimensionSnapshot;

  for (const [dim, post] of Object.entries(state.posteriors)) {
    const sampleValue = snapshot[dim] ?? post.mu;
    const sigma = Math.sqrt(post.sigma2);

    // z-score: 이 차원이 mu에서 얼마나 벗어났는지 (방향 + 크기)
    const z = sigma > 1e-8 ? (sampleValue - post.mu) / sigma : 0;

    // REINFORCE gradient: advantage × z
    // α는 sigma에 비례 — 불확실한 차원일수록 큰 업데이트
    const alpha = Math.min(0.1, post.sigma2); // 최대 학습률 0.1
    const muDelta = alpha * advantage * z;

    post.mu = clamp01(post.mu + muDelta);

    // σ² shrink: Normal-Normal conjugate (관측 수 기반 불확실성 감소)
    // 관측이 쌓일수록 자연스럽게 exploitation으로 전환
    const sigma2_0 = post.sigma2;
    post.sigma2 = Math.max(MIN_SIGMA2,
      (sigma2_0 * SIGMA2_OBS) / (sigma2_0 + SIGMA2_OBS),
    );

    post.n++;
    post.rewardSum += r;
    post.rewardSumSq += r * r;
  }

  // 관측 이력 추가 (FIFO)
  state.observations.push({
    dimensionValues: reward.dimensionSnapshot,
    reward: r,
    timestamp: reward.timestamp,
  });
  if (state.observations.length > MAX_OBSERVATIONS) {
    state.observations = state.observations.slice(-MAX_OBSERVATIONS);
  }
}

/** 초기 σ² (탐색 범위 기준점) */
const BASE_SIGMA2 = 0.04;
/** σ² 상한 (폭발 방지) */
const MAX_SIGMA2 = 0.1;

/**
 * BKT의 P(known)에 따라 탐색 강도(sigma2)를 함수적으로 설정합니다.
 *
 * 곱셈 누적 대신 직접 함수 설정으로 σ² 폭발/수축 방지:
 * σ² = BASE_SIGMA2 × (1.5 - pKnown) × decay(n)
 *
 * P(known)=0 → σ² = BASE × 1.5 (최대 탐색)
 * P(known)=1 → σ² = BASE × 0.5 (최소 탐색)
 * decay(n) = max(0.2, 1 / (1 + n/30)) — 관측이 쌓이면 자연 감소
 *
 * 유한 범위 보장: MIN_SIGMA2 ≤ σ² ≤ MAX_SIGMA2
 */
export function adjustSigmaWithBKT(
  state: ThompsonState,
  pKnownMap: Record<string, number>,
): void {
  for (const [dim, post] of Object.entries(state.posteriors)) {
    const pKnown = pKnownMap[dim] ?? 0.5;
    const explorationFactor = 1.5 - pKnown; // [0.5, 1.5]
    const decay = Math.max(0.2, 1 / (1 + post.n / 30)); // [0.2, 1.0]
    post.sigma2 = Math.max(MIN_SIGMA2, Math.min(MAX_SIGMA2,
      BASE_SIGMA2 * explorationFactor * decay,
    ));
  }
}

// ── Persistence ──

export function loadThompsonState(): ThompsonState | null {
  return safeReadJSON<ThompsonState | null>(STATE_PATH, null);
}

export function saveThompsonState(state: ThompsonState): void {
  try {
    atomicWriteJSON(STATE_PATH, state, { pretty: true });
  } catch (e) {
    log.debug('Thompson state 저장 실패', e);
  }
}

// ── Utilities ──

/** Box-Muller transform: uniform(0,1) → standard normal */
function boxMullerSample(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, Number.EPSILON))) * Math.cos(2 * Math.PI * u2);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 현재 posterior의 불확실성 수준을 반환 (평균 sigma) */
export function getUncertaintyLevel(state: ThompsonState): number {
  const posteriorValues = Object.values(state.posteriors);
  if (posteriorValues.length === 0) return 0;
  const sigmas = posteriorValues.map(p => Math.sqrt(p.sigma2));
  return sigmas.reduce((a, b) => a + b, 0) / sigmas.length;
}

/** posterior 요약 (디버그/대시보드용) */
export function summarizePosteriors(
  state: ThompsonState,
): Array<{ dimension: string; mu: number; sigma: number; n: number }> {
  return Object.entries(state.posteriors).map(([dim, p]) => ({
    dimension: dim,
    mu: p.mu,
    sigma: Math.sqrt(p.sigma2),
    n: p.n,
  }));
}
