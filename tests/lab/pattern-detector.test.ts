import { describe, it, expect } from 'vitest';
import {
  detectPatterns,
  patternsToDimensionAdjustments,
} from '../../src/lab/pattern-detector.js';
import type { LabEvent, BehavioralPattern } from '../../src/lab/types.js';

// ---------------------------------------------------------------------------
// Event Factory Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function uid(): string {
  return `ev-${++idCounter}`;
}

/** Base timestamp offset so events have distinct, sortable timestamps */
let tsOffset = 0;
function nextTs(): string {
  return new Date(Date.now() - 1_000_000 + tsOffset++ * 1000).toISOString();
}

function makeOverrideEvent(
  sessionId = 'sess',
  userDecision = 'wait',
  originalDecision = 'proceed',
): LabEvent {
  return {
    id: uid(),
    type: 'user-override',
    timestamp: nextTs(),
    sessionId,
    payload: { component: 'executor', originalDecision, userDecision },
  };
}

function makeAgentCallEvent(
  sessionId = 'sess',
  result: 'success' | 'error' = 'success',
  name = 'executor',
): LabEvent {
  return {
    id: uid(),
    type: 'agent-call',
    timestamp: nextTs(),
    sessionId,
    payload: { name, result, durationMs: 500 },
  };
}

function makeHookEvent(
  sessionId = 'sess',
  result: 'approve' | 'block' = 'approve',
  hookName = 'pre-tool-use',
): LabEvent {
  return {
    id: uid(),
    type: 'hook-trigger',
    timestamp: nextTs(),
    sessionId,
    payload: { hookName, eventName: 'Bash', result, durationMs: 5 },
  };
}

function makeRoutingEvent(
  recommended: string,
  actual: string,
  sessionId = 'sess',
): LabEvent {
  return {
    id: uid(),
    type: 'routing-decision',
    timestamp: nextTs(),
    sessionId,
    payload: { task: 'implement', recommendedModel: recommended, actualModel: actual },
  };
}

function makeSkillEvent(skillName: string, sessionId = 'sess'): LabEvent {
  return {
    id: uid(),
    type: 'skill-invocation',
    timestamp: nextTs(),
    sessionId,
    payload: { skillName, durationMs: 200 },
  };
}

function makeReviewerCallEvent(
  result: 'success' | 'error' = 'success',
  sessionId = 'sess',
): LabEvent {
  return {
    id: uid(),
    type: 'agent-call',
    timestamp: nextTs(),
    sessionId,
    payload: { name: 'code-reviewer', result, durationMs: 300 },
  };
}

