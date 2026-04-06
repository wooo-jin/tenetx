import { describe, it, expect } from 'vitest';
import { computeEffectiveTrust, composeSession, GLOBAL_SAFETY_RULES } from '../../src/preset/preset-manager.js';
import { createProfile } from '../../src/store/profile-store.js';
import type { RuntimeCapabilityState } from '../../src/store/types.js';

// profile-store의 paths mock은 불필요 — createProfile은 파일 I/O 없음

describe('computeEffectiveTrust', () => {
  const guarded: RuntimeCapabilityState = { permission_mode: 'guarded', dangerous_skip_permissions: false, auto_accept_scope: [], detected_from: 'cli' };
  const relaxed: RuntimeCapabilityState = { permission_mode: 'relaxed', dangerous_skip_permissions: false, auto_accept_scope: ['write'], detected_from: 'settings' };
  const bypassed: RuntimeCapabilityState = { permission_mode: 'bypassed', dangerous_skip_permissions: true, auto_accept_scope: ['all'], detected_from: 'flag' };

  it('runtime == desired → no warning', () => {
    const result = computeEffectiveTrust('가드레일 우선', guarded);
    expect(result.effective).toBe('가드레일 우선');
    expect(result.warning).toBeNull();
  });

  it('runtime < desired → warning + downgrade', () => {
    const result = computeEffectiveTrust('완전 신뢰 실행', guarded);
    expect(result.effective).toBe('가드레일 우선');
    expect(result.warning).toContain('Trust 하향');
  });

  it('runtime > desired → silent upgrade', () => {
    const result = computeEffectiveTrust('가드레일 우선', bypassed);
    expect(result.effective).toBe('완전 신뢰 실행');
    expect(result.warning).toBeNull();
  });

  it('relaxed runtime + 승인 완화 → match', () => {
    const result = computeEffectiveTrust('승인 완화', relaxed);
    expect(result.effective).toBe('승인 완화');
    expect(result.warning).toBeNull();
  });
});

describe('composeSession', () => {
  it('includes global safety rules', () => {
    const profile = createProfile('u', '균형형', '균형형', '승인 완화', 'onboarding');
    const runtime: RuntimeCapabilityState = { permission_mode: 'relaxed', dangerous_skip_permissions: false, auto_accept_scope: [], detected_from: 'cli' };

    const state = composeSession({ session_id: 'sess-1', profile, personalRules: [], sessionOverlays: [], runtime });

    expect(state.active_rule_ids).toContain('global-no-credentials');
    expect(state.active_rule_ids).toContain('global-no-destructive-unconfirmed');
    expect(state.active_rule_ids.length).toBe(GLOBAL_SAFETY_RULES.length);
  });

  it('merges personal rules + session overlays', () => {
    const profile = createProfile('u', '보수형', '확인 우선형', '가드레일 우선', 'onboarding');
    const runtime: RuntimeCapabilityState = { permission_mode: 'guarded', dangerous_skip_permissions: false, auto_accept_scope: [], detected_from: 'cli' };

    const personalRule = {
      rule_id: 'personal-1', category: 'quality' as const, scope: 'me' as const,
      trigger: 't', policy: 'p', strength: 'default' as const, source: 'onboarding' as const,
      status: 'active' as const, evidence_refs: [], render_key: 'quality.p',
      created_at: '', updated_at: '',
    };
    const overlay = {
      rule_id: 'overlay-1', category: 'autonomy' as const, scope: 'session' as const,
      trigger: 't', policy: 'o', strength: 'strong' as const, source: 'explicit_correction' as const,
      status: 'active' as const, evidence_refs: [], render_key: 'autonomy.o',
      created_at: '', updated_at: '',
    };

    const state = composeSession({ session_id: 'sess-2', profile, personalRules: [personalRule], sessionOverlays: [overlay], runtime });

    expect(state.active_rule_ids).toContain('personal-1');
    expect(state.active_rule_ids).toContain('overlay-1');
    expect(state.temporary_overlays).toHaveLength(1);
  });

  it('trust warning propagated to state', () => {
    const profile = createProfile('u', '속도형', '자율 실행형', '완전 신뢰 실행', 'onboarding');
    const runtime: RuntimeCapabilityState = { permission_mode: 'guarded', dangerous_skip_permissions: false, auto_accept_scope: [], detected_from: 'cli' };

    const state = composeSession({ session_id: 'sess-3', profile, personalRules: [], sessionOverlays: [], runtime });

    expect(state.effective_trust_policy).toBe('가드레일 우선');
    expect(state.warnings.length).toBeGreaterThan(0);
    expect(state.warnings[0]).toContain('Trust 하향');
  });
});
