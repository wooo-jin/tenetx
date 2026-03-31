/**
 * Tenetx Orchestration — Type Definitions
 *
 * Phase 2 개인화 오케스트레이션의 공유 타입.
 * Pipeline Recommender, Agent Overlay Injector, Contextual Bandit.
 */

import type { TaskCategory, ModelTier } from '../engine/signals.js';

export type { TaskCategory, ModelTier };

// ── Pipeline ───────────────────────────────────────

export interface PipelineStep {
  agentName: string;
  modelTier: ModelTier;
  isRequired: boolean;
}

export interface PipelineRecommendation {
  name: string;
  description: string;
  steps: PipelineStep[];
  trigger: TaskCategory[];
  confidence: number;
  reasoning: string;
}

// ── Orchestration Context ──────────────────────────

export interface OrchestrationContext {
  taskCategory: TaskCategory;
  qualityFocus: number;
  riskTolerance: number;
  autonomyPreference: number;
}

// ── Agent Overlay Injection ────────────────────────

export interface OverlayInjection {
  agentType: string;
  message: string;
  recommendedModel: ModelTier;
}
