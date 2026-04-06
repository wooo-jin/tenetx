/**
 * Tenetx v1 — Profile Store
 *
 * Profile CRUD. 4축 + facet + trust preferences.
 * Authoritative schema: docs/plans/2026-04-03-tenetx-data-model-storage-spec.md §2
 */

import * as fs from 'node:fs';
import { V1_PROFILE } from '../core/paths.js';
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';
import type { Profile, QualityPack, AutonomyPack, JudgmentPack, CommunicationPack, TrustPolicy } from './types.js';
import {
  qualityCentroid,
  autonomyCentroid,
  judgmentCentroid,
  communicationCentroid,
} from '../preset/facet-catalog.js';

const MODEL_VERSION = '2.0';

export function createProfile(
  userId: string,
  qualityPack: QualityPack,
  autonomyPack: AutonomyPack,
  trustPolicy: TrustPolicy,
  trustSource: Profile['trust_preferences']['source'],
  judgmentPack: JudgmentPack = '균형형',
  communicationPack: CommunicationPack = '균형형',
): Profile {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    model_version: MODEL_VERSION,
    axes: {
      quality_safety: { score: 0.5, facets: qualityCentroid(qualityPack), confidence: 0.45 },
      autonomy: { score: 0.5, facets: autonomyCentroid(autonomyPack), confidence: 0.45 },
      judgment_philosophy: { score: 0.5, facets: judgmentCentroid(judgmentPack), confidence: 0.45 },
      communication_style: { score: 0.5, facets: communicationCentroid(communicationPack), confidence: 0.45 },
    },
    base_packs: {
      quality_pack: qualityPack,
      autonomy_pack: autonomyPack,
      judgment_pack: judgmentPack,
      communication_pack: communicationPack,
    },
    trust_preferences: { desired_policy: trustPolicy, source: trustSource },
    metadata: {
      created_at: now,
      updated_at: now,
      last_onboarding_at: now,
      last_reclassification_at: null,
    },
  };
}

export function loadProfile(): Profile | null {
  return safeReadJSON<Profile | null>(V1_PROFILE, null);
}

export function saveProfile(profile: Profile): void {
  profile.metadata.updated_at = new Date().toISOString();
  atomicWriteJSON(V1_PROFILE, profile, { pretty: true });
}

export function profileExists(): boolean {
  return fs.existsSync(V1_PROFILE);
}

export function isV1Profile(data: unknown): data is Profile {
  if (!data || typeof data !== 'object') return false;
  const p = data as Record<string, unknown>;
  return typeof p.model_version === 'string' && p.model_version.startsWith('2.');
}
