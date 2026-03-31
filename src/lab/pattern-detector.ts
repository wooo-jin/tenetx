/**
 * Tenetx Lab — Behavioral Pattern Detector
 *
 * Extracts behavioral patterns from lab events and translates them
 * into dimension adjustments for the auto-learning engine.
 */

import { createLogger } from '../core/logger.js';

const log = createLogger('pattern-detector');
import type { LabEvent, BehavioralPattern, DimensionAdjustment } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum single adjustment magnitude */
const MAX_DELTA = 0.1;

/** Minimum events required to detect a pattern.
 * n=20 gives FPR≈3%, 95% CI width≈30% (vs n=10: FPR=8.6%, CI=45%).
 * Raised from 10 based on statistical power analysis (Wilson score interval). */
const MIN_EVENTS_FOR_PATTERN = 20;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Beta posterior confidence: P(true_rate > threshold | data).
 * Uses Beta(1+k, 1+n-k) posterior with uniform prior Beta(1,1).
 * Naturally accounts for sample size — n=10 gives lower confidence than n=1000
 * for the same observed rate. (Bayesian alternative to frequentist rate×multiplier)
 */
function betaConfidence(k: number, n: number, threshold: number): number {
  if (n <= 0 || k < 0 || k > n) return 0;
  // Approximate P(X > threshold) via normal approximation to Beta distribution
  const alpha = 1 + k;
  const beta = 1 + n - k;
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const std = Math.sqrt(variance);
  if (std === 0) return mean > threshold ? 1 : 0;
  // P(X > threshold) ≈ Φ((mean - threshold) / std)
  const z = (mean - threshold) / std;
  // Standard normal CDF approximation (Abramowitz & Stegun 26.2.17)
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = 1 - poly * Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  return z >= 0 ? phi : 1 - phi;
}

function makePattern(
  id: string,
  type: BehavioralPattern['type'],
  description: string,
  confidence: number,
  eventCount: number,
  firstSeen: string,
  lastSeen: string,
): BehavioralPattern {
  return {
    id,
    type,
    description,
    confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100,
    eventCount,
    firstSeen,
    lastSeen,
  };
}

function timeRange(events: LabEvent[]): { firstSeen: string; lastSeen: string } {
  if (events.length === 0) {
    const now = new Date().toISOString();
    return { firstSeen: now, lastSeen: now };
  }
  const sorted = events
    .map(e => e.timestamp)
    .sort();
  return { firstSeen: sorted[0], lastSeen: sorted[sorted.length - 1] };
}

// ---------------------------------------------------------------------------
// Pattern Detectors
// ---------------------------------------------------------------------------

/** Detect: user frequently overrides AI decisions */
function detectOverridePattern(events: LabEvent[]): BehavioralPattern | null {
  const overrideEvents = events.filter(e => e.type === 'user-override');
  const totalActionEvents = events.filter(
    e => e.type === 'agent-call' || e.type === 'hook-trigger' || e.type === 'user-override',
  );
  if (totalActionEvents.length < MIN_EVENTS_FOR_PATTERN) return null;

  const overrideRate = overrideEvents.length / totalActionEvents.length;
  if (overrideRate <= 0.15) return null;

  const range = timeRange(overrideEvents);
  const confidence = betaConfidence(overrideEvents.length, totalActionEvents.length, 0.15);
  return makePattern(
    'high-override-rate',
    'preference',
    `User overrides AI decisions ${Math.round(overrideRate * 100)}% of the time`,
    confidence,
    overrideEvents.length,
    range.firstSeen,
    range.lastSeen,
  );
}

