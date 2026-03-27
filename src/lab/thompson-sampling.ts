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
 * Bayesian conjugate update: Normal prior × Normal likelihood → Normal posterior
 */
export function updatePosterior(
  state: ThompsonState,
  reward: SessionReward,
): void {
  const r = reward.reward;

  for (const [, post] of Object.entries(state.posteriors)) {
    // Bayesian update: posterior = prior × likelihood
    // Prior: N(mu_0, sigma2_0), Likelihood: N(reward, sigma2_obs)
    const sigma2_0 = post.sigma2;
    const newSigma2 = Math.max(MIN_SIGMA2,
      (sigma2_0 * SIGMA2_OBS) / (sigma2_0 + SIGMA2_OBS),
    );
    const newMu = (SIGMA2_OBS * post.mu + sigma2_0 * r) / (sigma2_0 + SIGMA2_OBS);

    post.mu = clamp01(newMu);
    post.sigma2 = newSigma2;
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

/**
 * BKT의 P(known)에 따라 탐색 강도(sigma2)를 조절합니다.
 * P(known) 높음 → sigma2 축소 (exploitation 모드)
 * P(known) 낮음 → sigma2 유지/증가 (exploration 모드)
 */
export function adjustSigmaWithBKT(
  state: ThompsonState,
  pKnownMap: Record<string, number>,
): void {
  for (const [dim, post] of Object.entries(state.posteriors)) {
    const pKnown = pKnownMap[dim] ?? 0.5;
    // pKnown=1.0 → factor=0.5 (sigma 절반), pKnown=0.0 → factor=1.5 (sigma 1.5배)
    const factor = 1.5 - pKnown;
    post.sigma2 = Math.max(MIN_SIGMA2, post.sigma2 * factor);
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
  return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 현재 posterior의 불확실성 수준을 반환 (평균 sigma) */
export function getUncertaintyLevel(state: ThompsonState): number {
  const sigmas = Object.values(state.posteriors).map(p => Math.sqrt(p.sigma2));
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