function makePattern(
  id: string,
  overrides: Partial<BehavioralPattern> = {},
): BehavioralPattern {
  return {
    id,
    type: 'preference',
    description: 'test pattern',
    confidence: 0.7,
    eventCount: 5,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectPatterns — public API tests
// ---------------------------------------------------------------------------

describe('detectPatterns', () => {
  it('returns empty array with no events', () => {
    expect(detectPatterns([])).toEqual([]);
  });

  it('returns empty array when event count is below MIN_EVENTS_FOR_PATTERN threshold', () => {
    const events = Array.from({ length: 5 }, () => makeAgentCallEvent());
    expect(detectPatterns(events)).toEqual([]);
  });

  it('returns patterns sorted by confidence descending', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 6; i++) events.push(makeOverrideEvent(`s${i}`));
    for (let i = 0; i < 10; i++) events.push(makeRoutingEvent('haiku', 'opus', `route-${i}`));

    const patterns = detectPatterns(events, 0.0);
    for (let i = 0; i < patterns.length - 1; i++) {
      expect(patterns[i].confidence).toBeGreaterThanOrEqual(patterns[i + 1].confidence);
    }
  });

  it('filters patterns by minConfidence threshold', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 3; i++) events.push(makeOverrideEvent(`s${i}`));

    const allPatterns = detectPatterns(events, 0.0);
    const filteredPatterns = detectPatterns(events, 0.9);

    expect(filteredPatterns.length).toBeLessThanOrEqual(allPatterns.length);
    for (const p of filteredPatterns) {
      expect(p.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('each pattern has all required fields', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 5; i++) events.push(makeOverrideEvent(`s${i}`));

    const patterns = detectPatterns(events, 0.0);
    for (const p of patterns) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.type).toBe('string');
      expect(typeof p.description).toBe('string');
      expect(typeof p.confidence).toBe('number');
      expect(typeof p.eventCount).toBe('number');
      expect(typeof p.firstSeen).toBe('string');
      expect(typeof p.lastSeen).toBe('string');
    }
  });

  it('clamps confidence values to 0-1 range', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 5; i++) events.push(makeOverrideEvent(`s${i}`));

    const patterns = detectPatterns(events, 0.0);
    for (const p of patterns) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('does not throw on malformed events', () => {
    const malformed: LabEvent[] = [
      { id: 'm1', type: 'user-override', timestamp: 'invalid-date', sessionId: '', payload: {} },
    ];
    expect(() => detectPatterns(malformed, 0.0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Detector 1: detectOverridePattern
// ---------------------------------------------------------------------------

describe('detectOverridePattern', () => {
  it('detects high-override-rate when override rate exceeds 15%', () => {
    // 5 overrides + 15 agent calls = 25% override rate (total action events = 20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 5; i++) events.push(makeOverrideEvent(`s${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'high-override-rate')).toBe(true);
  });

  it('does NOT detect high-override-rate when override rate is at or below 15%', () => {
    // 1 override + 14 agent calls = ~6.7% override rate
    const events: LabEvent[] = [];
    for (let i = 0; i < 14; i++) events.push(makeAgentCallEvent(`s${i}`));
    events.push(makeOverrideEvent('s0'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'high-override-rate')).toBe(false);
  });

  it('returns null (no pattern) when total action events < 10', () => {
    // 3 overrides + 5 agent calls = 8 total action events (below threshold)
    const events: LabEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(makeAgentCallEvent());
    for (let i = 0; i < 3; i++) events.push(makeOverrideEvent());

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'high-override-rate')).toBe(false);
  });

  it('includes override event count in eventCount field', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 5; i++) events.push(makeOverrideEvent(`s${i}`));

    const patterns = detectPatterns(events, 0.0);
    const pattern = patterns.find(p => p.id === 'high-override-rate');
    expect(pattern?.eventCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Detector 2: detectLowInterventionPattern
// ---------------------------------------------------------------------------

describe('detectLowInterventionPattern', () => {
  /**
   * Build sessions where each session has >= 3 action events and < 10% overrides.
   * Requires >= 3 qualifying sessions and >= 50% of those sessions to be low-intervention.
   */
  function makeLowInterventionSessions(count: number): LabEvent[] {
    const events: LabEvent[] = [];
    for (let i = 0; i < count; i++) {
      const sid = `low-sess-${i}`;
      // 5 agent calls, 0 overrides = 0% intervention
      for (let j = 0; j < 5; j++) events.push(makeAgentCallEvent(sid));
    }
    return events;
  }

  it('detects low-intervention when >= 50% of qualifying sessions have < 10% override rate', () => {
    // 4 sessions with 0% override rate → 100% low-intervention sessions
    const events = makeLowInterventionSessions(4);

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'low-intervention')).toBe(true);
  });

  it('does NOT detect low-intervention when fewer than 3 sessions exist', () => {
    // Only 2 sessions (below minimum of 3)
    const events = makeLowInterventionSessions(2);

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'low-intervention')).toBe(false);
  });

  it('does NOT detect low-intervention when majority of sessions have high override rate', () => {
    const events: LabEvent[] = [];
    // 4 sessions, each with 50% override rate (well above 10% threshold)
    for (let i = 0; i < 4; i++) {
      const sid = `hi-int-sess-${i}`;
      for (let j = 0; j < 5; j++) events.push(makeAgentCallEvent(sid));
      for (let j = 0; j < 5; j++) events.push(makeOverrideEvent(sid));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'low-intervention')).toBe(false);
  });

  it('requires qualifying sessions to have at least 3 action events', () => {
    // Sessions with only 2 action events each are skipped by detector
    const events: LabEvent[] = [];
    for (let i = 0; i < 5; i++) {
      const sid = `tiny-sess-${i}`;
      events.push(makeAgentCallEvent(sid));
      events.push(makeAgentCallEvent(sid));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'low-intervention')).toBe(false);
  });

  it('sets pattern type to preference', () => {
    const events = makeLowInterventionSessions(4);
    const patterns = detectPatterns(events, 0.0);
    const pattern = patterns.find(p => p.id === 'low-intervention');
    expect(pattern?.type).toBe('preference');
  });
});

