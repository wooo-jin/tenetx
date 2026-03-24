/**
 * Tenetx Lab — Passive Event Collector (Tracker)
 *
 * Non-blocking, failure-tolerant event recording.
 * Called from hooks to passively track harness component usage.
 * NEVER throws — all errors are silently logged via debugLog.
 */

import * as crypto from 'node:crypto';
import { debugLog } from '../core/logger.js';
import { appendEvent } from './store.js';
import type { LabEvent, LabEventType } from './types.js';

// ---------------------------------------------------------------------------
// Model Pricing (for cost estimation)
// ---------------------------------------------------------------------------

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.80, output: 4.0 },
};

/** Resolve a model name (partial match) to its pricing */
export function resolveModelPricing(
  modelId: string,
): { input: number; output: number } {
  const lower = modelId.toLowerCase();
  if (lower.includes('opus')) return MODEL_PRICING['claude-opus-4-6'];
  if (lower.includes('haiku')) return MODEL_PRICING['claude-haiku-4-5'];
  // Default to sonnet
  return MODEL_PRICING['claude-sonnet-4-6'];
}

/** Estimate cost from tokens */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  modelId: string,
): number {
  const pricing = resolveModelPricing(modelId);
  return (inputTokens / 1_000_000) * pricing.input
    + (outputTokens / 1_000_000) * pricing.output;
}

// ---------------------------------------------------------------------------
// Event ID Generation
// ---------------------------------------------------------------------------

function generateEventId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Core Track Function
// ---------------------------------------------------------------------------

/**
 * Record a lab event. Non-blocking and failure-tolerant.
 * @param type Event type
 * @param sessionId Session ID
 * @param payload Event-specific data
 */
export function track(
  type: LabEventType,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  try {
    const event: LabEvent = {
      id: generateEventId(),
      type,
      timestamp: new Date().toISOString(),
      sessionId,
      payload,
    };
    appendEvent(event);
  } catch (e) {
    debugLog('lab-tracker', `Failed to track ${type}`, e);
  }
}

// ---------------------------------------------------------------------------
// Convenience Track Functions
// ---------------------------------------------------------------------------

/**
 * Track an agent invocation.
 * @param sessionId Session ID
 * @param name Agent name (e.g. "executor", "explore")
 * @param model Model used (e.g. "opus", "sonnet")
 * @param durationMs Execution duration
 * @param result "success" | "error" | "cancelled"
 * @param extra Additional metadata
 */
export function trackAgentCall(
  sessionId: string,
  name: string,
  model: string,
  durationMs: number,
  result: 'success' | 'error' | 'cancelled',
  extra?: Record<string, unknown>,
): void {
  track('agent-call', sessionId, {
    name,
    model,
    durationMs,
    result,
    ...extra,
  });
}

/**
 * Track a skill invocation (e.g. /tenetx:autopilot).
 */
export function trackSkillInvocation(
  sessionId: string,
  skillName: string,
  durationMs: number,
  result: 'success' | 'error',
): void {
  track('skill-invocation', sessionId, {
    skillName,
    durationMs,
    result,
  });
}

/**
 * Track a hook trigger event.
 */
export function trackHookTrigger(
  sessionId: string,
  hookName: string,
  eventName: string,
  result: 'approve' | 'block' | 'modify' | 'error',
  durationMs?: number,
): void {
  track('hook-trigger', sessionId, {
    hookName,
    eventName,
    result,
    durationMs,
  });
}

/**
 * Track a mode activation.
 */
export function trackModeActivation(
  sessionId: string,
  modeName: string,
  trigger: 'keyword' | 'flag' | 'command',
): void {
  track('mode-activation', sessionId, {
    modeName,
    trigger,
  });
}

/**
 * Track a model routing decision.
 */
export function trackRoutingDecision(
  sessionId: string,
  task: string,
  recommendedModel: string,
  actualModel: string,
  source: string,
): void {
  track('routing-decision', sessionId, {
    task,
    recommendedModel,
    actualModel,
    source,
    wasOverridden: recommendedModel !== actualModel,
  });
}

/**
 * Track a user override of a harness decision.
 */
export function trackUserOverride(
  sessionId: string,
  component: string,
  originalDecision: string,
  userDecision: string,
): void {
  track('user-override', sessionId, {
    component,
    originalDecision,
    userDecision,
  });
}

/**
 * Track session-level metrics (tokens, cost, duration).
 */
export function trackSessionMetrics(
  sessionId: string,
  inputTokens: number,
  outputTokens: number,
  estimatedCostValue: number,
  durationMs: number,
  agentSpawnCount: number,
  model?: string,
): void {
  track('session-metrics', sessionId, {
    inputTokens,
    outputTokens,
    estimatedCost: estimatedCostValue,
    durationMs,
    agentSpawnCount,
    model: model ?? 'unknown',
  });
}

// ---------------------------------------------------------------------------
// Compound Track Functions
// ---------------------------------------------------------------------------

export function trackCompoundInjected(
  sessionId: string,
  solutionName: string,
  status: string,
  confidence: number,
): void {
  track('compound-injected', sessionId, { solutionName, status, confidence });
}

export function trackCompoundReflected(
  sessionId: string,
  solutionName: string,
  matchedIdentifiers: number,
): void {
  track('compound-reflected', sessionId, { solutionName, matchedIdentifiers });
}

export function trackCompoundNegative(
  sessionId: string,
  solutionName: string,
  signal: string,
): void {
  track('compound-negative', sessionId, { solutionName, signal });
}
