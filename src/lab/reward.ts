/**
 * Tenetx Lab — Reward Function (Forge v2)
 *
 * 세션의 이벤트를 분석하여 0~1 보상 점수를 계산합니다.
 * Thompson Sampling과 OPRO의 기반 데이터를 제공합니다.
 *
 * 보상 구성요소:
 * - nonOverrideRate (w=0.30): 사용자 override가 없을수록 좋은 설정
 * - successRate (w=0.25): agent/skill 성공 비율
 * - costEfficiency (w=0.15): 토큰 대비 완료 작업
 * - durationScore (w=0.15): 세션 길이 건전성
 * - lowBlockRate (w=0.15): 훅 차단 비율이 낮을수록 적절한 방어
 */

import { createLogger } from '../core/logger.js';
import type { LabEvent, SessionReward } from './types.js';

const log = createLogger('reward');

/** 보상 가중치 — 합은 반드시 1.0 (유지보수 시 확인 필수) */
const WEIGHTS = {
  nonOverrideRate: 0.30,
  successRate: 0.25,
  costEfficiency: 0.15,
  durationScore: 0.15,
  lowBlockRate: 0.15,
} as const;

// 컴파일 타임 합 검증은 불가하므로 모듈 로드 시 런타임 검증
const _weightSum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(_weightSum - 1.0) > 1e-6) {
  throw new Error(`Reward WEIGHTS sum must be 1.0, got ${_weightSum}`);
}

/** 행동 이벤트 타입 (override 비율 계산 분모) */
const ACTION_EVENT_TYPES = new Set([
  'agent-call', 'skill-invocation', 'hook-trigger',
  'mode-activation', 'routing-decision', 'user-override', 'user-rejection',
]);

/** 세션 이벤트에서 보상 구성요소를 계산 */
export function computeRewardComponents(
  sessionEvents: LabEvent[],
): SessionReward['components'] {
  // nonOverrideRate: 1 - (override + rejection) / total actions
  const actionEvents = sessionEvents.filter(e => ACTION_EVENT_TYPES.has(e.type));
  const overrideCount = sessionEvents.filter(e =>
    e.type === 'user-override' || e.type === 'user-rejection',
  ).length;
  const nonOverrideRate = actionEvents.length > 0
    ? 1 - (overrideCount / actionEvents.length)
    : 1.0;

  // successRate: agent-call/skill-invocation 성공 비율
  const taskEvents = sessionEvents.filter(e =>
    e.type === 'agent-call' || e.type === 'skill-invocation',
  );
  const successCount = taskEvents.filter(e =>
    String(e.payload.result ?? '') === 'success',
  ).length;
  const successRate = taskEvents.length > 0
    ? successCount / taskEvents.length
    : 0.5; // 중립 (데이터 없음)

  // costEfficiency: sigmoid(10 / costPerSuccess)
  const metricsEvents = sessionEvents.filter(e => e.type === 'session-metrics');
  let costEfficiency = 0.5;
  if (metricsEvents.length > 0 && successCount > 0) {
    const lastMetrics = metricsEvents[metricsEvents.length - 1];
    const totalCost = (lastMetrics.payload.estimatedCost as number) ?? 0;
    if (totalCost > 0) {
      const costPerSuccess = totalCost / successCount;
      // log-scale sigmoid: median=$0.05에서 0.5, $0.5에서 ~0.12, $0.005에서 ~0.88
      const logCost = Math.log(costPerSuccess + 1e-8);
      const logMedian = Math.log(0.05);
      costEfficiency = sigmoid(-(logCost - logMedian) / 0.8);
    }
  }

  // durationScore: bell curve — 최적 30분, 5분 미만/180분 초과는 0.2
  let durationScore = 0.5;
  if (sessionEvents.length >= 2) {
    const timestamps = sessionEvents.map(e => new Date(e.timestamp).getTime()).sort();
    const durationMin = (timestamps[timestamps.length - 1] - timestamps[0]) / 60000;
    durationScore = bellCurveScore(durationMin, 30, 40);
  }

  // lowBlockRate: 1 - block비율
  const hookEvents = sessionEvents.filter(e => e.type === 'hook-trigger');
  const blockCount = hookEvents.filter(e =>
    String(e.payload.result ?? '') === 'block',
  ).length;
  const lowBlockRate = hookEvents.length > 0
    ? 1 - (blockCount / hookEvents.length)
    : 1.0;

  return {
    nonOverrideRate: clamp01(nonOverrideRate),
    successRate: clamp01(successRate),
    costEfficiency: clamp01(costEfficiency),
    durationScore: clamp01(durationScore),
    lowBlockRate: clamp01(lowBlockRate),
  };
}

/** 이벤트 배열에서 세션별 보상을 계산 */
export function computeSessionRewards(events: LabEvent[]): SessionReward[] {
  // 세션별 그룹화
  const sessions = new Map<string, LabEvent[]>();
  for (const event of events) {
    const sid = event.sessionId;
    if (!sessions.has(sid)) sessions.set(sid, []);
    sessions.get(sid)?.push(event);
  }

  const rewards: SessionReward[] = [];
  for (const [sessionId, sessionEvents] of sessions) {
    if (sessionEvents.length < 3) continue; // 너무 짧은 세션 제외

    try {
      const components = computeRewardComponents(sessionEvents);
      const reward =
        WEIGHTS.nonOverrideRate * components.nonOverrideRate +
        WEIGHTS.successRate * components.successRate +
        WEIGHTS.costEfficiency * components.costEfficiency +
        WEIGHTS.durationScore * components.durationScore +
        WEIGHTS.lowBlockRate * components.lowBlockRate;

      rewards.push({
        sessionId,
        timestamp: sessionEvents[sessionEvents.length - 1].timestamp,
        dimensionSnapshot: {}, // 호출자가 세션 시작 시점의 프로필로 채움
        components,
        reward: clamp01(reward),
      });
    } catch (e) {
      log.debug(`세션 ${sessionId} 보상 계산 실패`, e);
    }
  }

  return rewards;
}

// ── Utility functions ──

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Bell curve score: peak at center, spread controlled by sigma */
function bellCurveScore(value: number, center: number, sigma: number): number {
  const z = (value - center) / sigma;
  const raw = Math.exp(-0.5 * z * z);
  // 최소 0.2 보장 (극단값도 완전히 0이 되지 않도록)
  return 0.2 + 0.8 * raw;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5; // NaN/Infinity → 중립
  return Math.max(0, Math.min(1, v));
}
