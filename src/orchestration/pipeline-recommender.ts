/**
 * Tenetx Orchestration — Pipeline Recommender
 *
 * 태스크 카테고리 × 사용자 차원 벡터 → 에이전트 파이프라인 추천.
 * 규칙 기반 (LLM 호출 0). 사용자에게 제안만 하고 opt-in 실행.
 *
 * 오케스트레이션 패턴: "Personalized Supervisor-Expert Pipeline with Quality Gates"
 *   - Supervisor: Claude Code (중앙 감독자)
 *   - Expert Pool: agent-tuner (전문가 동적 선택)
 *   - Pipeline: 태스크별 에이전트 체이닝
 *   - Generate-Verify: 품질 게이트
 */

import type { TaskCategory } from '../engine/signals.js';
import type { PipelineStep, PipelineRecommendation, OrchestrationContext } from './types.js';

// ── Base Pipelines ─────────────────────────────────

/** 태스크 카테고리별 기본 파이프라인 */
const BASE_PIPELINES: Record<string, { name: string; steps: PipelineStep[] }> = {
  // implement, architect → Feature Pipeline
  'implement': {
    name: 'Feature Pipeline',
    steps: [
      { agentName: 'architect', modelTier: 'opus', isRequired: false },
      { agentName: 'executor', modelTier: 'sonnet', isRequired: true },
      { agentName: 'test-engineer', modelTier: 'sonnet', isRequired: false },
      { agentName: 'code-reviewer', modelTier: 'sonnet', isRequired: false },
    ],
  },
  'architect': {
    name: 'Design Pipeline',
    steps: [
      { agentName: 'architect', modelTier: 'opus', isRequired: true },
      { agentName: 'critic', modelTier: 'opus', isRequired: false },
      { agentName: 'executor', modelTier: 'sonnet', isRequired: false },
    ],
  },
  // debug-complex → Bug Fix Pipeline
  'debug-complex': {
    name: 'Bug Fix Pipeline',
    steps: [
      { agentName: 'debugger', modelTier: 'opus', isRequired: true },
      { agentName: 'executor', modelTier: 'sonnet', isRequired: true },
      { agentName: 'test-engineer', modelTier: 'sonnet', isRequired: false },
    ],
  },
  // code-review → Review Pipeline
  'code-review': {
    name: 'Review Pipeline',
    steps: [
      { agentName: 'code-reviewer', modelTier: 'opus', isRequired: true },
      { agentName: 'security-reviewer', modelTier: 'opus', isRequired: false },
      { agentName: 'performance-reviewer', modelTier: 'sonnet', isRequired: false },
    ],
  },
  // analysis → Analysis Pipeline
  'analysis': {
    name: 'Analysis Pipeline',
    steps: [
      { agentName: 'architect', modelTier: 'opus', isRequired: true },
      { agentName: 'critic', modelTier: 'opus', isRequired: false },
    ],
  },
  // design → Design Pipeline (architect와 동일)
  'design': {
    name: 'Design Pipeline',
    steps: [
      { agentName: 'architect', modelTier: 'opus', isRequired: true },
      { agentName: 'critic', modelTier: 'opus', isRequired: false },
    ],
  },
  // explore, file-search, simple-qa → Quick Pipeline (단독)
  'explore': {
    name: 'Quick Pipeline',
    steps: [
      { agentName: 'explore', modelTier: 'sonnet', isRequired: true },
    ],
  },
  'file-search': {
    name: 'Quick Pipeline',
    steps: [
      { agentName: 'explore', modelTier: 'haiku', isRequired: true },
    ],
  },
  'simple-qa': {
    name: 'Quick Pipeline',
    steps: [
      { agentName: 'executor', modelTier: 'sonnet', isRequired: true },
    ],
  },
};

// ── Dimension-Based Adjustments ────────────────────

/**
 * 차원 벡터에 따라 파이프라인 단계 조정.
 * 조정 우선순위: riskTolerance(보안) > qualityFocus(품질) > autonomyPreference(자율)
 * 모든 조정은 순차 적용되며, early return 없이 최종 결과를 반환.
 */
