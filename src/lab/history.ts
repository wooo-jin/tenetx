/**
 * Tenetx Lab — Harness Evolution History
 *
 * Tracks harness configuration changes over time via snapshots.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { createLogger } from '../core/logger.js';

const log = createLogger('lab-history');
import { saveSnapshot, listSnapshots, countEvents } from './store.js';
import { getAverageEffectiveness } from './scorer.js';
import type { HarnessSnapshot, SnapshotTrigger } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPOUND_HOME = path.join(os.homedir(), '.compound');
const SESSIONS_DIR = path.join(COMPOUND_HOME, 'sessions');
const PACKS_DIR = path.join(COMPOUND_HOME, 'packs');

// ---------------------------------------------------------------------------
// Snapshot Creation
// ---------------------------------------------------------------------------

/** Discover currently installed agents */
function discoverAgents(cwd?: string): string[] {
  const agents: string[] = [];
  const agentsDir = cwd
    ? path.join(cwd, '.claude', 'agents')
    : path.join(os.homedir(), '.claude', 'agents');

  try {
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
      agents.push(...files);
    }
  } catch (e) {
    log.debug('Failed to discover agents', e);
  }
  return agents;
}

/** Discover active hooks from settings */
function discoverHooks(): string[] {
  const hooks: string[] = [];
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const hooksConfig = settings.hooks as Record<string, unknown[]> | undefined;
      if (hooksConfig) {
        for (const [eventName, entries] of Object.entries(hooksConfig)) {
          if (Array.isArray(entries) && entries.length > 0) {
            hooks.push(eventName);
          }
        }
      }
    }
  } catch (e) {
    log.debug('Failed to discover hooks', e);
  }
  return hooks;
}

/** Discover connected packs */
function discoverPacks(): string[] {
  try {
    if (fs.existsSync(PACKS_DIR)) {
      return fs.readdirSync(PACKS_DIR)
        .filter(f => {
          const stat = fs.statSync(path.join(PACKS_DIR, f));
          return stat.isDirectory();
        });
    }
  } catch (e) {
    log.debug('Failed to discover packs', e);
  }
  return [];
}

/** Load philosophy info */
function loadPhilosophyInfo(): { name: string; version: string } {
  const philosophyPath = path.join(COMPOUND_HOME, 'me', 'philosophy.json');
  try {
    if (fs.existsSync(philosophyPath)) {
      const data = JSON.parse(fs.readFileSync(philosophyPath, 'utf-8'));
      return { name: data.name ?? 'unknown', version: data.version ?? '0.0.0' };
    }
  } catch (e) {
    log.debug('Failed to load philosophy', e);
  }
  return { name: 'default', version: '1.0.0' };
}

/** Count total session files */
function countSessions(): number {
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      return fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')).length;
    }
  } catch {
    // ignore
  }
  return 0;
}

/** Load routing preset from global config */
function loadRoutingPreset(): string {
  const configPath = path.join(COMPOUND_HOME, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return (config.modelRouting as string) ?? 'default';
    }
  } catch {
    // ignore
  }
  return 'default';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Known mode names (matches paths.ts ALL_MODES) */
const ALL_MODES = [
  'ralph', 'autopilot', 'ultrawork', 'team', 'pipeline',
  'ccg', 'ralplan', 'deep-interview',
];

/**
 * Create a harness snapshot capturing current configuration state.
 */
export function createSnapshot(
  trigger: SnapshotTrigger,
  cwd?: string,
): HarnessSnapshot {
  const snapshot: HarnessSnapshot = {
    id: crypto.randomUUID().slice(0, 12),
    timestamp: new Date().toISOString(),
    trigger,
    philosophy: loadPhilosophyInfo(),
    agents: discoverAgents(cwd),
    hooks: discoverHooks(),
    modes: ALL_MODES,
    routingPreset: loadRoutingPreset(),
    packs: discoverPacks(),
    metricsSummary: {
      totalEvents: countEvents(),
      totalSessions: countSessions(),
      avgEffectiveness: getAverageEffectiveness(),
    },
  };

  saveSnapshot(snapshot);
  return snapshot;
}

/**
 * Get harness evolution history (list of snapshots, newest first).
 */
export function getHistory(): HarnessSnapshot[] {
  return listSnapshots();
}

/**
 * Compare two snapshots and describe the differences.
 */
export function compareSnapshots(
  older: HarnessSnapshot,
  newer: HarnessSnapshot,
): string[] {
  const diffs: string[] = [];

  // Philosophy change
  if (older.philosophy.name !== newer.philosophy.name
    || older.philosophy.version !== newer.philosophy.version) {
    diffs.push(
      `Philosophy: ${older.philosophy.name} v${older.philosophy.version} -> `
      + `${newer.philosophy.name} v${newer.philosophy.version}`,
    );
  }

  // Routing preset change
  if (older.routingPreset !== newer.routingPreset) {
    diffs.push(`Routing: ${older.routingPreset} -> ${newer.routingPreset}`);
  }

  // Agent changes
  const addedAgents = newer.agents.filter(a => !older.agents.includes(a));
  const removedAgents = older.agents.filter(a => !newer.agents.includes(a));
  if (addedAgents.length > 0) diffs.push(`Agents added: ${addedAgents.join(', ')}`);
  if (removedAgents.length > 0) diffs.push(`Agents removed: ${removedAgents.join(', ')}`);

  // Pack changes
  const addedPacks = newer.packs.filter(p => !older.packs.includes(p));
  const removedPacks = older.packs.filter(p => !newer.packs.includes(p));
  if (addedPacks.length > 0) diffs.push(`Packs added: ${addedPacks.join(', ')}`);
  if (removedPacks.length > 0) diffs.push(`Packs removed: ${removedPacks.join(', ')}`);

  // Effectiveness delta
  const effDelta = newer.metricsSummary.avgEffectiveness
    - older.metricsSummary.avgEffectiveness;
  if (Math.abs(effDelta) >= 1) {
    const sign = effDelta > 0 ? '+' : '';
    diffs.push(`Effectiveness: ${sign}${effDelta}% (${older.metricsSummary.avgEffectiveness} -> ${newer.metricsSummary.avgEffectiveness})`);
  }

  if (diffs.length === 0) {
    diffs.push('No significant changes detected');
  }

  return diffs;
}
