export interface Principle {
  belief: string;
  /**
   * generates 항목 유형:
   * - string: 일반 텍스트 규칙
   * - routing: 모델 라우팅 지시 (예: "explore → Sonnet, implement → Opus")
   * - alert: 경고 메시지 (임계값 초과 시 표시)
   * - step: 단계 설명
   * - hook: @planned — 향후 자동 훅 등록 기능에서 사용 예정. 현재 소비자 없음.
   */
  generates: Array<string | { hook?: string; routing?: string; alert?: string; step?: string }>;
}

export interface Philosophy {
  name: string;
  version: string;
  author: string;
  description?: string;
  /** 중앙 관리 팩에서 상속 (예: "pack:emr-standard") */
  extends?: string;
  principles: Record<string, Principle>;
}

/** 팩이 요구하는 외부 의존성 */
export interface PackRequirement {
  /** MCP 서버 */
  mcpServers?: Array<{
    name: string;
    installCmd?: string;
    npm?: string;
    pip?: string;
    description?: string;
  }>;
  /** CLI 도구 */
  tools?: Array<{
    name: string;
    installCmd?: string;
    description?: string;
  }>;
  /** 환경변수 */
  envVars?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
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
    skills?: number;
    agents?: number;
    workflows?: number;
  };
  /** 팩이 요구하는 외부 의존성 */
  requires?: PackRequirement;
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

/** 태스크 → 추천 모델 라우팅 테이블 */
export interface ModelRoutingTable {
  /** Task type → recommended model */
  routes: Record<string, 'opus' | 'sonnet' | 'haiku'>;
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
