/**
 * Tenetx v1 — Onboarding
 *
 * 2문항 온보딩, 점수 계산, pack 추천.
 * Authoritative spec: docs/plans/2026-04-03-tenetx-onboarding-adaptation-spec.md §3-4
 */

import type { QualityPack, AutonomyPack, JudgmentPack, CommunicationPack, TrustPolicy, PackRecommendation } from '../store/types.js';
import { createRecommendation } from '../store/recommendation-store.js';

// ── 선택지 점수 ──

export type ChoiceId = 'A' | 'B' | 'C';

interface ChoiceScore {
  quality: number;
  autonomy: number;
}

// 질문 1: 애매한 구현 요청 + 인접 영향 가능성
// 주 판별: 자율 실행 성향, 보조: 품질/안전
const Q1_SCORES: Record<ChoiceId, ChoiceScore> = {
  A: { quality: -1, autonomy: -2 },
  B: { quality: 0, autonomy: 0 },
  C: { quality: +1, autonomy: +2 },
};

// 질문 2: 수정 완료 직전 + 검증 강도 vs 완료 속도
// 주 판별: 품질/안전, 보조: 자율 실행 성향
const Q2_SCORES: Record<ChoiceId, ChoiceScore> = {
  A: { quality: -2, autonomy: 0 },
  B: { quality: 0, autonomy: 0 },
  C: { quality: +2, autonomy: +1 },
};

// 질문 3: 코드 수정 접근법 — 최소변경 vs 구조적 리팩토링
// 주 판별: 판단 철학
const Q3_SCORES: Record<ChoiceId, { judgment: number }> = {
  A: { judgment: -2 },  // 최소 변경 우선
  B: { judgment: 0 },
  C: { judgment: +2 },  // 구조적 정리 우선
};

// 질문 4: 설명/보고 스타일 — 간결 vs 상세
// 주 판별: 커뮤니케이션 스타일
const Q4_SCORES: Record<ChoiceId, { communication: number }> = {
  A: { communication: +2 },  // 상세 설명 선호
  B: { communication: 0 },
  C: { communication: -2 },  // 간결 선호
};

// ── Pack 매핑 ──

function qualityFromScore(score: number): QualityPack {
  if (score <= -2) return '보수형';
  if (score >= 2) return '속도형';
  return '균형형';
}

function autonomyFromScore(score: number): AutonomyPack {
  if (score <= -2) return '확인 우선형';
  if (score >= 2) return '자율 실행형';
  return '균형형';
}

function judgmentFromScore(score: number): JudgmentPack {
  if (score <= -1) return '최소변경형';
  if (score >= 1) return '구조적접근형';
  return '균형형';
}

function communicationFromScore(score: number): CommunicationPack {
  if (score <= -1) return '간결형';
  if (score >= 1) return '상세형';
  return '균형형';
}

// ── Confidence ──

function computeConfidence(score: number, q1Contribution: number, q2Contribution: number): number {
  // contradiction: 2문항 기여 부호가 반대일 때
  const contradictions = (q1Contribution > 0 && q2Contribution < 0) || (q1Contribution < 0 && q2Contribution > 0) ? 1 : 0;
  const raw = 0.45 + (0.2 * Math.abs(score)) - (0.15 * contradictions);
  return Math.max(0.2, Math.min(0.95, raw));
}

// ── Trust Policy 추천 ──

const TRUST_MAP: Record<string, TrustPolicy> = {
  '보수형+확인 우선형': '가드레일 우선',
  '속도형+자율 실행형': '완전 신뢰 실행',
};

function suggestTrustPolicy(quality: QualityPack, autonomy: AutonomyPack): TrustPolicy {
  return TRUST_MAP[`${quality}+${autonomy}`] ?? '승인 완화';
}

// ── Main ──

export interface OnboardingResult {
  qualityScore: number;
  autonomyScore: number;
  judgmentScore: number;
  communicationScore: number;
  qualityPack: QualityPack;
  autonomyPack: AutonomyPack;
  judgmentPack: JudgmentPack;
  communicationPack: CommunicationPack;
  qualityConfidence: number;
  autonomyConfidence: number;
  judgmentConfidence: number;
  communicationConfidence: number;
  suggestedTrustPolicy: TrustPolicy;
}

export function computeOnboarding(q1: ChoiceId, q2: ChoiceId, q3: ChoiceId = 'B', q4: ChoiceId = 'B'): OnboardingResult {
  const qualityScore = Q1_SCORES[q1].quality + Q2_SCORES[q2].quality;
  const autonomyScore = Q1_SCORES[q1].autonomy + Q2_SCORES[q2].autonomy;
  const judgmentScore = Q3_SCORES[q3].judgment;
  const communicationScore = Q4_SCORES[q4].communication;

  const qualityPack = qualityFromScore(qualityScore);
  const autonomyPack = autonomyFromScore(autonomyScore);
  const judgmentPack = judgmentFromScore(judgmentScore);
  const communicationPack = communicationFromScore(communicationScore);

  const qualityConfidence = computeConfidence(qualityScore, Q1_SCORES[q1].quality, Q2_SCORES[q2].quality);
  const autonomyConfidence = computeConfidence(autonomyScore, Q1_SCORES[q1].autonomy, Q2_SCORES[q2].autonomy);
  // Q3, Q4는 단일 질문이므로 confidence가 낮음
  const judgmentConfidence = Math.max(0.2, Math.min(0.75, 0.35 + 0.2 * Math.abs(judgmentScore)));
  const communicationConfidence = Math.max(0.2, Math.min(0.75, 0.35 + 0.2 * Math.abs(communicationScore)));

  return {
    qualityScore,
    autonomyScore,
    judgmentScore,
    communicationScore,
    qualityPack,
    autonomyPack,
    judgmentPack,
    communicationPack,
    qualityConfidence,
    autonomyConfidence,
    judgmentConfidence,
    communicationConfidence,
    suggestedTrustPolicy: suggestTrustPolicy(qualityPack, autonomyPack),
  };
}

export function onboardingToRecommendation(result: OnboardingResult): PackRecommendation {
  const avgConfidence = (result.qualityConfidence + result.autonomyConfidence + result.judgmentConfidence + result.communicationConfidence) / 4;
  return createRecommendation({
    source: 'onboarding',
    quality_pack: result.qualityPack,
    autonomy_pack: result.autonomyPack,
    judgment_pack: result.judgmentPack,
    communication_pack: result.communicationPack,
    suggested_trust_policy: result.suggestedTrustPolicy,
    confidence: avgConfidence,
    reason_summary: `온보딩 4문항 결과: quality=${result.qualityScore}, autonomy=${result.autonomyScore}, judgment=${result.judgmentScore}, communication=${result.communicationScore}`,
  });
}
