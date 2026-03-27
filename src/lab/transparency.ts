/**
 * Tenetx Lab — Transparency Layer
 *
 * Generates user-facing notifications when dimension vectors change,
 * collects user responses (accept/revert/modify/ignore), and translates
 * those responses into reward adjustments for Thompson Sampling.
 *
 * Design rationale:
 *   - File-based persistence (one JSON per notification) keeps each
 *     notification independently addressable and avoids JSONL append
 *     contention with the main event store.
 *   - Notifications below NOTIFICATION_THRESHOLD are silently dropped
 *     to avoid alert fatigue on micro-adjustments.
 *   - Reward mapping is intentionally asymmetric: reverts carry a strong
 *     negative signal (-0.5) while accepts are weak positives (+0.1),
 *     because false-positive adaptation is costlier than slow convergence.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { createLogger } from '../core/logger.js';
import type { ChangeNotification, UserResponse } from './types.js';

const log = createLogger('transparency');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directory where individual notification JSON files are stored */
const NOTIFICATIONS_DIR = path.join(os.homedir(), '.compound', 'lab', 'notifications');

/** Minimum absolute delta on any dimension to trigger a notification */
const NOTIFICATION_THRESHOLD = 0.02;

/** Default maximum age in days before notifications are garbage-collected */
const DEFAULT_MAX_AGE_DAYS = 30;

// ---------------------------------------------------------------------------
// Notification Creation
// ---------------------------------------------------------------------------

/**
 * Creates a change notification from dimension vector diffs.
 *
 * Only dimensions whose absolute delta meets or exceeds `NOTIFICATION_THRESHOLD`
 * are included. Returns `null` when no dimension crosses the threshold,
 * meaning the change was too small to warrant user attention.
 *
 * Side-effect: persists the notification to disk when non-null.
 *
 * @param previousVector - Dimension values before the change
 * @param newVector      - Dimension values after the change
 * @param reasons        - Per-dimension reason strings (key = dimension name)
 * @returns The notification, or null if all deltas are below threshold
 */
export function createChangeNotification(
  previousVector: Record<string, number>,
  newVector: Record<string, number>,
  reasons: Record<string, string>,
): ChangeNotification | null {
  const changes: ChangeNotification['changes'] = [];

  for (const [dim, newVal] of Object.entries(newVector)) {
    const prevVal = previousVector[dim] ?? 0.5;
    if (Math.abs(newVal - prevVal) >= NOTIFICATION_THRESHOLD) {
      changes.push({
        dimension: dim,
        previousValue: prevVal,
        newValue: newVal,
        reason: reasons[dim] ?? 'auto-evolution',
      });
    }
  }

  if (changes.length === 0) return null;

  const notification: ChangeNotification = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    changes,
  };

  saveNotification(notification);
  return notification;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Persists a notification as an individual JSON file.
 *
 * Creates the notifications directory if it does not exist.
 * Failures are logged but never thrown -- notification persistence
 * is best-effort and must not break the main evolution flow.
 */
function saveNotification(notification: ChangeNotification): void {
  try {
    fs.mkdirSync(NOTIFICATIONS_DIR, { recursive: true });
    const filePath = path.join(NOTIFICATIONS_DIR, `${notification.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(notification, null, 2));
  } catch (e) {
    log.debug('Failed to save notification', e);
  }
}

/**
 * Loads the most recent notification that has no user response yet.
 *
 * Files are sorted lexicographically in reverse (UUID v4 is not time-ordered,
 * but combined with the timestamp field this gives a reasonable recency proxy).
 *
 * @returns The oldest unanswered notification, or null if none exist
 */
export function loadPendingNotification(): ChangeNotification | null {
  try {
    if (!fs.existsSync(NOTIFICATIONS_DIR)) return null;

    const files = fs.readdirSync(NOTIFICATIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    for (const file of files) {
      const filePath = path.join(NOTIFICATIONS_DIR, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as ChangeNotification;
      if (!data.userResponse) return data;
    }
  } catch (e) {
    log.debug('Failed to load pending notification', e);
  }
  return null;
}

// ---------------------------------------------------------------------------
// User Response Recording
// ---------------------------------------------------------------------------

/**
 * Records the user's response to a notification.
 *
 * @param notificationId - UUID of the notification to update
 * @param response       - One of: accepted, reverted, modified, ignored
 * @param modifiedValues - Optional dimension overrides (only for 'modified' response)
 * @returns true if the notification was found and updated, false otherwise
 */
export function recordUserResponse(
  notificationId: string,
  response: UserResponse,
  modifiedValues?: Record<string, number>,
): boolean {
  try {
    const filePath = path.join(NOTIFICATIONS_DIR, `${notificationId}.json`);
    if (!fs.existsSync(filePath)) return false;

    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as ChangeNotification;
    data.userResponse = response;
    if (modifiedValues) data.userModifiedValues = modifiedValues;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    log.debug('Failed to record user response', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Formats a notification into a human-readable summary string.
 *
 * Example output:
 *   [Forge v2] Profile dimensions updated:
 *     autonomyPreference: 0.60 -> 0.65 (^0.050) -- pattern detected
 *
 * @param notification - The notification to format
 * @returns Multi-line summary string
 */
export function formatNotification(notification: ChangeNotification): string {
  const lines = ['[Forge v2] Profile dimensions updated:'];

  for (const change of notification.changes) {
    const direction = change.newValue > change.previousValue ? '\u2191' : '\u2193';
    const delta = Math.abs(change.newValue - change.previousValue).toFixed(3);
    lines.push(
      `  ${change.dimension}: ${change.previousValue.toFixed(2)} \u2192 ${change.newValue.toFixed(2)} (${direction}${delta}) \u2014 ${change.reason}`,
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Garbage Collection
// ---------------------------------------------------------------------------

/**
 * Removes notification files older than `maxAgeDays`.
 *
 * Uses file mtime (not the timestamp field inside the JSON) for efficiency,
 * avoiding the cost of parsing every file.
 *
 * @param maxAgeDays - Maximum age in days (default: 30)
 * @returns Number of files deleted
 */
export function cleanOldNotifications(maxAgeDays: number = DEFAULT_MAX_AGE_DAYS): number {
  let cleaned = 0;

  try {
    if (!fs.existsSync(NOTIFICATIONS_DIR)) return 0;

    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const file of fs.readdirSync(NOTIFICATIONS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(NOTIFICATIONS_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }
  } catch (e) {
    log.debug('Failed to clean old notifications', e);
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Reward Mapping
// ---------------------------------------------------------------------------

/**
 * Maps a user response to a reward adjustment value for Thompson Sampling.
 *
 * The mapping is intentionally asymmetric:
 *   - reverted:  -0.5  (strong negative -- user explicitly rejected the change)
 *   - modified:  -0.1  (mild negative -- direction was right but magnitude was wrong)
 *   - accepted:  +0.1  (mild positive -- user confirmed the change)
 *   - ignored:   +0.05 (very weak positive -- change was natural enough to go unnoticed)
 *
 * Rationale: penalizing unwanted changes heavily while rewarding good changes
 * mildly prevents the system from drifting away from user preferences.
 *
 * @param response - The user's response to a notification
 * @returns Reward adjustment value to inject into Thompson Sampling
 */
export function responseToRewardAdjustment(response: UserResponse): number {
  switch (response) {
    case 'reverted': return -0.5;
    case 'modified': return -0.1;
    case 'accepted': return 0.1;
    case 'ignored':  return 0.05;
  }
}
