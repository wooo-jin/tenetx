/**
 * Tenetx v1 — Evidence Store
 *
 * explicit_correction, behavior_observation, session_summary CRUD.
 * Authoritative schema: docs/plans/2026-04-03-tenetx-data-model-storage-spec.md §4
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { V1_EVIDENCE_DIR } from '../core/paths.js';
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';
import type { Evidence, EvidenceType } from './types.js';

function evidencePath(evidenceId: string): string {
  return path.join(V1_EVIDENCE_DIR, `${evidenceId}.json`);
}

export function createEvidence(params: {
  type: EvidenceType;
  session_id: string;
  source_component: string;
  summary: string;
  axis_refs?: string[];
  candidate_rule_refs?: string[];
  confidence: number;
  raw_payload?: Record<string, unknown>;
}): Evidence {
  return {
    evidence_id: crypto.randomUUID(),
    type: params.type,
    session_id: params.session_id,
    timestamp: new Date().toISOString(),
    source_component: params.source_component,
    summary: params.summary,
    axis_refs: params.axis_refs ?? [],
    candidate_rule_refs: params.candidate_rule_refs ?? [],
    confidence: params.confidence,
    raw_payload: params.raw_payload ?? {},
  };
}

export function saveEvidence(evidence: Evidence): void {
  atomicWriteJSON(evidencePath(evidence.evidence_id), evidence, { pretty: true });
}

export function loadEvidence(evidenceId: string): Evidence | null {
  return safeReadJSON<Evidence | null>(evidencePath(evidenceId), null);
}

export function loadAllEvidence(): Evidence[] {
  if (!fs.existsSync(V1_EVIDENCE_DIR)) return [];
  const items: Evidence[] = [];
  for (const file of fs.readdirSync(V1_EVIDENCE_DIR)) {
    if (!file.endsWith('.json')) continue;
    const ev = safeReadJSON<Evidence | null>(path.join(V1_EVIDENCE_DIR, file), null);
    if (ev) items.push(ev);
  }
  return items;
}

export function loadEvidenceBySession(sessionId: string): Evidence[] {
  return loadAllEvidence().filter(e => e.session_id === sessionId);
}

export function loadEvidenceByType(type: EvidenceType): Evidence[] {
  return loadAllEvidence().filter(e => e.type === type);
}

export function loadRecentEvidence(limit: number = 20): Evidence[] {
  return loadAllEvidence()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}
