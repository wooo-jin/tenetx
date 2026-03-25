/**
 * Tenetx Lab — Append-Only JSONL Event Store
 *
 * Events are stored in JSONL format (one JSON object per line).
 * Non-JSONL files use atomic writes (tmp + rename).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from '../core/logger.js';
import type {
  LabEvent,
  LabSuggestion,
  MonthlyMetrics,
  HarnessSnapshot,
  LabExperiment,
  SessionCostEntry,
} from './types.js';

// ---------------------------------------------------------------------------
// Path Constants
// ---------------------------------------------------------------------------

const LAB_DIR = path.join(os.homedir(), '.compound', 'lab');
const EVENTS_PATH = path.join(LAB_DIR, 'events.jsonl');
const METRICS_DIR = path.join(LAB_DIR, 'metrics');
const SUGGESTIONS_DIR = path.join(LAB_DIR, 'suggestions');
const SNAPSHOTS_DIR = path.join(LAB_DIR, 'snapshots');
const EXPERIMENTS_DIR = path.join(LAB_DIR, 'experiments');
const COST_DIR = path.join(LAB_DIR, 'cost');

const PENDING_SUGGESTIONS_PATH = path.join(SUGGESTIONS_DIR, 'pending.json');
const SUGGESTION_HISTORY_PATH = path.join(SUGGESTIONS_DIR, 'history.json');
const SESSIONS_COST_PATH = path.join(COST_DIR, 'sessions.json');

/** Lab storage directory */
export { LAB_DIR, EVENTS_PATH };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Atomic write: write to tmp file then rename */
function atomicWrite(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (unlinkErr) { debugLog('lab-store', 'tmp file cleanup failed after write error', unlinkErr); }
    throw e;
  }
}

function safeReadJSON<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch (e) {
    debugLog('lab-store', `JSON read failed: ${filePath}`, e);
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Event Store (JSONL)
// ---------------------------------------------------------------------------

/** Append a single event to events.jsonl */
export function appendEvent(event: LabEvent): void {
  try {
    ensureDir(LAB_DIR);
    const line = `${JSON.stringify(event)}\n`;
    fs.appendFileSync(EVENTS_PATH, line);
  } catch (e) {
    debugLog('lab-store', 'Failed to append event', e);
  }
}

/** Read all events (optionally filtered by time range) */
export function readEvents(sinceMs?: number, untilMs?: number): LabEvent[] {
  if (!fs.existsSync(EVENTS_PATH)) return [];

  const events: LabEvent[] = [];
  try {
    const content = fs.readFileSync(EVENTS_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as LabEvent;
        if (sinceMs !== undefined) {
          const ts = new Date(event.timestamp).getTime();
          if (ts < sinceMs) continue;
          if (untilMs !== undefined && ts > untilMs) continue;
        }
        events.push(event);
      } catch {
        // Skip malformed lines
      }
    }
  } catch (e) {
    debugLog('lab-store', 'Failed to read events', e);
  }
  return events;
}

/** Count total events without loading all into memory */
export function countEvents(): number {
  if (!fs.existsSync(EVENTS_PATH)) return 0;
  try {
    const content = fs.readFileSync(EVENTS_PATH, 'utf-8');
    return content.split('\n').filter(l => l.trim()).length;
  } catch {
    return 0;
  }
}

/** Reset event data (clear events.jsonl) */
export function resetEvents(): void {
  try {
    if (fs.existsSync(EVENTS_PATH)) {
      fs.writeFileSync(EVENTS_PATH, '');
    }
  } catch (e) {
    debugLog('lab-store', 'Failed to reset events', e);
  }
}

// ---------------------------------------------------------------------------
// Monthly Metrics
// ---------------------------------------------------------------------------

function monthlyMetricsPath(month: string): string {
  return path.join(METRICS_DIR, `${month}.json`);
}

