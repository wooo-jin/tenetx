/**
 * Tenetx Lab — Append-Only JSONL Event Store
 *
 * Events are stored in JSONL format (one JSON object per line).
 * Non-JSONL files use atomic writes (tmp + rename).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';

const log = createLogger('lab-store');
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

// atomicWrite + safeReadJSON: shared utility
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';
function atomicWrite(filePath: string, data: unknown): void {
  atomicWriteJSON(filePath, data, { pretty: true });
}

// ---------------------------------------------------------------------------
// Event Store (JSONL)
// ---------------------------------------------------------------------------

/** Maximum events file size before rotation (10MB) */
const MAX_EVENTS_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum archive age in days */
const MAX_ARCHIVE_AGE_DAYS = 90;

/** Rotate events.jsonl if it exceeds size threshold */
export function rotateEventsIfNeeded(): boolean {
  try {
    if (!fs.existsSync(EVENTS_PATH)) return false;
    const stat = fs.statSync(EVENTS_PATH);
    if (stat.size < MAX_EVENTS_FILE_SIZE) return false;

    const archiveDir = path.join(LAB_DIR, 'archive');
    ensureDir(archiveDir);
    const date = new Date().toISOString().split('T')[0];
    const archivePath = path.join(archiveDir, `events.${date}.jsonl`);

    // If archive for today already exists, append a counter
    let finalPath = archivePath;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(archiveDir, `events.${date}.${counter}.jsonl`);
      counter++;
    }

    fs.renameSync(EVENTS_PATH, finalPath);
    log.debug(`Rotated events.jsonl → ${path.basename(finalPath)}`);
    return true;
  } catch (e) {
    log.debug('Failed to rotate events', e);
    return false;
  }
}

/** Clean up archives older than MAX_ARCHIVE_AGE_DAYS */
export function cleanOldArchives(): number {
  const archiveDir = path.join(LAB_DIR, 'archive');
  if (!fs.existsSync(archiveDir)) return 0;

  let removed = 0;
  try {
    const cutoffMs = Date.now() - MAX_ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(archiveDir).filter(f => f.startsWith('events.') && f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(archiveDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoffMs) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch { /* skip files we can't stat */ }
    }
  } catch (e) {
    log.debug('Failed to clean archives', e);
  }
  return removed;
}

/** Append a single event to events.jsonl (with auto-rotation) */
export function appendEvent(event: LabEvent): void {
  try {
    ensureDir(LAB_DIR);
    const rotated = rotateEventsIfNeeded();
    if (rotated) cleanOldArchives(); // only scan archives when rotation occurs
    const line = `${JSON.stringify(event)}\n`;
    fs.appendFileSync(EVENTS_PATH, line);
  } catch (e) {
    log.debug('Failed to append event', e);
  }
}

/** Read events from a single JSONL file with time filtering */
function readEventsFromFile(filePath: string, sinceMs?: number, untilMs?: number): LabEvent[] {
  if (!fs.existsSync(filePath)) return [];
  const events: LabEvent[] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
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
    log.debug(`Failed to read events from ${filePath}`, e);
  }
  return events;
}

/** Read all events from current file + archives (optionally filtered by time range) */
export function readEvents(sinceMs?: number, untilMs?: number): LabEvent[] {
  const events: LabEvent[] = [];

  // Read archives first (older data)
  const archiveDir = path.join(LAB_DIR, 'archive');
  if (fs.existsSync(archiveDir)) {
    try {
      const archiveFiles = fs.readdirSync(archiveDir)
        .filter(f => f.startsWith('events.') && f.endsWith('.jsonl'))
        .sort(); // chronological order
      for (const file of archiveFiles) {
        events.push(...readEventsFromFile(path.join(archiveDir, file), sinceMs, untilMs));
      }
    } catch (e) {
      log.debug('Failed to read archive events', e);
    }
  }

  // Read current events file
  events.push(...readEventsFromFile(EVENTS_PATH, sinceMs, untilMs));

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
    log.debug('Failed to reset events', e);
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
  log.debug('All lab data reset');
}
