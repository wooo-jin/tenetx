/**
 * Tenetx v1 — Legacy Detector
 *
 * ~/.compound/ 5D profile 감지, backup, cutover 분기.
 * Authoritative spec:
 *   docs/plans/2026-04-03-tenetx-lifecycle-design.md §12
 *   docs/plans/2026-04-03-tenetx-data-model-storage-spec.md §11
 *
 * cutover 순서:
 * 1. ~/.compound/me/forge-profile.json 존재 여부 확인
 * 2. 5D schema인지 검사
 * 3. legacy면 backup (forge-profile.legacy-<ts>.json)
 * 4. 새 profile은 ~/.tenetx/me/forge-profile.json에 생성 → fresh onboarding
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { FORGE_PROFILE } from './paths.js';
import { safeReadJSON } from '../hooks/shared/atomic-write.js';

// 5D schema의 핵심 필드
const LEGACY_FIELDS = ['riskTolerance', 'autonomyPreference', 'qualityFocus', 'abstractionLevel', 'communicationStyle'];

export interface LegacyCheckResult {
  found: boolean;
  isLegacy: boolean;
  backupPath: string | null;
}

/**
 * ~/.compound/me/forge-profile.json이 5D legacy인지 확인.
 */
export function checkLegacyProfile(): LegacyCheckResult {
  if (!fs.existsSync(FORGE_PROFILE)) {
    return { found: false, isLegacy: false, backupPath: null };
  }

  const data = safeReadJSON<Record<string, unknown>>(FORGE_PROFILE, {});

  // model_version이 2.x면 이미 v1 마이그레이션 완료
  if (typeof data.model_version === 'string' && data.model_version.startsWith('2.')) {
    return { found: true, isLegacy: false, backupPath: null };
  }

  // 5D 필드 존재 여부로 legacy 판정
  const dimensions = data.dimensions as Record<string, unknown> | undefined;
  if (dimensions && LEGACY_FIELDS.some(f => f in dimensions)) {
    return { found: true, isLegacy: true, backupPath: null };
  }

  // dimensions가 없더라도 model_version이 없으면 legacy로 간주
  if (!data.model_version) {
    return { found: true, isLegacy: true, backupPath: null };
  }

  return { found: true, isLegacy: false, backupPath: null };
}

/**
 * legacy profile을 backup.
 * ~/.compound/me/forge-profile.legacy-<timestamp>.json으로 복사.
 */
export function backupLegacyProfile(): string | null {
  if (!fs.existsSync(FORGE_PROFILE)) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    path.dirname(FORGE_PROFILE),
    `forge-profile.legacy-${timestamp}.json`,
  );

  fs.copyFileSync(FORGE_PROFILE, backupPath);
  return backupPath;
}

/**
 * legacy cutover 전체 실행.
 * 반환: backup 경로 (legacy가 아니면 null)
 */
export function runLegacyCutover(): string | null {
  const check = checkLegacyProfile();
  if (!check.found || !check.isLegacy) return null;

  const backupPath = backupLegacyProfile();
  return backupPath;
}
