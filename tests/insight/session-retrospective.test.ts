import { describe, it, expect, vi } from 'vitest';
import type { LabEvent } from '../../src/lab/types.js';

// readEvents를 mock하여 실제 파일 I/O 없이 테스트
vi.mock('../../src/lab/store.js', () => ({
  readEvents: vi.fn(() => []),
}));

const { generateRetrospective } = await import('../../src/insight/session-retrospective.js');
const { readEvents } = await import('../../src/lab/store.js');
const mockReadEvents = vi.mocked(readEvents);

function makeEvent(type: string, payload: Record<string, unknown> = {}, sessionId = 'test-session'): LabEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type: type as LabEvent['type'],
    timestamp: new Date().toISOString(),
    sessionId,
    payload,
  };
}

// rule4SurpriseDetection은 fs를 직접 사용 — 실제 reward-history.json 유무에 따라 결과가 다름
const { rule4SurpriseDetection } = await import('../../src/insight/session-retrospective.js');

describe('rule4SurpriseDetection', () => {
  it('returns a valid result structure regardless of data availability', () => {
    const result = rule4SurpriseDetection(0.5);
    expect(typeof result.surprised).toBe('boolean');
    expect(result.insight === null || typeof result.insight.rule === 'string').toBe(true);
  });

  it('does not throw on extreme reward values', () => {
    expect(() => rule4SurpriseDetection(0)).not.toThrow();
    expect(() => rule4SurpriseDetection(1)).not.toThrow();
    expect(() => rule4SurpriseDetection(-1)).not.toThrow();
    expect(() => rule4SurpriseDetection(NaN)).not.toThrow();
  });
});

describe('generateRetrospective', () => {
  it('returns empty insights when no events', () => {
    mockReadEvents.mockReturnValue([]);
    const result = generateRetrospective('test', 0, 1000);
    expect(result.insights).toHaveLength(0);
    expect(result.surpriseDetected).toBe(false);
  });

  it('rule 1: detects override after injection', () => {
    mockReadEvents.mockReturnValue([
      makeEvent('compound-injected', { name: 'test-sol' }),
      makeEvent('user-rejection', { tool: 'Bash' }),
    ]);
    const result = generateRetrospective('test-session', 0, 1000);
    const overrideInsight = result.insights.find(i => i.rule === 'override-after-injection');
    expect(overrideInsight).toBeDefined();
    expect(overrideInsight!.severity).toBe('action');
  });

  it('rule 2: detects repeated agent calls (3+)', () => {
    mockReadEvents.mockReturnValue([
      makeEvent('agent-call', { name: 'executor' }),
      makeEvent('agent-call', { name: 'executor' }),
      makeEvent('agent-call', { name: 'executor' }),
    ]);
    const result = generateRetrospective('test-session', 0, 1000);
    const repeated = result.insights.find(i => i.rule === 'repeated-agent');
    expect(repeated).toBeDefined();
    expect(repeated!.message).toContain('executor');
    expect(repeated!.message).toContain('3');
  });

  it('rule 2: does NOT trigger for 2 consecutive calls', () => {
    mockReadEvents.mockReturnValue([
      makeEvent('agent-call', { name: 'executor' }),
      makeEvent('agent-call', { name: 'executor' }),
    ]);
    const result = generateRetrospective('test-session', 0, 1000);
    expect(result.insights.find(i => i.rule === 'repeated-agent')).toBeUndefined();
  });

  it('rule 3: detects long session (>2x average)', () => {
    mockReadEvents.mockReturnValue([]);
    const result = generateRetrospective('test-session', 0, 300000, 100000); // 300s vs avg 100s
    const longSession = result.insights.find(i => i.rule === 'long-session');
    expect(longSession).toBeDefined();
    expect(longSession!.severity).toBe('warn');
  });

  it('rule 3: does NOT trigger when duration < 2x average', () => {
    mockReadEvents.mockReturnValue([]);
    const result = generateRetrospective('test-session', 0, 150000, 100000);
    expect(result.insights.find(i => i.rule === 'long-session')).toBeUndefined();
  });

  it('rule 5: detects missing agent from recent sessions', () => {
    // 최근 세션(sinceMs < sessionStartMs)에서 architect 사용
    // 현재 세션에서는 architect 미사용
    mockReadEvents.mockImplementation((_sinceMs?: number, untilMs?: number) => {
      if (untilMs && untilMs <= 1000) {
        // 현재 세션 이벤트 (architect 없음)
        return [makeEvent('agent-call', { name: 'executor' })];
      }
      // 최근 이벤트 (architect 있음)
      return [makeEvent('agent-call', { name: 'architect' }, 'old-session')];
    });
    const result = generateRetrospective('test-session', 0, 1000);
    const frame = result.insights.find(i => i.rule === 'frame-recomposition');
    expect(frame).toBeDefined();
    expect(frame!.message).toContain('architect');
  });
});
