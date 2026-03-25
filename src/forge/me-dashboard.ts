/**
 * Tenetx Forge — Me Dashboard
 *
 * tenetx me: 사용자 프로필, 진화 히스토리, 패턴, 에이전트 튜닝, 세션 비용을 한 화면에 표시.
 */

import { loadForgeProfile } from './profile.js';
import { DIMENSION_META, dimensionLabel } from './dimensions.js';
import { generateAgentOverlays } from './agent-tuner.js';
import { loadEvolutionHistory, loadStoredPatterns } from '../lab/auto-learn.js';
import { getAllSessionCosts } from '../lab/cost-tracker.js';
import type { DimensionVector } from './types.js';
import type { EvolutionRecord, BehavioralPattern } from '../lab/types.js';

// ── ASCII Bar ─────────────────────────────────────────

/** 0.0~1.0 값을 10칸 ASCII 바로 렌더: # 채움, · 빔 */
function renderBar(value: number): string {
  const width = 10;
  const filled = Math.round(Math.max(0, Math.min(1, value)) * width);
  return `[${'#'.repeat(filled)}${'·'.repeat(width - filled)}]`;
}

// ── Time Formatting ───────────────────────────────────

function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Token Formatting ─────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatUsd(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

// ── Sections ─────────────────────────────────────────

function renderProfile(dims: DimensionVector): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  ╔══════════════════════════════════════╗');
  lines.push('  ║          My Forge Profile            ║');
  lines.push('  ╚══════════════════════════════════════╝');
  lines.push('');

  for (const meta of DIMENSION_META) {
    const val = dims[meta.key] ?? 0.5;
    const bar = renderBar(val);
    const label = dimensionLabel(meta.key, val);
    const namePad = meta.label.padEnd(22);
    lines.push(`  ${namePad} ${bar} ${val.toFixed(2)}  ${label}`);
  }

  return lines.join('\n');
}

function renderEvolution(history: EvolutionRecord[]): string {
  if (history.length === 0) {
    return '\n  ── Recent Evolution ──────────────────\n  No evolution history yet — run `tenetx lab evolve` to start.\n';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('  ── Recent Evolution ──────────────────');

  // 최근 5개 레코드의 조정사항 표시
  const recent = history.slice(-5).reverse();
  for (const record of recent) {
    const ago = timeAgo(record.timestamp);
    for (const adj of record.adjustments) {
      const oldVal = record.previousVector[adj.dimension] ?? 0.5;
      const newVal = record.newVector[adj.dimension] ?? 0.5;
      const diff = newVal - oldVal;
      const diffStr = diff >= 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3);
      lines.push(`  ${ago.padEnd(8)} ${adj.dimension.padEnd(22)} ${oldVal.toFixed(2)} → ${newVal.toFixed(2)}  (${diffStr})`);
    }
  }

  return lines.join('\n');
}

function renderPatterns(patterns: BehavioralPattern[]): string {
  if (patterns.length === 0) {
    return '\n  ── Detected Patterns ─────────────────\n  No usage data yet — patterns will appear after a few sessions.\n';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('  ── Detected Patterns ─────────────────');

  for (const p of patterns) {
    lines.push(`  • ${p.id}: ${p.description} (confidence: ${p.confidence.toFixed(2)})`);
  }

  return lines.join('\n');
}

function renderAgentTuning(dims: DimensionVector): string {
  const overlays = generateAgentOverlays(dims);

  if (overlays.length === 0) {
    return '\n  ── Active Agent Tuning ───────────────\n  No active tuning — all dimensions are near neutral.\n';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('  ── Active Agent Tuning ───────────────');

  for (const overlay of overlays) {
    const params = overlay.parameters;
    const paramStr = [
      `strictness=${params.strictness.toFixed(2)}`,
      `autonomy=${params.autonomy.toFixed(2)}`,
      `depth=${params.depth.toFixed(2)}`,
    ].join('  ');

    const namePad = overlay.agentName.padEnd(18);
    lines.push(`  ${namePad} ${paramStr}`);

    // 첫 번째 행동 지시문 표시
    if (overlay.behaviorModifiers.length > 0) {
      const mod = overlay.behaviorModifiers[0];
      const truncated = mod.length > 60 ? `${mod.slice(0, 57)}...` : mod;
      lines.push(`  ${' '.repeat(18)} "${truncated}"`);
    }
  }

  return lines.join('\n');
}

function renderCost(): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  ── Session Cost ──────────────────────');

  // 오늘
  const todaySessions = getAllSessionCosts(1);
  if (todaySessions.length === 0) {
    lines.push('  Today:     no sessions recorded yet');
  } else {
    const todayTokens = todaySessions.reduce(
      (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens,
      0,
    );
    const todayCost = todaySessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
    lines.push(`  Today:     ${formatTokens(todayTokens)} tokens (~${formatUsd(todayCost)})`);
  }

  // 이번 주
  const weekSessions = getAllSessionCosts(7);
  if (weekSessions.length > 0) {
    const weekTokens = weekSessions.reduce(
      (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens,
      0,
    );
    const weekCost = weekSessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
    lines.push(`  This week: ${formatTokens(weekTokens)} tokens (~${formatUsd(weekCost)})`);
  }

  return lines.join('\n');
}

function renderSuggestions(history: EvolutionRecord[], patterns: BehavioralPattern[]): string {
  const suggestions: string[] = [];

  // 패턴 기반 제안
  const escalationPattern = patterns.find(p => p.id === 'frequent-escalation');
  if (escalationPattern) {
    suggestions.push('De-escalate: check if a lower model tier achieves the same results');
  }

  const verbosePattern = patterns.find(p => p.id === 'verbose-override');
  if (verbosePattern) {
    suggestions.push('Adjust communicationStyle upward — you frequently override verbose responses');
  }

  const overridePattern = patterns.find(p => p.id === 'high-override-rate');
  if (overridePattern) {
    suggestions.push('Consider lowering autonomyPreference — you override AI decisions frequently');
  }

  // 진화 제안
  if (history.length === 0) {
    suggestions.push('Run `tenetx lab evolve` to start auto-learning from your usage patterns');
  }

  if (suggestions.length === 0) return '';

  const lines: string[] = [];
  lines.push('');
  lines.push('  ── Suggestions ───────────────────────');
  for (const s of suggestions) {
    lines.push(`  • ${s}`);
  }

  return lines.join('\n');
}

// ── Main Entry ───────────────────────────────────────

export async function runMeDashboard(_args: string[]): Promise<void> {
  const profile = loadForgeProfile(process.cwd());

  if (!profile) {
    console.log('\n  No profile yet — run `tenetx forge` to create one.\n');
    return;
  }

  const dims = profile.dimensions;
  const history = loadEvolutionHistory();
  const patterns = loadStoredPatterns();

  const output: string[] = [];

  output.push(renderProfile(dims));
  output.push(renderEvolution(history));
  output.push(renderPatterns(patterns));
  output.push(renderAgentTuning(dims));
  output.push(renderCost());

  const suggestions = renderSuggestions(history, patterns);
  if (suggestions) {
    output.push(suggestions);
  }

  output.push('');

  console.log(output.join('\n'));
}