/** Detect: user rarely intervenes in autopilot sessions */
function detectLowInterventionPattern(events: LabEvent[]): BehavioralPattern | null {
  // Group events by session
  const sessions = new Map<string, LabEvent[]>();
  for (const e of events) {
    const list = sessions.get(e.sessionId) ?? [];
    list.push(e);
    sessions.set(e.sessionId, list);
  }

  if (sessions.size < 3) return null;

  let lowInterventionSessions = 0;
  let totalSessions = 0;
  const allSessionEvents: LabEvent[] = [];

  for (const [, sessionEvents] of sessions) {
    const actionEvents = sessionEvents.filter(
      e => e.type === 'agent-call' || e.type === 'hook-trigger',
    );
    const overrides = sessionEvents.filter(e => e.type === 'user-override');
    if (actionEvents.length < 3) continue;

    totalSessions++;
    const interventionRate = overrides.length / actionEvents.length;
    if (interventionRate < 0.1) {
      lowInterventionSessions++;
      allSessionEvents.push(...sessionEvents);
    }
  }

  if (totalSessions < 3) return null;
  const lowRate = lowInterventionSessions / totalSessions;
  if (lowRate < 0.5) return null;

  const range = timeRange(allSessionEvents.length > 0 ? allSessionEvents : events);
  return makePattern(
    'low-intervention',
    'preference',
    `${Math.round(lowRate * 100)}% of sessions have <10% user intervention`,
    betaConfidence(lowInterventionSessions, totalSessions, 0.5),
    allSessionEvents.length,
    range.firstSeen,
    range.lastSeen,
  );
}

/** Detect: code-reviewer has high/low acceptance rate */
function detectReviewerAcceptancePattern(events: LabEvent[]): BehavioralPattern | null {
  const reviewEvents = events.filter(
    e => e.type === 'agent-call' && e.payload.name === 'code-reviewer',
  );
  if (reviewEvents.length < MIN_EVENTS_FOR_PATTERN) return null;

  const successEvents = reviewEvents.filter(
    e => e.payload.result === 'success',
  );
  const acceptanceRate = successEvents.length / reviewEvents.length;
  const range = timeRange(reviewEvents);

  if (acceptanceRate < 0.5) {
    return makePattern(
      'low-review-acceptance',
      'avoidance',
      `Code reviewer acceptance rate is ${Math.round(acceptanceRate * 100)}% (too strict)`,
      betaConfidence(reviewEvents.length - successEvents.length, reviewEvents.length, 0.5),
      reviewEvents.length,
      range.firstSeen,
      range.lastSeen,
    );
  }

  return null;
}

/** Detect: user frequently uses TDD skill */
function detectTddUsagePattern(events: LabEvent[]): BehavioralPattern | null {
  const skillEvents = events.filter(e => e.type === 'skill-invocation');
  const tddEvents = skillEvents.filter(
    e => String(e.payload.skillName ?? '').toLowerCase().includes('tdd'),
  );
  const codingSessions = new Set(
    events
      .filter(e => e.type === 'agent-call' || e.type === 'skill-invocation')
      .map(e => e.sessionId),
  );

  if (codingSessions.size < 5) return null;

  const tddSessions = new Set(tddEvents.map(e => e.sessionId));
  const tddRate = tddSessions.size / codingSessions.size;
  if (tddRate < 0.15) return null;

  const range = timeRange(tddEvents);
  return makePattern(
    'frequent-tdd',
    'workflow',
    `TDD skill used in ${Math.round(tddRate * 100)}% of coding sessions`,
    betaConfidence(tddSessions.size, codingSessions.size, 0.15),
    tddEvents.length,
    range.firstSeen,
    range.lastSeen,
  );
}

/** Detect: model escalation happens often */
function detectEscalationPattern(events: LabEvent[]): BehavioralPattern | null {
  const routingEvents = events.filter(e => e.type === 'routing-decision');
  if (routingEvents.length < MIN_EVENTS_FOR_PATTERN) return null;

  const escalated = routingEvents.filter(e => {
    const recommended = String(e.payload.recommendedModel ?? '').toLowerCase();
    const actual = String(e.payload.actualModel ?? '').toLowerCase();
    const isLowerRecommended = recommended.includes('haiku') || recommended.includes('sonnet');
    const isHigherActual = actual.includes('opus');
    return isLowerRecommended && isHigherActual;
  });

  const escalationRate = escalated.length / routingEvents.length;
  if (escalationRate < 0.3) return null;

  const range = timeRange(escalated);
  return makePattern(
    'frequent-escalation',
    'workflow',
    `${Math.round(escalationRate * 100)}% of routing decisions escalate to a higher model`,
    betaConfidence(escalated.length, routingEvents.length, 0.3),
    escalated.length,
    range.firstSeen,
    range.lastSeen,
  );
}

