/**
 * Tenetx — Signal Scorer
 *
 * 신호 번들을 가중치 스코어링하여 모델 티어를 결정.
 * Philosophy의 선언적 라우팅이 최우선, 신호 스코어링은 동적 에스컬레이션용.
 *
 * 스코어 범위: 0~20+
 * - HIGH (≥8): Opus 추천
 * - MEDIUM (4~7): Sonnet 추천
 * - LOW (<4): Haiku 추천
 */

import type { SignalBundle } from './signals.js';
import type { ModelTier } from './router.js';

export interface ScoreBreakdown {
  /** 최종 스코어 */
  total: number;
  /** 개별 스코어 기여 */
  contributions: Record<string, number>;
  /** 추천 모델 티어 */
  recommendedTier: ModelTier;
}

// ── 가중치 상수 ───────────────────────────────────

const WEIGHTS = {
  // 어휘
  architecture: 3,       // 아키텍처 키워드 당
  debugging: 2,          // 디버깅 키워드 당
  risk: 2,              // 리스크/보안 키워드 당
  deepQuestion: 2,       // why/how 질문
  codeBlock: 1,          // 코드 블록 포함
  longPrompt: 1,         // 긴 프롬프트 (100+ 단어)
  multiRequirement: 1,   // 다중 요구사항

  // 구조
  subtasks: 1,           // 서브태스크 당 (최대 +4)
  crossFile: 2,          // 교차파일 의존성
  needsTests: 1,         // 테스트 필요
  securityDomain: 2,     // 보안 도메인
  highIrreversibility: 3, // 되돌리기 어려움
  medIrreversibility: 1,  // 중간 되돌리기 난이도

  // 컨텍스트
  previousFailure: 2,    // 실패당 (최대 +6)
  deepConversation: 1,   // 긴 대화 (20+ 턴)
  agentChain: 1,         // 에이전트 체인 깊이당

  // 감점
  simpleQuestion: -2,    // what/where 단순 질문
  shortPrompt: -1,       // 짧은 프롬프트 (<20 단어)
} as const;

// ── 임계값 ────────────────────────────────────────

const HIGH_THRESHOLD = 8;
const MEDIUM_THRESHOLD = 4;

// ── 스코어링 ──────────────────────────────────────

export function scoreSignals(signals: SignalBundle): ScoreBreakdown {
  const contributions: Record<string, number> = {};
  let total = 0;

  function add(key: string, value: number): void {
    if (value !== 0) {
      contributions[key] = value;
      total += value;
    }
  }

  // 어휘 신호
  const { lexical, structural, context } = signals;

  add('architecture', Math.min(lexical.architectureKeywords, 3) * WEIGHTS.architecture);
  add('debugging', Math.min(lexical.debugKeywords, 3) * WEIGHTS.debugging);
  add('risk', Math.min(lexical.riskKeywords, 3) * WEIGHTS.risk);

  if (lexical.questionDepth === 'deep') add('deepQuestion', WEIGHTS.deepQuestion);
  if (lexical.questionDepth === 'shallow') add('simpleQuestion', WEIGHTS.simpleQuestion);

  if (lexical.hasCodeBlock) add('codeBlock', WEIGHTS.codeBlock);
  if (lexical.wordCount >= 100) add('longPrompt', WEIGHTS.longPrompt);
  if (lexical.wordCount < 20) add('shortPrompt', WEIGHTS.shortPrompt);
  if (lexical.multiRequirement) add('multiRequirement', WEIGHTS.multiRequirement);

  // 구조 신호
  add('subtasks', Math.min(structural.estimatedSubtasks, 4) * WEIGHTS.subtasks);
  if (structural.crossFileDependency) add('crossFile', WEIGHTS.crossFile);
  if (structural.needsTests) add('needsTests', WEIGHTS.needsTests);
  if (structural.securityDomain) add('securityDomain', WEIGHTS.securityDomain);
  if (structural.irreversibility === 'high') add('highIrreversibility', WEIGHTS.highIrreversibility);
  else if (structural.irreversibility === 'medium') add('medIrreversibility', WEIGHTS.medIrreversibility);

  // 컨텍스트 신호
  add('previousFailures', Math.min(context.previousFailures, 3) * WEIGHTS.previousFailure);
  if (context.conversationTurns >= 20) add('deepConversation', WEIGHTS.deepConversation);
  add('agentChain', Math.min(context.agentChainDepth, 3) * WEIGHTS.agentChain);

  // 최소 0
  total = Math.max(0, total);

  // 티어 결정
  let recommendedTier: ModelTier;
  if (total >= HIGH_THRESHOLD) recommendedTier = 'opus';
  else if (total >= MEDIUM_THRESHOLD) recommendedTier = 'sonnet';
  else recommendedTier = 'haiku';

  return { total, contributions, recommendedTier };
}
