/**
 * Tenetx v1 — Inspect CLI
 *
 * tenetx inspect profile|rules|evidence|session
 * Authoritative: docs/plans/2026-04-03-tenetx-rule-renderer-spec.md §6
 */

import { loadProfile } from '../store/profile-store.js';
import { loadAllRules } from '../store/rule-store.js';
import { loadRecentEvidence } from '../store/evidence-store.js';
import { loadRecentSessions } from '../store/session-state-store.js';
import * as inspect from '../renderer/inspect-renderer.js';

export async function handleInspect(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'profile') {
    const profile = loadProfile();
    if (!profile) {
      console.log('\n  No v1 profile found. Run onboarding first.\n');
      return;
    }
    console.log('\n' + inspect.renderProfile(profile) + '\n');
    return;
  }

  if (sub === 'rules') {
    const rules = loadAllRules();
    console.log('\n' + inspect.renderRules(rules) + '\n');
    return;
  }

  if (sub === 'evidence') {
    const evidence = loadRecentEvidence(20);
    console.log('\n' + inspect.renderEvidence(evidence) + '\n');
    return;
  }

  if (sub === 'session') {
    const sessions = loadRecentSessions(1);
    if (sessions.length === 0) {
      console.log('\n  No session state found.\n');
      return;
    }
    console.log('\n' + inspect.renderSession(sessions[0]) + '\n');
    return;
  }

  console.log(`  Usage:
    tenetx inspect profile   — 현재 profile 상태
    tenetx inspect rules     — active/suppressed 규칙 목록
    tenetx inspect evidence  — 최근 evidence 목록
    tenetx inspect session   — 현재/최근 세션 상태`);
}