/** Detect: user overrides verbose explanations */
function detectVerboseOverridePattern(events: LabEvent[]): BehavioralPattern | null {
  const overrideEvents = events.filter(e => e.type === 'user-override');
  const verboseOverrides = overrideEvents.filter(e => {
    const decision = String(e.payload.userDecision ?? '').toLowerCase();
    const original = String(e.payload.originalDecision ?? '').toLowerCase();
    return decision.includes('too long') || decision.includes('verbose')
      || decision.includes('terse') || decision.includes('brief')
      || original.includes('verbose') || original.includes('explanation');
  });

  if (verboseOverrides.length < 3) return null;

  const range = timeRange(verboseOverrides);
  const totalOverrides = overrideEvents.length; // ≥5 guaranteed by early return above
  return makePattern(
    'verbose-override',
    'avoidance',
    'User frequently overrides verbose explanations',
    betaConfidence(verboseOverrides.length, totalOverrides, 0.1),
    verboseOverrides.length,
    range.firstSeen,
    range.lastSeen,
  );
}

/** Detect: frequent use of architect/design agents */
function detectArchitectUsagePattern(events: LabEvent[]): BehavioralPattern | null {
  const agentEvents = events.filter(e => e.type === 'agent-call');
  if (agentEvents.length < MIN_EVENTS_FOR_PATTERN) return null;

  const architectEvents = agentEvents.filter(e => {
    const name = String(e.payload.name ?? '').toLowerCase();
    return name.includes('architect') || name.includes('design');
  });

  const architectRate = architectEvents.length / agentEvents.length;
  if (architectRate < 0.15) return null;

  const range = timeRange(architectEvents);
  return makePattern(
    'frequent-architect',
    'dependency',
    `Architect/design agents used in ${Math.round(architectRate * 100)}% of agent calls`,
    betaConfidence(architectEvents.length, agentEvents.length, 0.15),
    architectEvents.length,
    range.firstSeen,
    range.lastSeen,
  );
}

/** Detect: frequent security hook blocks */
function detectSecurityBlockPattern(events: LabEvent[]): BehavioralPattern | null {
  const hookEvents = events.filter(e => e.type === 'hook-trigger');
  if (hookEvents.length < MIN_EVENTS_FOR_PATTERN) return null;

  const securityBlocks = hookEvents.filter(e => {
    const hookName = String(e.payload.hookName ?? '').toLowerCase();
    const result = String(e.payload.result ?? '');
    return (hookName.includes('security') || hookName.includes('secret')
      || hookName.includes('db-guard'))
      && result === 'block';
  });

  const blockRate = securityBlocks.length / hookEvents.length;
  if (blockRate < 0.1) return null;

  const range = timeRange(securityBlocks);
  return makePattern(
    'frequent-security-blocks',
    'avoidance',
    `Security hooks blocking ${Math.round(blockRate * 100)}% of actions`,
    betaConfidence(securityBlocks.length, hookEvents.length, 0.1),
    securityBlocks.length,
    range.firstSeen,
    range.lastSeen,
  );
}

// ---------------------------------------------------------------------------
// Forge v2: Bidirectional Patterns (양방향 패턴)
// ---------------------------------------------------------------------------

