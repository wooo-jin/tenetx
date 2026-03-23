/**
 * Tenetx Forge — Dimension Definitions
 *
 * 5개 핵심 차원의 메타데이터와 기본값 정의.
 * 각 차원은 0.0 ~ 1.0 연속값으로, 양극 레이블이 있음.
 */

import type { CoreDimension, DimensionMeta, DimensionVector } from './types.js';

/** 핵심 차원 메타데이터 */
export const DIMENSION_META: DimensionMeta[] = [
  {
    key: 'riskTolerance',
    label: '위험 감수도',
    lowLabel: 'conservative',
    highLabel: 'aggressive',
    description: '변경에 대한 신중함 vs 과감함',
  },
  {
    key: 'autonomyPreference',
    label: '자율성 선호',
    lowLabel: 'supervised',
    highLabel: 'autonomous',
    description: 'AI 행동에 대한 감독 vs 자율 허용',
  },
  {
    key: 'qualityFocus',
    label: '품질 초점',
    lowLabel: 'speed',
    highLabel: 'thoroughness',
    description: '빠른 결과 vs 철저한 검증',
  },
  {
    key: 'abstractionLevel',
    label: '추상화 수준',
    lowLabel: 'pragmatic',
    highLabel: 'architectural',
    description: '직접 구현 vs 설계 우선',
  },
  {
    key: 'communicationStyle',
    label: '커뮤니케이션 스타일',
    lowLabel: 'verbose',
    highLabel: 'terse',
    description: '상세 설명 vs 간결 응답',
  },
];

/** 모든 핵심 차원 키 */
export const CORE_DIMENSIONS: CoreDimension[] = DIMENSION_META.map(d => d.key);

/** 기본 차원 벡터 (모두 중립 0.5) */
export function defaultDimensionVector(): DimensionVector {
  return {
    riskTolerance: 0.5,
    autonomyPreference: 0.5,
    qualityFocus: 0.5,
    abstractionLevel: 0.5,
    communicationStyle: 0.5,
  };
}

/** 차원 값을 0.0 ~ 1.0 범위로 클램핑 */
export function clampDimension(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 차원 벡터에 델타 적용 (in-place mutation 없음) */
export function applyDeltas(
  vector: DimensionVector,
  deltas: Partial<Record<CoreDimension, number>>,
): DimensionVector {
  const result = { ...vector };
  for (const [key, delta] of Object.entries(deltas)) {
    if (typeof delta === 'number' && key in result) {
      result[key] = clampDimension((result[key] ?? 0.5) + delta);
    }
  }
  return result;
}

/** 차원 벡터의 유클리드 거리 계산 */
export function dimensionDistance(a: DimensionVector, b: DimensionVector): number {
  let sum = 0;
  for (const dim of CORE_DIMENSIONS) {
    const diff = (a[dim] ?? 0.5) - (b[dim] ?? 0.5);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/** 차원 값을 사람이 읽기 좋은 레이블로 변환 */
export function dimensionLabel(key: CoreDimension, value: number): string {
  const meta = DIMENSION_META.find(d => d.key === key);
  if (!meta) return `${value.toFixed(2)}`;

  if (value <= 0.25) return meta.lowLabel;
  if (value <= 0.45) return `leaning ${meta.lowLabel}`;
  if (value <= 0.55) return 'balanced';
  if (value <= 0.75) return `leaning ${meta.highLabel}`;
  return meta.highLabel;
}