export function loadMonthlyMetrics(month: string): MonthlyMetrics | null {
  return safeReadJSON<MonthlyMetrics | null>(monthlyMetricsPath(month), null);
}

export function saveMonthlyMetrics(metrics: MonthlyMetrics): void {
  atomicWrite(monthlyMetricsPath(metrics.month), metrics);
}

/** List available monthly metrics files (sorted ascending) */
export function listMonthlyMetrics(): string[] {
  if (!fs.existsSync(METRICS_DIR)) return [];
  try {
    return fs.readdirSync(METRICS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export function loadPendingSuggestions(): LabSuggestion[] {
  return safeReadJSON<LabSuggestion[]>(PENDING_SUGGESTIONS_PATH, []);
}

export function savePendingSuggestions(suggestions: LabSuggestion[]): void {
  atomicWrite(PENDING_SUGGESTIONS_PATH, suggestions);
}

export function loadSuggestionHistory(): LabSuggestion[] {
  return safeReadJSON<LabSuggestion[]>(SUGGESTION_HISTORY_PATH, []);
}

export function saveSuggestionHistory(history: LabSuggestion[]): void {
  atomicWrite(SUGGESTION_HISTORY_PATH, history);
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export function saveSnapshot(snapshot: HarnessSnapshot): void {
  const filename = `${snapshot.timestamp.replace(/[:.]/g, '-')}-${snapshot.trigger}.json`;
  atomicWrite(path.join(SNAPSHOTS_DIR, filename), snapshot);
}

export function listSnapshots(): HarnessSnapshot[] {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
  try {
    const files = fs.readdirSync(SNAPSHOTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    const snapshots: HarnessSnapshot[] = [];
    for (const file of files) {
      const snap = safeReadJSON<HarnessSnapshot | null>(
        path.join(SNAPSHOTS_DIR, file), null,
      );
      if (snap) snapshots.push(snap);
    }
    return snapshots;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

function experimentPath(id: string): string {
  return path.join(EXPERIMENTS_DIR, `${id}.json`);
}

export function saveExperiment(experiment: LabExperiment): void {
  atomicWrite(experimentPath(experiment.id), experiment);
}

export function loadExperiment(id: string): LabExperiment | null {
  return safeReadJSON<LabExperiment | null>(experimentPath(id), null);
}

export function listExperiments(): LabExperiment[] {
  if (!fs.existsSync(EXPERIMENTS_DIR)) return [];
  try {
    const files = fs.readdirSync(EXPERIMENTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    const experiments: LabExperiment[] = [];
    for (const file of files) {
      const exp = safeReadJSON<LabExperiment | null>(
        path.join(EXPERIMENTS_DIR, file), null,
      );
      if (exp) experiments.push(exp);
    }
    return experiments;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Session Cost
// ---------------------------------------------------------------------------

export function loadSessionCosts(): SessionCostEntry[] {
  return safeReadJSON<SessionCostEntry[]>(SESSIONS_COST_PATH, []);
}

export function saveSessionCosts(entries: SessionCostEntry[]): void {
  atomicWrite(SESSIONS_COST_PATH, entries);
}

export function appendSessionCost(entry: SessionCostEntry): void {
  const entries = loadSessionCosts();
  entries.push(entry);
  // Keep last 500 entries
  if (entries.length > 500) {
    entries.splice(0, entries.length - 500);
  }
  saveSessionCosts(entries);
}

// ---------------------------------------------------------------------------
// Full Reset
// ---------------------------------------------------------------------------

/** Reset all lab data */
export function resetAll(): void {
  resetEvents();
  // Clear suggestions
  if (fs.existsSync(PENDING_SUGGESTIONS_PATH)) {
    fs.writeFileSync(PENDING_SUGGESTIONS_PATH, '[]');
  }
  // Clear cost data
  if (fs.existsSync(SESSIONS_COST_PATH)) {
    fs.writeFileSync(SESSIONS_COST_PATH, '[]');
  }
  debugLog('lab-store', 'All lab data reset');
}
