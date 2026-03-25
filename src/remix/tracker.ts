/**
 * Tenetx — Remix Provenance Tracker
 *
 * Tracks the origin and modification state of all remixed components.
 * Enables update detection and upstream change tracking.
 */

import * as fs from 'node:fs';
import { REMIX_DIR, REMIX_PROVENANCE } from './paths.js';
import { hashContent } from './registry.js';
import { getLocalComponentPath } from './cherry-pick.js';
import { findHarness, getHarnessComponents } from './registry.js';
import type {
  ComponentType,
  ProvenanceFile,
  RemixProvenance,
} from './types.js';

// ---------------------------------------------------------------------------
// Provenance I/O
// ---------------------------------------------------------------------------

/** Load provenance file */
export function loadProvenance(): ProvenanceFile {
  try {
    if (fs.existsSync(REMIX_PROVENANCE)) {
      const raw = fs.readFileSync(REMIX_PROVENANCE, 'utf-8');
      return JSON.parse(raw) as ProvenanceFile;
    }
  } catch {
    // Corrupted file, return empty
  }
  return { version: 1, components: [] };
}

/** Save provenance file atomically */
function saveProvenance(provenance: ProvenanceFile): void {
  fs.mkdirSync(REMIX_DIR, { recursive: true });
  const tmpPath = `${REMIX_PROVENANCE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(provenance, null, 2));
  fs.renameSync(tmpPath, REMIX_PROVENANCE);
}

// ---------------------------------------------------------------------------
// Provenance operations
// ---------------------------------------------------------------------------

/**
 * Record provenance for a remixed component.
 * Updates existing entry or creates a new one.
 */
export function recordProvenance(
  componentType: ComponentType,
  componentName: string,
  sourceHarness: string,
  sourceVersion: string,
  contentHash: string,
): void {
  const provenance = loadProvenance();

  // Remove existing entry for the same component
  provenance.components = provenance.components.filter(
    (c) => !(c.componentType === componentType && c.componentName === componentName),
  );

  // Add new entry
  provenance.components.push({
    componentType,
    componentName,
    sourceHarness,
    sourceVersion,
    remixedAt: new Date().toISOString(),
    currentHash: contentHash,
    originalHash: contentHash,
    locallyModified: false,
  });

  saveProvenance(provenance);
}

/**
 * Refresh provenance modification status by comparing current file hashes
 * with recorded hashes.
 */
export function refreshProvenance(cwd: string): ProvenanceFile {
  const provenance = loadProvenance();
  let changed = false;

  for (const entry of provenance.components) {
    const localPath = getLocalComponentPath(entry.componentType, entry.componentName, cwd);
    try {
      if (!fs.existsSync(localPath)) continue;
      const content = fs.readFileSync(localPath, 'utf-8');
      const currentHash = hashContent(content);
      const wasModified = entry.locallyModified;
      entry.currentHash = currentHash;
      entry.locallyModified = currentHash !== entry.originalHash;
      if (entry.locallyModified !== wasModified) changed = true;
    } catch {
      // File read error, skip
    }
  }

  if (changed) {
    saveProvenance(provenance);
  }

  return provenance;
}

/**
 * Check for available updates from remix sources.
 * Compares original hashes with current source component hashes.
 */
export interface UpdateInfo {
  componentType: ComponentType;
  componentName: string;
  sourceHarness: string;
  originalHash: string;
  currentSourceHash: string;
  locallyModified: boolean;
}

export function checkUpdates(cwd: string): UpdateInfo[] {
  const provenance = refreshProvenance(cwd);
  const updates: UpdateInfo[] = [];

  // Group by source harness for efficient lookup
  const bySource = new Map<string, RemixProvenance[]>();
  for (const entry of provenance.components) {
    const list = bySource.get(entry.sourceHarness) ?? [];
    list.push(entry);
    bySource.set(entry.sourceHarness, list);
  }

  for (const [sourceName, entries] of bySource) {
    // Strip @ prefix for lookup
    const id = sourceName.startsWith('@') ? sourceName.slice(1) : sourceName;
    const harness = findHarness(id);
    if (!harness) continue;

    const sourceComponents = getHarnessComponents(harness);

    for (const entry of entries) {
      const sourceComponent = sourceComponents.find(
        (c) => c.type === entry.componentType && c.name === entry.componentName,
      );
      if (!sourceComponent) continue;

      if (sourceComponent.contentHash !== entry.originalHash) {
        updates.push({
          componentType: entry.componentType,
          componentName: entry.componentName,
          sourceHarness: entry.sourceHarness,
          originalHash: entry.originalHash,
          currentSourceHash: sourceComponent.contentHash,
          locallyModified: entry.locallyModified,
        });
      }
    }
  }

  return updates;
}

/**
 * Format provenance status for CLI display.
 */
export function formatProvenanceStatus(provenance: ProvenanceFile): string {
  if (provenance.components.length === 0) {
    return '  No remixed components found.';
  }

  const lines: string[] = [];
  lines.push(`  Remixed components (${provenance.components.length})`);
  lines.push('');

  // Group by source
  const bySource = new Map<string, RemixProvenance[]>();
  for (const entry of provenance.components) {
    const list = bySource.get(entry.sourceHarness) ?? [];
    list.push(entry);
    bySource.set(entry.sourceHarness, list);
  }

  for (const [source, entries] of bySource) {
    lines.push(`  From ${source}:`);
    for (const entry of entries) {
      const modified = entry.locallyModified ? ' (locally modified)' : '';
      const date = entry.remixedAt.split('T')[0];
      lines.push(`    [${entry.componentType}] ${entry.componentName}${modified} — remixed ${date}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format update info for CLI display.
 */
export function formatUpdates(updates: UpdateInfo[]): string {
  if (updates.length === 0) {
    return '  All remixed components are up to date.';
  }

  const lines: string[] = [];
  lines.push(`  Updates available (${updates.length})`);
  lines.push('');

  for (const u of updates) {
    const warning = u.locallyModified ? ' [locally modified — merge may be needed]' : '';
    lines.push(`  [${u.componentType}] ${u.componentName} from ${u.sourceHarness}${warning}`);
    lines.push(`    original: ${u.originalHash} -> source: ${u.currentSourceHash}`);
  }

  return lines.join('\n');
}
