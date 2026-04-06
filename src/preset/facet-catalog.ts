/**
 * Tenetx v1 — Facet Catalog
 *
 * Authoritative source: docs/plans/2026-04-03-tenetx-facet-catalog.md
 * 모든 facet 값 범위: 0.0 ~ 1.0
 */

import type {
  QualityPack,
  AutonomyPack,
  JudgmentPack,
  CommunicationPack,
  QualityFacets,
  AutonomyFacets,
  JudgmentFacets,
  CommunicationFacets,
} from '../store/types.js';

// ── Quality centroids ──

export const QUALITY_CENTROIDS: Record<QualityPack, QualityFacets> = {
  '보수형': { verification_depth: 0.90, stop_threshold: 0.85, change_conservatism: 0.80 },
  '균형형': { verification_depth: 0.60, stop_threshold: 0.55, change_conservatism: 0.55 },
  '속도형': { verification_depth: 0.35, stop_threshold: 0.20, change_conservatism: 0.30 },
};

// ── Autonomy centroids ──

export const AUTONOMY_CENTROIDS: Record<AutonomyPack, AutonomyFacets> = {
  '확인 우선형': { confirmation_independence: 0.15, assumption_tolerance: 0.30, scope_expansion_tolerance: 0.35, approval_threshold: 0.25 },
  '균형형':     { confirmation_independence: 0.50, assumption_tolerance: 0.55, scope_expansion_tolerance: 0.55, approval_threshold: 0.60 },
  '자율 실행형': { confirmation_independence: 0.80, assumption_tolerance: 0.85, scope_expansion_tolerance: 0.90, approval_threshold: 0.90 },
};

// ── Judgment centroids ──

export const JUDGMENT_CENTROIDS: Record<JudgmentPack, JudgmentFacets> = {
  '최소변경형': { minimal_change_bias: 0.85, abstraction_bias: 0.20, evidence_first_bias: 0.80 },
  '균형형':     { minimal_change_bias: 0.50, abstraction_bias: 0.50, evidence_first_bias: 0.50 },
  '구조적접근형': { minimal_change_bias: 0.20, abstraction_bias: 0.85, evidence_first_bias: 0.70 },
};

// ── Communication centroids ──

export const COMMUNICATION_CENTROIDS: Record<CommunicationPack, CommunicationFacets> = {
  '간결형': { verbosity: 0.15, structure: 0.70, teaching_bias: 0.20 },
  '균형형': { verbosity: 0.50, structure: 0.50, teaching_bias: 0.50 },
  '상세형': { verbosity: 0.85, structure: 0.80, teaching_bias: 0.80 },
};

// ── Defaults (backward compat) ──

export const DEFAULT_JUDGMENT_FACETS: JudgmentFacets = JUDGMENT_CENTROIDS['균형형'];
export const DEFAULT_COMMUNICATION_FACETS: CommunicationFacets = COMMUNICATION_CENTROIDS['균형형'];

// ── Utilities ──

export function qualityCentroid(pack: QualityPack): QualityFacets {
  return { ...QUALITY_CENTROIDS[pack] };
}

export function autonomyCentroid(pack: AutonomyPack): AutonomyFacets {
  return { ...AUTONOMY_CENTROIDS[pack] };
}

export function judgmentCentroid(pack: JudgmentPack): JudgmentFacets {
  return { ...JUDGMENT_CENTROIDS[pack] };
}

export function communicationCentroid(pack: CommunicationPack): CommunicationFacets {
  return { ...COMMUNICATION_CENTROIDS[pack] };
}
