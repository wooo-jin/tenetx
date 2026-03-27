/**
 * Tenetx Forge — Shared Utilities
 *
 * 튜너 파일들에서 공통으로 사용하는 수학적 유틸리티 함수 모음.
 * 각 파일에 중복 정의되어 있던 함수들을 단일 출처(SSOT)로 통합.
 */

/** 선형 보간: t (0-1) 범위에서 a-b 사이 값 계산 */
export function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

/**
 * 0-1 값을 서술적 강도 부사로 변환.
 * 0.5 중심 대칭 — 0.5에서 멀수록 극단 표현.
 *
 * 0.85+  → 'extremely'
 * 0.7+   → 'highly'
 * 0.55+  → 'moderately'
 * 0.45+  → 'somewhat'
 * 0.3+   → 'moderately'
 * 0.15+  → 'highly'
 * 0.15-  → 'extremely'
 */
export function intensityWord(v: number): string {
  if (v >= 0.85) return 'extremely';
  if (v >= 0.7) return 'highly';
  if (v >= 0.55) return 'moderately';
  if (v >= 0.45) return 'somewhat';
  if (v >= 0.3) return 'moderately';
  if (v >= 0.15) return 'highly';
  return 'extremely';
}

/** 중립(0.5)에서의 편차 (0~0.5) */
export function deviation(value: number): number {
  return Math.abs(value - 0.5);
}
