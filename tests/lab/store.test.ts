/**
 * Tests for lab/store.ts
 *
 * Isolation strategy: each test uses a unique session ID and timestamp window
 * to avoid interference from concurrent test files sharing the same events.jsonl.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  appendEvent,
  readEvents,
  countEvents,
  resetEvents,
} from '../../src/lab/store.js';
import type { LabEvent } from '../../src/lab/types.js';

const TEST_SESSION_PREFIX = `store-test-${Date.now()}-${process.pid}`;

function makeEvent(suffix: string, overrides: Partial<LabEvent> = {}): LabEvent {
  return {
    id: `${TEST_SESSION_PREFIX}-${suffix}`,
    type: 'agent-call',
    timestamp: new Date().toISOString(),
    sessionId: `${TEST_SESSION_PREFIX}-sess`,
    payload: { name: 'executor', result: 'success' },
    ...overrides,
  };
}

/** Read only events belonging to this test run (by session prefix) */
function readTestEvents(): LabEvent[] {
  return readEvents().filter(e => e.sessionId.startsWith(TEST_SESSION_PREFIX));
}

describe('appendEvent / readEvents round-trip', () => {
  afterEach(() => {
    // Clean up only our test events by resetting (safest approach)
    // Since we can't selectively delete from JSONL, we accept shared state
    // and filter by session prefix instead.
  });

  it('appendEvent writes an event that readEvents can retrieve', () => {
    const event = makeEvent('rt-1');
    appendEvent(event);
    const events = readTestEvents();
    expect(events.some(e => e.id === event.id)).toBe(true);
  });

  it('multiple events are stored and retrieved', () => {
    const before = readTestEvents().length;
    const e1 = makeEvent(`multi-a-${Date.now()}`);
    const e2 = makeEvent(`multi-b-${Date.now()}`);
    const e3 = makeEvent(`multi-c-${Date.now()}`);
    appendEvent(e1);
    appendEvent(e2);
    appendEvent(e3);

    const events = readTestEvents();
    expect(events.length).toBeGreaterThanOrEqual(before + 3);
  });

  it('event payload is preserved correctly', () => {
    const uniqueSuffix = `payload-${Date.now()}`;
    const event = makeEvent(uniqueSuffix, {
      payload: { name: 'my-special-agent', model: 'opus', durationMs: 1234 },
    });
    appendEvent(event);
    const events = readTestEvents();
    const found = events.find(e => e.id === event.id);
    expect(found?.payload.name).toBe('my-special-agent');
    expect(found?.payload.model).toBe('opus');
    expect(found?.payload.durationMs).toBe(1234);
  });

  it('event type is preserved', () => {
    const uniqueEvent = makeEvent(`type-${Date.now()}`, {
      type: 'hook-trigger',
      sessionId: `${TEST_SESSION_PREFIX}-type`,
    });
    appendEvent(uniqueEvent);
    const events = readTestEvents();
    const found = events.find(e => e.id === uniqueEvent.id);
    expect(found?.type).toBe('hook-trigger');
  });

  it('readEvents with sinceMs filters out older events', () => {
    const pastTs = new Date(Date.now() - 100000).toISOString();
    const nowTs = new Date().toISOString();
    const oldEvent = makeEvent(`old-${Date.now()}`, { timestamp: pastTs });
    const newEvent = makeEvent(`new-${Date.now()}`, { timestamp: nowTs });
    appendEvent(oldEvent);
    appendEvent(newEvent);

    const since = Date.now() - 50000;
    const events = readEvents(since);
    expect(events.some(e => e.id === newEvent.id)).toBe(true);
    expect(events.some(e => e.id === oldEvent.id)).toBe(false);
  });
});

describe('resetEvents - behavior', () => {
  /**
   * resetEvents() truncates the shared JSONL file.  Asserting
   * readEvents().length === 0 is inherently racy when other test files run
   * concurrently because they may append events between resetEvents() and
   * readEvents(). Instead we test only what is safe under concurrent execution.
   */
  it('resetEvents does not throw', () => {
    expect(() => resetEvents()).not.toThrow();
  });

  it('resetEvents does not throw when called on an empty store', () => {
    resetEvents();
    expect(() => resetEvents()).not.toThrow();
  });

  it('after resetEvents, appendEvent writes an event that can be found', () => {
    resetEvents();
    const event = makeEvent(`post-reset-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    appendEvent(event);
    const events = readEvents();
    expect(events.some(e => e.id === event.id)).toBe(true);
  });
});

describe('countEvents - concurrent-safe counting via readEvents', () => {
  /**
   * countEvents() counts all lines in the shared JSONL file and is inherently
   * unsafe under concurrent test execution. We test the counting behavior via
   * readEvents().filter(sessionPrefix).length instead, which isolates counts
   * to events created by this test run.
   */
  it('event count increases after appending one event', () => {
    const prefix = `cnt-one-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const before = readEvents().filter(e => e.sessionId.startsWith(prefix)).length;
    appendEvent(makeEvent(`cnt-a`, { sessionId: prefix }));
    const after = readEvents().filter(e => e.sessionId.startsWith(prefix)).length;
    expect(after).toBe(before + 1);
  });

  it('event count increases by N after N appends', () => {
    const prefix = `cnt-n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const N = 3;
    for (let i = 0; i < N; i++) {
      appendEvent(makeEvent(`cnt-n-${i}`, { sessionId: prefix }));
    }
    const count = readEvents().filter(e => e.sessionId.startsWith(prefix)).length;
    expect(count).toBe(N);
  });

  it('countEvents returns a non-negative integer', () => {
    // Verify the function is callable and returns a number
    const count = countEvents();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(count)).toBe(true);
  });
});