// ---------------------------------------------------------------------------
// Detector 3: detectReviewerAcceptancePattern
// ---------------------------------------------------------------------------

describe('detectReviewerAcceptancePattern', () => {
  it('detects low-review-acceptance when acceptance rate < 50%', () => {
    // 6 success + 16 error = ~27% acceptance rate (below 50%), total=22 >= MIN_EVENTS(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(makeReviewerCallEvent('success', `rev-s${i}`));
    for (let i = 0; i < 16; i++) events.push(makeReviewerCallEvent('error', `rev-e${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'low-review-acceptance')).toBe(true);
  });

  it('does NOT detect low-review-acceptance when acceptance rate >= 50%', () => {
    // 16 success + 6 error = ~73% acceptance rate, total=22 >= MIN_EVENTS(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 16; i++) events.push(makeReviewerCallEvent('success', `rev-s${i}`));
    for (let i = 0; i < 6; i++) events.push(makeReviewerCallEvent('error', `rev-e${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'low-review-acceptance')).toBe(false);
  });

  it('returns no pattern when code-reviewer events < 20', () => {
    // 19 reviewer calls — below MIN_EVENTS_FOR_PATTERN(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 19; i++) events.push(makeReviewerCallEvent('error'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'low-review-acceptance')).toBe(false);
  });

  it('ignores non-code-reviewer agent calls', () => {
    // 25 executor calls (not code-reviewer) — should not trigger pattern
    const events: LabEvent[] = [];
    for (let i = 0; i < 25; i++) events.push(makeAgentCallEvent(`s${i}`, 'error', 'executor'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'low-review-acceptance')).toBe(false);
  });

  it('sets pattern type to avoidance when detected', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(makeReviewerCallEvent('success'));
    for (let i = 0; i < 16; i++) events.push(makeReviewerCallEvent('error'));

    const patterns = detectPatterns(events, 0.0);
    const pattern = patterns.find(p => p.id === 'low-review-acceptance');
    expect(pattern?.type).toBe('avoidance');
  });
});

// ---------------------------------------------------------------------------
// Detector 4: detectTddUsagePattern
// ---------------------------------------------------------------------------

