/**
 * Tenetx — Remix Cherry-Pick
 *
 * Component-level selection from published harnesses.
 * Detects conflicts and builds a remix plan.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMPOUND_HOME, ME_RULES } from '../core/paths.js';
import { hashContent } from './registry.js';
import type {
  ComponentType,
  RemixableComponent,
  RemixConflict,
  RemixPlan,
  PublishedHarness,
} from './types.js';

// ---------------------------------------------------------------------------
// Local component discovery
// ---------------------------------------------------------------------------

/** Get the local file path for a component type and name */
export function getLocalComponentPath(type: ComponentType, name: string, cwd: string): string {
  switch (type) {
    case 'agent':
      return path.join(cwd, '.claude', 'agents', `${name}.md`);
    case 'skill':
      return path.join(COMPOUND_HOME, 'me', 'skills', `${name}.md`);
    case 'hook':
      return path.join(cwd, '.claude', 'hooks', `${name}.ts`);
    case 'rule':
      return path.join(ME_RULES, `${name}.md`);
    case 'principle':
      return path.join(COMPOUND_HOME, 'me', 'philosophy.json');
    case 'routing':
      return path.join(COMPOUND_HOME, 'me', 'philosophy.json');
    default:
      return path.join(COMPOUND_HOME, 'me', `${name}`);
  }
}

/** Check if a component already exists locally and return its hash */
function getLocalHash(type: ComponentType, name: string, cwd: string): string | null {
  if (type === 'principle' || type === 'routing') {
    // Principles and routing are stored in philosophy.json
    const philPath = path.join(COMPOUND_HOME, 'me', 'philosophy.json');
    if (!fs.existsSync(philPath)) return null;
    try {
      const phil = JSON.parse(fs.readFileSync(philPath, 'utf-8'));
      if (type === 'principle') {
        const principle = phil.principles?.[name];
        if (!principle) return null;
        return hashContent(JSON.stringify(principle));
      }
      // routing: check modelRouting or routing-related principles
      const routing = phil.modelRouting ?? phil.routing;
      if (!routing) return null;
      return hashContent(JSON.stringify(routing));
    } catch {
      return null;
    }
  }

  const localPath = getLocalComponentPath(type, name, cwd);
  if (!fs.existsSync(localPath)) return null;
  try {
    const content = fs.readFileSync(localPath, 'utf-8');
    return hashContent(content);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Detect conflicts between incoming components and local state.
 *
 * Rules:
 * 1. Same name + same hash -> auto-skip (already have it)
 * 2. Same name + different hash -> CONFLICT
 * 3. New name -> add directly
 */
function detectConflict(
  component: RemixableComponent,
  cwd: string,
): 'add' | 'skip' | RemixConflict {
  const localHash = getLocalHash(component.type, component.name, cwd);

  if (localHash === null) {
    // New component, add directly
    return 'add';
  }

  if (localHash === component.contentHash) {
    // Identical content, skip
    return 'skip';
  }

  // Conflict: same name, different content
  return {
    type: component.type,
    name: component.name,
    localHash,
    incomingHash: component.contentHash,
  };
}

/**
 * Build a remix plan from selected components.
 *
 * Categorizes each component as addition, skip, or conflict.
 */
export function buildRemixPlan(
  harness: PublishedHarness,
  selectedComponents: RemixableComponent[],
  cwd: string,
): RemixPlan {
  const plan: RemixPlan = {
    sourceHarnessId: harness.id,
    sourceHarnessName: harness.name,
    additions: [],
    skipped: [],
    conflicts: [],
  };

  for (const component of selectedComponents) {
    const result = detectConflict(component, cwd);
    if (result === 'add') {
      plan.additions.push(component);
    } else if (result === 'skip') {
      plan.skipped.push(component);
    } else {
      plan.conflicts.push(result);
    }
  }

  return plan;
}

/**
 * Select components by name from a harness component list.
 * If no names specified, returns all components.
 */
export function selectComponents(
  allComponents: RemixableComponent[],
  names?: string[],
): RemixableComponent[] {
  if (!names || names.length === 0) return allComponents;

  const selected: RemixableComponent[] = [];
  for (const name of names) {
    const found = allComponents.find(
      (c) => c.name === name || `${c.type}:${c.name}` === name,
    );
    if (found) {
      selected.push(found);
    }
  }
  return selected;
}

/**
 * Format a remix plan for CLI display.
 */
export function formatRemixPlan(plan: RemixPlan): string {
  const lines: string[] = [];
  lines.push(`  Remix plan from ${plan.sourceHarnessName}`);
  lines.push('');

  if (plan.additions.length > 0) {
    lines.push(`  Add (${plan.additions.length}):`);
    for (const c of plan.additions) {
      lines.push(`    + [${c.type}] ${c.name} — ${c.description}`);
    }
    lines.push('');
  }

  if (plan.skipped.length > 0) {
    lines.push(`  Skip (${plan.skipped.length}, already identical):`);
    for (const c of plan.skipped) {
      lines.push(`    = [${c.type}] ${c.name}`);
    }
    lines.push('');
  }

  if (plan.conflicts.length > 0) {
    lines.push(`  Conflict (${plan.conflicts.length}):`);
    for (const c of plan.conflicts) {
      lines.push(`    ! [${c.type}] ${c.name} — local: ${c.localHash} vs incoming: ${c.incomingHash}`);
    }
    lines.push('');
  }

  if (plan.additions.length === 0 && plan.conflicts.length === 0) {
    lines.push('  Nothing to remix (all components are identical or skipped).');
  }

  return lines.join('\n');
}
