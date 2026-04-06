/**
 * Tenetx v1 — Pack Recommendation Store
 *
 * Authoritative schema: docs/plans/2026-04-03-tenetx-data-model-storage-spec.md §6
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { V1_RECOMMENDATIONS_DIR } from '../core/paths.js';
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';
import type { PackRecommendation, QualityPack, AutonomyPack, JudgmentPack, CommunicationPack, TrustPolicy, RecommendationSource, RecommendationStatus } from './types.js';

function recPath(id: string): string {
  return path.join(V1_RECOMMENDATIONS_DIR, `${id}.json`);
}

export function createRecommendation(params: {
  source: RecommendationSource;
  quality_pack: QualityPack;
  autonomy_pack: AutonomyPack;
  judgment_pack?: JudgmentPack;
  communication_pack?: CommunicationPack;
  suggested_trust_policy: TrustPolicy;
  confidence: number;
  reason_summary: string;
}): PackRecommendation {
  return {
    recommendation_id: crypto.randomUUID(),
    source: params.source,
    quality_pack: params.quality_pack,
    autonomy_pack: params.autonomy_pack,
    judgment_pack: params.judgment_pack ?? '균형형',
    communication_pack: params.communication_pack ?? '균형형',
    suggested_trust_policy: params.suggested_trust_policy,
    confidence: params.confidence,
    reason_summary: params.reason_summary,
    status: 'proposed',
    created_at: new Date().toISOString(),
  };
}

export function saveRecommendation(rec: PackRecommendation): void {
  atomicWriteJSON(recPath(rec.recommendation_id), rec, { pretty: true });
}

export function loadRecommendation(id: string): PackRecommendation | null {
  return safeReadJSON<PackRecommendation | null>(recPath(id), null);
}

export function loadAllRecommendations(): PackRecommendation[] {
  if (!fs.existsSync(V1_RECOMMENDATIONS_DIR)) return [];
  const items: PackRecommendation[] = [];
  for (const file of fs.readdirSync(V1_RECOMMENDATIONS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const rec = safeReadJSON<PackRecommendation | null>(path.join(V1_RECOMMENDATIONS_DIR, file), null);
    if (rec) items.push(rec);
  }
  return items;
}

export function updateRecommendationStatus(id: string, status: RecommendationStatus): boolean {
  const rec = loadRecommendation(id);
  if (!rec) return false;
  rec.status = status;
  saveRecommendation(rec);
  return true;
}

export function loadAcceptedRecommendation(): PackRecommendation | null {
  return loadAllRecommendations().find(r => r.status === 'accepted') ?? null;
}

export function loadLatestRecommendation(): PackRecommendation | null {
  const all = loadAllRecommendations();
  if (all.length === 0) return null;
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}
