/**
 * Tenetx Lab — Type Definitions
 *
 * Adaptive optimization engine types for tracking harness effectiveness.
 */

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type LabEventType =
  | 'agent-call'
  | 'skill-invocation'
  | 'hook-trigger'
  | 'mode-activation'
  | 'routing-decision'
  | 'user-override'
  | 'session-metrics'
  | 'synthesis'
  | 'auto-evolve'
  // Compound Engine v3
  | 'compound-injected'
  | 'compound-reflected'
  | 'compound-negative'
  | 'compound-extracted'
  | 'compound-promoted'
  | 'compound-demoted'
  | 'compound-precision'
  // Forge v2
  | 'user-rejection';

export interface LabEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: LabEventType;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Session ID (from session-logger) */
  sessionId: string;
  /** Event-specific payload */
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Component Metrics
// ---------------------------------------------------------------------------

export type ComponentKind = 'agent' | 'skill' | 'hook' | 'mode';
export type Trend = 'increasing' | 'stable' | 'decreasing' | 'unused';

export interface ComponentMetrics {
  /** Component identifier (e.g. "executor", "pre-tool-use", "autopilot") */
  name: string;
  /** Component kind */
  kind: ComponentKind;
  /** Total invocation count */
  invocationCount: number;
  /** Completed without user reject/override (0-1) */
  acceptanceRate: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** No errors rate (0-1) */
  successRate: number;
  /** 30-day usage trend */
  trend: Trend;
  /** Composite effectiveness score (0-100) */
  effectivenessScore: number;
  /** Last used timestamp (ISO 8601) */
  lastUsed: string | null;
  /** First seen timestamp (ISO 8601) */
  firstSeen: string;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export type SuggestionType =
  | 'remove-unused'
  | 'escalate-model'
  | 'deescalate-model'
  | 'adjust-hook'
  | 'add-rule'
  | 'mode-recommendation';

export type SuggestionStatus = 'pending' | 'applied' | 'dismissed';

export interface LabSuggestion {
  /** Unique suggestion ID */
  id: string;
  /** Suggestion type */
  type: SuggestionType;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** Target component name */
  component: string;
  /** Target component kind */
  componentKind: ComponentKind;
  /** Confidence (0-1) */
  confidence: number;
  /** Expected impact description */
  impact: string;
  /** Current status */
  status: SuggestionStatus;
  /** ISO 8601 created timestamp */
  createdAt: string;
  /** ISO 8601 resolved timestamp */
  resolvedAt?: string;
  /** Data points backing this suggestion */
  evidence: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Harness Snapshots
// ---------------------------------------------------------------------------

export type SnapshotTrigger = 'manual' | 'suggestion-applied' | 'session-start' | 'periodic' | 'auto-evolve';

// ---------------------------------------------------------------------------
// Auto-Learning Types
// ---------------------------------------------------------------------------

/** A single dimension adjustment proposed by the auto-learning engine */
export interface DimensionAdjustment {
  /** Dimension key (e.g., 'autonomyPreference') */
  dimension: string;
  /** Delta to apply (e.g., +0.05) */
  delta: number;
  /** Confidence in this adjustment (0-1) */
  confidence: number;
  /** What triggered this adjustment */
  evidence: string;
  /** Number of events supporting this adjustment */
  eventCount: number;
}

/** Record of a single auto-evolution cycle */
export interface EvolutionRecord {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Adjustments applied in this cycle */
  adjustments: DimensionAdjustment[];
  /** Dimension vector before adjustments */
  previousVector: Record<string, number>;
  /** Dimension vector after adjustments */
  newVector: Record<string, number>;
  /** Number of days in the analysis window */
  eventWindowDays: number;
  /** Total events analyzed in this cycle */
  totalEventsAnalyzed: number;
}

/** A behavioral pattern detected from lab events */
export interface BehavioralPattern {
  /** Unique pattern identifier */
  id: string;
  /** Pattern classification */
  type: 'preference' | 'workflow' | 'avoidance' | 'dependency';
  /** Human-readable description */
  description: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Number of events supporting this pattern */
  eventCount: number;
  /** ISO 8601 first seen timestamp */
  firstSeen: string;
  /** ISO 8601 last seen timestamp */
  lastSeen: string;
}

/** Metadata about the last auto-learn run */
export interface LastEvolveInfo {
  /** ISO 8601 timestamp of last run */
  timestamp: string;
  /** Number of events analyzed */
  eventsAnalyzed: number;
  /** Number of adjustments made */
  adjustmentCount: number;
  /** Whether it was a dry run */
  dryRun: boolean;
}

export interface HarnessSnapshot {
  /** Snapshot ID */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** What triggered the snapshot */
  trigger: SnapshotTrigger;
  /** Philosophy name and version */
  philosophy: { name: string; version: string };
  /** Installed agents list */
  agents: string[];
  /** Active hooks list */
  hooks: string[];
  /** Active modes list */
  modes: string[];
  /** Routing preset */
  routingPreset: string;
  /** Connected packs */
  packs: string[];
  /** Aggregate metrics summary */
  metricsSummary: {
    totalEvents: number;
    totalSessions: number;
    avgEffectiveness: number;
  };
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export type ExperimentStatus = 'running' | 'completed' | 'cancelled';
export type ExperimentMetric = 'cost' | 'duration' | 'success-rate' | 'effectiveness';

export interface ExperimentVariant {
  /** Variant name (e.g. "control", "treatment") */
  name: string;
  /** Description of what's different */
  description: string;
  /** Session IDs in this variant */
  sessionIds: string[];
  /** Metric values collected */
  metricValues: number[];
}

export interface LabExperiment {
  /** Experiment ID */
  id: string;
  /** Experiment name */
  name: string;
  /** Metric being compared */
  metric: ExperimentMetric;
  /** Current status */
  status: ExperimentStatus;
  /** ISO 8601 start time */
  startedAt: string;
  /** ISO 8601 end time */
  endedAt?: string;
  /** Variants */
  variants: ExperimentVariant[];
  /** Conclusion (after completion) */
  conclusion?: string;
}

// ---------------------------------------------------------------------------
// Session Cost
// ---------------------------------------------------------------------------

export interface SessionCostEntry {
  sessionId: string;
  startTime: string;
  endTime?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  model: string;
  agentSpawnCount: number;
}

// ---------------------------------------------------------------------------
// Monthly Aggregated Metrics
// ---------------------------------------------------------------------------

export interface MonthlyMetrics {
  /** YYYY-MM */
  month: string;
  /** Component metrics keyed by "{kind}:{name}" */
  components: Record<string, ComponentMetrics>;
  /** Total event count in the month */
  totalEvents: number;
  /** Total sessions in the month */
  totalSessions: number;
  /** Total estimated cost */
  totalCost: number;
}

// ---------------------------------------------------------------------------
// Forge v2 Types
// ---------------------------------------------------------------------------

/** 세션 단위 보상 신호 */
export interface SessionReward {
  sessionId: string;
  timestamp: string;
  /** 세션 시작 시 차원 벡터 스냅샷 */
  dimensionSnapshot: Record<string, number>;
  /** 보상 구성 요소 (각 0-1) */
  components: {
    nonOverrideRate: number;
    successRate: number;
    costEfficiency: number;
    durationScore: number;
    lowBlockRate: number;
  };
  /** 최종 통합 보상 (0-1) */
  reward: number;
}

/** Gaussian posterior for Thompson Sampling */
export interface GaussianPosterior {
  mu: number;
  sigma2: number;
  n: number;
  rewardSum: number;
  rewardSumSq: number;
}

/** BKT 차원별 4파라미터 */
export interface BKTParameters {
  pLearn: number;
  pForget: number;
  pSlip: number;
  pGuess: number;
}

/** BKT 선호 추적 상태 */
export interface PreferenceState {
  pKnown: number;
  observations: Array<{ consistent: boolean; timestamp: string }>;
  params: BKTParameters;
}

/** User response to a dimension change notification */
export type UserResponse = 'accepted' | 'reverted' | 'modified' | 'ignored';

/** 변경 알림 */
export interface ChangeNotification {
  /** Unique notification ID */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** List of dimension changes exceeding the notification threshold */
  changes: Array<{
    /** Dimension key (e.g. 'autonomyPreference') */
    dimension: string;
    /** Value before the change */
    previousValue: number;
    /** Value after the change */
    newValue: number;
    /** Reason for the change */
    reason: string;
  }>;
  /** User's response to this notification */
  userResponse?: UserResponse;
  /** User-provided override values (only when response is 'modified') */
  userModifiedValues?: Record<string, number>;
}
