/**
 * Tenetx — Remix Merger
 *
 * Applies remix plan: writes components to disk, handles conflict resolution,
 * and records provenance.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_PHILOSOPHY } from '../core/paths.js';
import { loadPhilosophy } from '../core/philosophy-loader.js';
import type { Philosophy, Principle } from '../core/types.js';
import { hashContent } from './registry.js';
import { getLocalComponentPath } from './cherry-pick.js';
import { recordProvenance } from './tracker.js';
import type {
  ComponentType,
  RemixableComponent,
  RemixConflict,
  RemixPlan,
  ConflictResolution,
} from './types.js';

// ---------------------------------------------------------------------------
// Component writers
// ---------------------------------------------------------------------------

/** Write a .md file component (agent, skill, rule) */
function writeMdComponent(type: ComponentType, name: string, content: string, cwd: string): void {
  const filePath = getLocalComponentPath(type, name, cwd);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/** Write a hook .ts file */
function writeHookComponent(name: string, content: string, cwd: string): void {
  const filePath = getLocalComponentPath('hook', name, cwd);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

/** Merge a principle into the local philosophy */
function mergePrinciple(name: string, content: string): void {
  fs.mkdirSync(path.dirname(ME_PHILOSOPHY), { recursive: true });

  let philosophy: Philosophy;
  if (fs.existsSync(ME_PHILOSOPHY)) {
    philosophy = loadPhilosophy(ME_PHILOSOPHY);
  } else {
    philosophy = {
      name: 'personal',
      version: '1.0.0',
      author: 'me',
      principles: {},
    };
  }

  try {
    const principle = JSON.parse(content) as Principle;
    philosophy.principles[name] = principle;
  } catch {
    // If the content is plain text, wrap it as a principle
    philosophy.principles[name] = {
      belief: content,
      generates: [],
    };
  }

  const tmpPath = `${ME_PHILOSOPHY}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(philosophy, null, 2));
  fs.renameSync(tmpPath, ME_PHILOSOPHY);
}

/** Merge routing configuration into the local philosophy */
function mergeRouting(name: string, content: string): void {
  fs.mkdirSync(path.dirname(ME_PHILOSOPHY), { recursive: true });

  let philosophy: Philosophy;
  if (fs.existsSync(ME_PHILOSOPHY)) {
    philosophy = loadPhilosophy(ME_PHILOSOPHY);
  } else {
    philosophy = {
      name: 'personal',
      version: '1.0.0',
      author: 'me',
      principles: {},
    };
  }

  try {
    const routingConfig = JSON.parse(content) as Record<string, string[]>;
    // Store routing as a principle with routing generates
    const generates: Array<string | { routing?: string }> = [];
    for (const [model, tasks] of Object.entries(routingConfig)) {
      generates.push({ routing: `${tasks.join(', ')} -> ${model}` });
    }
    philosophy.principles[`routing-${name}`] = {
      belief: `Model routing configuration from remix: ${name}`,
      generates,
    };
  } catch {
    // Store as plain text routing principle
    philosophy.principles[`routing-${name}`] = {
      belief: content,
      generates: [],
    };
  }

  const tmpPath = `${ME_PHILOSOPHY}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(philosophy, null, 2));
  fs.renameSync(tmpPath, ME_PHILOSOPHY);
}

// ---------------------------------------------------------------------------
// Component writer dispatch
// ---------------------------------------------------------------------------

/** Write a single component to disk based on its type */
function writeComponent(component: RemixableComponent, cwd: string): void {
  const content = component.content ?? '';

  switch (component.type) {
    case 'agent':
    case 'skill':
    case 'rule':
      writeMdComponent(component.type, component.name, content, cwd);
      break;
    case 'hook':
      writeHookComponent(component.name, content, cwd);
      break;
    case 'principle':
      mergePrinciple(component.name, content);
      break;
    case 'routing':
      mergeRouting(component.name, content);
      break;
  }
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a conflict by applying the chosen resolution strategy.
 */
function resolveConflict(
  conflict: RemixConflict,
  resolution: ConflictResolution,
  incomingComponent: RemixableComponent,
  cwd: string,
): boolean {
  switch (resolution) {
    case 'keep-existing':
      // Do nothing, keep local version
      return false;

    case 'use-incoming':
      // Overwrite with incoming
      writeComponent(incomingComponent, cwd);
      return true;

    case 'merge': {
      // For .md files: concatenate with separator
      // For config (principle/routing): deep merge via philosophy merger
      if (conflict.type === 'principle' || conflict.type === 'routing') {
        writeComponent(incomingComponent, cwd);
        return true;
      }

      // For .md files: append incoming content below existing with separator
      const localPath = getLocalComponentPath(conflict.type, conflict.name, cwd);
      if (fs.existsSync(localPath)) {
        const localContent = fs.readFileSync(localPath, 'utf-8');
        const incomingContent = incomingComponent.content ?? '';
        const merged = `${localContent}\n\n---\n<!-- Remixed from ${incomingComponent.description ?? 'external source'} -->\n\n${incomingContent}`;
        fs.writeFileSync(localPath, merged);
        return true;
      }

      // Local file missing, just write
      writeComponent(incomingComponent, cwd);
      return true;
    }

    case 'skip':
      return false;

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Plan execution
// ---------------------------------------------------------------------------

/** Result of applying a remix plan */
export interface RemixResult {
  added: number;
  skipped: number;
  conflictsResolved: number;
  conflictsSkipped: number;
  errors: string[];
}

/**
 * Apply a remix plan with resolved conflicts.
 *
 * @param plan - The remix plan to apply
 * @param allComponents - Full component list (needed to look up content for conflicts)
 * @param conflictResolutions - Map of conflict name to resolution
 * @param cwd - Project working directory
 */
export function applyRemixPlan(
  plan: RemixPlan,
  allComponents: RemixableComponent[],
  conflictResolutions: Map<string, ConflictResolution>,
  cwd: string,
): RemixResult {
  const result: RemixResult = {
    added: 0,
    skipped: plan.skipped.length,
    conflictsResolved: 0,
    conflictsSkipped: 0,
    errors: [],
  };

  // 1. Apply additions
  for (const component of plan.additions) {
    try {
      writeComponent(component, cwd);
      recordProvenance(
        component.type,
        component.name,
        plan.sourceHarnessName,
        '0.0.0',
        component.contentHash,
      );
      result.added++;
    } catch (e) {
      result.errors.push(
        `Failed to add [${component.type}] ${component.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 2. Apply conflict resolutions
  for (const conflict of plan.conflicts) {
    const resolution = conflictResolutions.get(conflict.name) ?? 'skip';
    const incoming = allComponents.find(
      (c) => c.name === conflict.name && c.type === conflict.type,
    );

    if (!incoming) {
      result.errors.push(`Component [${conflict.type}] ${conflict.name} not found in source`);
      result.conflictsSkipped++;
      continue;
    }

    try {
      const applied = resolveConflict(conflict, resolution, incoming, cwd);
      if (applied) {
        const currentHash = hashContent(incoming.content ?? '');
        recordProvenance(
          conflict.type,
          conflict.name,
          plan.sourceHarnessName,
          '0.0.0',
          currentHash,
        );
        result.conflictsResolved++;
      } else {
        result.conflictsSkipped++;
      }
    } catch (e) {
      result.errors.push(
        `Failed to resolve [${conflict.type}] ${conflict.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
      result.conflictsSkipped++;
    }
  }

  return result;
}

/**
 * Format remix result for CLI display.
 */
export function formatRemixResult(result: RemixResult): string {
  const lines: string[] = [];
  lines.push('  Remix complete');
  lines.push('');
  lines.push(`    Added:             ${result.added}`);
  lines.push(`    Skipped (same):    ${result.skipped}`);
  lines.push(`    Conflicts resolved: ${result.conflictsResolved}`);
  lines.push(`    Conflicts skipped: ${result.conflictsSkipped}`);

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('  Errors:');
    for (const err of result.errors) {
      lines.push(`    ! ${err}`);
    }
  }

  return lines.join('\n');
}
