/**
 * Tenetx Insight — Session Retrospective
 *
 * 세션 종료 후 패턴 매칭 기반 자동 회고. LLM 호출 0, 외부 의존성 0.
 *
 * 규칙 엔진 (Schon's Reflective Practice 기반):
 *   규칙 1: 솔루션 주입 후 override — surprise 감지 (Reflection-in-Action)
 *   규칙 2: 같은 에이전트 3회+ 연속 호출 — 효율 경고
 *   규칙 3: 세션 duration이 평균의 2배 초과 — 집중도 경고
 *   규칙 5: 과거 성공 패턴과의 비교 — frame 재구성 (seeing-as)
 *   규칙 4: reward baseline 이탈 — Phase 1.5 (30+ 세션 후 활성화)
 */

import { readEvents } from '../lab/store.js';
import type { LabEvent } from '../lab/types.js';
import type { RetrospectiveResult, RetrospectiveInsight } from './types.js';

// ── Rule Engine ────────────────────────────────────

/** 규칙 1: 솔루션 주입 후 override/rejection 발생 */
function rule1OverrideAfterInjection(events: LabEvent[]): RetrospectiveInsight[] {
  const insights: RetrospectiveInsight[] = [];
  const injected = events.filter(e => e.type === 'compound-injected');
  const rejections = events.filter(e => e.type === 'user-override' || e.type === 'user-rejection');

  if (injected.length > 0 && rejections.length > 0) {
    insights.push({
      rule: 'override-after-injection',
      severity: 'action',
      message: `주입된 솔루션 이후 ${rejections.length}건의 거부/수정이 발생했습니다. 솔루션 적합성을 재검토하세요.`,
    });
  }
  return insights;
}

/** 규칙 2: 같은 에이전트 3회+ 연속 호출 */
function rule2RepeatedAgent(events: LabEvent[]): RetrospectiveInsight[] {
  const insights: RetrospectiveInsight[] = [];
  const agentCalls = events.filter(e => e.type === 'agent-call');

  let currentAgent = '';
  let count = 0;
  for (const call of agentCalls) {
    const name = String(call.payload.name ?? '');
    if (name === currentAgent) {
      count++;
    } else {
      if (count >= 3) {
        insights.push({
          rule: 'repeated-agent',
          severity: 'info',
          message: `'${currentAgent}' 에이전트를 ${count}회 연속 호출했습니다. 파이프라인 순서 조정으로 효율을 높일 수 있습니다.`,
        });
      }
      currentAgent = name;
      count = 1;
    }
  }
  if (count >= 3) {
    insights.push({
      rule: 'repeated-agent',
      severity: 'info',
      message: `'${currentAgent}' 에이전트를 ${count}회 연속 호출했습니다. 파이프라인 순서 조정으로 효율을 높일 수 있습니다.`,
    });
  }
  return insights;
}

/** 규칙 3: 세션 duration이 이전 30세션 평균의 2배 초과 */
function rule3LongSession(
  durationMs: number,
  avgDurationMs: number,
): RetrospectiveInsight[] {
  if (avgDurationMs <= 0 || durationMs <= 0) return [];
  const ratio = durationMs / avgDurationMs;
  if (ratio > 2.0) {
    return [{
      rule: 'long-session',
      severity: 'warn',
      message: `이번 세션은 평소보다 ${ratio.toFixed(1)}배 길었습니다 (${Math.round(durationMs / 60000)}분). 작업을 분할하면 집중도가 높아집니다.`,
    }];
  }
  return [];
}

/** 규칙 5: 과거 성공 패턴과의 비교 (frame 재구성) */
function rule5FrameRecomposition(
  currentSessionEvents: LabEvent[],
  recentEvents: LabEvent[],
): RetrospectiveInsight[] {
  const insights: RetrospectiveInsight[] = [];

  // 최근 3일간의 에이전트 사용 집합 vs 현재 세션
  const recentAgents = new Set(
    recentEvents
      .filter(e => e.type === 'agent-call')
      .map(e => String(e.payload.name ?? '')),
  );
  const currentAgents = new Set(
    currentSessionEvents
      .filter(e => e.type === 'agent-call')
      .map(e => String(e.payload.name ?? '')),
  );

  for (const agent of recentAgents) {
    if (agent && !currentAgents.has(agent)) {
      insights.push({
        rule: 'frame-recomposition',
        severity: 'info',
        message: `최근 세션에서 '${agent}'를 사용했지만 이번 세션에서는 호출하지 않았습니다. 이 변화가 의도적인지 확인하세요.`,
      });
    }
  }

  return insights;
}

// ── Main ───────────────────────────────────────────

/** 세션 회고 생성 (sessionId 기반) */
export function generateRetrospective(
  sessionId: string,
  sessionStartMs: number,
  sessionEndMs: number,
  avgDurationMs: number = 0,
): RetrospectiveResult {
  const sessionEvents = readEvents(sessionStartMs, sessionEndMs)
    .filter(e => e.sessionId === sessionId);

  // 최근 3일간 이벤트 (현재 세션 제외, frame 재구성 규칙용)
  const threeDaysAgo = sessionStartMs - 3 * 24 * 60 * 60 * 1000;
  const recentEvents = readEvents(threeDaysAgo, sessionStartMs);

  const insights: RetrospectiveInsight[] = [
    ...rule1OverrideAfterInjection(sessionEvents),
    ...rule2RepeatedAgent(sessionEvents),
    ...rule3LongSession(sessionEndMs - sessionStartMs, avgDurationMs),
    ...rule5FrameRecomposition(sessionEvents, recentEvents),
  ];

  const durationMs = sessionEndMs - sessionStartMs;

  return {
    sessionId,
    duration: avgDurationMs > 0
      ? { actual: durationMs, avgLast30: avgDurationMs, ratio: durationMs / avgDurationMs }
      : null,
    insights,
    surpriseDetected: false, // Phase 1.5
  };
}

/** ASCII 포맷 렌더링 */
export function formatRetrospective(result: RetrospectiveResult): string {
  if (result.insights.length === 0) return '';

  const lines: string[] = ['  ── Session Retrospective ──────────────'];
  for (const insight of result.insights) {
    const icon = insight.severity === 'action' ? '!' : insight.severity === 'warn' ? '?' : '-';
    lines.push(`  [${icon}] ${insight.message}`);
  }
  return lines.join('\n');
}
