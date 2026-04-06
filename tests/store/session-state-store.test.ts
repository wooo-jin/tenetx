import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-session-state',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  saveSessionState,
  loadSessionState,
  loadAllSessionStates,
  loadRecentSessions,
  finalizeSession,
} from '../../src/store/session-state-store.js';
import { V1_SESSIONS_DIR } from '../../src/core/paths.js';
import type { SessionEffectiveState } from '../../src/store/types.js';

function makeSession(id: string, startedAt?: string): SessionEffectiveState {
  return {
    session_id: id,
    profile_version: '2.0',
    quality_pack: '균형형',
    autonomy_pack: '균형형',
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
    started_at: startedAt ?? new Date().toISOString(),
    ended_at: null,
  };
}

describe('session-state-store', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(V1_SESSIONS_DIR, { recursive: true });
  });
  afterEach(() => { fs.rmSync(TEST_HOME, { recursive: true, force: true }); });

  it('save and load', () => {
    const s = makeSession('sess-1');
    saveSessionState(s);
    const loaded = loadSessionState('sess-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.session_id).toBe('sess-1');
    expect(loaded!.quality_pack).toBe('균형형');
  });

  it('loadAllSessionStates', () => {
    saveSessionState(makeSession('a'));
    saveSessionState(makeSession('b'));
    const all = loadAllSessionStates();
    expect(all.length).toBe(2);
  });

  it('loadRecentSessions respects limit and order', () => {
    saveSessionState(makeSession('old', '2026-01-01T00:00:00Z'));
    saveSessionState(makeSession('new', '2026-04-01T00:00:00Z'));
    saveSessionState(makeSession('mid', '2026-02-15T00:00:00Z'));
    const recent = loadRecentSessions(2);
    expect(recent.length).toBe(2);
    expect(recent[0].session_id).toBe('new');
    expect(recent[1].session_id).toBe('mid');
  });

  it('finalizeSession sets ended_at', () => {
    saveSessionState(makeSession('fin'));
    expect(finalizeSession('fin')).toBe(true);
    const loaded = loadSessionState('fin');
    expect(loaded!.ended_at).not.toBeNull();
  });

  it('finalizeSession returns false for missing session', () => {
    expect(finalizeSession('missing')).toBe(false);
  });

  it('loadSessionState returns null for missing session', () => {
    expect(loadSessionState('nonexistent')).toBeNull();
  });
});
