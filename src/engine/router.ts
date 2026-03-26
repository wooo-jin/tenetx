import type { Philosophy } from '../core/types.js';
import { extractSignals, type ContextSignals, type ModelTier, type TaskCategory } from './signals.js';
import { scoreSignals, type ScoreBreakdown } from './scorer.js';

// Re-export for backwards compatibility
export type { ModelTier, TaskCategory };

/** 기본 라우팅 테이블 (focus-resources-on-judgment 원칙 기반) */
const DEFAULT_ROUTING: Record<ModelTier, TaskCategory[]> = {
  haiku: ['explore', 'file-search', 'simple-qa'],
  sonnet: ['code-review', 'analysis', 'design'],
  opus: ['implement', 'architect', 'debug-complex'],
};

/** 프리셋 라우팅 테이블 (tenetx setup에서 선택) */
export type RoutingPreset = 'default' | 'cost-saving' | 'max-quality';

const PRESET_ROUTING: Record<RoutingPreset, Record<ModelTier, TaskCategory[]>> = {
  'default': DEFAULT_ROUTING,
  'cost-saving': {
    haiku: ['explore', 'file-search', 'simple-qa'],
    sonnet: ['code-review', 'analysis', 'design', 'implement', 'debug-complex'],
    opus: ['architect'],
  },
  'max-quality': {
    haiku: ['file-search'],
    sonnet: ['explore', 'simple-qa'],
    opus: ['code-review', 'analysis', 'design', 'implement', 'architect', 'debug-complex'],
  },
};

/** 철학에서 커스텀 라우팅 추출 */
function extractRouting(philosophy: Philosophy): Record<ModelTier, TaskCategory[]> | null {
  for (const principle of Object.values(philosophy.principles)) {
    for (const gen of principle.generates) {
      if (typeof gen === 'object' && gen.routing) {
        return parseRoutingString(gen.routing);
      }
    }
  }
  return null;
}

function parseRoutingString(routing: string): Record<ModelTier, TaskCategory[]> | null {
  const result: Record<ModelTier, TaskCategory[]> = { haiku: [], sonnet: [], opus: [] };

  const parts = routing.split(',').map(s => s.trim());
  for (const part of parts) {
    const match = part.match(/^(.+?)\s*→\s*(.+)$/);
    if (!match) continue;

    const tasks = match[1].toLowerCase().split(/[/+]/).map(s => s.trim()) as TaskCategory[];
    const model = match[2].toLowerCase().trim() as ModelTier;

    if (model in result) {
      result[model].push(...tasks);
    }
  }

  const total = result.haiku.length + result.sonnet.length + result.opus.length;
  return total > 0 ? result : null;
}

export interface RoutingResult {
  /** 최종 추천 모델 */
  tier: ModelTier;
  /** 라우팅 결정 근거 */
  source: 'philosophy' | 'signal' | 'category' | 'default';
  /** 카테고리 기반 추론 결과 */
  category: TaskCategory;
  /** 신호 스코어 (signal 소스일 때만 유의미) */
  score?: ScoreBreakdown;
}

export class ModelRouter {
  private routing: Record<ModelTier, TaskCategory[]>;
  private hasPhilosophyRouting: boolean;

  /**
   * @param philosophy 철학 객체
   * @param preset 라우팅 프리셋 (tenetx setup에서 선택). Philosophy 커스텀 라우팅이 최우선.
   */
  constructor(philosophy: Philosophy, preset?: RoutingPreset) {
    const extracted = extractRouting(philosophy);
    if (extracted) {
      this.routing = extracted;
      this.hasPhilosophyRouting = true;
    } else if (preset && preset in PRESET_ROUTING) {
      this.routing = PRESET_ROUTING[preset];
      this.hasPhilosophyRouting = false;
    } else {
      this.routing = DEFAULT_ROUTING;
      this.hasPhilosophyRouting = false;
    }
  }

  /** 작업 카테고리에 맞는 모델 추천 (테이블 기반) */
  recommend(task: TaskCategory): ModelTier {
    for (const [tier, tasks] of Object.entries(this.routing) as [ModelTier, TaskCategory[]][]) {
      if (tasks.includes(task)) return tier;
    }
    return 'sonnet';
  }

  /** 자유 텍스트에서 작업 카테고리 추론 (고티어 우선 매칭) */
  inferCategory(prompt: string): TaskCategory {
    const lower = prompt.toLowerCase();

    // 카테고리별 매칭 점수를 수집 (순서 의존성 제거)
    const matchers: Array<{ category: TaskCategory; pattern: RegExp; tier: number }> = [
      { category: 'architect', pattern: /설계|아키텍처|구조|design|architect/, tier: 3 },
      { category: 'debug-complex', pattern: /디버그|왜.*안|에러|bug|debug/, tier: 3 },
      { category: 'implement', pattern: /구현|만들|추가|수정|fix|implement|build|create/, tier: 2 },
      { category: 'code-review', pattern: /리뷰|검토|review|분석|analyze/, tier: 2 },
      { category: 'explore', pattern: /찾아|검색|어디|파일.*뭐|grep|find|search/, tier: 1 },
      { category: 'simple-qa', pattern: /뭐야|설명|무슨|what is/, tier: 1 },
    ];

    // 매칭되는 카테고리 중 가장 높은 티어를 선택 (안전 방향 에스컬레이션)
    let best: { category: TaskCategory; tier: number } | null = null;
    for (const m of matchers) {
      if (m.pattern.test(lower)) {
        if (!best || m.tier > best.tier) {
          best = { category: m.category, tier: m.tier };
        }
      }
    }

    return best?.category ?? 'implement';
  }

  /**
   * 하이브리드 라우팅: Philosophy(선언적) + Signal(동적)
   *
   * 우선순위:
   * 1. Philosophy 라우팅 (사용자 선언이 있으면 최우선)
   * 2. 신호 스코어링 (동적 에스컬레이션 — 복잡한 요청 감지)
   * 3. 카테고리 기반 테이블 (기본)
   *
   * 에스컬레이션 규칙: 신호 스코어가 카테고리 결과보다 높은 티어를 추천하면 에스컬레이션
   */
  route(prompt: string, context?: Partial<ContextSignals>): RoutingResult {
    const category = this.inferCategory(prompt);
    const categoryTier = this.recommend(category);

    // Philosophy 라우팅이 있으면 카테고리 결과를 신뢰
    if (this.hasPhilosophyRouting) {
      return { tier: categoryTier, source: 'philosophy', category };
    }

    // 신호 추출 + 스코어링
    const signals = extractSignals(prompt, context);
    const score = scoreSignals(signals);

    // 에스컬레이션 판단: 신호가 더 높은 티어를 추천하면 올림
    const tierRank: Record<ModelTier, number> = { haiku: 0, sonnet: 1, opus: 2 };
    if (tierRank[score.recommendedTier] > tierRank[categoryTier]) {
      return { tier: score.recommendedTier, source: 'signal', category, score };
    }

    return { tier: categoryTier, source: 'category', category, score };
  }

  /** 라우팅 테이블 반환 (디버깅/표시용) */
  getTable(): Record<ModelTier, TaskCategory[]> {
    return { ...this.routing };
  }
}
