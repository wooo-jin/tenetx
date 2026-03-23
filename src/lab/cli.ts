/**
 * Tenetx Lab — CLI Handler
 *
 * Provides the `tenetx lab` command interface for the adaptive optimization engine.
 */

import { computeAllMetrics, getAverageEffectiveness } from './scorer.js';
import { generateSuggestions, getPendingSuggestions,
  applySuggestion, dismissSuggestion } from './advisor.js';
import { createSnapshot, getHistory, compareSnapshots } from './history.js';
import { createExperiment, getExperimentStatus, getAllExperiments,
  completeExperiment, cancelExperiment } from './experiment.js';
import { countEvents, resetAll } from './store.js';
import type { ComponentMetrics, ExperimentMetric } from './types.js';
import {
  runEvolveCycle, loadEvolutionHistory, loadStoredPatterns,
} from './auto-learn.js';

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function trendIcon(trend: string): string {
  switch (trend) {
    case 'increasing': return '^';
    case 'decreasing': return 'v';
    case 'stable': return '=';
    case 'unused': return '-';
    default: return '?';
  }
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return '#'.repeat(filled) + '.'.repeat(empty);
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

export async function handleLab(args: string[]): Promise<void> {
  const subcommand = args[0] ?? 'dashboard';

  switch (subcommand) {
    case 'dashboard':
    case '':
      showDashboard();
      break;
    case 'metrics':
      showMetrics();
      break;
    case 'suggest':
      handleSuggest(args.slice(1));
      break;
    case 'history':
      showHistory();
      break;
    case 'snapshot':
      handleSnapshot();
      break;
    case 'experiment':
      handleExperiment(args.slice(1));
      break;
    case 'reset':
      handleReset();
      break;
    case 'cost':
      await handleCost(args.slice(1));
      break;
    case 'evolve':
      await handleEvolve(args.slice(1));
      break;
    case 'patterns':
      showPatterns();
      break;
    case 'evolution-history':
      showEvolutionHistory();
      break;
    case '--help':
    case '-h':
      printLabHelp();
      break;
    default:
      console.log(`  Unknown lab subcommand: ${subcommand}`);
      console.log('  Run "tenetx lab --help" for usage.\n');
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function showDashboard(): void {
  console.log('\n  Tenetx Lab — Component Effectiveness Dashboard\n');

  const totalEvents = countEvents();
  const avgEffectiveness = getAverageEffectiveness();
  const metrics = computeAllMetrics();
  const pending = getPendingSuggestions();

  console.log(`  Total events: ${totalEvents}`);
  console.log(`  Avg effectiveness: ${avgEffectiveness}%`);
  console.log(`  Pending suggestions: ${pending.length}`);

  if (metrics.length === 0) {
    console.log('\n  No component data yet. Use tenetx to generate events.\n');
    return;
  }

  console.log(`\n  ${'Component'.padEnd(24)} ${'Kind'.padEnd(8)} ${'Score'.padEnd(6)} ${'Trend'.padEnd(6)} ${'Uses'.padEnd(6)} Success`);
  console.log(`  ${'-'.repeat(24)} ${'-'.repeat(8)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(6)} -------`);

  for (const m of metrics.slice(0, 20)) {
    const name = padRight(m.name.slice(0, 23), 24);
    const kind = padRight(m.kind, 8);
    const score = padLeft(String(m.effectivenessScore), 4) + '%';
    const trend = padRight(trendIcon(m.trend), 6);
    const uses = padLeft(String(m.invocationCount), 5);
    const success = `${Math.round(m.successRate * 100)}%`;
    console.log(`  ${name} ${kind} ${score} ${trend} ${uses}  ${success}`);
  }

  if (metrics.length > 20) {
    console.log(`\n  ... and ${metrics.length - 20} more (use "tenetx lab metrics" for full list)`);
  }

  if (pending.length > 0) {
    console.log(`\n  Top suggestions:`);
    for (const s of pending.slice(0, 3)) {
      console.log(`    [${s.id}] ${s.title} (${Math.round(s.confidence * 100)}% confidence)`);
    }
    console.log('  Run "tenetx lab suggest" for details.');
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function showMetrics(): void {
  console.log('\n  Tenetx Lab — Detailed Component Metrics\n');

  const metrics = computeAllMetrics();

  if (metrics.length === 0) {
    console.log('  No metrics data available yet.\n');
    return;
  }

  // Group by kind
  const byKind = new Map<string, ComponentMetrics[]>();
  for (const m of metrics) {
    const group = byKind.get(m.kind) ?? [];
    group.push(m);
    byKind.set(m.kind, group);
  }

  for (const [kind, components] of byKind) {
    console.log(`  === ${kind.toUpperCase()}S ===\n`);

    for (const m of components) {
      console.log(`  ${m.name}`);
      console.log(`    Effectiveness: [${scoreBar(m.effectivenessScore)}] ${m.effectivenessScore}%`);
      console.log(`    Invocations:   ${m.invocationCount}`);
      console.log(`    Success rate:  ${Math.round(m.successRate * 100)}%`);
      console.log(`    Acceptance:    ${Math.round(m.acceptanceRate * 100)}%`);
      console.log(`    Avg duration:  ${m.avgDurationMs}ms`);
      console.log(`    Trend:         ${m.trend} ${trendIcon(m.trend)}`);
      console.log(`    Last used:     ${m.lastUsed ?? 'never'}`);
      console.log();
    }
  }
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

function handleSuggest(args: string[]): void {
  const applyIdx = args.indexOf('--apply');
  const dismissIdx = args.indexOf('--dismiss');

  if (applyIdx !== -1) {
    const id = args[applyIdx + 1];
    if (!id) {
      console.log('  Usage: tenetx lab suggest --apply <id>\n');
      return;
    }
    const result = applySuggestion(id);
    if (result) {
      console.log(`\n  Applied suggestion [${result.id}]: ${result.title}`);
      console.log(`  Note: Manual configuration changes may still be needed.\n`);
    } else {
      console.log(`\n  Suggestion "${id}" not found in pending list.\n`);
    }
    return;
  }

  if (dismissIdx !== -1) {
    const id = args[dismissIdx + 1];
    if (!id) {
      console.log('  Usage: tenetx lab suggest --dismiss <id>\n');
      return;
    }
    const result = dismissSuggestion(id);
    if (result) {
      console.log(`\n  Dismissed suggestion [${result.id}]: ${result.title}\n`);
    } else {
      console.log(`\n  Suggestion "${id}" not found in pending list.\n`);
    }
    return;
  }

  // Generate new + show all pending
  const newSuggestions = generateSuggestions();
  const pending = getPendingSuggestions();

  console.log('\n  Tenetx Lab — Data-Driven Suggestions\n');

  if (newSuggestions.length > 0) {
    console.log(`  ${newSuggestions.length} new suggestion(s) generated.\n`);
  }

  if (pending.length === 0) {
    console.log('  No pending suggestions. Your harness looks well-tuned!\n');
    return;
  }

  for (const s of pending) {
    console.log(`  [${s.id}] ${s.title}`);
    console.log(`    Type:       ${s.type}`);
    console.log(`    Component:  ${s.component} (${s.componentKind})`);
    console.log(`    Confidence: ${Math.round(s.confidence * 100)}%`);
    console.log(`    Impact:     ${s.impact}`);
    console.log(`    ${s.description}`);
    console.log();
  }

  console.log('  Actions:');
  console.log('    tenetx lab suggest --apply <id>    Apply a suggestion');
  console.log('    tenetx lab suggest --dismiss <id>  Dismiss a suggestion\n');
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function showHistory(): void {
  console.log('\n  Tenetx Lab — Harness Evolution History\n');

  const snapshots = getHistory();

  if (snapshots.length === 0) {
    console.log('  No snapshots yet. Run "tenetx lab snapshot" to create one.\n');
    return;
  }

  for (let i = 0; i < snapshots.length && i < 10; i++) {
    const snap = snapshots[i];
    console.log(`  [${snap.id}] ${snap.timestamp} (${snap.trigger})`);
    console.log(`    Philosophy: ${snap.philosophy.name} v${snap.philosophy.version}`);
    console.log(`    Routing:    ${snap.routingPreset}`);
    console.log(`    Agents:     ${snap.agents.length}`);
    console.log(`    Packs:      ${snap.packs.length > 0 ? snap.packs.join(', ') : 'none'}`);
    console.log(`    Effectiveness: ${snap.metricsSummary.avgEffectiveness}%`);

    // Compare with next (older) snapshot
    if (i < snapshots.length - 1) {
      const older = snapshots[i + 1];
      const diffs = compareSnapshots(older, snap);
      if (diffs.length > 0 && diffs[0] !== 'No significant changes detected') {
        console.log(`    Changes:`);
        for (const d of diffs) {
          console.log(`      - ${d}`);
        }
      }
    }
    console.log();
  }

  if (snapshots.length > 10) {
    console.log(`  ... and ${snapshots.length - 10} older snapshots\n`);
  }
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

function handleSnapshot(): void {
  const snapshot = createSnapshot('manual');
  console.log(`\n  Snapshot created: ${snapshot.id}`);
  console.log(`  Timestamp: ${snapshot.timestamp}`);
  console.log(`  Philosophy: ${snapshot.philosophy.name} v${snapshot.philosophy.version}`);
  console.log(`  Agents: ${snapshot.agents.length}`);
  console.log(`  Packs: ${snapshot.packs.length > 0 ? snapshot.packs.join(', ') : 'none'}`);
  console.log(`  Effectiveness: ${snapshot.metricsSummary.avgEffectiveness}%\n`);
}

// ---------------------------------------------------------------------------
// Experiment
// ---------------------------------------------------------------------------

function handleExperiment(args: string[]): void {
  const action = args[0] ?? 'status';

  switch (action) {
    case 'create': {
      const name = args[1];
      if (!name) {
        console.log('  Usage: tenetx lab experiment create <name> --metric <cost|duration|success-rate|effectiveness>\n');
        return;
      }
      const metricIdx = args.indexOf('--metric');
      const metric = (metricIdx !== -1 ? args[metricIdx + 1] : 'cost') as ExperimentMetric;
      const validMetrics = ['cost', 'duration', 'success-rate', 'effectiveness'];
      if (!validMetrics.includes(metric)) {
        console.log(`  Invalid metric: ${metric}. Must be one of: ${validMetrics.join(', ')}\n`);
        return;
      }

      const experiment = createExperiment(name, metric);
      console.log(`\n  Experiment created: ${experiment.id}`);
      console.log(`  Name: ${experiment.name}`);
      console.log(`  Metric: ${experiment.metric}`);
      console.log(`  Status: ${experiment.status}\n`);
      break;
    }

    case 'complete': {
      const id = args[1];
      if (!id) {
        console.log('  Usage: tenetx lab experiment complete <id>\n');
        return;
      }
      const result = completeExperiment(id);
      if (result) {
        console.log(`\n  Experiment completed: ${result.id}`);
        console.log(`  Conclusion: ${result.conclusion}\n`);
      } else {
        console.log(`\n  Experiment "${id}" not found or not running.\n`);
      }
      break;
    }

    case 'cancel': {
      const id = args[1];
      if (!id) {
        console.log('  Usage: tenetx lab experiment cancel <id>\n');
        return;
      }
      const success = cancelExperiment(id);
      console.log(success
        ? `\n  Experiment "${id}" cancelled.\n`
        : `\n  Experiment "${id}" not found or not running.\n`);
      break;
    }

    case 'status':
    default: {
      const experiments = getAllExperiments();
      console.log('\n  Tenetx Lab — Experiments\n');

      if (experiments.length === 0) {
        console.log('  No experiments yet.');
        console.log('  Create one: tenetx lab experiment create <name> --metric cost\n');
        return;
      }

      for (const exp of experiments) {
        const report = getExperimentStatus(exp.id);
        console.log(`  [${exp.id}] ${exp.name} (${exp.status})`);
        console.log(`    Metric: ${exp.metric}`);
        console.log(`    Started: ${exp.startedAt}`);
        if (exp.endedAt) console.log(`    Ended: ${exp.endedAt}`);

        if (report) {
          for (const v of report.variantSummaries) {
            console.log(`    ${v.name}: n=${v.sampleSize}, mean=${v.mean.toFixed(2)}, median=${v.median.toFixed(2)}`);
          }
          if (report.winner) {
            const sig = report.significant ? ' (significant)' : ' (not significant)';
            console.log(`    Winner: ${report.winner}${sig}`);
          }
        }

        if (exp.conclusion) console.log(`    Conclusion: ${exp.conclusion}`);
        console.log();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function handleReset(): void {
  resetAll();
  console.log('\n  Lab data has been reset.');
  console.log('  Events, suggestions, and cost data cleared.\n');
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

async function handleCost(args: string[]): Promise<void> {
  // Delegate to the dedicated cost-tracker for richer output
  const { printCostSummary } = await import('./cost-tracker.js');
  printCostSummary(args);
}

// ---------------------------------------------------------------------------
// Evolve (Auto-Learning)
// ---------------------------------------------------------------------------

async function handleEvolve(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run');

  console.log('\n  Tenetx Lab — Auto-Learning Cycle\n');

  if (dryRun) {
    console.log('  Mode: dry-run (no changes will be applied)\n');
  }

  const result = await runEvolveCycle(dryRun);

  console.log(`  Events analyzed: ${result.totalEventsAnalyzed}`);
  console.log(`  Patterns detected: ${result.patterns.length}`);
  console.log(`  Adjustments proposed: ${result.adjustments.length}`);

  if (result.reason) {
    console.log(`\n  Result: ${result.reason}\n`);
    return;
  }

  if (result.patterns.length > 0) {
    console.log('\n  Detected patterns:');
    for (const p of result.patterns) {
      console.log(`    [${p.type}] ${p.description} (${Math.round(p.confidence * 100)}% confidence, ${p.eventCount} events)`);
    }
  }

  if (result.adjustments.length > 0) {
    console.log('\n  Dimension adjustments:');
    for (const adj of result.adjustments) {
      const sign = adj.delta > 0 ? '+' : '';
      console.log(`    ${adj.dimension}: ${sign}${adj.delta.toFixed(4)} (${Math.round(adj.confidence * 100)}% confidence)`);
      console.log(`      Evidence: ${adj.evidence}`);
    }
  }

  if (result.previousVector && result.newVector) {
    console.log('\n  Dimension vector changes:');
    for (const key of Object.keys(result.previousVector)) {
      const prev = result.previousVector[key] ?? 0.5;
      const next = result.newVector[key] ?? 0.5;
      const diff = next - prev;
      if (Math.abs(diff) > 0.001) {
        const sign = diff > 0 ? '+' : '';
        console.log(`    ${padRight(key, 22)} ${prev.toFixed(3)} -> ${next.toFixed(3)} (${sign}${diff.toFixed(4)})`);
      }
    }
  }

  if (result.changed && !dryRun) {
    console.log('\n  Profile updated and harness config regenerated.');
  } else if (result.changed && dryRun) {
    console.log('\n  Changes would be applied. Run without --dry-run to apply.');
  } else {
    console.log('\n  No changes needed — current profile matches usage patterns.');
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

function showPatterns(): void {
  console.log('\n  Tenetx Lab — Detected Behavioral Patterns\n');

  const patterns = loadStoredPatterns();

  if (patterns.length === 0) {
    console.log('  No patterns detected yet.');
    console.log('  Run "tenetx lab evolve --dry-run" to detect patterns.\n');
    return;
  }

  for (const p of patterns) {
    console.log(`  [${p.id}] ${p.description}`);
    console.log(`    Type:       ${p.type}`);
    console.log(`    Confidence: ${Math.round(p.confidence * 100)}%`);
    console.log(`    Events:     ${p.eventCount}`);
    console.log(`    First seen: ${p.firstSeen}`);
    console.log(`    Last seen:  ${p.lastSeen}`);
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Evolution History
// ---------------------------------------------------------------------------

function showEvolutionHistory(): void {
  console.log('\n  Tenetx Lab — Auto-Evolution History\n');

  const history = loadEvolutionHistory();

  if (history.length === 0) {
    console.log('  No auto-evolution records yet.');
    console.log('  Run "tenetx lab evolve" to trigger an auto-learning cycle.\n');
    return;
  }

  // Show newest first, limit to 10
  const records = [...history].reverse().slice(0, 10);

  for (const record of records) {
    console.log(`  ${record.timestamp}`);
    console.log(`    Events analyzed:  ${record.totalEventsAnalyzed}`);
    console.log(`    Window:           ${record.eventWindowDays} days`);
    console.log(`    Adjustments:      ${record.adjustments.length}`);

    for (const adj of record.adjustments) {
      const sign = adj.delta > 0 ? '+' : '';
      console.log(`      ${adj.dimension}: ${sign}${adj.delta.toFixed(4)} — ${adj.evidence}`);
    }

    // Show dimension changes
    const changedDims = Object.keys(record.previousVector).filter(
      k => Math.abs((record.previousVector[k] ?? 0) - (record.newVector[k] ?? 0)) > 0.001,
    );
    if (changedDims.length > 0) {
      console.log('    Resulting changes:');
      for (const dim of changedDims) {
        const prev = record.previousVector[dim]?.toFixed(3) ?? '0.500';
        const next = record.newVector[dim]?.toFixed(3) ?? '0.500';
        console.log(`      ${dim}: ${prev} -> ${next}`);
      }
    }
    console.log();
  }

  if (history.length > 10) {
    console.log(`  ... and ${history.length - 10} older records\n`);
  }
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printLabHelp(): void {
  console.log(`
  Tenetx Lab — Adaptive Optimization Engine

  Usage:
    tenetx lab                        Dashboard: component effectiveness summary
    tenetx lab metrics                Detailed metrics output
    tenetx lab suggest                Show data-driven suggestions
    tenetx lab suggest --apply <id>   Apply a suggestion
    tenetx lab suggest --dismiss <id> Dismiss a suggestion
    tenetx lab history                Harness evolution history
    tenetx lab snapshot               Create manual snapshot
    tenetx lab experiment create <name> --metric <metric>
                                      Create A/B experiment
    tenetx lab experiment status      Show experiment status
    tenetx lab experiment complete <id>
                                      Complete an experiment
    tenetx lab experiment cancel <id> Cancel an experiment
    tenetx lab cost                   Session cost summary
    tenetx lab evolve                 Trigger auto-learning cycle
    tenetx lab evolve --dry-run       Show what would change without applying
    tenetx lab patterns               Show detected behavioral patterns
    tenetx lab evolution-history      Show all auto-adjustment records
    tenetx lab reset                  Reset all lab data

  Metrics: cost, duration, success-rate, effectiveness
`);
}
