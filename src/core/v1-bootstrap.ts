/**
 * Tenetx v1 — Session Bootstrap
 *
 * v1 설계의 세션 시작 흐름을 구현.
 * Authoritative: docs/plans/2026-04-03-tenetx-lifecycle-design.md §6
 *               docs/plans/2026-04-03-tenetx-component-interface-design.md §4
 *
 * 흐름:
 * 1. Legacy 감지 → cutover 필요 시 backup + fresh onboarding
 * 2. Profile 로드 (없으면 onboarding 필요)
 * 3. Runtime capability 감지
 * 4. Preset Manager가 SessionEffectiveState 합성
 * 5. Rule Renderer가 자연어 규칙 세트 생성
 */

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { TENETX_HOME, V1_ME_DIR, V1_RULES_DIR, V1_EVIDENCE_DIR, V1_RECOMMENDATIONS_DIR, V1_SESSIONS_DIR, V1_STATE_DIR, V1_RAW_LOGS_DIR, V1_SOLUTIONS_DIR } from './paths.js';
import { checkLegacyProfile, runLegacyCutover } from './legacy-detector.js';
import { detectRuntimeCapability } from './runtime-detector.js';
import { loadProfile, profileExists } from '../store/profile-store.js';
import { loadActiveRules } from '../store/rule-store.js';
import { composeSession } from '../preset/preset-manager.js';
import { renderRules, DEFAULT_CONTEXT } from '../renderer/rule-renderer.js';
import { saveSessionState, loadRecentSessions } from '../store/session-state-store.js';
import { loadEvidenceBySession } from '../store/evidence-store.js';
import { computeSessionSignals, detectMismatch, type MismatchSignal, type MismatchResult } from '../forge/mismatch-detector.js';
import { createRecommendation, saveRecommendation } from '../store/recommendation-store.js';
import type { SessionEffectiveState, Profile } from '../store/types.js';

// ── Directory Initialization ──

const V1_DIRS = [TENETX_HOME, V1_ME_DIR, V1_RULES_DIR, V1_EVIDENCE_DIR, V1_RECOMMENDATIONS_DIR, V1_STATE_DIR, V1_SESSIONS_DIR, V1_RAW_LOGS_DIR, V1_SOLUTIONS_DIR];

export function ensureV1Directories(): void {
  for (const dir of V1_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ── Bootstrap Result ──

export interface V1BootstrapResult {
  needsOnboarding: boolean;
  legacyBackupPath: string | null;
  session: SessionEffectiveState | null;
  renderedRules: string | null;
  profile: Profile | null;
  mismatch: MismatchResult | null;
}

// ── Main Bootstrap ──

export function bootstrapV1Session(): V1BootstrapResult {
  // 0. 디렉토리 준비
  ensureV1Directories();

  // 1. Legacy 감지
  const legacyCheck = checkLegacyProfile();
  let legacyBackupPath: string | null = null;
  if (legacyCheck.isLegacy) {
    legacyBackupPath = runLegacyCutover();
  }

  // 2. Profile 로드
  if (!profileExists()) {
    return {
      needsOnboarding: true,
      legacyBackupPath,
      session: null,
      renderedRules: null,
      profile: null,
      mismatch: null,
    };
  }

  const profile = loadProfile();
  if (!profile) {
    return { needsOnboarding: true, legacyBackupPath, session: null, renderedRules: null, profile: null, mismatch: null };
  }

  // 3. Runtime capability 감지
  const runtime = detectRuntimeCapability();

  // 4. Rules 로드 + Session 합성
  const personalRules = loadActiveRules();
  const sessionId = crypto.randomUUID();

  const session = composeSession({
    session_id: sessionId,
    profile,
    personalRules,
    sessionOverlays: [],
    runtime,
  });

  // 5. Session state 저장
  saveSessionState(session);

  // 6. Rule 렌더링
  const allRules = [...personalRules];
  const renderedRules = renderRules(allRules, session, profile, DEFAULT_CONTEXT);

  // 7. Mismatch 감지 (최근 3세션 rolling)
  let mismatchResult: MismatchResult | null = null;
  try {
    const recentSessions = loadRecentSessions(3);
    if (recentSessions.length >= 2) {
      const allSignals: MismatchSignal[] = [];
      for (const prevSession of recentSessions) {
        const sessionEvidence = loadEvidenceBySession(prevSession.session_id);
        const corrections = sessionEvidence.filter(e => e.type === 'explicit_correction');
        const summaries = sessionEvidence.filter(e => e.type === 'session_summary');
        const strongRules = personalRules.filter(
          r => r.strength === 'strong' && r.evidence_refs.some(ref =>
            sessionEvidence.some(e => e.evidence_id === ref),
          ),
        );
        const signals = computeSessionSignals(
          prevSession.session_id,
          corrections,
          summaries,
          strongRules,
          profile.base_packs.quality_pack,
          profile.base_packs.autonomy_pack,
        );
        allSignals.push(...signals);
      }

      if (allSignals.length > 0) {
        mismatchResult = detectMismatch(allSignals);

        // mismatch 감지 시 재추천 생성
        if (mismatchResult.quality_mismatch || mismatchResult.autonomy_mismatch) {
          session.warnings.push(
            `Pack mismatch 감지: quality=${mismatchResult.quality_score}, autonomy=${mismatchResult.autonomy_score}. tenetx forge --reset soft 로 재설정하거나 tenetx onboarding 으로 재추천을 받으세요.`,
          );

          const rec = createRecommendation({
            source: 'mismatch_recommendation',
            quality_pack: mismatchResult.quality_mismatch
              ? (profile.base_packs.quality_pack === '보수형' ? '속도형' : '보수형')
              : profile.base_packs.quality_pack,
            autonomy_pack: mismatchResult.autonomy_mismatch
              ? (profile.base_packs.autonomy_pack === '확인 우선형' ? '자율 실행형' : '확인 우선형')
              : profile.base_packs.autonomy_pack,
            suggested_trust_policy: profile.trust_preferences.desired_policy,
            confidence: 0.6,
            reason_summary: `Rolling 3세션 mismatch: quality=${mismatchResult.quality_score}, autonomy=${mismatchResult.autonomy_score}`,
          });
          saveRecommendation(rec);
        }
      }
    }
  } catch {
    // mismatch 감지 실패는 세션 시작을 막지 않음
  }

  // 8. Raw Log 기록 + TTL sweep (7일)
  try {
    // 세션 시작 로그
    const rawLogPath = require('node:path').join(V1_RAW_LOGS_DIR, `${sessionId}.jsonl`);
    fs.appendFileSync(rawLogPath, JSON.stringify({
      event: 'session-started',
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      quality_pack: profile.base_packs.quality_pack,
      autonomy_pack: profile.base_packs.autonomy_pack,
      judgment_pack: profile.base_packs.judgment_pack,
      communication_pack: profile.base_packs.communication_pack,
      effective_trust: session.effective_trust_policy,
    }) + '\n');

    // TTL sweep: 7일 이상 된 raw log 파일 삭제
    const TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const file of fs.readdirSync(V1_RAW_LOGS_DIR)) {
      const filePath = require('node:path').join(V1_RAW_LOGS_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > TTL_MS) {
          fs.unlinkSync(filePath);
        }
      } catch { /* skip */ }
    }
  } catch {
    // raw log 실패는 세션 시작을 막지 않음
  }

  return {
    needsOnboarding: false,
    legacyBackupPath,
    session,
    renderedRules,
    profile,
    mismatch: mismatchResult,
  };
}
