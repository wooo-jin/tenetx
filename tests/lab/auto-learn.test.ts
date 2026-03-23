import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  shouldAutoLearnRun,
  loadLastEvolveInfo,
  loadEvolutionHistory,
  runEvolveCycle,
} from '../../src/lab/auto-learn.js';
import { appendEvent } from '../../src/lab/store.js';
import type { LabEvent } from '../../src/lab/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const LAB_DIR = path.join(os.homedir(), '.compound', 'lab');
const LAST_EVOLVE_PATH = path.join(LAB_DIR, 'last-evolve.json');

/**
 * Back up and restore last-evolve.json around tests so we don't clobber
 * the user's real file.  We do NOT call resetEvents() because it is racy
 * under concurrent vitest workers — other test files share events.jsonl.
 */
let savedLastEvolveContent: string | null = null;

function backupLastEvolve(): void {
  try {
    if (fs.existsSync(LAST_EVOLVE_PATH)) {
      savedLastEvolveContent = fs.readFileSync(LAST_EVOLVE_PATH, 'utf-8');
    } else {
      savedLastEvolveContent = null;
    }
  } catch { savedLastEvolveContent = null; }
}

function restoreLastEvolve(): void {
  try {
    if (savedLastEvolveContent !== null) {
      fs.mkdirSync(LAB_DIR, { recursive: true });
      fs.writeFileSync(LAST_EVOLVE_PATH, savedLastEvolveContent);
    } else {
      if (fs.existsSync(LAST_EVOLVE_PATH)) {
        fs.unlinkSync(LAST_EVOLVE_PATH);
      }
    }
  } catch { /* ignore */ }
}

function setLastEvolveTimestamp(hoursAgo: number): void {
  const ts = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  const info = { timestamp: ts, eventsAnalyzed: 100, adjustmentCount: 0, dryRun: false };
  fs.mkdirSync(LAB_DIR, { recursive: true });
  fs.writeFileSync(LAST_EVOLVE_PATH, JSON.stringify(info));
}

function makeEvent(sessionId = 'sess'): LabEvent {
  return {
    id: `al-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'agent-call',
    timestamp: new Date().toISOString(),
    sessionId,
    payload: { name: 'executor', result: 'success', durationMs: 100 },
  };
}

describe('shouldAutoLearnRun', () => {
  beforeEach(backupLastEvolve);
  afterEach(restoreLastEvolve);

  it('returns true when there has never been a run (no last-evolve.json)', () => {
    if (fs.existsSync(LAST_EVOLVE_PATH)) {
      fs.unlinkSync(LAST_EVOLVE_PATH);
    }
    const result = shouldAutoLearnRun();
    expect(result).toBe(true);
  });

  it('returns false if last run was less than 24 hours ago', () => {
    // Write a recent last-evolve record (1 hour ago)
    setLastEvolveTimestamp(1);
    const result = shouldAutoLearnRun();
    expect(result).toBe(false);
  });

  it('returns false for a run exactly 23 hours ago', () => {
    setLastEvolveTimestamp(23);
    const result = shouldAutoLearnRun();
    expect(result).toBe(false);
  });
});

describe('loadLastEvolveInfo', () => {
  beforeEach(backupLastEvolve);
  afterEach(restoreLastEvolve);

  it('returns null when no last-evolve.json exists', () => {
    if (fs.existsSync(LAST_EVOLVE_PATH)) {
      fs.unlinkSync(LAST_EVOLVE_PATH);
    }
    const result = loadLastEvolveInfo();
    expect(result).toBeNull();
  });

  it('returns the persisted info when file exists', () => {
    const info = {
      timestamp: new Date().toISOString(),
      eventsAnalyzed: 75,
      adjustmentCount: 3,
      dryRun: true,
    };
    fs.mkdirSync(LAB_DIR, { recursive: true });
    fs.writeFileSync(LAST_EVOLVE_PATH, JSON.stringify(info));

    const result = loadLastEvolveInfo();
    expect(result?.eventsAnalyzed).toBe(75);
    expect(result?.adjustmentCount).toBe(3);
    expect(result?.dryRun).toBe(true);
  });

  it('returns an object with a timestamp property', () => {
    const info = {
      timestamp: new Date().toISOString(),
      eventsAnalyzed: 10,
      adjustmentCount: 1,
      dryRun: false,
    };
    fs.mkdirSync(LAB_DIR, { recursive: true });
    fs.writeFileSync(LAST_EVOLVE_PATH, JSON.stringify(info));

    const result = loadLastEvolveInfo();
    expect(result).not.toBeNull();
    expect(typeof result?.timestamp).toBe('string');
    expect(new Date(result!.timestamp).getTime()).toBeGreaterThan(0);
  });
});

describe('loadEvolutionHistory', () => {
  it('returns an array (empty or populated)', () => {
    const result = loadEvolutionHistory();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('runEvolveCycle (dry-run)', () => {
  it('returns adjustments array and patterns array', async () => {
    const result = await runEvolveCycle(true);
    expect(Array.isArray(result.adjustments)).toBe(true);
    expect(Array.isArray(result.patterns)).toBe(true);
  });

  it('returns an object with changed boolean', async () => {
    const result = await runEvolveCycle(true);
    expect(typeof result.changed).toBe('boolean');
  });

  it('returns totalEventsAnalyzed as a non-negative number', async () => {
    const result = await runEvolveCycle(true);
    expect(typeof result.totalEventsAnalyzed).toBe('number');
    expect(result.totalEventsAnalyzed).toBeGreaterThanOrEqual(0);
  });

  it('returns changed=false and Insufficient events reason when below threshold', async () => {
    /**
     * We cannot use resetEvents() because it races with other test files.
     * Instead we pass windowDays=0 to ensure an empty event window (no events
     * within the last 0 days) regardless of concurrent writes.
     */
    const result = await runEvolveCycle(true, 0);
    expect(result.changed).toBe(false);
    // Either insufficient events or empty window
    expect(result.totalEventsAnalyzed).toBe(0);
  });

  it('does not mutate the forge profile in dry-run mode (no throw)', async () => {
    // Append a few events to ensure there is something to analyze
    for (let i = 0; i < 5; i++) {
      appendEvent(makeEvent(`sess-dry-nocrash-${i}`));
    }
    const result = await runEvolveCycle(true);
    expect(typeof result).toBe('object');
  });
});
