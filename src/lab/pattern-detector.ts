/**
 * Tenetx Lab — Behavioral Pattern Detector
 *
 * Extracts behavioral patterns from lab events and translates them
 * into dimension adjustments for the auto-learning engine.
 */

import { debugLog } from '../core/logger.js';
import type { LabEvent, BehavioralPattern, DimensionAdjustment } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum single adjustment magnitude */
const MAX_DELTA = 0.1;

/** Minimum events required to detect a pattern */
const MIN_EVENTS_FOR_PATTERN = 10;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

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

function eventTimestamp(event: LabEvent): string {
  return event.timestamp;
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
  const confidence = Math.min(1, overrideRate * 1.5);
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
    Math.min(1, lowRate),
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
      Math.min(1, (1 - acceptanceRate) * 1.5),
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
    Math.min(1, tddRate * 2),
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
    Math.min(1, escalationRate),
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
  return makePattern(
    'verbose-override',
    'avoidance',
    'User frequently overrides verbose explanations',
    Math.min(1, verboseOverrides.length / 5),
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
    Math.min(1, architectRate * 2),
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
    Math.min(1, blockRate * 2),
    securityBlocks.length,
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
    debugLog('pattern-detector', 'Failed to detect patterns', e);
    return [];
  }
}

/**
 * Translate behavioral patterns into dimension adjustments.
 */
export function patternsToDimensionAdjustments(
  patterns: BehavioralPattern[],
): DimensionAdjustment[] {
  const adjustments: DimensionAdjustment[] = [];

  for (const pattern of patterns) {
    switch (pattern.id) {
      case 'high-override-rate':
        adjustments.push({
          dimension: 'autonomyPreference',
          delta: -Math.min(MAX_DELTA, 0.05 * pattern.confidence),
          confidence: pattern.confidence,
          evidence: pattern.description,
          eventCount: pattern.eventCount,
        });
        break;

      case 'low-intervention':
        adjustments.push({
          dimension: 'autonomyPreference',
          delta: Math.min(MAX_DELTA, 0.05 * pattern.confidence),
          confidence: pattern.confidence,
          evidence: pattern.description,
          eventCount: pattern.eventCount,
        });
        break;

      case 'low-review-acceptance':
        adjustments.push({
          dimension: 'qualityFocus',
          delta: -Math.min(MAX_DELTA, 0.05 * pattern.confidence),
          confidence: pattern.confidence,
          evidence: pattern.description,
          eventCount: pattern.eventCount,
        });
        break;

      case 'frequent-tdd':
        adjustments.push({
          dimension: 'qualityFocus',
          delta: Math.min(MAX_DELTA, 0.05 * pattern.confidence),
          confidence: pattern.confidence,
          evidence: pattern.description,
          eventCount: pattern.eventCount,
        });
        break;

      case 'frequent-escalation':
        adjustments.push({
          dimension: 'qualityFocus',
          delta: Math.min(MAX_DELTA, 0.05 * pattern.confidence),
          confidence: pattern.confidence,
          evidence: pattern.description,
          eventCount: pattern.eventCount,
        });
        break;

      case 'verbose-override':
        adjustments.push({
          dimension: 'communicationStyle',
          delta: Math.min(MAX_DELTA, 0.1 * pattern.confidence),
          confidence: pattern.confidence,
          evidence: pattern.description,
          eventCount: pattern.eventCount,
        });
        break;

      case 'frequent-architect':
        adjustments.push({
          dimension: 'abstractionLevel',
          delta: Math.min(MAX_DELTA, 0.05 * pattern.confidence),
          confidence: pattern.confidence,
          evidence: pattern.description,
          eventCount: pattern.eventCount,
        });
        break;

      case 'frequent-security-blocks':
        adjustments.push({
          dimension: 'riskTolerance',
          delta: -Math.min(MAX_DELTA, 0.05 * pattern.confidence),
          confidence: pattern.confidence,
          evidence: pattern.description,
          eventCount: pattern.eventCount,
        });
        break;
    }
  }

  return adjustments;
}