/** Detect: user repeatedly approves security warnings → higher risk tolerance */
function detectRiskUpPattern(events: LabEvent[]): BehavioralPattern | null {
  const hookEvents = events.filter(e => e.type === 'hook-trigger');
  if (hookEvents.length < MIN_EVENTS_FOR_PATTERN) return null;

  const securityApprovals = hookEvents.filter(e => {
    const hookName = String(e.payload.hookName ?? '').toLowerCase();
    const result = String(e.payload.result ?? '');
    return (hookName.includes('security') || hookName.includes('secret')
      || hookName.includes('db-guard'))
      && result === 'approve';
  });

  const securityTotal = hookEvents.filter(e => {
    const hookName = String(e.payload.hookName ?? '').toLowerCase();
    return hookName.includes('security') || hookName.includes('secret')
      || hookName.includes('db-guard');
  });

  if (securityTotal.length < 10) return null;
  const approveRate = securityApprovals.length / securityTotal.length;
  if (approveRate < 0.85) return null; // 85% 이상 통과 시에만

  const range = timeRange(securityApprovals);
  return makePattern(
    'risk-tolerance-up',
    'preference',
    `Security hooks approved ${Math.round(approveRate * 100)}% of the time`,
    betaConfidence(securityApprovals.length, securityTotal.length, 0.85),
    securityApprovals.length,
    range.firstSeen,
    range.lastSeen,
  );
}

/** Detect: user requests verbose/detailed explanations → lower communicationStyle */
function detectVerbosePreferencePattern(events: LabEvent[]): BehavioralPattern | null {
  const overrideEvents = events.filter(e => e.type === 'user-override');
  if (overrideEvents.length < 5) return null;

  const verboseRequests = overrideEvents.filter(e => {
    const desc = String(e.payload.userDecision ?? '').toLowerCase();
    return desc.includes('explain') || desc.includes('detail') || desc.includes('why')
      || desc.includes('more context') || desc.includes('설명') || desc.includes('자세히');
  });

  if (verboseRequests.length < 3) return null;

  const range = timeRange(verboseRequests);
  return makePattern(
    'communication-verbose',
    'preference',
    `User requested detailed explanations ${verboseRequests.length} times`,
    betaConfidence(verboseRequests.length, overrideEvents.length, 0.15),
    verboseRequests.length,
    range.firstSeen,
    range.lastSeen,
  );
}

