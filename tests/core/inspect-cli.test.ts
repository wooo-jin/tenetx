import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { setLocale } from '../../src/i18n/index.js';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-inspect-cli',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import { handleInspect } from '../../src/core/inspect-cli.js';
import { V1_ME_DIR, V1_RULES_DIR, V1_EVIDENCE_DIR, V1_SESSIONS_DIR } from '../../src/core/paths.js';
import { createProfile, saveProfile } from '../../src/store/profile-store.js';
import { createRule, saveRule } from '../../src/store/rule-store.js';
import { createEvidence, saveEvidence } from '../../src/store/evidence-store.js';
import { saveSessionState } from '../../src/store/session-state-store.js';
import type { SessionEffectiveState } from '../../src/store/types.js';

describe('inspect-cli', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setLocale('ko');
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(V1_ME_DIR, { recursive: true });
    fs.mkdirSync(V1_RULES_DIR, { recursive: true });
    fs.mkdirSync(V1_EVIDENCE_DIR, { recursive: true });
    fs.mkdirSync(V1_SESSIONS_DIR, { recursive: true });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('inspect profile — no profile', async () => {
    await handleInspect(['profile']);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No v1 profile'));
  });

  it('inspect profile — with profile', async () => {
    const profile = createProfile('test', '균형형', '균형형', '승인 완화', 'onboarding');
    saveProfile(profile);

    await handleInspect(['profile']);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('균형형');
  });

  it('inspect rules — empty', async () => {
    await handleInspect(['rules']);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('No rules');
  });

  it('inspect rules — with rules', async () => {
    const rule = createRule({
      category: 'quality',
      scope: 'me',
      trigger: 'always',
      policy: 'test-policy-rule',
      strength: 'default',
      source: 'onboarding',
      evidence_refs: [],
      render_key: 'test.rule',
    });
    saveRule(rule);

    await handleInspect(['rules']);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('test-policy-rule');
  });

  it('inspect evidence — empty', async () => {
    await handleInspect(['evidence']);
    // should not error
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('inspect evidence — with evidence', async () => {
    const ev = createEvidence({
      type: 'explicit_correction',
      session_id: 'sess-1',
      source_component: 'test',
      summary: 'correction-summary-text',
      axis_refs: ['quality_safety'],
      confidence: 0.9,
      raw_payload: {},
    });
    saveEvidence(ev);

    await handleInspect(['evidence']);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('correction-summary-text');
  });

  it('inspect session — no sessions', async () => {
    await handleInspect(['session']);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No session'));
  });

  it('inspect session — with session', async () => {
    const session: SessionEffectiveState = {
      session_id: 'test-sess',
      profile_version: '2.0',
      quality_pack: '보수형',
      autonomy_pack: '확인 우선형',
      judgment_pack: '균형형',
      communication_pack: '균형형',
      effective_trust_policy: '가드레일 우선',
      active_rule_ids: [],
      temporary_overlays: [],
      runtime_capability_state: {
        permission_mode: 'guarded',
        dangerous_skip_permissions: false,
        auto_accept_scope: [],
        detected_from: 'default',
      },
      warnings: [],
      started_at: new Date().toISOString(),
      ended_at: null,
    };
    saveSessionState(session);

    await handleInspect(['session']);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('가드레일 우선');
  });

  it('unknown subcommand shows usage', async () => {
    await handleInspect(['unknown']);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('no subcommand shows usage', async () => {
    await handleInspect([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });
});
