/**
 * Tenetx Forge — Profile Manager
 *
 * ProjectSignals -> DimensionVector 매핑 (스캔 기반 초기값 추정)
 * ForgeProfile 저장/로드/병합 로직
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_DIR } from '../core/paths.js';
import {
  defaultDimensionVector,
  clampDimension,
  CORE_DIMENSIONS,
  DIMENSION_META,
} from './dimensions.js';
import type {
  ForgeProfile,
  ProjectSignals,
  DimensionVector,
} from './types.js';

// ── Path Constants ──────────────────────────────────

/** ~/.compound/me/forge-profile.json */
export const GLOBAL_FORGE_PROFILE = path.join(ME_DIR, 'forge-profile.json');

/** {cwd}/.compound/forge-profile.json */
export function projectForgeProfile(cwd: string): string {
  return path.join(cwd, '.compound', 'forge-profile.json');
}

// ── Signal -> Dimension Mapping ─────────────────────

/** 프로젝트 시그널에서 차원 벡터 초기값 추정 */
export function signalsToDimensions(signals: ProjectSignals): DimensionVector {
  const v = defaultDimensionVector();

  // riskTolerance: CI + pre-commit + 린터 -> conservative, 없으면 aggressive
  if (signals.codeStyle.hasCI) v.riskTolerance -= 0.1;
  if (signals.codeStyle.hasPreCommitHook) v.riskTolerance -= 0.1;
  if (signals.dependencies.hasLinter) v.riskTolerance -= 0.05;
  if (signals.git.tagCount > 5) v.riskTolerance -= 0.05;
  if (signals.git.branchStrategy === 'gitflow') v.riskTolerance -= 0.1;
  if (signals.git.branchStrategy === 'trunk') v.riskTolerance += 0.1;

  // autonomyPreference: 커밋 빈도 높으면 자율적, 낮으면 감독 선호
  if (signals.git.recentCommits > 60) v.autonomyPreference += 0.15;
  else if (signals.git.recentCommits > 30) v.autonomyPreference += 0.05;
  else if (signals.git.recentCommits < 10) v.autonomyPreference -= 0.1;

  // qualityFocus: 테스트 + 타입 + 린터 -> thorough
  if (signals.codeStyle.testPattern !== 'none') v.qualityFocus += 0.1;
  if (signals.codeStyle.testFramework.length > 0) v.qualityFocus += 0.05;
  if (signals.dependencies.hasTypeChecker) v.qualityFocus += 0.1;
  if (signals.dependencies.typeDefs > 5) v.qualityFocus += 0.05;
  if (signals.codeStyle.hasPreCommitHook) v.qualityFocus += 0.05;

  // abstractionLevel: 디렉토리 깊이 + 모노레포 -> architectural
  if (signals.architecture.maxDirDepth > 5) v.abstractionLevel += 0.1;
  if (signals.architecture.isMonorepo) v.abstractionLevel += 0.1;
  if (signals.architecture.srcDirCount > 10) v.abstractionLevel += 0.05;
  if (signals.architecture.hasDocs) v.abstractionLevel += 0.05;
  if (signals.architecture.hasChangelog) v.abstractionLevel += 0.05;

  // communicationStyle: 커밋 메시지 짧으면 terse, 길면 verbose
  if (signals.git.avgCommitMsgLength > 60) v.communicationStyle -= 0.1;
  else if (signals.git.avgCommitMsgLength < 20) v.communicationStyle += 0.1;
  if (signals.architecture.hasDocs) v.communicationStyle -= 0.05;

  // 범위 클램핑
  for (const dim of CORE_DIMENSIONS) {
    v[dim] = clampDimension(v[dim]);
  }

  return v;
}

// ── Profile CRUD ────────────────────────────────────

/** 빈 프로필 생성 */
export function createEmptyProfile(): ForgeProfile {
  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dimensions: defaultDimensionVector(),
    lastScan: null,
    interviewAnswers: {},
  };
}

/** 프로필 로드 (프로젝트 > 글로벌 우선순위) */
export function loadForgeProfile(cwd?: string): ForgeProfile | null {
  // 프로젝트별 프로필 우선
  if (cwd) {
    const projPath = projectForgeProfile(cwd);
    const proj = loadProfileFromPath(projPath);
    if (proj) return proj;
  }

  // 글로벌 프로필
  return loadProfileFromPath(GLOBAL_FORGE_PROFILE);
}

function loadProfileFromPath(filePath: string): ForgeProfile | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return validateProfile(raw);
  } catch {
    return null;
  }
}

/** 프로필 유효성 검증 */
function validateProfile(raw: Record<string, unknown>): ForgeProfile | null {
  if (!raw.version || !raw.dimensions) return null;
  const dims = raw.dimensions as Record<string, number>;
  for (const key of CORE_DIMENSIONS) {
    if (typeof dims[key] !== 'number') return null;
  }
  return raw as unknown as ForgeProfile;
}

/** 프로필 저장 (atomic: tmp -> rename) */
export function saveForgeProfile(profile: ForgeProfile, filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  const data = JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }, null, 2);
  try {
    fs.writeFileSync(tmpFile, data);
    fs.renameSync(tmpFile, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    throw e;
  }
}

/** 두 프로필의 차원 벡터를 가중 평균으로 병합 */
export function mergeProfiles(
  base: DimensionVector,
  overlay: DimensionVector,
  overlayWeight: number = 0.7,
): DimensionVector {
  const result = { ...base };
  const baseWeight = 1 - overlayWeight;
  for (const dim of CORE_DIMENSIONS) {
    result[dim] = clampDimension(
      (base[dim] ?? 0.5) * baseWeight + (overlay[dim] ?? 0.5) * overlayWeight,
    );
  }
  return result;
}

// ── Display ─────────────────────────────────────────

/** 0.0~1.0 값을 ASCII 바 그래프로 렌더 */
function renderBar(value: number): string {
  const width = 20;
  const pos = Math.round(value * (width - 1));
  const chars = Array.from({ length: width }, (_, i) => {
    if (i === pos) return '\u2588';
    return '\u2591';
  });
  return `[${chars.join('')}]`;
}

/** 차원 벡터를 사람이 읽기 좋게 포맷 */
export function formatDimensions(dims: DimensionVector): string {
  const lines: string[] = [];
  for (const meta of DIMENSION_META) {
    const val = dims[meta.key] ?? 0.5;
    const bar = renderBar(val);
    lines.push(
      `  ${meta.label.padEnd(12)} ${meta.lowLabel.padEnd(13)} ${bar} ${meta.highLabel.padStart(13)}  (${val.toFixed(2)})`,
    );
  }
  return lines.join('\n');
}
