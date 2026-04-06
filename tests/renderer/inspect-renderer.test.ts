import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/i18n/index.js';
import {
  renderProfile,
  renderRules,
  renderEvidence,
  renderSession,
} from '../../src/renderer/inspect-renderer.js';
import type { Profile, Rule, Evidence, SessionEffectiveState } from '../../src/store/types.js';

const mockProfile: Profile = {
  user_id: 'test',
  model_version: '2.0',
  axes: {
    quality_safety: { score: 0.7, facets: { verification_depth: 0.8, stop_threshold: 0.7, change_conservatism: 0.6 }, confidence: 0.9 },
    autonomy: { score: 0.5, facets: { confirmation_independence: 0.5, assumption_tolerance: 0.4, scope_expansion_tolerance: 0.3, approval_threshold: 0.6 }, confidence: 0.8 },
    judgment_philosophy: { score: 0.5, facets: { minimal_change_bias: 0.5, abstraction_bias: 0.5, evidence_first_bias: 0.5 }, confidence: 0.5 },
    communication_style: { score: 0.5, facets: { verbosity: 0.5, structure: 0.5, teaching_bias: 0.5 }, confidence: 0.5 },
  },
  base_packs: { quality_pack: '균형형', autonomy_pack: '균형형', judgment_pack: '균형형', communication_pack: '균형형' },
  trust_preferences: { desired_policy: '승인 완화', source: 'onboarding' },
  metadata: {
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    last_onboarding_at: '2026-01-01T00:00:00Z',
    last_reclassification_at: null,
  },
};

const mockRule: Rule = {
  rule_id: 'r1',
  category: 'quality',
  scope: 'me',
  trigger: 'always',
  policy: 'test rule',
  strength: 'default',
  source: 'onboarding',
  status: 'active',
  evidence_refs: [],
  render_key: 'test.r1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockEvidence: Evidence = {
  evidence_id: 'e1',
  type: 'explicit_correction',
  session_id: 'sess1',
  timestamp: '2026-01-01T00:00:00Z',
  source_component: 'Hooks',
  summary: 'test correction',
  axis_refs: ['quality_safety'],
  candidate_rule_refs: [],
  confidence: 0.85,
  raw_payload: {},
};

const mockSession: SessionEffectiveState = {
  session_id: 'sess1',
  profile_version: '2.0',
  quality_pack: '균형형',
  autonomy_pack: '균형형',
  judgment_pack: '균형형',
  communication_pack: '균형형',
  effective_trust_policy: '승인 완화',
  active_rule_ids: ['r1'],
  temporary_overlays: [],
  runtime_capability_state: {
    permission_mode: 'guarded',
    dangerous_skip_permissions: false,
    auto_accept_scope: [],
    detected_from: 'default',
  },
  warnings: [],
  started_at: '2026-01-01T00:00:00Z',
  ended_at: null,
};

describe('inspect-renderer', () => {
  beforeEach(() => { setLocale('ko'); });

  it('renderProfile includes pack and trust info', () => {
    const output = renderProfile(mockProfile);
    expect(output).toContain('균형형');
    expect(output).toContain('승인 완화');
  });

  it('renderRules includes active rules', () => {
    const output = renderRules([mockRule]);
    expect(output).toContain('test rule');
  });

  it('renderRules with empty array', () => {
    const output = renderRules([]);
    expect(output).toContain('No rules');
  });

  it('renderEvidence includes correction summary', () => {
    const output = renderEvidence([mockEvidence]);
    expect(output).toContain('test correction');
  });

  it('renderSession includes trust policy', () => {
    const output = renderSession(mockSession);
    expect(output).toContain('승인 완화');
    expect(output).toContain('sess1');
  });
});
