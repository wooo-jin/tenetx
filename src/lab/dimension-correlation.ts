/**
 * Tenetx Lab — Dimension Correlation Engine (Forge v2)
 *
 * 5×5 공분산 행렬을 Welford 온라인 알고리즘으로 학습하여
 * 한 차원의 변경이 연관된 차원도 비례적으로 조정되도록 합니다.
 *
 * 예: riskTolerance↓ 일 때 qualityFocus↑가 함께 발생하는 패턴을 자동 학습.
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';

const log = createLogger('dimension-correlation');

const STATE_PATH = path.join(os.homedir(), '.compound', 'lab', 'dimension-correlation.json');

/** 5×5 공분산 상태 */
export interface CovarianceState {
  /** 차원 키 순서 */
  dimensions: string[];
  /** 공분산 행렬 (대칭) */
  matrix: number[][];
  /** 관측 수 */
  n: number;
  /** 차원별 평균 */
  means: number[];
  /** Welford M2 행렬 (분산 계산용) */
  m2: number[][];
  updatedAt: string;
}

/** 차원 목록으로 초기 상태 생성 */
export function initCovarianceState(dimensions: string[]): CovarianceState {
  const k = dimensions.length;
  const zeros = () => Array.from({ length: k }, () => 0);
  return {
    dimensions: [...dimensions],
    matrix: Array.from({ length: k }, zeros),
    n: 0,
    means: zeros(),
    m2: Array.from({ length: k }, zeros),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Welford 온라인 알고리즘으로 새 관측값을 업데이트합니다.
 * 한 번에 하나의 차원 벡터 관측을 추가.
 */
export function updateCovariance(
  state: CovarianceState,
  observation: Record<string, number>,
): void {
  const dims = state.dimensions;
  const k = dims.length;
  const x = dims.map(d => observation[d] ?? 0.5);

  state.n++;
  const n = state.n;

  // Welford online update for means and M2
  const delta: number[] = new Array(k);
  for (let i = 0; i < k; i++) {
    delta[i] = x[i] - state.means[i];
    state.means[i] += delta[i] / n;
  }

  const delta2: number[] = new Array(k);
  for (let i = 0; i < k; i++) {
    delta2[i] = x[i] - state.means[i];
  }

  // Update M2 matrix (cross products)
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      state.m2[i][j] += delta[i] * delta2[j];
      if (i !== j) state.m2[j][i] = state.m2[i][j]; // 대칭
    }
  }

  // Compute covariance matrix (with ridge regularization for stability)
  if (n >= 2) {
    const ridge = 0.001; // Tikhonov regularization
    for (let i = 0; i < k; i++) {
      for (let j = i; j < k; j++) {
        const cov = state.m2[i][j] / (n - 1);
        state.matrix[i][j] = i === j ? cov + ridge : cov;
        if (i !== j) state.matrix[j][i] = state.matrix[i][j];
      }
    }
  }

  state.updatedAt = new Date().toISOString();
}

/**
 * 상관 행렬을 반환합니다 (공분산을 표준편차로 정규화).
 * 값 범위: -1 ~ +1
 */
export function getCorrelationMatrix(state: CovarianceState): number[][] {
  const k = state.dimensions.length;
  const corr = Array.from({ length: k }, () => Array.from({ length: k }, () => 0));

  if (state.n < 3) return corr; // 데이터 부족

  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const si = Math.sqrt(state.matrix[i][i]);
      const sj = Math.sqrt(state.matrix[j][j]);
      corr[i][j] = si > 0 && sj > 0
        ? state.matrix[i][j] / (si * sj)
        : (i === j ? 1 : 0);
    }
  }
  return corr;
}

/**
 * 주 차원의 delta가 주어졌을 때, 연관된 차원의 coupled delta를 계산합니다.
 *
 * coupling_strength = min(0.5, n / 100) — 데이터 부족 시 약화
 * 최대 50%까지만 간접 조정하여 주 차원의 의도를 보존합니다.
 */
export function computeCoupledDeltas(
  state: CovarianceState,
  primaryDelta: Record<string, number>,
): Record<string, number> {
  const dims = state.dimensions;
  const k = dims.length;
  const coupled: Record<string, number> = {};

  // 데이터 부족 시 커플링 비활성화
  if (state.n < 20) return coupled;

  const couplingStrength = Math.min(0.5, state.n / 100);
  const corr = getCorrelationMatrix(state);

  for (let i = 0; i < k; i++) {
    const dim = dims[i];
    if (primaryDelta[dim] !== undefined) continue; // 주 차원은 건너뜀

    let coupledDelta = 0;
    for (let j = 0; j < k; j++) {
      const sourceDim = dims[j];
      const delta = primaryDelta[sourceDim];
      if (delta === undefined || i === j) continue;

      // 상관 계수 × 원본 delta × 커플링 강도
      coupledDelta += corr[i][j] * delta * couplingStrength;
    }

    if (Math.abs(coupledDelta) > 0.001) {
      coupled[dim] = coupledDelta;
    }
  }

  return coupled;
}

// ── Persistence ──

export function loadCovarianceState(): CovarianceState | null {
  return safeReadJSON<CovarianceState | null>(STATE_PATH, null);
}

export function saveCovarianceState(state: CovarianceState): void {
  try {
    atomicWriteJSON(STATE_PATH, state, { pretty: true });
  } catch (e) {
    log.debug('covariance state 저장 실패', e);
  }
}

/** 공분산 행렬 요약 (상관 > 0.3인 쌍만) */
export function summarizeCorrelations(
  state: CovarianceState,
): Array<{ dim1: string; dim2: string; correlation: number }> {
  const corr = getCorrelationMatrix(state);
  const result: Array<{ dim1: string; dim2: string; correlation: number }> = [];
  const dims = state.dimensions;

  for (let i = 0; i < dims.length; i++) {
    for (let j = i + 1; j < dims.length; j++) {
      if (Math.abs(corr[i][j]) >= 0.3) {
        result.push({ dim1: dims[i], dim2: dims[j], correlation: corr[i][j] });
      }
    }
  }

  return result.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}