describe('detectTddUsagePattern', () => {
  /**
   * Requires >= 5 distinct coding sessions (agent-call or skill-invocation)
   * and TDD skill used in >= 15% of those sessions.
   */
  function makeCodingSessions(count: number): LabEvent[] {
    const events: LabEvent[] = [];
    for (let i = 0; i < count; i++) {
      events.push(makeAgentCallEvent(`code-sess-${i}`));
    }
    return events;
  }

  it('detects frequent-tdd when TDD skill used in >= 15% of coding sessions', () => {
    // 5 coding sessions, 2 with TDD invocations = 40% TDD rate
    const events = makeCodingSessions(5);
    events.push(makeSkillEvent('tdd', 'code-sess-0'));
    events.push(makeSkillEvent('tdd', 'code-sess-1'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-tdd')).toBe(true);
  });

  it('detects frequent-tdd with case-insensitive skill name matching', () => {
    const events = makeCodingSessions(5);
    events.push(makeSkillEvent('TDD-workflow', 'code-sess-0'));
    events.push(makeSkillEvent('run-TDD', 'code-sess-1'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-tdd')).toBe(true);
  });

  it('does NOT detect frequent-tdd when TDD rate is below 15%', () => {
    // 10 sessions, 1 TDD invocation = 10% TDD rate (below 15% threshold)
    const events = makeCodingSessions(10);
    events.push(makeSkillEvent('tdd', 'code-sess-0'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-tdd')).toBe(false);
  });

  it('returns no pattern when fewer than 5 coding sessions exist', () => {
    // Only 4 coding sessions (below minimum)
    const events = makeCodingSessions(4);
    events.push(makeSkillEvent('tdd', 'code-sess-0'));
    events.push(makeSkillEvent('tdd', 'code-sess-1'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-tdd')).toBe(false);
  });

  it('does NOT detect frequent-tdd when skill name does not contain tdd', () => {
    const events = makeCodingSessions(5);
    events.push(makeSkillEvent('unit-test', 'code-sess-0'));
    events.push(makeSkillEvent('review', 'code-sess-1'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-tdd')).toBe(false);
  });

  it('sets pattern type to workflow', () => {
    const events = makeCodingSessions(5);
    events.push(makeSkillEvent('tdd', 'code-sess-0'));
    events.push(makeSkillEvent('tdd', 'code-sess-1'));

    const patterns = detectPatterns(events, 0.0);
    const pattern = patterns.find(p => p.id === 'frequent-tdd');
    expect(pattern?.type).toBe('workflow');
  });
});

// ---------------------------------------------------------------------------
// Detector 5: detectEscalationPattern
// ---------------------------------------------------------------------------

describe('detectEscalationPattern', () => {
  it('detects frequent-escalation when escalation rate >= 30%', () => {
    // 10 escalations (haiku → opus) + 10 non-escalations = 50% rate, total=20 >= MIN_EVENTS(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(makeRoutingEvent('haiku', 'opus', `esc-${i}`));
    for (let i = 0; i < 10; i++) events.push(makeRoutingEvent('opus', 'opus', `noesc-${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-escalation')).toBe(true);
  });

  it('detects escalation from sonnet to opus', () => {
    // sonnet → opus is also an escalation, total=20 >= MIN_EVENTS(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(makeRoutingEvent('sonnet', 'opus', `esc-${i}`));
    for (let i = 0; i < 10; i++) events.push(makeRoutingEvent('opus', 'opus', `noesc-${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-escalation')).toBe(true);
  });

  it('does NOT detect frequent-escalation when escalation rate < 30%', () => {
    // 4 escalations + 16 non-escalations = 20% rate (below 30%), total=20
    const events: LabEvent[] = [];
    for (let i = 0; i < 4; i++) events.push(makeRoutingEvent('haiku', 'opus', `esc-${i}`));
    for (let i = 0; i < 16; i++) events.push(makeRoutingEvent('opus', 'opus', `noesc-${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-escalation')).toBe(false);
  });

  it('returns no pattern when routing-decision events < 20', () => {
    // 19 routing events (below MIN_EVENTS_FOR_PATTERN=20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 19; i++) events.push(makeRoutingEvent('haiku', 'opus', `r-${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-escalation')).toBe(false);
  });

  it('does NOT detect escalation when actual model is not opus', () => {
    // haiku → sonnet is NOT counted as escalation (actual must be opus), total=20
    const events: LabEvent[] = [];
    for (let i = 0; i < 16; i++) events.push(makeRoutingEvent('haiku', 'sonnet', `esc-${i}`));
    for (let i = 0; i < 4; i++) events.push(makeRoutingEvent('opus', 'opus', `noesc-${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-escalation')).toBe(false);
  });

  it('sets pattern type to workflow', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(makeRoutingEvent('haiku', 'opus', `esc-${i}`));
    for (let i = 0; i < 10; i++) events.push(makeRoutingEvent('opus', 'opus', `noesc-${i}`));

    const patterns = detectPatterns(events, 0.0);
    const pattern = patterns.find(p => p.id === 'frequent-escalation');
    expect(pattern?.type).toBe('workflow');
  });
});

// ---------------------------------------------------------------------------
// Detector 6: detectVerboseOverridePattern
// ---------------------------------------------------------------------------

describe('detectVerboseOverridePattern', () => {
  it('detects verbose-override when userDecision contains "verbose"', () => {
    const events: LabEvent[] = [];
    // Need >= 3 verbose overrides
    for (let i = 0; i < 3; i++) {
      events.push(makeOverrideEvent(`v-sess-${i}`, 'too verbose, please be concise'));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'verbose-override')).toBe(true);
  });

  it('detects verbose-override when userDecision contains "too long"', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(makeOverrideEvent(`v-sess-${i}`, 'too long response'));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'verbose-override')).toBe(true);
  });

  it('detects verbose-override when userDecision contains "terse"', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(makeOverrideEvent(`v-sess-${i}`, 'be more terse'));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'verbose-override')).toBe(true);
  });

  it('detects verbose-override when userDecision contains "brief"', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(makeOverrideEvent(`v-sess-${i}`, 'keep it brief'));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'verbose-override')).toBe(true);
  });

  it('detects verbose-override when originalDecision contains "verbose"', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(makeOverrideEvent(`v-sess-${i}`, 'skip this', 'verbose explanation mode'));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'verbose-override')).toBe(true);
  });

  it('detects verbose-override when originalDecision contains "explanation"', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(makeOverrideEvent(`v-sess-${i}`, 'no', 'full explanation requested'));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'verbose-override')).toBe(true);
  });

  it('does NOT detect verbose-override when fewer than 3 verbose overrides exist', () => {
    // Only 2 verbose overrides (below minimum threshold of 3)
    const events: LabEvent[] = [];
    for (let i = 0; i < 2; i++) {
      events.push(makeOverrideEvent(`v-sess-${i}`, 'too verbose'));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'verbose-override')).toBe(false);
  });

  it('does NOT detect verbose-override for unrelated override reasons', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(makeOverrideEvent(`v-sess-${i}`, 'wrong approach', 'proceed'));
    }

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'verbose-override')).toBe(false);
  });

  it('sets pattern type to avoidance', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(makeOverrideEvent(`v-sess-${i}`, 'too verbose'));
    }

    const patterns = detectPatterns(events, 0.0);
    const pattern = patterns.find(p => p.id === 'verbose-override');
    expect(pattern?.type).toBe('avoidance');
  });
});

// ---------------------------------------------------------------------------
// Detector 7: detectArchitectUsagePattern
// ---------------------------------------------------------------------------

describe('detectArchitectUsagePattern', () => {
  function makeArchitectCallEvent(sessionId = 'sess'): LabEvent {
    return makeAgentCallEvent(sessionId, 'success', 'architect');
  }

  it('detects frequent-architect when architect agent used in >= 15% of agent calls', () => {
    // 6 architect + 17 executor = ~26% architect rate, total=23 >= MIN_EVENTS(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 17; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 6; i++) events.push(makeArchitectCallEvent(`arch-${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-architect')).toBe(true);
  });

  it('detects frequent-architect for agent names containing "design"', () => {
    // 15 executor + 7 design-reviewer = ~32% architect rate, total=22 >= MIN_EVENTS(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 7; i++) events.push(makeAgentCallEvent(`d${i}`, 'success', 'design-reviewer'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-architect')).toBe(true);
  });

  it('does NOT detect frequent-architect when architect rate < 15%', () => {
    // 2 architect + 20 executor = ~9% architect rate, total=22 >= MIN_EVENTS(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 20; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 2; i++) events.push(makeArchitectCallEvent(`arch-${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-architect')).toBe(false);
  });

  it('returns no pattern when total agent-call events < 20', () => {
    // Only 19 agent calls total (below MIN_EVENTS_FOR_PATTERN=20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 13; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 6; i++) events.push(makeArchitectCallEvent(`arch-${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-architect')).toBe(false);
  });

  it('sets pattern type to dependency', () => {
    // 15 executor + 7 architect = total 22 >= MIN_EVENTS(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 7; i++) events.push(makeArchitectCallEvent(`arch-${i}`));

    const patterns = detectPatterns(events, 0.0);
    const pattern = patterns.find(p => p.id === 'frequent-architect');
    expect(pattern?.type).toBe('dependency');
  });

  it('includes architect event count in eventCount field', () => {
    // 15 executor + 7 architect = total 22 >= MIN_EVENTS(20)
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`s${i}`));
    for (let i = 0; i < 7; i++) events.push(makeArchitectCallEvent(`arch-${i}`));

    const patterns = detectPatterns(events, 0.0);
    const pattern = patterns.find(p => p.id === 'frequent-architect');
    expect(pattern?.eventCount).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Detector 8: detectSecurityBlockPattern
// ---------------------------------------------------------------------------

describe('detectSecurityBlockPattern', () => {
  function makeSecurityBlockEvent(hookName = 'security-guard', sessionId = 'sess'): LabEvent {
    return makeHookEvent(sessionId, 'block', hookName);
  }

  function makeSecurityApproveEvent(sessionId = 'sess'): LabEvent {
    return makeHookEvent(sessionId, 'approve', 'security-guard');
  }

  it('detects frequent-security-blocks when block rate >= 10%', () => {
    // 2 security blocks + 18 approve hooks = 10% block rate (exactly at threshold)
    const events: LabEvent[] = [];
    for (let i = 0; i < 18; i++) events.push(makeSecurityApproveEvent(`s${i}`));
    for (let i = 0; i < 2; i++) events.push(makeSecurityBlockEvent('security-guard', `b${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-security-blocks')).toBe(true);
  });

  it('detects frequent-security-blocks for "secret" hook name', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeHookEvent(`s${i}`, 'approve', 'pre-tool-use'));
    for (let i = 0; i < 5; i++) events.push(makeSecurityBlockEvent('secret-scanner', `b${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-security-blocks')).toBe(true);
  });

  it('detects frequent-security-blocks for "db-guard" hook name', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeHookEvent(`s${i}`, 'approve', 'pre-tool-use'));
    for (let i = 0; i < 5; i++) events.push(makeSecurityBlockEvent('db-guard', `b${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-security-blocks')).toBe(true);
  });

  it('does NOT detect frequent-security-blocks when block rate < 10%', () => {
    // 1 security block + 19 approve = 5% block rate (below 10%)
    const events: LabEvent[] = [];
    for (let i = 0; i < 19; i++) events.push(makeSecurityApproveEvent(`s${i}`));
    events.push(makeSecurityBlockEvent('security-guard', 'b0'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-security-blocks')).toBe(false);
  });

  it('does NOT detect frequent-security-blocks when hook name is not security-related', () => {
    // Non-security hook with block result — should not trigger
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeHookEvent(`s${i}`, 'approve', 'rate-limiter'));
    for (let i = 0; i < 5; i++) events.push(makeHookEvent(`b${i}`, 'block', 'rate-limiter'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-security-blocks')).toBe(false);
  });

  it('does NOT detect frequent-security-blocks when security hook result is approve (not block)', () => {
    // Security hooks that approve are not counted as blocks
    const events: LabEvent[] = [];
    for (let i = 0; i < 20; i++) events.push(makeSecurityApproveEvent(`s${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-security-blocks')).toBe(false);
  });

  it('returns no pattern when hook-trigger events < 10', () => {
    // 9 hook events total (below MIN_EVENTS_FOR_PATTERN)
    const events: LabEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(makeSecurityApproveEvent(`s${i}`));
    for (let i = 0; i < 3; i++) events.push(makeSecurityBlockEvent('security-guard', `b${i}`));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-security-blocks')).toBe(false);
  });

  it('sets pattern type to avoidance', () => {
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeSecurityApproveEvent(`s${i}`));
    for (let i = 0; i < 5; i++) events.push(makeSecurityBlockEvent('security-guard', `b${i}`));

    const patterns = detectPatterns(events, 0.0);
    const pattern = patterns.find(p => p.id === 'frequent-security-blocks');
    expect(pattern?.type).toBe('avoidance');
  });
});

// ---------------------------------------------------------------------------
// patternsToDimensionAdjustments — all 8 pattern ID mappings
// ---------------------------------------------------------------------------

describe('patternsToDimensionAdjustments', () => {
  it('returns empty array when no patterns provided', () => {
    expect(patternsToDimensionAdjustments([])).toEqual([]);
  });

  it('maps high-override-rate to negative autonomyPreference delta', () => {
    const patterns = [makePattern('high-override-rate', { type: 'preference', confidence: 0.8 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    const adj = adjustments.find(a => a.dimension === 'autonomyPreference');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeLessThan(0);
  });

  it('maps low-intervention to positive autonomyPreference delta', () => {
    const patterns = [makePattern('low-intervention', { type: 'preference', confidence: 0.7 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    const adj = adjustments.find(a => a.dimension === 'autonomyPreference');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeGreaterThan(0);
  });

  it('maps low-review-acceptance to negative qualityFocus delta', () => {
    const patterns = [makePattern('low-review-acceptance', { type: 'avoidance', confidence: 0.6 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    const adj = adjustments.find(a => a.dimension === 'qualityFocus');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeLessThan(0);
  });

  it('maps frequent-tdd to positive qualityFocus delta', () => {
    const patterns = [makePattern('frequent-tdd', { type: 'workflow', confidence: 0.8 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    const adj = adjustments.find(a => a.dimension === 'qualityFocus');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeGreaterThan(0);
  });

  it('maps frequent-escalation to positive qualityFocus delta', () => {
    const patterns = [makePattern('frequent-escalation', { type: 'workflow', confidence: 0.5 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    const adj = adjustments.find(a => a.dimension === 'qualityFocus');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeGreaterThan(0);
  });

  it('maps verbose-override to positive communicationStyle delta', () => {
    const patterns = [makePattern('verbose-override', { type: 'avoidance', confidence: 0.6 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    const adj = adjustments.find(a => a.dimension === 'communicationStyle');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeGreaterThan(0);
  });

  it('maps frequent-architect to positive abstractionLevel delta', () => {
    const patterns = [makePattern('frequent-architect', { type: 'dependency', confidence: 0.7 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    const adj = adjustments.find(a => a.dimension === 'abstractionLevel');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeGreaterThan(0);
  });

  it('maps frequent-security-blocks to negative riskTolerance delta', () => {
    const patterns = [makePattern('frequent-security-blocks', { type: 'avoidance', confidence: 0.8 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    const adj = adjustments.find(a => a.dimension === 'riskTolerance');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeLessThan(0);
  });

  it('produces one adjustment per recognized pattern', () => {
    const allPatterns = [
      makePattern('high-override-rate'),
      makePattern('low-intervention'),
      makePattern('low-review-acceptance'),
      makePattern('frequent-tdd'),
      makePattern('frequent-escalation'),
      makePattern('verbose-override'),
      makePattern('frequent-architect'),
      makePattern('frequent-security-blocks'),
    ];
    const adjustments = patternsToDimensionAdjustments(allPatterns);
    expect(adjustments).toHaveLength(8);
  });

  it('clamps all deltas to MAX_DELTA (0.1) bounds', () => {
    const patterns = [
      makePattern('high-override-rate', { confidence: 1.0 }),
      makePattern('verbose-override', { confidence: 1.0 }),
    ];
    const adjustments = patternsToDimensionAdjustments(patterns);
    for (const adj of adjustments) {
      expect(Math.abs(adj.delta)).toBeLessThanOrEqual(0.1);
    }
  });

  it('each adjustment carries required fields', () => {
    const patterns = [makePattern('frequent-tdd', { type: 'workflow', confidence: 0.5, eventCount: 10 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    for (const adj of adjustments) {
      expect(typeof adj.dimension).toBe('string');
      expect(typeof adj.delta).toBe('number');
      expect(typeof adj.confidence).toBe('number');
      expect(typeof adj.evidence).toBe('string');
      expect(typeof adj.eventCount).toBe('number');
    }
  });

  it('carries pattern description as evidence field', () => {
    const description = 'TDD used in 40% of sessions';
    const patterns = [makePattern('frequent-tdd', { description, confidence: 0.7 })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    expect(adjustments[0].evidence).toBe(description);
  });

  it('carries pattern confidence in adjustment confidence field', () => {
    const confidence = 0.65;
    const patterns = [makePattern('low-intervention', { confidence })];
    const adjustments = patternsToDimensionAdjustments(patterns);
    expect(adjustments[0].confidence).toBe(confidence);
  });

  it('ignores unknown pattern ids without throwing', () => {
    const patterns = [makePattern('unknown-pattern-id')];
    expect(() => patternsToDimensionAdjustments(patterns)).not.toThrow();
    expect(patternsToDimensionAdjustments(patterns)).toEqual([]);
  });

  describe('qualityFocus 진화 불균형 정규화', () => {
    it('qualityFocus 3개 패턴 각각의 개별 |delta|가 autonomyPreference 개별 |delta|보다 작다', () => {
      // qualityFocus: 3 patterns → each delta normalized by /3
      // autonomyPreference: 2 patterns → each delta normalized by /2
      // 같은 confidence에서 qf 개별 |delta| < ap 개별 |delta|
      const qfAdj = patternsToDimensionAdjustments([
        makePattern('frequent-tdd', { confidence: 0.8 }),
      ]);
      const apAdj = patternsToDimensionAdjustments([
        makePattern('low-intervention', { confidence: 0.8 }),
      ]);

      const qfDelta = Math.abs(qfAdj[0].delta);
      const apDelta = Math.abs(apAdj[0].delta);

      // qf: 0.05*0.8/3 ≈ 0.0133, ap: 0.05*0.8/2 = 0.02
      expect(qfDelta).toBeLessThan(apDelta);
      expect(qfDelta).toBeCloseTo(0.05 * 0.8 / 3, 4);
      expect(apDelta).toBeCloseTo(0.05 * 0.8 / 2, 4);
    });

    it('같은 방향 3개 패턴 모두 활성 시 합산이 단일 차원 단일 패턴과 동등 규모', () => {
      // qualityFocus: 3개 같은 방향 → sum = 3 × (0.05*0.8/3) = 0.04
      // abstractionLevel: 2개 중 1개 → 0.05*0.8/2 = 0.02
      const qfAdj = patternsToDimensionAdjustments([
        makePattern('frequent-tdd', { confidence: 0.8 }),
        makePattern('frequent-escalation', { confidence: 0.8 }),
      ]);
      const qfSum = qfAdj.reduce((s, a) => s + a.delta, 0);
      // 2개 같은 방향: 2 × (0.05*0.8/3) ≈ 0.0267
      // 정규화 없었다면: 2 × 0.04 = 0.08 — 3배 차이
      // 정규화 후: 0.0267 — 합리적 크기
      expect(qfSum).toBeCloseTo(2 * 0.05 * 0.8 / 3, 4);
    });

    it('단일 패턴의 delta는 정규화로 인해 원래보다 작다 (패턴 수 > 1인 차원)', () => {
      const patterns = [makePattern('frequent-tdd', { confidence: 1.0 })];
      const adjustments = patternsToDimensionAdjustments(patterns);
      // qualityFocus에 3개 패턴 → delta = 0.05 * 1.0 / 3 ≈ 0.0167
      expect(adjustments[0].delta).toBeLessThan(0.05);
      expect(adjustments[0].delta).toBeGreaterThan(0);
    });

    it('패턴 1개인 차원 (riskTolerance)는 정규화 영향 없음', () => {
      // riskTolerance: frequent-security-blocks (down) + risk-tolerance-up (up) = 2개
      // 하지만 각각 반대 방향이라 하나만 활성 시 정규화 적용됨
      const patterns = [makePattern('frequent-security-blocks', { confidence: 1.0 })];
      const adjustments = patternsToDimensionAdjustments(patterns);
      // delta = -0.05 * 1.0 / 2 = -0.025
      expect(adjustments[0].delta).toBeCloseTo(-0.025, 3);
    });
  });
});
