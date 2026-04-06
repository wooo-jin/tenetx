/**
 * Tenetx v1 — Data Model Types
 *
 * Authoritative source: docs/plans/2026-04-03-tenetx-data-model-storage-spec.md
 * Runtime contracts: docs/plans/2026-04-03-tenetx-component-interface-design.md
 */

// ── Quality packs ──

export type QualityPack = '보수형' | '균형형' | '속도형';

// ── Autonomy packs ──

export type AutonomyPack = '확인 우선형' | '균형형' | '자율 실행형';

// ── Judgment packs ──

export type JudgmentPack = '최소변경형' | '균형형' | '구조적접근형';

// ── Communication packs ──

export type CommunicationPack = '간결형' | '균형형' | '상세형';

// ── Trust policy ──

export type TrustPolicy = '가드레일 우선' | '승인 완화' | '완전 신뢰 실행';

// ── Rule ──

export type RuleCategory = 'quality' | 'autonomy' | 'communication' | 'workflow' | 'safety';
export type RuleScope = 'me' | 'session';
export type RuleStrength = 'soft' | 'default' | 'strong' | 'hard';
export type RuleSource = 'onboarding' | 'explicit_correction' | 'behavior_inference' | 'pack_overlay';
export type RuleStatus = 'active' | 'suppressed' | 'removed' | 'superseded';

export interface Rule {
  rule_id: string;
  category: RuleCategory;
  scope: RuleScope;
  trigger: string;
  policy: string;
  strength: RuleStrength;
  source: RuleSource;
  status: RuleStatus;
  evidence_refs: string[];
  render_key: string;
  created_at: string;
  updated_at: string;
}

// ── Evidence ──

export type EvidenceType = 'explicit_correction' | 'behavior_observation' | 'session_summary';

export interface Evidence {
  evidence_id: string;
  type: EvidenceType;
  session_id: string;
  timestamp: string;
  source_component: string;
  summary: string;
  axis_refs: string[];
  candidate_rule_refs: string[];
  confidence: number;
  raw_payload: Record<string, unknown>;
}

// ── Facets ──

export interface QualityFacets {
  verification_depth: number;
  stop_threshold: number;
  change_conservatism: number;
}

export interface AutonomyFacets {
  confirmation_independence: number;
  assumption_tolerance: number;
  scope_expansion_tolerance: number;
  approval_threshold: number;
}

export interface JudgmentFacets {
  minimal_change_bias: number;
  abstraction_bias: number;
  evidence_first_bias: number;
}

export interface CommunicationFacets {
  verbosity: number;
  structure: number;
  teaching_bias: number;
}

// ── Axis ──

export interface Axis<F> {
  score: number;
  facets: F;
  confidence: number;
}

// ── Profile ──

export interface Profile {
  user_id: string;
  model_version: string;
  axes: {
    quality_safety: Axis<QualityFacets>;
    autonomy: Axis<AutonomyFacets>;
    judgment_philosophy: Axis<JudgmentFacets>;
    communication_style: Axis<CommunicationFacets>;
  };
  base_packs: {
    quality_pack: QualityPack;
    autonomy_pack: AutonomyPack;
    judgment_pack: JudgmentPack;
    communication_pack: CommunicationPack;
  };
  trust_preferences: {
    desired_policy: TrustPolicy;
    source: 'onboarding' | 'user_override' | 'mismatch_recommendation';
  };
  metadata: {
    created_at: string;
    updated_at: string;
    last_onboarding_at: string;
    last_reclassification_at: string | null;
  };
}

// ── Pack Recommendation ──

export type RecommendationSource = 'onboarding' | 'mismatch_recommendation';
export type RecommendationStatus = 'proposed' | 'accepted' | 'archived';

export interface PackRecommendation {
  recommendation_id: string;
  source: RecommendationSource;
  quality_pack: QualityPack;
  autonomy_pack: AutonomyPack;
  judgment_pack: JudgmentPack;
  communication_pack: CommunicationPack;
  suggested_trust_policy: TrustPolicy;
  confidence: number;
  reason_summary: string;
  status: RecommendationStatus;
  created_at: string;
}

// ── Session Effective State ──

export type PermissionMode = 'guarded' | 'relaxed' | 'bypassed';

export interface RuntimeCapabilityState {
  permission_mode: PermissionMode;
  dangerous_skip_permissions: boolean;
  auto_accept_scope: string[];
  detected_from: string;
}

export interface SessionEffectiveState {
  session_id: string;
  profile_version: string;
  quality_pack: QualityPack;
  autonomy_pack: AutonomyPack;
  judgment_pack: JudgmentPack;
  communication_pack: CommunicationPack;
  effective_trust_policy: TrustPolicy;
  active_rule_ids: string[];
  temporary_overlays: Rule[];
  runtime_capability_state: RuntimeCapabilityState;
  warnings: string[];
  started_at: string;
  ended_at: string | null;
}

// ── Correction ──

export type CorrectionKind = 'fix-now' | 'prefer-from-now' | 'avoid-this';

export interface CorrectionRequest {
  session_id: string;
  kind: CorrectionKind;
  message: string;
  target: string;
  axis_hint: 'quality_safety' | 'autonomy' | 'judgment_philosophy' | 'communication_style' | null;
}

export interface CorrectionResult {
  temporary_rule: Rule | null;
  evidence_event_id: string;
  recompose_required: boolean;
  promotion_candidate: boolean;
}

// ── Session Learning Summary ──

export interface SessionLearningSummary {
  session_id: string;
  explicit_corrections: Evidence[];
  behavior_observations: Evidence[];
  session_summary_evidence: Evidence | null;
  rule_candidates: string[];
  knowledge_candidates: string[];
  profile_delta_suggestion: Partial<{
    quality_safety: Partial<QualityFacets>;
    autonomy: Partial<AutonomyFacets>;
  }> | null;
  pack_mismatch_candidate: boolean;
}
