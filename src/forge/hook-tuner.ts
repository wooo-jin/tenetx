/**
 * Tenetx Forge — Hook Configuration Tuner
 *
 * 차원 벡터에서 훅별 세부 파라미터를 연속적으로 조정.
 * strict/balanced/relaxed 3단계 대신 연속값 기반 설정 생성.
 */

import type { DimensionVector, HookTuning } from './types.js';
import { lerp } from './shared-utils.js';

// ── Helpers ─────────────────────────────────────────

/** 정수 보간 */
function lerpInt(t: number, a: number, b: number): number {
  return Math.round(lerp(t, a, b));
}

// ── Hook Tuners ─────────────────────────────────────

type HookTuner = (dims: DimensionVector) => HookTuning;

/** 시크릿 필터: 항상 활성, 감도만 조정 */
const secretFilter: HookTuner = (dims) => {
  const quality = dims.qualityFocus ?? 0.5;
  const risk = dims.riskTolerance ?? 0.5;

  return {
    hookName: 'secret-filter',
    enabled: true, // 시크릿 필터는 항상 활성
    parameters: {
      // 보수적일수록 더 넓은 패턴 검사
      patternBreadth: risk <= 0.3 ? 'broad' : risk >= 0.7 ? 'narrow' : 'standard',
      // 품질 높으면 경고도 차단, 낮으면 확실한 것만
      blockOnWarning: quality >= 0.6,
      // 컨텍스트 윈도우에서 비밀 감지 범위 (줄 수)
      scanLines: lerpInt(quality, 50, 200),
    },
  };
};

/** 슬롭 감지기: 품질 차원에 따라 민감도 조정 */
const slopDetector: HookTuner = (dims) => {
  const quality = dims.qualityFocus ?? 0.5;
  const comm = dims.communicationStyle ?? 0.5;

  // 품질 낮으면 슬롭 감지 비활성화
  const enabled = quality >= 0.35;

  return {
    hookName: 'slop-detector',
    enabled,
    parameters: {
      // 임계값: 품질 높을수록 엄격 (낮은 값 = 더 엄격)
      threshold: Number(lerp(quality, 0.8, 0.2).toFixed(2)),
      // 간결 스타일이면 슬롭 기준도 간결 쪽으로 조정
      verbosityPenalty: comm >= 0.6,
      // 최대 허용 슬롭 패턴 수
      maxAllowedPatterns: lerpInt(1 - quality, 1, 10),
    },
  };
};

/** 컨텍스트 가드: 토큰 제한 관리 */
const contextGuard: HookTuner = (dims) => {
  const quality = dims.qualityFocus ?? 0.5;
  const autonomy = dims.autonomyPreference ?? 0.5;

  return {
    hookName: 'context-guard',
    enabled: true,
    parameters: {
      // 품질 높으면 토큰 절약 (에이전트 더 세심), 낮으면 넉넉하게
      maxTokens: lerpInt(quality, 200000, 50000),
      // 경고 임계값 (%)
      warningThreshold: lerpInt(quality, 60, 85),
      // 자율성 높으면 자동 컴팩트, 낮으면 확인
      autoCompact: autonomy >= 0.6,
    },
  };
};

/** pre-commit 검증 */
const preCommitValidation: HookTuner = (dims) => {
  const risk = dims.riskTolerance ?? 0.5;
  const quality = dims.qualityFocus ?? 0.5;

  // 둘 다 낮으면 비활성화
  const enabled = quality >= 0.3 || risk <= 0.4;

  return {
    hookName: 'pre-commit-validation',
    enabled,
    parameters: {
      // 린트 검사 활성
      runLint: quality >= 0.4,
      // 타입 검사 활성
      runTypeCheck: quality >= 0.6,
      // 테스트 실행 활성
      runTests: quality >= 0.7,
      // diff 크기 제한 (줄 수): 보수적일수록 작게
      maxDiffLines: lerpInt(risk, 100, 1000),
      // 타임아웃 (ms)
      timeout: lerpInt(quality, 3000, 10000),
    },
  };
};

/** DB 가드 */
const dbGuard: HookTuner = (dims) => {
  const risk = dims.riskTolerance ?? 0.5;

  return {
    hookName: 'db-guard',
    enabled: true,
    parameters: {
      // 위험 감수도 낮으면 모든 쿼리 차단, 높으면 DROP/TRUNCATE만
      blockLevel:
        risk <= 0.3 ? 'all-mutations' : risk >= 0.7 ? 'destructive-only' : 'write-operations',
      // 읽기 전용 모드 강제
      forceReadOnly: risk <= 0.2,
      // 쿼리 로깅
      logQueries: risk <= 0.4,
    },
  };
};

/** 레이트 리미터 */
const rateLimiter: HookTuner = (dims) => {
  const autonomy = dims.autonomyPreference ?? 0.5;
  const quality = dims.qualityFocus ?? 0.5;

  return {
    hookName: 'rate-limiter',
    enabled: true,
    parameters: {
      // 자율성 높으면 제한 완화
      maxCallsPerMinute: lerpInt(autonomy, 20, 60),
      // 품질 높으면 도구 호출 간 대기
      cooldownMs: lerpInt(1 - quality, 100, 500),
      // 동시 에이전트 수 제한
      maxConcurrentAgents: lerpInt(autonomy, 2, 5),
    },
  };
};

// ── Public API ──────────────────────────────────────

const ALL_HOOK_TUNERS: HookTuner[] = [
  secretFilter,
  slopDetector,
  contextGuard,
  preCommitValidation,
  dbGuard,
  rateLimiter,
];

/** 차원 벡터에서 훅별 세부 설정 생성 */
export function generateHookTuning(dims: DimensionVector): HookTuning[] {
  return ALL_HOOK_TUNERS.map((tuner) => tuner(dims));
}
