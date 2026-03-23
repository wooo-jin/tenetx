/**
 * Tests for lab/tracker.ts
 *
 * Isolation strategy: each test uses a globally-unique session ID
 * so it can find its own events in the shared events.jsonl file
 * without being affected by concurrent test files.
 */
import { describe, it, expect } from 'vitest';
import {
  track,
  trackAgentCall,
  trackSkillInvocation,
  trackHookTrigger,
  trackModeActivation,
  trackRoutingDecision,
  trackUserOverride,
  trackSessionMetrics,
  resolveModelPricing,
  estimateCost,
  MODEL_PRICING,
} from '../../src/lab/tracker.js';
import { readEvents } from '../../src/lab/store.js';

/** Generate a globally-unique session ID for test isolation */
function uniqueSess(tag: string): string {
  return `t-${tag}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`;
}

describe('track', () => {
  it('does not throw on valid input', () => {
    expect(() => track('agent-call', uniqueSess('nothrow'), { name: 'executor' })).not.toThrow();
  });

  it('writes an event that can be read back by session ID', () => {
    const sess = uniqueSess('readback');
    track('agent-call', sess, { name: 'my-agent' });
    const events = readEvents();
    const found = events.find(e => e.sessionId === sess);
    expect(found).toBeDefined();
    expect(found?.type).toBe('agent-call');
  });

  it('assigns a unique id to each event', () => {
    const sess = uniqueSess('uniqueid');
    track('agent-call', sess, { n: 1 });
    track('agent-call', sess, { n: 2 });
    const events = readEvents().filter(e => e.sessionId === sess);
    const ids = events.map(e => e.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.length).toBe(2);
  });

  it('sets a valid ISO timestamp on the event', () => {
    const sess = uniqueSess('timestamp');
    track('hook-trigger', sess, {});
    const events = readEvents();
    const found = events.find(e => e.sessionId === sess && e.type === 'hook-trigger');
    expect(found).toBeDefined();
    const ts = new Date(found!.timestamp).getTime();
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThan(0);
  });
});

describe('trackAgentCall', () => {
  it('does not throw on valid input', () => {
    expect(() =>
      trackAgentCall(uniqueSess('agent-nothrow'), 'executor', 'opus', 1200, 'success'),
    ).not.toThrow();
  });

  it('writes an agent-call event with correct payload fields', () => {
    const sess = uniqueSess('agent-payload');
    trackAgentCall(sess, 'code-reviewer', 'sonnet', 800, 'success');
    const found = readEvents().find(e => e.sessionId === sess && e.type === 'agent-call');
    expect(found?.payload.name).toBe('code-reviewer');
    expect(found?.payload.model).toBe('sonnet');
    expect(found?.payload.durationMs).toBe(800);
    expect(found?.payload.result).toBe('success');
  });

  it('passes extra payload fields through', () => {
    const sess = uniqueSess('agent-extra');
    trackAgentCall(sess, 'executor', 'opus', 500, 'success', { customField: 'hello' });
    const found = readEvents().find(e => e.sessionId === sess && e.type === 'agent-call');
    expect(found?.payload.customField).toBe('hello');
  });
});

describe('trackSkillInvocation', () => {
  it('does not throw', () => {
    expect(() => trackSkillInvocation(uniqueSess('skill-nothrow'), 'autopilot', 2000, 'success')).not.toThrow();
  });

  it('writes a skill-invocation event', () => {
    const sess = uniqueSess('skill-write');
    trackSkillInvocation(sess, 'tdd', 500, 'success');
    const found = readEvents().find(e => e.type === 'skill-invocation' && e.sessionId === sess);
    expect(found?.payload.skillName).toBe('tdd');
    expect(found?.payload.result).toBe('success');
  });
});

describe('trackHookTrigger', () => {
  it('does not throw', () => {
    expect(() =>
      trackHookTrigger(uniqueSess('hook-nothrow'), 'pre-tool-use', 'Bash', 'approve'),
    ).not.toThrow();
  });

  it('writes a hook-trigger event with hookName and result', () => {
    const sess = uniqueSess('hook-write');
    trackHookTrigger(sess, 'secret-filter', 'Write', 'block');
    const found = readEvents().find(e => e.type === 'hook-trigger' && e.sessionId === sess);
    expect(found?.payload.hookName).toBe('secret-filter');
    expect(found?.payload.result).toBe('block');
  });
});

