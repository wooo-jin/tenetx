import { describe, it, expect, beforeEach } from 'vitest';
import { setLocale } from '../../src/i18n/index.js';
import { renderRules, DEFAULT_CONTEXT } from '../../src/renderer/rule-renderer.js';
import { createProfile } from '../../src/store/profile-store.js';
import type { Rule, SessionEffectiveState, RuntimeCapabilityState } from '../../src/store/types.js';

function makeState(overrides?: Partial<SessionEffectiveState>): SessionEffectiveState {
  const runtime: RuntimeCapabilityState = { permission_mode: 'guarded', dangerous_skip_permissions: false, auto_accept_scope: [], detected_from: 'cli' };
  return {
    session_id: 'sess-1', profile_version: '2.0', quality_pack: '균형형', autonomy_pack: '균형형', judgment_pack: '균형형', communication_pack: '균형형',
    effective_trust_policy: '승인 완화', active_rule_ids: [], temporary_overlays: [],
    runtime_capability_state: runtime, warnings: [], started_at: '', ended_at: null,
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule>): Rule {
  return {
    rule_id: 'r1', category: 'quality', scope: 'me', trigger: 't', policy: 'Test policy',
    strength: 'default', source: 'onboarding', status: 'active', evidence_refs: [],
    render_key: 'quality.test', created_at: '', updated_at: '',
    ...overrides,
  };
}

describe('renderRules', () => {
  beforeEach(() => { setLocale('ko'); });

  const profile = createProfile('u', '균형형', '균형형', '승인 완화', 'onboarding');

  it('renders empty rules gracefully', () => {
    const output = renderRules([], makeState(), profile);
    expect(output).toContain('균형형 quality');
    expect(output).toContain('Trust:');
  });

  it('hard rules go to Must Not', () => {
    const rules = [makeRule({ strength: 'hard', category: 'safety', policy: 'Never expose credentials', render_key: 'safety.creds' })];
    const output = renderRules(rules, makeState(), profile);
    expect(output).toContain('## Must Not');
    expect(output).toContain('Never expose credentials');
  });

  it('quality rules go to How To Validate', () => {
    const rules = [makeRule({ category: 'quality', policy: 'Run tests before completing' })];
    const output = renderRules(rules, makeState(), profile);
    expect(output).toContain('## How To Validate');
    expect(output).toContain('Run tests before completing');
  });

  it('autonomy rules go to When To Ask', () => {
    const rules = [makeRule({ category: 'autonomy', policy: 'Ask before public API change', render_key: 'autonomy.api' })];
    const output = renderRules(rules, makeState(), profile);
    expect(output).toContain('## When To Ask');
  });

  it('deduplicates by render_key — stronger wins', () => {
    const rules = [
      makeRule({ rule_id: 'weak', strength: 'soft', render_key: 'quality.dup', policy: 'soft policy' }),
      makeRule({ rule_id: 'strong', strength: 'strong', render_key: 'quality.dup', policy: 'strong policy' }),
    ];
    const output = renderRules(rules, makeState(), profile);
    expect(output).toContain('strong policy');
    expect(output).not.toContain('soft policy');
  });

  it('deduplicates by render_key — session scope wins over me', () => {
    const rules = [
      makeRule({ rule_id: 'me-rule', scope: 'me', render_key: 'quality.dup', policy: 'me version' }),
      makeRule({ rule_id: 'session-rule', scope: 'session', render_key: 'quality.dup', policy: 'session version' }),
    ];
    const output = renderRules(rules, makeState(), profile);
    expect(output).toContain('session version');
    expect(output).not.toContain('me version');
  });

  it('filters out non-active rules', () => {
    const rules = [
      makeRule({ status: 'active', policy: 'visible' }),
      makeRule({ rule_id: 'r2', status: 'suppressed', policy: 'hidden', render_key: 'quality.hidden' }),
    ];
    const output = renderRules(rules, makeState(), profile);
    expect(output).toContain('visible');
    expect(output).not.toContain('hidden');
  });

  it('respects max_chars budget', () => {
    const rules = Array.from({ length: 50 }, (_, i) =>
      makeRule({ rule_id: `r-${i}`, render_key: `quality.r${i}`, policy: `Policy number ${i} with some extra text to fill space` }),
    );
    const output = renderRules(rules, makeState(), profile, { ...DEFAULT_CONTEXT, max_chars: 500 });
    expect(output.length).toBeLessThanOrEqual(600); // 약간의 여유
  });

  it('includes warnings from state', () => {
    const output = renderRules([], makeState({ warnings: ['Trust 하향: desired=완전 신뢰, runtime=가드레일'] }), profile);
    expect(output).toContain('## Warnings');
    expect(output).toContain('Trust 하향');
  });
});
