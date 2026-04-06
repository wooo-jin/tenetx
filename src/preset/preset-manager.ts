/**
 * Tenetx v1 — Preset Manager
 *
 * pack + overlay + trust policy 합성 엔진.
 * Authoritative spec: docs/plans/2026-04-03-tenetx-preset-system-design.md §7
 *
 * 합성 순서:
 * 1. 글로벌 안전 불변식
 * 2. base pack
 * 3. 개인 장기 overlay
 * 4. 현재 세션 임시 overlay
 * 5. runtime capability detection
 * 6. effective trust policy 계산
 *
 * 충돌 해소: 세션 임시 > 개인 장기 > base pack (글로벌 안전은 hard constraint)
 */

import type {
  Profile,
  Rule,
  SessionEffectiveState,
  RuntimeCapabilityState,
  TrustPolicy,
} from '../store/types.js';

// ── Global Safety Invariants ──

const GLOBAL_SAFETY_RULES: Rule[] = [
  {
    rule_id: 'global-no-credentials',
    category: 'safety',
    scope: 'me',
    trigger: 'always',
    policy: '.env, credentials, API 키를 절대 커밋하거나 노출하지 마라.',
    strength: 'hard',
    source: 'pack_overlay',
    status: 'active',
    evidence_refs: [],
    render_key: 'safety.no_credentials',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    rule_id: 'global-no-destructive-unconfirmed',
    category: 'safety',
    scope: 'me',
    trigger: 'destructive command detected',
    policy: '파괴적 명령(rm -rf, DROP, force-push)은 사용자 확인 없이 실행하지 마라.',
    strength: 'hard',
    source: 'pack_overlay',
    status: 'active',
    evidence_refs: [],
    render_key: 'safety.no_destructive_unconfirmed',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

// ── Trust Policy Computation ──

const TRUST_ORDER: TrustPolicy[] = ['가드레일 우선', '승인 완화', '완전 신뢰 실행'];

function trustRank(policy: TrustPolicy): number {
  return TRUST_ORDER.indexOf(policy);
}

export interface TrustComputeResult {
  effective: TrustPolicy;
  warning: string | null;
}

export function computeEffectiveTrust(
  desired: TrustPolicy,
  runtime: RuntimeCapabilityState,
): TrustComputeResult {
  // runtime capability → trust level 매핑
  let runtimeTrust: TrustPolicy;
  if (runtime.dangerous_skip_permissions) {
    runtimeTrust = '완전 신뢰 실행';
  } else if (runtime.permission_mode === 'bypassed') {
    runtimeTrust = '완전 신뢰 실행';
  } else if (runtime.permission_mode === 'relaxed') {
    runtimeTrust = '승인 완화';
  } else {
    runtimeTrust = '가드레일 우선';
  }

  // effective = min(desired, runtime) — runtime이 최상위 사실
  const desiredRank = trustRank(desired);
  const runtimeRank = trustRank(runtimeTrust);

  if (runtimeRank < desiredRank) {
    // runtime < desired → 세션 시작 시 안내
    return {
      effective: runtimeTrust,
      warning: `Trust 하향: desired=${desired}, runtime=${runtimeTrust} (${runtime.permission_mode})`,
    };
  }

  if (runtimeRank > desiredRank) {
    // runtime > desired → 조용히 진행, effective만 상향
    return { effective: runtimeTrust, warning: null };
  }

  return { effective: desired, warning: null };
}

// ── Session Effective State 합성 ──

export function composeSession(params: {
  session_id: string;
  profile: Profile;
  personalRules: Rule[];
  sessionOverlays: Rule[];
  runtime: RuntimeCapabilityState;
}): SessionEffectiveState {
  const { session_id, profile, personalRules, sessionOverlays, runtime } = params;

  // trust 계산
  const trustResult = computeEffectiveTrust(profile.trust_preferences.desired_policy, runtime);

  // rule 합성: global safety + personal + session overlay
  const allRules = [...GLOBAL_SAFETY_RULES, ...personalRules, ...sessionOverlays];
  const activeRuleIds = allRules.filter(r => r.status === 'active').map(r => r.rule_id);

  const warnings: string[] = [];
  if (trustResult.warning) warnings.push(trustResult.warning);

  return {
    session_id,
    profile_version: profile.model_version,
    quality_pack: profile.base_packs.quality_pack,
    autonomy_pack: profile.base_packs.autonomy_pack,
    judgment_pack: profile.base_packs.judgment_pack,
    communication_pack: profile.base_packs.communication_pack,
    effective_trust_policy: trustResult.effective,
    active_rule_ids: activeRuleIds,
    temporary_overlays: sessionOverlays,
    runtime_capability_state: runtime,
    warnings,
    started_at: new Date().toISOString(),
    ended_at: null,
  };
}

export { GLOBAL_SAFETY_RULES };
