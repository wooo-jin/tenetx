/**
 * Tenetx v1 — Pack Mismatch Detector
 *
 * rolling 3세션 mismatch score 계산.
 * Authoritative spec: docs/plans/2026-04-03-tenetx-onboarding-adaptation-spec.md §8
 *
 * 신호별 점수:
 * - 반대 방향 explicit_correction: +2
 * - session_summary가 반대 pack 성향 명시: +1
 * - 같은 축 strong rule 2개+ 신규 생성: +1
 *
 * 후보 조건:
 * - 최근 3세션 rolling sum >= 4 (축별)
 * - 또는 최근 3세션에 같은 방향 explicit_correction 2회+
 */

import type { Evidence, Rule, QualityPack, AutonomyPack } from '../store/types.js';

export interface MismatchSignal {
  session_id: string;
  axis: 'quality_safety' | 'autonomy';
  score: number;
  reason: string;
}

export interface MismatchResult {
  quality_mismatch: boolean;
  autonomy_mismatch: boolean;
  quality_score: number;
  autonomy_score: number;
  signals: MismatchSignal[];
}

/**
 * 단일 세션의 mismatch 신호를 계산.
 *
 * @param sessionId 세션 ID
 * @param corrections 해당 세션의 explicit_correction evidence
 * @param summaries 해당 세션의 session_summary evidence
 * @param newStrongRules 해당 세션에서 신규 생성된 strong rule
 * @param currentQuality 현재 quality pack
 * @param currentAutonomy 현재 autonomy pack
 */
export function computeSessionSignals(
  sessionId: string,
  corrections: Evidence[],
  summaries: Evidence[],
  newStrongRules: Rule[],
  _currentQuality: QualityPack,
  _currentAutonomy: AutonomyPack,
): MismatchSignal[] {
  const signals: MismatchSignal[] = [];

  // 반대 방향 explicit_correction
  for (const c of corrections) {
    for (const axis of c.axis_refs) {
      if (axis === 'quality_safety' || axis === 'autonomy') {
        // correction의 raw_payload에 direction 힌트가 있으면 pack과 비교
        const direction = (c.raw_payload as Record<string, unknown>)?.direction as string | undefined;
        if (direction === 'opposite') {
          signals.push({ session_id: sessionId, axis, score: 2, reason: `반대 방향 correction: ${c.summary}` });
        }
      }
    }
  }

  // session_summary가 반대 성향 명시
  for (const s of summaries) {
    const packHint = (s.raw_payload as Record<string, unknown>)?.pack_direction as string | undefined;
    if (packHint === 'opposite_quality') {
      signals.push({ session_id: sessionId, axis: 'quality_safety', score: 1, reason: `session summary 반대 성향: ${s.summary}` });
    }
    if (packHint === 'opposite_autonomy') {
      signals.push({ session_id: sessionId, axis: 'autonomy', score: 1, reason: `session summary 반대 성향: ${s.summary}` });
    }
  }

  // 같은 축 strong rule 2개+ 신규 생성
  const qualityStrong = newStrongRules.filter(r => r.category === 'quality' && r.strength === 'strong');
  const autonomyStrong = newStrongRules.filter(r => r.category === 'autonomy' && r.strength === 'strong');

  if (qualityStrong.length >= 2) {
    signals.push({ session_id: sessionId, axis: 'quality_safety', score: 1, reason: `${qualityStrong.length}개 strong quality rule 신규 생성` });
  }
  if (autonomyStrong.length >= 2) {
    signals.push({ session_id: sessionId, axis: 'autonomy', score: 1, reason: `${autonomyStrong.length}개 strong autonomy rule 신규 생성` });
  }

  return signals;
}

/**
 * 최근 3세션 rolling sum으로 mismatch 판정.
 */
export function detectMismatch(recentSignals: MismatchSignal[]): MismatchResult {
  let qualityScore = 0;
  let autonomyScore = 0;

  for (const s of recentSignals) {
    if (s.axis === 'quality_safety') qualityScore += s.score;
    if (s.axis === 'autonomy') autonomyScore += s.score;
  }

  // 같은 방향 correction 2회+ 체크
  const qualityCorrections = recentSignals.filter(s => s.axis === 'quality_safety' && s.score === 2);
  const autonomyCorrections = recentSignals.filter(s => s.axis === 'autonomy' && s.score === 2);

  return {
    quality_mismatch: qualityScore >= 4 || qualityCorrections.length >= 2,
    autonomy_mismatch: autonomyScore >= 4 || autonomyCorrections.length >= 2,
    quality_score: qualityScore,
    autonomy_score: autonomyScore,
    signals: recentSignals,
  };
}
