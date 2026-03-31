/**
 * Tenetx Orchestration — Agent Overlay Injector
 *
 * PreToolUse 훅에서 Agent tool 감지 시 forge agent-tuner overlay를
 * approve(message)로 주입하여 Claude Code의 sub-agent 동작을 개인화.
 *
 * Plugin SDK 제약: tool input을 직접 수정할 수 없으므로
 * approve(systemMessage)로 힌트를 전달. Claude가 이를 참고하여
 * sub-agent 프롬프트에 반영.
 *
 * 설계 결정:
 *   - approve(message)는 힌트이므로 강제성 없음 (의도적 설계)
 *   - forge-profile이 없으면 조용히 skip (Phase 0 이전 환경 호환)
 *   - 에이전트 타입 추론은 프롬프트 키워드 기반 (LLM 호출 0)
 */

import type { AgentOverlay } from '../forge/types.js';
import type { OverlayInjection } from './types.js';

// ── Agent Type Inference ───────────────────────────

/** 프롬프트 키워드 → 에이전트 타입 매핑 */
const AGENT_KEYWORDS: Array<{ pattern: RegExp; agentType: string }> = [
  { pattern: /코드\s*리뷰|code.?review|review.*code/i, agentType: 'code-reviewer' },
  { pattern: /보안.*리뷰|보안.*검토|security.?review|security.?audit/i, agentType: 'security-reviewer' },
  { pattern: /성능.*리뷰|performance.?review/i, agentType: 'performance-reviewer' },
  { pattern: /디버그|debug|버그.*찾|원인.*분석/i, agentType: 'debugger' },
  { pattern: /테스트.*작성|test.*write|tdd|테스트.*먼저/i, agentType: 'test-engineer' },
  { pattern: /리팩토링|refactor/i, agentType: 'refactoring-expert' },
  { pattern: /설계|아키텍처|architect|design.*system/i, agentType: 'architect' },
  { pattern: /탐색|explore|검색|찾아/i, agentType: 'explore' },
  { pattern: /비평|critic|검증/i, agentType: 'critic' },
  // executor는 기본값 (다른 패턴에 매칭되지 않을 때)
];

/** 프롬프트에서 에이전트 타입 추론 (first-match-wins: 복수 의도 시 첫 매칭만 적용) */
export function inferAgentType(prompt: string): string {
  for (const { pattern, agentType } of AGENT_KEYWORDS) {
    if (pattern.test(prompt)) return agentType;
  }
  return 'executor';
}

// ── Overlay Message Formatting ─────────────────────

/** 오버레이를 approve(message)용 마크다운으로 포맷 */
export function formatOverlayMessage(
  agentType: string,
  overlay: AgentOverlay,
): string {
  const modifiers = overlay.behaviorModifiers
    .map(m => `- ${m}`)
    .join('\n');

  return [
    `<tenetx-agent-tuning agent="${agentType}">`,
    `## Personalized Agent Tuning for ${agentType}`,
    ``,
    `Parameters: strictness=${overlay.parameters.strictness.toFixed(2)} autonomy=${overlay.parameters.autonomy.toFixed(2)} depth=${overlay.parameters.depth.toFixed(2)}`,
    ``,
    modifiers,
    `</tenetx-agent-tuning>`,
  ].join('\n');
}

// ── Public API ──────────────────────────────────────

/**
 * Agent tool의 prompt에서 에이전트 타입을 추론하고,
 * forge overlay를 매칭하여 주입 메시지를 생성.
 *
 * @returns null이면 overlay 주입 불필요 (forge-profile 없음 등)
 */
export function buildOverlayInjection(
  agentPrompt: string,
  overlays: AgentOverlay[],
): OverlayInjection | null {
  if (overlays.length === 0) return null;

  const agentType = inferAgentType(agentPrompt);
  const overlay = overlays.find(o => o.agentName === agentType);
  if (!overlay) return null;

  return {
    agentType,
    message: formatOverlayMessage(agentType, overlay),
    recommendedModel: overlay.parameters.depth >= 0.7 ? 'opus' : 'sonnet',
  };
}
