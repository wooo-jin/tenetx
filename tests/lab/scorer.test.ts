import { describe, it, expect } from 'vitest';
import {
  computeMetricsFromEvents,
  computeAllMetrics,
  getAverageEffectiveness,
} from '../../src/lab/scorer.js';
import { appendEvent } from '../../src/lab/store.js';
import type { LabEvent } from '../../src/lab/types.js';

function makeAgentCallEvent(id: string, name: string, result: 'success' | 'error' = 'success'): LabEvent {
  return {
    id,
    type: 'agent-call',
    timestamp: new Date().toISOString(),
    sessionId: 'session-scorer-test',
    payload: { name, result, durationMs: 500 },
  };
}

function makeHookEvent(id: string, hookName: string, result: 'approve' | 'block' = 'approve'): LabEvent {
  return {
    id,
    type: 'hook-trigger',
    timestamp: new Date().toISOString(),
    sessionId: 'session-scorer-test',
    payload: { hookName, eventName: 'Bash', result, durationMs: 10 },
  };
}

function makeSkillEvent(id: string, skillName: string): LabEvent {
  return {
    id,
    type: 'skill-invocation',
    timestamp: new Date().toISOString(),
    sessionId: 'session-scorer-test',
    payload: { skillName, durationMs: 200, result: 'success' },
  };
}

function makeModeEvent(id: string, modeName: string): LabEvent {
  return {
    id,
    type: 'mode-activation',
    timestamp: new Date().toISOString(),
    sessionId: 'session-scorer-test',
    payload: { modeName, trigger: 'keyword' },
  };
}

describe('computeMetricsFromEvents', () => {
  it('returns empty array for empty events list', () => {
    const result = computeMetricsFromEvents([]);
    expect(result).toEqual([]);
  });

  it('returns one metric entry per unique component', () => {
    const events = [
      makeAgentCallEvent('e1', 'executor'),
      makeAgentCallEvent('e2', 'executor'),
      makeAgentCallEvent('e3', 'code-reviewer'),
    ];
    const metrics = computeMetricsFromEvents(events);
    const names = metrics.map(m => m.name);
    expect(names).toContain('executor');
    expect(names).toContain('code-reviewer');
    // No duplicates
    expect(new Set(names).size).toBe(names.length);
  });

  it('counts invocations correctly', () => {
    const events = [
      makeAgentCallEvent('a1', 'executor'),
      makeAgentCallEvent('a2', 'executor'),
      makeAgentCallEvent('a3', 'executor'),
    ];
    const metrics = computeMetricsFromEvents(events);
    const exec = metrics.find(m => m.name === 'executor');
    expect(exec?.invocationCount).toBe(3);
  });

  it('calculates success rate correctly', () => {
    const events = [
      makeAgentCallEvent('s1', 'my-agent', 'success'),
      makeAgentCallEvent('s2', 'my-agent', 'success'),
      makeAgentCallEvent('s3', 'my-agent', 'error'),
    ];
    const metrics = computeMetricsFromEvents(events);
    const agent = metrics.find(m => m.name === 'my-agent');
    expect(agent?.successRate).toBeCloseTo(2 / 3, 1);
  });

  it('effectivenessScore is within 0-100 range', () => {
    const events = [makeAgentCallEvent('e1', 'executor')];
    const metrics = computeMetricsFromEvents(events);
    const exec = metrics.find(m => m.name === 'executor');
    expect(exec?.effectivenessScore).toBeGreaterThanOrEqual(0);
    expect(exec?.effectivenessScore).toBeLessThanOrEqual(100);
  });

  it('assigns correct component kind for agent-call events', () => {
    const metrics = computeMetricsFromEvents([makeAgentCallEvent('e1', 'executor')]);
    const exec = metrics.find(m => m.name === 'executor');
    expect(exec?.kind).toBe('agent');
  });

  it('assigns correct component kind for hook-trigger events', () => {
    const metrics = computeMetricsFromEvents([makeHookEvent('h1', 'pre-tool-use')]);
    const hook = metrics.find(m => m.name === 'pre-tool-use');
    expect(hook?.kind).toBe('hook');
  });

  it('assigns correct component kind for skill-invocation events', () => {
    const metrics = computeMetricsFromEvents([makeSkillEvent('sk1', 'autopilot')]);
    const skill = metrics.find(m => m.name === 'autopilot');
    expect(skill?.kind).toBe('skill');
  });

  it('assigns correct component kind for mode-activation events', () => {
    const metrics = computeMetricsFromEvents([makeModeEvent('m1', 'focus')]);
    const mode = metrics.find(m => m.name === 'focus');
    expect(mode?.kind).toBe('mode');
  });

  it('sets lastUsed to a valid ISO timestamp', () => {
    const metrics = computeMetricsFromEvents([makeAgentCallEvent('e1', 'executor')]);
    const exec = metrics.find(m => m.name === 'executor');
    expect(exec?.lastUsed).not.toBeNull();
    expect(() => new Date(exec!.lastUsed!).getTime()).not.toThrow();
  });

  it('ignores routing-decision events (not a tracked component type)', () => {
    const routingEvent: LabEvent = {
      id: 'r1',
      type: 'routing-decision',
      timestamp: new Date().toISOString(),
      sessionId: 'sess',
      payload: { task: 'test', recommendedModel: 'haiku', actualModel: 'opus' },
    };
    const metrics = computeMetricsFromEvents([routingEvent]);
    expect(metrics).toEqual([]);
  });

  it('sorts metrics by effectivenessScore descending', () => {
    // Create events so that executor has more successes than failing-agent
    const events = [
      makeAgentCallEvent('e1', 'executor', 'success'),
      makeAgentCallEvent('e2', 'executor', 'success'),
      makeAgentCallEvent('e3', 'executor', 'success'),
      makeAgentCallEvent('f1', 'failing-agent', 'error'),
      makeAgentCallEvent('f2', 'failing-agent', 'error'),
    ];
    const metrics = computeMetricsFromEvents(events);
    expect(metrics[0].effectivenessScore).toBeGreaterThanOrEqual(metrics[metrics.length - 1].effectivenessScore);
  });
});

describe('computeAllMetrics', () => {
  it('returns an array (not throws) when called', () => {
    // computeAllMetrics reads from the global shared store.
    // We only assert it returns an array to avoid concurrent-execution flakiness.
    const metrics = computeAllMetrics();
    expect(Array.isArray(metrics)).toBe(true);
  });

  it('includes metrics for specific agent names after appending events', () => {
    // Use unique names so they can be found even among other events
    const agentName1 = `scorer-agent-${Date.now()}-${Math.random().toString(36).slice(2)}-1`;
    const agentName2 = `scorer-agent-${Date.now()}-${Math.random().toString(36).slice(2)}-2`;
    appendEvent(makeAgentCallEvent('se1', agentName1));
    appendEvent(makeAgentCallEvent('se2', agentName2));
    const metrics = computeAllMetrics();
    const names = metrics.map(m => m.name);
    expect(names).toContain(agentName1);
    expect(names).toContain(agentName2);
  });
});

describe('getAverageEffectiveness', () => {
  it('returns a numeric value in 0-100 range', () => {
    // Append at least one event to guarantee a non-empty store
    appendEvent(makeAgentCallEvent('ae1', `executor-effectiveness-${Date.now()}`));
    const avg = getAverageEffectiveness();
    expect(typeof avg).toBe('number');
    expect(avg).toBeGreaterThanOrEqual(0);
    expect(avg).toBeLessThanOrEqual(100);
  });
});
