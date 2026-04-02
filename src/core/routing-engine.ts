/**
 * Tenetx — Model Routing Engine
 *
 * 프리셋 기반 모델 라우팅 테이블 생성.
 * task → model 매핑을 정의하고, HarnessContext에 주입할
 * model → tasks[] 형태로 변환하는 유틸리티를 제공합니다.
 */

import type { ModelRoutingTable } from './types.js';

type ModelName = 'opus' | 'sonnet' | 'haiku';
type RoutingRoutes = Record<string, ModelName>;

const PRESET_TABLES: Record<string, RoutingRoutes> = {
  default: {
    explore: 'sonnet',
    implement: 'sonnet',
    review: 'sonnet',
    design: 'opus',
    security: 'opus',
    architecture: 'opus',
  },
  'max-quality': {
    explore: 'sonnet',
    implement: 'opus',
    review: 'opus',
    design: 'opus',
    security: 'opus',
    architecture: 'opus',
  },
  'cost-saving': {
    explore: 'haiku',
    implement: 'sonnet',
    review: 'sonnet',
    design: 'sonnet',
    security: 'sonnet',
    architecture: 'sonnet',
  },
};

/** 프리셋으로 라우팅 테이블 생성. 알 수 없는 프리셋은 default로 폴백. */
export function buildRoutingTable(preset: string): ModelRoutingTable {
  const routes = PRESET_TABLES[preset] ?? PRESET_TABLES['default'];
  return { routes: { ...routes } };
}

/**
 * task→model 라우팅 테이블을 model→tasks[] 맵으로 변환.
 * HarnessContext.modelRouting (Record<string, string[]>) 형태에 맞춤.
 */
export function toModelTaskMap(table: ModelRoutingTable): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const [task, model] of Object.entries(table.routes)) {
    if (!map[model]) map[model] = [];
    map[model].push(task);
  }
  return map;
}
