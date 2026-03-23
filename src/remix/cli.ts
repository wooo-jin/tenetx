/**
 * Tenetx — Remix CLI
 *
 * CLI handler for the `tenetx remix` command.
 * Supports: browse, inspect, pick, status, update, publish
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMPOUND_HOME } from '../core/paths.js';
import { hashContent } from './registry.js';
import type { ConflictResolution, RemixableComponent } from './types.js';

/**
 * `tenetx remix <subcommand>` CLI entry point.
 */
export async function handleRemix(args: string[]): Promise<void> {
  const sub = args[0];
  const cwd = process.cwd();

  switch (sub) {
    case 'browse': {
      await handleBrowse(args.slice(1));
      break;
    }

    case 'inspect': {
      await handleInspect(args.slice(1));
      break;
    }

    case 'pick': {
      await handlePick(args.slice(1), cwd);
      break;
    }

    case 'status': {
      await handleStatus(cwd);
      break;
    }

    case 'update': {
      await handleUpdate(cwd);
      break;
    }

    case 'publish': {
      await handlePublish(cwd);
      break;
    }

    default: {
      printRemixHelp();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleBrowse(args: string[]): Promise<void> {
  const { browseHarnesses, formatHarnessList } = await import('./browser.js');

  const query = args.join(' ').trim();
  const harnesses = browseHarnesses(query || undefined);

  if (query) {
    console.log(`\n  Remix registry — search: "${query}"\n`);
  } else {
    console.log('\n  Remix registry — all published harnesses\n');
  }

  console.log(formatHarnessList(harnesses));
}

async function handleInspect(args: string[]): Promise<void> {
  const { inspectHarness, formatComponentList } = await import('./browser.js');

  const harnessId = args[0];
  if (!harnessId) {
    console.error('  Usage: tenetx remix inspect <harness-id>');
    process.exit(1);
  }

  const result = inspectHarness(harnessId);
  if (!result) {
    console.error(`  Harness '${harnessId}' not found.`);
    console.error('  Run "tenetx remix browse" to see available harnesses.');
    process.exit(1);
  }

  console.log(`\n  ${result.harness.name} — ${result.harness.description}`);
  console.log(`  by ${result.harness.author} | source: ${result.harness.source}`);
  console.log(`  tags: ${result.harness.tags.join(', ')}\n`);
  console.log(formatComponentList(result.components));
}

async function handlePick(args: string[], cwd: string): Promise<void> {
  const { findHarness, getHarnessComponents } = await import('./registry.js');
  const { buildRemixPlan, selectComponents, formatRemixPlan } = await import('./cherry-pick.js');
  const { applyRemixPlan, formatRemixResult } = await import('./merger.js');

  const harnessId = args[0];
  if (!harnessId) {
    console.error('  Usage: tenetx remix pick <harness-id> [--component <name> ...]');
    process.exit(1);
  }

  const harness = findHarness(harnessId);
  if (!harness) {
    console.error(`  Harness '${harnessId}' not found.`);
    console.error('  Run "tenetx remix browse" to see available harnesses.');
    process.exit(1);
  }

  const allComponents = getHarnessComponents(harness);
  if (allComponents.length === 0) {
    console.error(`  Harness '${harnessId}' has no components available.`);
    process.exit(1);
  }

  // Parse --component flags
  const componentNames = parseComponentArgs(args.slice(1));

  // Select components
  const selected = selectComponents(allComponents, componentNames.length > 0 ? componentNames : undefined);
  if (selected.length === 0) {
    console.error('  No matching components found.');
    if (componentNames.length > 0) {
      console.error('  Available components:');
      for (const c of allComponents) {
        console.error(`    [${c.type}] ${c.name}`);
      }
    }
    process.exit(1);
  }

  // Build plan
  const plan = buildRemixPlan(harness, selected, cwd);

  console.log(`\n${formatRemixPlan(plan)}`);

  // Auto-resolve conflicts for non-interactive mode
  // In non-interactive mode (no TTY), default to 'skip' for conflicts
  const conflictResolutions = new Map<string, ConflictResolution>();

  if (plan.conflicts.length > 0) {
    // Parse --resolve flag
    const resolveIdx = args.indexOf('--resolve');
    const defaultResolution: ConflictResolution =
      resolveIdx !== -1 ? (args[resolveIdx + 1] as ConflictResolution) ?? 'skip' : 'skip';

    for (const conflict of plan.conflicts) {
      conflictResolutions.set(conflict.name, defaultResolution);
    }

    if (resolveIdx === -1) {
      console.log('  Conflicts detected. Use --resolve <keep-existing|use-incoming|merge|skip>');
      console.log('  Defaulting to "skip" for all conflicts.\n');
    } else {
      console.log(`  Resolving all conflicts with: ${defaultResolution}\n`);
    }
  }

  if (plan.additions.length === 0 && plan.conflicts.every((c) => conflictResolutions.get(c.name) === 'skip')) {
    console.log('  Nothing to apply.\n');
    return;
  }

  // Apply the plan
  const result = applyRemixPlan(plan, allComponents, conflictResolutions, cwd);
  console.log(`\n${formatRemixResult(result)}\n`);
}

async function handleStatus(cwd: string): Promise<void> {
  const { refreshProvenance, formatProvenanceStatus } = await import('./tracker.js');

  const provenance = refreshProvenance(cwd);
  console.log(`\n${formatProvenanceStatus(provenance)}`);
}

async function handleUpdate(cwd: string): Promise<void> {
  const { checkUpdates, formatUpdates } = await import('./tracker.js');

  console.log('\n  Checking for remix updates...\n');
  const updates = checkUpdates(cwd);
  console.log(formatUpdates(updates));
  console.log();
}

async function handlePublish(cwd: string): Promise<void> {
  // Generate a publishable harness JSON from the current project
  const components = discoverLocalComponents(cwd);

  if (components.length === 0) {
    console.log('\n  No publishable components found in the current project.');
    console.log('  Add agents, skills, rules, or principles first.\n');
    return;
  }

  const harness = {
    id: path.basename(cwd),
    name: `@${path.basename(cwd)}`,
    author: 'local',
    description: 'Published from local project',
    source: cwd,
    tags: [],
    components,
  };

  const outputPath = path.join(cwd, 'harness.json');
  fs.writeFileSync(outputPath, JSON.stringify(harness, null, 2));

  console.log(`\n  Harness published: ${outputPath}`);
  console.log(`  Components: ${components.length}`);
  for (const c of components) {
    console.log(`    [${c.type}] ${c.name} — ${c.description}`);
  }
  console.log('\n  Share this file or host it on GitHub for others to remix.\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse --component <name> flags from args */
function parseComponentArgs(args: string[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--component' && args[i + 1]) {
      names.push(args[i + 1]);
      i++; // skip the value
    }
  }
  return names;
}

/** Discover publishable components from the current project */
function discoverLocalComponents(cwd: string): RemixableComponent[] {
  const components: RemixableComponent[] = [];

  // Agents
  const agentsDir = path.join(cwd, '.claude', 'agents');
  discoverMdComponents(agentsDir, 'agent', components);

  // Skills
  const meSkillsDir = path.join(COMPOUND_HOME, 'me', 'skills');
  discoverMdComponents(meSkillsDir, 'skill', components);

  // Rules (personal)
  const meRulesDir = path.join(COMPOUND_HOME, 'me', 'rules');
  discoverMdComponents(meRulesDir, 'rule', components);

  // Rules (project)
  const projectRulesDir = path.join(cwd, '.claude', 'rules');
  discoverMdComponents(projectRulesDir, 'rule', components, 'ch-');

  // Principles from philosophy
  const philPath = path.join(COMPOUND_HOME, 'me', 'philosophy.json');
  if (fs.existsSync(philPath)) {
    try {
      const phil = JSON.parse(fs.readFileSync(philPath, 'utf-8'));
      if (phil.principles) {
        for (const [name, principle] of Object.entries(phil.principles)) {
          const content = JSON.stringify(principle);
          components.push({
            type: 'principle',
            name,
            description: (principle as { belief?: string }).belief ?? name,
            contentHash: hashContent(content),
            content,
          });
        }
      }
    } catch {
      // Skip invalid philosophy file
    }
  }

  return components;
}

/** Discover .md files in a directory and add as components */
function discoverMdComponents(
  dir: string,
  type: 'agent' | 'skill' | 'rule',
  components: RemixableComponent[],
  skipPrefix?: string,
): void {
  if (!fs.existsSync(dir)) return;

  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      // Skip tenetx-managed files (ch-* prefix agents, etc.)
      if (skipPrefix && !file.startsWith(skipPrefix)) continue;
      if (!skipPrefix && file.startsWith('ch-')) continue;
      if (file.startsWith('pack-')) continue;

      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      // Skip tenetx-managed content
      if (content.includes('<!-- tenetx-managed -->')) continue;

      const name = file.replace(/\.md$/, '');
      const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? name;
      components.push({
        type,
        name,
        description: firstLine.replace(/^#+\s*/, '').slice(0, 80),
        contentHash: hashContent(content),
        content,
      });
    }
  } catch {
    // Directory read error, skip
  }
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printRemixHelp(): void {
  console.log(`
  Tenetx Remix — Harness Composition System

  Usage:
    tenetx remix browse [query]             Browse/search published harnesses
    tenetx remix inspect <harness-id>       Show harness details (component list)
    tenetx remix pick <harness-id>          Select all components + resolve conflicts
    tenetx remix pick <id> --component <n>  Select specific component(s)
    tenetx remix pick <id> --resolve <r>    Auto-resolve conflicts (keep-existing|use-incoming|merge|skip)
    tenetx remix status                     Show remixed components + modification status
    tenetx remix update                     Check for updates from remix sources
    tenetx remix publish                    Publish current harness as shareable JSON
`);
}
