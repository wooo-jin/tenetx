export interface Principle {
  belief: string;
  generates: Array<string | { hook?: string; routing?: string; alert?: string; step?: string }>;
}

export interface Philosophy {
  name: string;
  version: string;
  author: string;
  description?: string;
  principles: Record<string, Principle>;
}

export interface PackMeta {
  name: string;
  version: string;
  remote?: {
    type: 'github' | 'gdrive' | 's3' | 'local';
    url: string;
    auto_sync?: boolean;
  };
  provides?: {
    atoms?: number;
    manuals?: number;
    solutions?: number;
    rules?: number;
  };
}

export interface ScopeInfo {
  me: {
    philosophyPath: string;
    solutionCount: number;
    ruleCount: number;
  };
  team?: {
    name: string;
    version: string;
    packPath: string;
    solutionCount: number;
    ruleCount: number;
    syncStatus: 'synced' | 'outdated' | 'unknown';
  };
  project: {
    path: string;
    solutionCount: number;
  };
  summary: string;
}

export interface HarnessContext {
  philosophy: Philosophy;
  /** 철학 로드 소스: project(프로젝트별), global(글로벌), default(기본값) */
  philosophySource: 'project' | 'global' | 'default';
  scope: ScopeInfo;
  cwd: string;
  inTmux: boolean;
  /** Philosophy 기반 모델 라우팅 테이블 */
  modelRouting?: Record<string, string[]>;
  /** 신호 기반 하이브리드 라우팅 활성 여부 */
  signalRoutingEnabled?: boolean;
  /** 모델 라우팅 프리셋 (default, cost-saving, max-quality) */
  routingPreset?: string;
}
