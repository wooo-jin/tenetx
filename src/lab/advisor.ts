/**
 * Tenetx Lab — Adaptive Suggestion Engine (Advisor)
 *
 * Generates data-driven suggestions based on accumulated metrics.
 * Suggestions are stored persistently and can be applied or dismissed.
 */

import * as crypto from 'node:crypto';
import { debugLog } from '../core/logger.js';
import { computeAllMetrics } from './scorer.js';
import { readEvents, loadPendingSuggestions, savePendingSuggestions,
  loadSuggestionHistory, saveSuggestionHistory } from './store.js';
import type {
  LabSuggestion,
  SuggestionType,
  ComponentMetrics,
  ComponentKind,
  LabEvent,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_INVOCATIONS_FOR_SUGGESTION = 5;
const HIGH_FAILURE_THRESHOLD = 0.30; // 30%+ failure rate
const LOW_SUCCESS_SIMPLE_TASK_THRESHOLD = 0.90; // 90%+ success on simple tasks
const UNUSED_DAYS_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Suggestion Generators
// ---------------------------------------------------------------------------

type SuggestionGenerator = (
  metrics: ComponentMetrics[],
  events: LabEvent[],
) => LabSuggestion[];

/** Detect components not used in 30+ days */
function detectUnusedComponents(metrics: ComponentMetrics[]): LabSuggestion[] {
  const suggestions: LabSuggestion[] = [];
  const now = Date.now();

  for (const m of metrics) {
    if (!m.lastUsed) continue;
    const lastUsedMs = new Date(m.lastUsed).getTime();
    const daysSinceUse = (now - lastUsedMs) / (24 * 60 * 60 * 1000);

    if (daysSinceUse >= UNUSED_DAYS_THRESHOLD && m.invocationCount > 0) {
      suggestions.push(createSuggestion(
        'remove-unused',
        `Remove unused ${m.kind}: ${m.name}`,
        `"${m.name}" (${m.kind}) has not been used for ${Math.round(daysSinceUse)} days. `
          + `Consider removing or replacing it to reduce configuration complexity.`,
        m.name,
        m.kind,
        Math.min(0.9, 0.5 + (daysSinceUse - UNUSED_DAYS_THRESHOLD) / 60),
        'Reduced configuration overhead',
        { daysSinceUse: Math.round(daysSinceUse), lastInvocationCount: m.invocationCount },
      ));
    }
  }

  return suggestions;
}

/** Detect components with high failure rates that might need a higher model */
function detectEscalationNeeds(
  metrics: ComponentMetrics[],
  events: LabEvent[],
): LabSuggestion[] {
  const suggestions: LabSuggestion[] = [];

  // Find agent components with high failure rates
  const agentMetrics = metrics.filter(m => m.kind === 'agent');

  for (const m of agentMetrics) {
    if (m.invocationCount < MIN_INVOCATIONS_FOR_SUGGESTION) continue;
    if (m.successRate >= (1 - HIGH_FAILURE_THRESHOLD)) continue;

    // Check what model is being used
    const agentEvents = events.filter(
      e => e.type === 'agent-call' && e.payload.name === m.name,
    );
    const modelCounts: Record<string, number> = {};
    for (const e of agentEvents) {
      const model = String(e.payload.model ?? 'unknown');
      modelCounts[model] = (modelCounts[model] ?? 0) + 1;
    }

    const primaryModel = Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    if (primaryModel && !primaryModel.includes('opus')) {
      suggestions.push(createSuggestion(
        'escalate-model',
        `Escalate model for agent: ${m.name}`,
        `Agent "${m.name}" has a ${Math.round((1 - m.successRate) * 100)}% failure rate `
          + `using ${primaryModel}. Consider escalating to a higher-tier model.`,
        m.name,
        'agent',
        0.6 + (1 - m.successRate) * 0.3,
        'Improved task success rate',
        {
          currentModel: primaryModel,
          failureRate: Math.round((1 - m.successRate) * 100),
          invocations: m.invocationCount,
        },
      ));
    }
  }

  return suggestions;
}

/** Detect expensive models used for simple tasks */
function detectDeescalationOpportunities(
  metrics: ComponentMetrics[],
  events: LabEvent[],
): LabSuggestion[] {
  const suggestions: LabSuggestion[] = [];

  const agentMetrics = metrics.filter(m => m.kind === 'agent');

  for (const m of agentMetrics) {
    if (m.invocationCount < MIN_INVOCATIONS_FOR_SUGGESTION) continue;
    if (m.successRate < LOW_SUCCESS_SIMPLE_TASK_THRESHOLD) continue;

    const agentEvents = events.filter(
      e => e.type === 'agent-call' && e.payload.name === m.name,
    );
    const modelCounts: Record<string, number> = {};
    for (const e of agentEvents) {
      const model = String(e.payload.model ?? 'unknown');
      modelCounts[model] = (modelCounts[model] ?? 0) + 1;
    }

    const primaryModel = Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    if (primaryModel?.includes('opus') && m.avgDurationMs < 5000) {
      suggestions.push(createSuggestion(
        'deescalate-model',
        `De-escalate model for agent: ${m.name}`,
        `Agent "${m.name}" uses ${primaryModel} but has a `
          + `${Math.round(m.successRate * 100)}% success rate with fast avg duration `
          + `(${m.avgDurationMs}ms). A cheaper model may suffice.`,
        m.name,
        'agent',
        0.5 + m.successRate * 0.3,
        'Reduced cost without quality impact',
        {
          currentModel: primaryModel,
          successRate: Math.round(m.successRate * 100),
          avgDurationMs: m.avgDurationMs,
        },
      ));
    }
  }

  return suggestions;
}

/** Detect hooks with too many blocks (false positives) */
function detectHookAdjustments(metrics: ComponentMetrics[]): LabSuggestion[] {
  const suggestions: LabSuggestion[] = [];

  const hookMetrics = metrics.filter(m => m.kind === 'hook');

  for (const m of hookMetrics) {
    if (m.invocationCount < MIN_INVOCATIONS_FOR_SUGGESTION) continue;

    // Low acceptance rate suggests too aggressive blocking
    if (m.acceptanceRate < 0.50) {
      suggestions.push(createSuggestion(
        'adjust-hook',
        `Adjust hook severity: ${m.name}`,
        `Hook "${m.name}" blocks ${Math.round((1 - m.acceptanceRate) * 100)}% of `
          + `invocations. This may indicate overly aggressive rules.`,
        m.name,
        'hook',
        0.5 + (1 - m.acceptanceRate) * 0.4,
        'Fewer interruptions, improved workflow',
        {
          acceptanceRate: Math.round(m.acceptanceRate * 100),
          invocations: m.invocationCount,
        },
      ));
    }
  }

  return suggestions;
}

/** Detect repeated patterns that could benefit from rules */
function detectPatternOpportunities(
  _metrics: ComponentMetrics[],
  events: LabEvent[],
): LabSuggestion[] {
  const suggestions: LabSuggestion[] = [];

  // Check for repeated user overrides on the same component
  const overrideEvents = events.filter(e => e.type === 'user-override');
  const overrideCounts: Record<string, number> = {};

  for (const e of overrideEvents) {
    const component = String(e.payload.component ?? 'unknown');
    overrideCounts[component] = (overrideCounts[component] ?? 0) + 1;
  }

  for (const [component, count] of Object.entries(overrideCounts)) {
    if (count >= 3) {
      suggestions.push(createSuggestion(
        'add-rule',
        `Add rule for frequently overridden: ${component}`,
        `You have overridden "${component}" ${count} times. `
          + `Consider adding a rule to automate this decision.`,
        component,
        'hook',
        Math.min(0.9, 0.4 + count * 0.1),
        'Reduced manual overrides',
        { overrideCount: count },
      ));
    }
  }

  return suggestions;
}

/** Detect mode usage patterns for recommendations */
function detectModeRecommendations(
  metrics: ComponentMetrics[],
  _events: LabEvent[],
): LabSuggestion[] {
  const suggestions: LabSuggestion[] = [];

  const modeMetrics = metrics.filter(m => m.kind === 'mode');
  if (modeMetrics.length === 0) return suggestions;

  // Find highly effective modes that are rarely used
  for (const m of modeMetrics) {
    if (m.effectivenessScore >= 70 && m.trend === 'decreasing') {
      suggestions.push(createSuggestion(
        'mode-recommendation',
        `Consider using mode: ${m.name} more`,
        `Mode "${m.name}" has a ${m.effectivenessScore}% effectiveness score `
          + `but usage is declining. It may be worth revisiting.`,
        m.name,
        'mode',
        0.4,
        'Potential productivity improvement',
        {
          effectivenessScore: m.effectivenessScore,
          trend: m.trend,
        },
      ));
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Suggestion Factory
// ---------------------------------------------------------------------------

function createSuggestion(
  type: SuggestionType,
  title: string,
  description: string,
  component: string,
  componentKind: ComponentKind,
  confidence: number,
  impact: string,
  evidence: Record<string, unknown>,
): LabSuggestion {
  return {
    id: crypto.randomUUID().slice(0, 8),
    type,
    title,
    description,
    component,
    componentKind,
    confidence: Math.round(confidence * 100) / 100,
    impact,
    status: 'pending',
    createdAt: new Date().toISOString(),
    evidence,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const generators: SuggestionGenerator[] = [
  (m, _e) => detectUnusedComponents(m),
  detectEscalationNeeds,
  detectDeescalationOpportunities,
  (m, _e) => detectHookAdjustments(m),
  detectPatternOpportunities,
  detectModeRecommendations,
];

/**
 * Generate new suggestions based on current data.
 * Deduplicates against existing pending suggestions.
 */
export function generateSuggestions(): LabSuggestion[] {
  try {
    const metrics = computeAllMetrics();
    const events = readEvents(Date.now() - THIRTY_DAYS_MS);
    const existing = loadPendingSuggestions();
    const existingKeys = new Set(
      existing.map(s => `${s.type}:${s.component}`),
    );

    const newSuggestions: LabSuggestion[] = [];

    for (const generator of generators) {
      const generated = generator(metrics, events);
      for (const suggestion of generated) {
        const key = `${suggestion.type}:${suggestion.component}`;
        if (!existingKeys.has(key)) {
          newSuggestions.push(suggestion);
          existingKeys.add(key);
        }
      }
    }

    if (newSuggestions.length > 0) {
      const allPending = [...existing, ...newSuggestions];
      savePendingSuggestions(allPending);
    }

    return newSuggestions;
  } catch (e) {
    debugLog('lab-advisor', 'Failed to generate suggestions', e);
    return [];
  }
}

/**
 * Get all pending suggestions (does not regenerate).
 */
export function getPendingSuggestions(): LabSuggestion[] {
  return loadPendingSuggestions();
}

/**
 * Apply a suggestion by ID.
 * Moves from pending to history with status "applied".
 */
export function applySuggestion(id: string): LabSuggestion | null {
  const pending = loadPendingSuggestions();
  const idx = pending.findIndex(s => s.id === id);
  if (idx === -1) return null;

  const suggestion = pending[idx];
  suggestion.status = 'applied';
  suggestion.resolvedAt = new Date().toISOString();

  // Remove from pending
  pending.splice(idx, 1);
  savePendingSuggestions(pending);

  // Add to history
  const history = loadSuggestionHistory();
  history.push(suggestion);
  saveSuggestionHistory(history);

  return suggestion;
}

/**
 * Dismiss a suggestion by ID.
 * Moves from pending to history with status "dismissed".
 */
export function dismissSuggestion(id: string): LabSuggestion | null {
  const pending = loadPendingSuggestions();
  const idx = pending.findIndex(s => s.id === id);
  if (idx === -1) return null;

  const suggestion = pending[idx];
  suggestion.status = 'dismissed';
  suggestion.resolvedAt = new Date().toISOString();

  pending.splice(idx, 1);
  savePendingSuggestions(pending);

  const history = loadSuggestionHistory();
  history.push(suggestion);
  saveSuggestionHistory(history);

  return suggestion;
}
