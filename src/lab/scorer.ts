/**
 * Tenetx Lab — Component Effectiveness Scorer
 *
 * Computes effectiveness scores for harness components
 * based on accumulated event data.
 */

import { readEvents } from './store.js';
import { debugLog } from '../core/logger.js';
import type {
  LabEvent,
  ComponentMetrics,
  ComponentKind,
  Trend,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Scoring weights for effectiveness calculation */
const WEIGHTS = {
  acceptance: 0.30,
  success: 0.35,
  frequency: 0.15,
  recency: 0.20,
} as const;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

interface RawComponentData {
  name: string;
  kind: ComponentKind;
  invocations: number;
  successes: number;
  acceptances: number;
  totalDurationMs: number;
  firstSeen: number;
  lastSeen: number;
  /** 30-day window invocations per 10-day bucket (for trend) */
  recentBuckets: [number, number, number];
}

function emptyRawData(name: string, kind: ComponentKind): RawComponentData {
  return {
    name,
    kind,
    invocations: 0,
    successes: 0,
    acceptances: 0,
    totalDurationMs: 0,
    firstSeen: Number.MAX_SAFE_INTEGER,
    lastSeen: 0,
    recentBuckets: [0, 0, 0],
  };
}

/** Classify an event into a component identity */
function classifyEvent(event: LabEvent): { name: string; kind: ComponentKind } | null {
  const p = event.payload;
  switch (event.type) {
    case 'agent-call':
      return { name: String(p.name ?? 'unknown'), kind: 'agent' };
    case 'skill-invocation':
      return { name: String(p.skillName ?? 'unknown'), kind: 'skill' };
    case 'hook-trigger':
      return { name: String(p.hookName ?? 'unknown'), kind: 'hook' };
    case 'mode-activation':
      return { name: String(p.modeName ?? 'unknown'), kind: 'mode' };
    default:
      return null;
  }
}

/** Check if event represents a success */
function isSuccess(event: LabEvent): boolean {
  const result = event.payload.result as string | undefined;
  if (!result) return true; // No result field = assumed success
  return result === 'success' || result === 'approve';
}

/** Check if event represents an accepted outcome (not overridden) */
function isAccepted(event: LabEvent): boolean {
  if (event.type === 'user-override') return false;
  const result = event.payload.result as string | undefined;
  return result !== 'block' && result !== 'cancelled';
}

/** Get event duration */
function getEventDuration(event: LabEvent): number {
  return (event.payload.durationMs as number) ?? 0;
}

/** Calculate trend from 3 time buckets */
function calculateTrend(buckets: [number, number, number]): Trend {
  const [old, mid, recent] = buckets;
  const total = old + mid + recent;

  if (total === 0) return 'unused';
  if (recent > mid && mid >= old) return 'increasing';
  if (recent < mid && mid <= old) return 'decreasing';
  return 'stable';
}

/** Calculate recency score (0-1, higher = more recent) */
function recencyScore(lastSeenMs: number, nowMs: number): number {
  const age = nowMs - lastSeenMs;
  if (age <= 0) return 1;
  if (age >= THIRTY_DAYS_MS) return 0;
  return 1 - (age / THIRTY_DAYS_MS);
}

/** Calculate frequency score (0-1, logarithmic) */
function frequencyScore(count: number): number {
  if (count <= 0) return 0;
  // log10(count+1) / log10(1001) → maps 1-1000 invocations to ~0-1
  return Math.min(1, Math.log10(count + 1) / 3);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute effectiveness metrics for all tracked components.
 * Handles empty data gracefully.
 */
export function computeAllMetrics(sinceMs?: number): ComponentMetrics[] {
  try {
    const events = readEvents(sinceMs);
    return computeMetricsFromEvents(events);
  } catch (e) {
    debugLog('lab-scorer', 'Failed to compute metrics', e);
    return [];
  }
}

/**
 * Compute metrics from a pre-loaded event array.
 */
export function computeMetricsFromEvents(events: LabEvent[]): ComponentMetrics[] {
  if (events.length === 0) return [];

  const now = Date.now();
  const thirtyDaysAgo = now - THIRTY_DAYS_MS;
  const tenDaysBucket = THIRTY_DAYS_MS / 3;

  // Aggregate raw data per component
  const components = new Map<string, RawComponentData>();

  for (const event of events) {
    const classified = classifyEvent(event);
    if (!classified) continue;

    const key = `${classified.kind}:${classified.name}`;
    if (!components.has(key)) {
      components.set(key, emptyRawData(classified.name, classified.kind));
    }
    const data = components.get(key) ?? emptyRawData(classified.name, classified.kind);
    const ts = new Date(event.timestamp).getTime();

    data.invocations++;
    if (isSuccess(event)) data.successes++;
    if (isAccepted(event)) data.acceptances++;
    data.totalDurationMs += getEventDuration(event);
    data.firstSeen = Math.min(data.firstSeen, ts);
    data.lastSeen = Math.max(data.lastSeen, ts);

    // Bucket for trend calculation (last 30 days only)
    if (ts >= thirtyDaysAgo) {
      const bucketAge = now - ts;
      if (bucketAge < tenDaysBucket) {
        data.recentBuckets[2]++; // Most recent 10 days
      } else if (bucketAge < tenDaysBucket * 2) {
        data.recentBuckets[1]++; // Middle 10 days
      } else {
        data.recentBuckets[0]++; // Oldest 10 days
      }
    }
  }

  // Build override map: check if there are user-override events targeting components
  const overrideTargets = new Set<string>();
  for (const event of events) {
    if (event.type === 'user-override') {
      const component = event.payload.component as string | undefined;
      if (component) overrideTargets.add(component);
    }
  }

  // Convert raw data to ComponentMetrics
  const metrics: ComponentMetrics[] = [];
  for (const [, data] of components) {
    const successRate = data.invocations > 0
      ? data.successes / data.invocations
      : 1;
    const acceptanceRate = data.invocations > 0
      ? data.acceptances / data.invocations
      : 1;
    const avgDurationMs = data.invocations > 0
      ? data.totalDurationMs / data.invocations
      : 0;
    const trend = calculateTrend(data.recentBuckets);

    // Composite effectiveness score
    const freqScore = frequencyScore(data.invocations);
    const recScore = recencyScore(data.lastSeen, now);
    const effectivenessScore = Math.round(
      (acceptanceRate * WEIGHTS.acceptance
        + successRate * WEIGHTS.success
        + freqScore * WEIGHTS.frequency
        + recScore * WEIGHTS.recency
      ) * 100,
    );

    metrics.push({
      name: data.name,
      kind: data.kind,
      invocationCount: data.invocations,
      acceptanceRate: Math.round(acceptanceRate * 100) / 100,
      avgDurationMs: Math.round(avgDurationMs),
      successRate: Math.round(successRate * 100) / 100,
      trend,
      effectivenessScore: Math.min(100, Math.max(0, effectivenessScore)),
      lastUsed: data.lastSeen > 0 ? new Date(data.lastSeen).toISOString() : null,
      firstSeen: data.firstSeen < Number.MAX_SAFE_INTEGER
        ? new Date(data.firstSeen).toISOString()
        : new Date().toISOString(),
    });
  }

  // Sort by effectiveness score descending
  metrics.sort((a, b) => b.effectivenessScore - a.effectivenessScore);
  return metrics;
}

/**
 * Compute metrics for a single component.
 */
export function computeComponentMetrics(
  name: string,
  kind: ComponentKind,
  sinceMs?: number,
): ComponentMetrics | null {
  const all = computeAllMetrics(sinceMs);
  return all.find(m => m.name === name && m.kind === kind) ?? null;
}

/**
 * Get average effectiveness score across all components.
 */
export function getAverageEffectiveness(sinceMs?: number): number {
  const metrics = computeAllMetrics(sinceMs);
  if (metrics.length === 0) return 0;
  const total = metrics.reduce((sum, m) => sum + m.effectivenessScore, 0);
  return Math.round(total / metrics.length);
}