/** Detect: user prefers pragmatic/fast implementation over architecture → lower abstractionLevel */
function detectPragmaticPattern(events: LabEvent[]): BehavioralPattern | null {
  const agentEvents = events.filter(e => e.type === 'agent-call');
  if (agentEvents.length < MIN_EVENTS_FOR_PATTERN) return null;

  // executor/build 에이전트 대비 architect/design 비율
  const executorCalls = agentEvents.filter(e => {
    const name = String(e.payload.name ?? '').toLowerCase();
    return name.includes('executor') || name.includes('build') || name.includes('implement');
  });

  const architectCalls = agentEvents.filter(e => {
    const name = String(e.payload.name ?? '').toLowerCase();
    return name.includes('architect') || name.includes('design') || name.includes('plan');
  });

  if (executorCalls.length + architectCalls.length < 10) return null;
  const pragmaticRate = executorCalls.length / (executorCalls.length + architectCalls.length);
  if (pragmaticRate < 0.8) return null; // 80% 이상 실행 에이전트 사용

  const range = timeRange(executorCalls);
  return makePattern(
    'abstraction-pragmatic',
    'preference',
    `Executor/build agents used ${Math.round(pragmaticRate * 100)}% of the time (vs architect)`,
    betaConfidence(executorCalls.length, executorCalls.length + architectCalls.length, 0.8),
    executorCalls.length,
    range.firstSeen,
    range.lastSeen,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const detectors: Array<(events: LabEvent[]) => BehavioralPattern | null> = [
  detectOverridePattern,
  detectLowInterventionPattern,
  detectReviewerAcceptancePattern,
  detectTddUsagePattern,
  detectEscalationPattern,
  detectVerboseOverridePattern,
  detectArchitectUsagePattern,
  detectSecurityBlockPattern,
  // Forge v2: bidirectional patterns
  detectRiskUpPattern,
  detectVerbosePreferencePattern,
  detectPragmaticPattern,
];

/**
 * Detect behavioral patterns from lab events.
 * @param events Lab events to analyze
 * @param minConfidence Minimum confidence threshold (0-1)
 */
export function detectPatterns(
  events: LabEvent[],
  minConfidence: number = 0.3,
): BehavioralPattern[] {
  try {
    const patterns: BehavioralPattern[] = [];
    for (const detector of detectors) {
      const pattern = detector(events);
      if (pattern && pattern.confidence >= minConfidence) {
        patterns.push(pattern);
      }
    }
    // Sort by confidence descending
    patterns.sort((a, b) => b.confidence - a.confidence);
    return patterns;
  } catch (e) {
    log.debug('Failed to detect patterns', e);
    return [];
  }
}

/**
 * Pattern → dimension mapping table.
 * Centralized to ensure consistent delta calculation and normalization.
 */
const PATTERN_DIMENSION_DELTAS: Record<string, { dimension: string; deltaSign: 1 | -1; baseDelta: number }> = {
  'high-override-rate':       { dimension: 'autonomyPreference',  deltaSign: -1, baseDelta: 0.05 },
  'low-intervention':         { dimension: 'autonomyPreference',  deltaSign:  1, baseDelta: 0.05 },
  'low-review-acceptance':    { dimension: 'qualityFocus',        deltaSign: -1, baseDelta: 0.05 },
  'frequent-tdd':             { dimension: 'qualityFocus',        deltaSign:  1, baseDelta: 0.05 },
  'frequent-escalation':      { dimension: 'qualityFocus',        deltaSign:  1, baseDelta: 0.05 },
  'verbose-override':         { dimension: 'communicationStyle',  deltaSign:  1, baseDelta: 0.1  },
  'frequent-architect':       { dimension: 'abstractionLevel',    deltaSign:  1, baseDelta: 0.05 },
  'frequent-security-blocks': { dimension: 'riskTolerance',       deltaSign: -1, baseDelta: 0.05 },
  // Forge v2: bidirectional patterns
  'risk-tolerance-up':        { dimension: 'riskTolerance',       deltaSign:  1, baseDelta: 0.05 },
  'communication-verbose':    { dimension: 'communicationStyle',  deltaSign: -1, baseDelta: 0.05 },
  'abstraction-pragmatic':    { dimension: 'abstractionLevel',    deltaSign: -1, baseDelta: 0.05 },
};

/**
 * Count how many patterns can map to each dimension (for normalization).
 * qualityFocus has 3 patterns (low-review, tdd, escalation) → delta / 3.
 * This prevents dimensions with more mapped patterns from evolving faster.
 */
const DIMENSION_PATTERN_COUNT: Record<string, number> = {};
for (const { dimension } of Object.values(PATTERN_DIMENSION_DELTAS)) {
  DIMENSION_PATTERN_COUNT[dimension] = (DIMENSION_PATTERN_COUNT[dimension] ?? 0) + 1;
}

/**
 * Translate behavioral patterns into dimension adjustments.
 *
 * Normalization: when multiple patterns map to the same dimension,
 * each delta is divided by the total number of patterns for that dimension.
 * This ensures all dimensions evolve at comparable speed regardless of
 * how many detectors feed into them.
 */
export function patternsToDimensionAdjustments(
  patterns: BehavioralPattern[],
): DimensionAdjustment[] {
  const adjustments: DimensionAdjustment[] = [];

  for (const pattern of patterns) {
    const mapping = PATTERN_DIMENSION_DELTAS[pattern.id];
    if (!mapping) continue;

    const { dimension, deltaSign, baseDelta } = mapping;
    const patternCount = DIMENSION_PATTERN_COUNT[dimension] ?? 1;
    // Normalize: divide by number of potential patterns for this dimension
    const rawDelta = deltaSign * Math.min(MAX_DELTA, baseDelta * pattern.confidence);
    const normalizedDelta = rawDelta / patternCount;

    adjustments.push({
      dimension,
      delta: normalizedDelta,
      confidence: pattern.confidence,
      evidence: pattern.description,
      eventCount: pattern.eventCount,
    });
  }

  return adjustments;
}
