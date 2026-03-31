/**
 * Tenetx Insight — Type Definitions
 *
 * Phase 1 이해 레이어의 공유 타입.
 * Knowledge Map, Evolution Timeline, Session Retrospective, HTML Dashboard.
 */

import type { SolutionStatus, SolutionType } from '../engine/solution-format.js';

// ── Knowledge Map ──────────────────────────────────

/** 그래프 노드 — 하나의 솔루션 */
export interface KnowledgeNode {
  id: string;
  title: string;
  status: SolutionStatus;
  confidence: number;
  type: SolutionType;
  scope: 'me' | 'team' | 'project';
  tags: string[];
  identifiers: string[];
  lastUpdated?: string;
}

/** 그래프 엣지 — 솔루션 간 관계 */
export interface KnowledgeEdge {
  source: string;
  target: string;
  similarity: number;
}

/** Knowledge Map 전체 구조 */
export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  metadata: {
    generatedAt: string;
    totalSolutions: number;
    avgConfidence: number;
    statusDistribution: Record<string, number>;
  };
}

// ── Evolution Timeline ─────────────────────────────

/** 차원 변화 관측 포인트 */
export interface TimelinePoint {
  timestamp: string;
  dimensions: Record<string, number>;
  reward: number;
  sessionId?: string;
}

/** 타임라인 데이터 (sparkline + chart 공용) */
export interface TimelineData {
  points: TimelinePoint[];
  dimensionNames: string[];
  dateRange: { start: string; end: string } | null;
}

// ── Session Retrospective ──────────────────────────

export interface RetrospectiveInsight {
  rule: string;
  severity: 'info' | 'warn' | 'action';
  message: string;
  relatedSolution?: string;
}

export interface RetrospectiveResult {
  sessionId: string;
  duration: { actual: number; avgLast30: number; ratio: number } | null;
  insights: RetrospectiveInsight[];
  surpriseDetected: boolean;
}

// ── HTML Dashboard ─────────────────────────────────

export interface DashboardInput {
  graph: KnowledgeGraph;
  timeline: TimelineData;
  retrospectives: RetrospectiveResult[];
  currentProfile: Record<string, number> | null;
  solutionCount: number;
  sessionCount: number;
  generatedAt: string;
}