function adjustPipeline(
  steps: PipelineStep[],
  ctx: OrchestrationContext,
): { steps: PipelineStep[]; reasoning: string[] } {
  let adjusted = steps.map(s => ({ ...s }));
  const reasons: string[] = [];

  // 1. riskTolerance < 0.3 → security-reviewer 추가 (최우선 — 보안은 항상 적용)
  if (ctx.riskTolerance < 0.3) {
    const hasSecurity = adjusted.some(s => s.agentName === 'security-reviewer');
    if (!hasSecurity) {
      adjusted.push({ agentName: 'security-reviewer', modelTier: 'opus', isRequired: true });
      reasons.push(`riskTolerance(${ctx.riskTolerance.toFixed(2)}) < 0.3 → security-reviewer 추가`);
    }
  }

  // 2. qualityFocus >= 0.7 → optional 단계를 required로 승격
  if (ctx.qualityFocus >= 0.7) {
    for (const step of adjusted) {
      if (!step.isRequired && (step.agentName === 'test-engineer' || step.agentName === 'code-reviewer')) {
        step.isRequired = true;
        reasons.push(`qualityFocus(${ctx.qualityFocus.toFixed(2)}) >= 0.7 → ${step.agentName} 필수화`);
      }
    }
  }

  // 3. qualityFocus < 0.4 → optional 단계 제거 (security-reviewer는 이미 required로 추가됨)
  if (ctx.qualityFocus < 0.4) {
    const before = adjusted.length;
    adjusted = adjusted.filter(s => s.isRequired);
    if (adjusted.length < before) {
      reasons.push(`qualityFocus(${ctx.qualityFocus.toFixed(2)}) < 0.4 → 선택 단계 제거`);
    }
  }

  // 4. autonomyPreference >= 0.7 → 단독 executor만 (code-review/architect 제외)
  //    단, security-reviewer가 추가된 경우 함께 유지
  if (ctx.autonomyPreference >= 0.7 && ctx.taskCategory !== 'code-review' && ctx.taskCategory !== 'architect') {
    const essential = adjusted.filter(s => s.agentName === 'executor' || s.agentName === 'security-reviewer');
    if (essential.some(s => s.agentName === 'executor')) {
      adjusted = essential;
      reasons.push(`autonomyPreference(${ctx.autonomyPreference.toFixed(2)}) >= 0.7 → 자율 모드`);
    }
  }

  return { steps: adjusted, reasoning: reasons };
}

// ── Public API ──────────────────────────────────────

/** 컨텍스트 기반 파이프라인 추천 */
export function recommendPipeline(ctx: OrchestrationContext): PipelineRecommendation {
  const base = BASE_PIPELINES[ctx.taskCategory] ?? BASE_PIPELINES['simple-qa']!;
  const { steps, reasoning } = adjustPipeline(base.steps, ctx);

  return {
    name: base.name,
    description: `${base.name} for ${ctx.taskCategory}`,
    steps,
    trigger: [ctx.taskCategory],
    confidence: reasoning.length === 0 ? 0.8 : 0.6, // 조정이 많으면 confidence 하향
    reasoning: reasoning.length > 0
      ? reasoning.join('; ')
      : `기본 ${base.name} (차원 조정 없음)`,
  };
}

/** 모든 카테고리의 파이프라인 요약 출력 */
export function formatPipelineSuggestions(
  ctx: Omit<OrchestrationContext, 'taskCategory'>,
): string {
  const categories: TaskCategory[] = [
    'implement', 'debug-complex', 'code-review', 'architect', 'design', 'analysis', 'explore',
  ];

  const lines: string[] = ['  ── Pipeline Suggestions ──────────────'];
  for (const cat of categories) {
    const rec = recommendPipeline({ ...ctx, taskCategory: cat });
    const steps = rec.steps.map(s =>
      `${s.agentName}(${s.modelTier})${s.isRequired ? '' : '?'}`,
    ).join(' → ');
    lines.push(`  ${cat.padEnd(16)} ${steps}`);
    if (rec.reasoning !== `기본 ${rec.name} (차원 조정 없음)`) {
      lines.push(`  ${''.padEnd(16)} ↳ ${rec.reasoning}`);
    }
  }
  return lines.join('\n');
}