describe('trackModeActivation', () => {
  it('does not throw', () => {
    expect(() => trackModeActivation(uniqueSess('mode-nothrow'), 'focus', 'keyword')).not.toThrow();
  });

  it('writes a mode-activation event', () => {
    const sess = uniqueSess('mode-write');
    trackModeActivation(sess, 'autopilot', 'command');
    const found = readEvents().find(e => e.type === 'mode-activation' && e.sessionId === sess);
    expect(found?.payload.modeName).toBe('autopilot');
    expect(found?.payload.trigger).toBe('command');
  });
});

describe('trackRoutingDecision', () => {
  it('does not throw', () => {
    expect(() =>
      trackRoutingDecision(uniqueSess('route-nothrow'), 'implement feature', 'sonnet', 'opus', 'signal'),
    ).not.toThrow();
  });

  it('flags wasOverridden as true when recommended and actual differ', () => {
    const sess = uniqueSess('route-override');
    trackRoutingDecision(sess, 'task', 'haiku', 'opus', 'signal');
    const found = readEvents().find(e => e.type === 'routing-decision' && e.sessionId === sess);
    expect(found?.payload.wasOverridden).toBe(true);
  });

  it('flags wasOverridden as false when recommended equals actual', () => {
    const sess = uniqueSess('route-nooverride');
    trackRoutingDecision(sess, 'task', 'sonnet', 'sonnet', 'signal');
    const found = readEvents().find(e => e.type === 'routing-decision' && e.sessionId === sess);
    expect(found?.payload.wasOverridden).toBe(false);
  });
});

describe('trackUserOverride', () => {
  it('does not throw', () => {
    expect(() =>
      trackUserOverride(uniqueSess('override-nothrow'), 'executor', 'proceed', 'wait'),
    ).not.toThrow();
  });

  it('writes a user-override event', () => {
    const sess = uniqueSess('override-write');
    trackUserOverride(sess, 'hook', 'block', 'approve');
    const found = readEvents().find(e => e.type === 'user-override' && e.sessionId === sess);
    expect(found?.payload.component).toBe('hook');
    expect(found?.payload.originalDecision).toBe('block');
    expect(found?.payload.userDecision).toBe('approve');
  });
});

describe('trackSessionMetrics', () => {
  it('does not throw', () => {
    expect(() =>
      trackSessionMetrics(uniqueSess('metrics-nothrow'), 1000, 500, 0.05, 30000, 3, 'claude-sonnet-4-6'),
    ).not.toThrow();
  });

  it('writes a session-metrics event', () => {
    const sess = uniqueSess('metrics-write');
    trackSessionMetrics(sess, 2000, 1000, 0.1, 60000, 5);
    const found = readEvents().find(e => e.type === 'session-metrics' && e.sessionId === sess);
    expect(found?.payload.inputTokens).toBe(2000);
    expect(found?.payload.outputTokens).toBe(1000);
  });
});

describe('resolveModelPricing', () => {
  it('returns opus pricing for modelId containing "opus"', () => {
    const pricing = resolveModelPricing('claude-opus-4-6');
    expect(pricing).toBe(MODEL_PRICING['claude-opus-4-6']);
  });

  it('returns haiku pricing for modelId containing "haiku"', () => {
    const pricing = resolveModelPricing('claude-haiku-4-5');
    expect(pricing).toBe(MODEL_PRICING['claude-haiku-4-5']);
  });

  it('defaults to sonnet pricing for unknown model', () => {
    const pricing = resolveModelPricing('some-unknown-model');
    expect(pricing).toBe(MODEL_PRICING['claude-sonnet-4-6']);
  });

  it('is case-insensitive', () => {
    const pricing = resolveModelPricing('CLAUDE-OPUS-LATEST');
    expect(pricing).toBe(MODEL_PRICING['claude-opus-4-6']);
  });
});

describe('estimateCost', () => {
  it('returns 0 for 0 tokens', () => {
    expect(estimateCost(0, 0, 'claude-sonnet-4-6')).toBe(0);
  });

  it('returns a positive cost for non-zero tokens', () => {
    expect(estimateCost(1000, 500, 'claude-sonnet-4-6')).toBeGreaterThan(0);
  });

  it('opus costs more than haiku for same token count', () => {
    const opusCost = estimateCost(1000, 1000, 'claude-opus-4-6');
    const haikuCost = estimateCost(1000, 1000, 'claude-haiku-4-5');
    expect(opusCost).toBeGreaterThan(haikuCost);
  });

  it('calculates cost correctly: (inputTokens/1M * inputPrice) + (outputTokens/1M * outputPrice)', () => {
    // sonnet: input $3.00/M, output $15.00/M
    const cost = estimateCost(1_000_000, 1_000_000, 'claude-sonnet-4-6');
    expect(cost).toBeCloseTo(3.0 + 15.0);
  });
});
