import { describe, it, expect } from 'vitest';
import {
  detectPatterns,
  patternsToDimensionAdjustments,
} from '../../src/lab/pattern-detector.js';
import type { LabEvent } from '../../src/lab/types.js';

let idCounter = 0;
function uid(): string {
  return `ev-${++idCounter}`;
}

function makeOverrideEvent(sessionId = 'sess'): LabEvent {
  return {
    id: uid(),
    type: 'user-override',
    timestamp: new Date().toISOString(),
    sessionId,
    payload: { component: 'executor', originalDecision: 'proceed', userDecision: 'wait' },
  };
}

function makeAgentCallEvent(sessionId = 'sess', result: 'success' | 'error' = 'success'): LabEvent {
  return {
    id: uid(),
    type: 'agent-call',
    timestamp: new Date().toISOString(),
    sessionId,
    payload: { name: 'executor', result, durationMs: 500 },
  };
}

function makeHookEvent(sessionId = 'sess', result: 'approve' | 'block' = 'approve'): LabEvent {
  return {
    id: uid(),
    type: 'hook-trigger',
    timestamp: new Date().toISOString(),
    sessionId,
    payload: { hookName: 'pre-tool-use', eventName: 'Bash', result, durationMs: 5 },
  };
}

function makeRoutingEvent(recommended: string, actual: string, sessionId = 'sess'): LabEvent {
  return {
    id: uid(),
    type: 'routing-decision',
    timestamp: new Date().toISOString(),
    sessionId,
    payload: { task: 'implement', recommendedModel: recommended, actualModel: actual },
  };
}

describe('detectPatterns', () => {
  it('returns empty array with no events', () => {
    const patterns = detectPatterns([]);
    expect(patterns).toEqual([]);
  });

  it('returns empty array when event count is below MIN_EVENTS_FOR_PATTERN threshold', () => {
    // MIN_EVENTS_FOR_PATTERN is 10, use fewer events
    const events = Array.from({ length: 5 }, () => makeAgentCallEvent());
    const patterns = detectPatterns(events);
    expect(patterns).toEqual([]);
  });

  it('detects high-override-rate pattern when override rate exceeds 15%', () => {
    // Build: 5 overrides out of 20 total action events = 25% override rate
    const events: LabEvent[] = [];
    for (let i = 0; i < 15; i++) events.push(makeAgentCallEvent(`sess-${i}`));
    for (let i = 0; i < 5; i++) events.push(makeOverrideEvent(`sess-${i}`));

    const patterns = detectPatterns(events, 0.0); // low threshold
    expect(patterns.some(p => p.id === 'high-override-rate')).toBe(true);
  });

  it('does NOT detect high-override-rate when override rate is low', () => {
    // 1 override out of 15 total = ~6% override rate (below 15% threshold)
    const events: LabEvent[] = [];
    for (let i = 0; i < 14; i++) events.push(makeAgentCallEvent(`sess-${i}`));
    events.push(makeOverrideEvent('sess-0'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'high-override-rate')).toBe(false);
  });

  it('detects frequent-escalation pattern when escalation rate >= 30%', () => {
    // 5 escalations (haiku -> opus) + 5 non-escalations = 50% escalation rate
    const events: LabEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(makeRoutingEvent('haiku', 'opus'));
    for (let i = 0; i < 5; i++) events.push(makeRoutingEvent('opus', 'opus'));

    const patterns = detectPatterns(events, 0.0);
    expect(patterns.some(p => p.id === 'frequent-escalation')).toBe(true);
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

  it('each pattern has required fields', () => {
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

  it('confidence values are clamped to 0-1', () => {
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

describe('patternsToDimensionAdjustments', () => {
  it('returns empty array when no patterns provided', () => {
    expect(patternsToDimensionAdjustments([])).toEqual([]);
  });

  it('maps high-override-rate pattern to negative autonomyPreference adjustment', () => {
    const pattern = {
      id: 'high-override-rate',
      type: 'preference' as const,
      description: 'test',
      confidence: 0.8,
      eventCount: 5,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    const adjustments = patternsToDimensionAdjustments([pattern]);
    const adj = adjustments.find(a => a.dimension === 'autonomyPreference');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeLessThan(0);
  });

  it('maps low-intervention pattern to positive autonomyPreference adjustment', () => {
    const pattern = {
      id: 'low-intervention',
      type: 'preference' as const,
      description: 'test',
      confidence: 0.7,
      eventCount: 10,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    const adjustments = patternsToDimensionAdjustments([pattern]);
    const adj = adjustments.find(a => a.dimension === 'autonomyPreference');
    expect(adj).toBeDefined();
    expect(adj!.delta).toBeGreaterThan(0);
  });

  it('maps verbose-override pattern to communicationStyle adjustment', () => {
    const pattern = {
      id: 'verbose-override',
      type: 'avoidance' as const,
      description: 'test',
      confidence: 0.6,
      eventCount: 4,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    const adjustments = patternsToDimensionAdjustments([pattern]);
    expect(adjustments.some(a => a.dimension === 'communicationStyle')).toBe(true);
  });

  it('all adjustment deltas are within MAX_DELTA (0.1) bounds', () => {
    const pattern = {
      id: 'high-override-rate',
      type: 'preference' as const,
      description: 'test',
      confidence: 1.0,
      eventCount: 100,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    const adjustments = patternsToDimensionAdjustments([pattern]);
    for (const adj of adjustments) {
      expect(Math.abs(adj.delta)).toBeLessThanOrEqual(0.1);
    }
  });

  it('each adjustment has required fields', () => {
    const pattern = {
      id: 'high-override-rate',
      type: 'preference' as const,
      description: 'high override rate detected',
      confidence: 0.5,
      eventCount: 5,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    const adjustments = patternsToDimensionAdjustments([pattern]);
    for (const adj of adjustments) {
      expect(typeof adj.dimension).toBe('string');
      expect(typeof adj.delta).toBe('number');
      expect(typeof adj.confidence).toBe('number');
      expect(typeof adj.evidence).toBe('string');
      expect(typeof adj.eventCount).toBe('number');
    }
  });
});
