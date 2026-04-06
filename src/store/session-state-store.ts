/**
 * Tenetx v1 — Session Effective State Store
 *
 * Authoritative schema: docs/plans/2026-04-03-tenetx-data-model-storage-spec.md §7
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { V1_SESSIONS_DIR } from '../core/paths.js';
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';
import type { SessionEffectiveState } from './types.js';

function sessionPath(sessionId: string): string {
  return path.join(V1_SESSIONS_DIR, `${sessionId}.json`);
}

export function saveSessionState(state: SessionEffectiveState): void {
  atomicWriteJSON(sessionPath(state.session_id), state, { pretty: true });
}

export function loadSessionState(sessionId: string): SessionEffectiveState | null {
  return safeReadJSON<SessionEffectiveState | null>(sessionPath(sessionId), null);
}

export function loadAllSessionStates(): SessionEffectiveState[] {
  if (!fs.existsSync(V1_SESSIONS_DIR)) return [];
  const items: SessionEffectiveState[] = [];
  for (const file of fs.readdirSync(V1_SESSIONS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const s = safeReadJSON<SessionEffectiveState | null>(path.join(V1_SESSIONS_DIR, file), null);
    if (s) items.push(s);
  }
  return items;
}

export function loadRecentSessions(limit: number = 10): SessionEffectiveState[] {
  return loadAllSessionStates()
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit);
}

export function finalizeSession(sessionId: string): boolean {
  const state = loadSessionState(sessionId);
  if (!state) return false;
  state.ended_at = new Date().toISOString();
  saveSessionState(state);
  return true;
}
