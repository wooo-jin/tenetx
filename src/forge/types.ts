/**
 * Tenetx Forge — Type Definitions
 *
 * ForgeProfile: 개인화 차원 벡터
 * DimensionValue: 0.0~1.0 연속 값
 * ProjectSignals: 프로젝트 스캔 결과
 * ForgeQuestion: 인터뷰 질문 구조
 * DerivedConfig: 프로필에서 파생된 하네스 설정
 */

// ── Dimension Vector ────────────────────────────────

/** 핵심 차원 키 */
export type CoreDimension =
  | 'riskTolerance'
  | 'autonomyPreference'
  | 'qualityFocus'
  | 'abstractionLevel'
  | 'communicationStyle';

/** 차원 값: 0.0 ~ 1.0 */
export type DimensionValue = number;

/** 차원 벡터 */
export type DimensionVector = Record<CoreDimension, DimensionValue> &
  Record<string, DimensionValue>;

/** 차원 메타데이터 */
export interface DimensionMeta {
  key: CoreDimension;
  label: string;
  lowLabel: string;
  highLabel: string;
  description: string;
}

// ── Project Signals ─────────────────────────────────

export interface GitSignals {
  /** 총 커밋 수 */
  totalCommits: number;
  /** 최근 30일 커밋 수 */
  recentCommits: number;
  /** 평균 커밋 메시지 길이 (글자수) */
  avgCommitMsgLength: number;
  /** 브랜치 수 */
  branchCount: number;
  /** 태그 수 */
  tagCount: number;
  /** 기본 브랜치 전략 추정 */
  branchStrategy: 'trunk' | 'gitflow' | 'feature-branch' | 'unknown';
}

export interface DependencySignals {
  /** 의존성 관리 파일 유형 */
  manager: 'npm' | 'yarn' | 'pnpm' | 'go' | 'cargo' | 'pip' | 'none';
  /** 총 의존성 수 */
  totalDeps: number;
  /** 개발 의존성 수 */
  devDeps: number;
  /** 타입 정의 패키지 수 (@types/*) */
  typeDefs: number;
  /** 린터/포매터 존재 */
  hasLinter: boolean;
  hasFormatter: boolean;
  hasTypeChecker: boolean;
}

export interface CodeStyleSignals {
  /** 린터 설정 파일 존재 */
  linterConfig: string[];
  /** 포매터 설정 파일 존재 */
  formatterConfig: string[];
  /** 테스트 패턴 */
  testPattern: 'colocated' | 'separate' | 'both' | 'none';
  /** 테스트 프레임워크 */
  testFramework: string[];
  /** CI 설정 존재 */
  hasCI: boolean;
  /** pre-commit 훅 존재 */
  hasPreCommitHook: boolean;
}

export interface ArchitectureSignals {
  /** 최대 디렉토리 깊이 */
  maxDirDepth: number;
  /** 소스 디렉토리 수 */
  srcDirCount: number;
  /** 문서 존재 */
  hasDocs: boolean;
  /** README 존재 */
  hasReadme: boolean;
  /** CHANGELOG 존재 */
  hasChangelog: boolean;
  /** 모노레포 여부 */
  isMonorepo: boolean;
  /** AST 분석 결과 (ast-grep 사용 가능 시) */
  ast?: {
    /** 함수 수 (AST 정확 측정) */
    functionCount: number;
    /** 클래스 수 */
    classCount: number;
    /** try-catch 블록 수 */
    tryCatchCount: number;
    /** ast-grep 사용 여부 */
    engine: 'ast-grep' | 'regex';
  };
}

/** 프로젝트 스캔 종합 결과 */
export interface ProjectSignals {
  git: GitSignals;
  dependencies: DependencySignals;
  codeStyle: CodeStyleSignals;
  architecture: ArchitectureSignals;
  /** 스캔 시각 (ISO 8601) */
  scannedAt: string;
}

// ── Interview ───────────────────────────────────────

/** 질문 답변 선택지 */
export interface AnswerOption {
  /** 답변 텍스트 */
  text: string;
  /** 차원 조정값 (예: { riskTolerance: -0.15, qualityFocus: 0.1 }) */
  deltas: Partial<Record<CoreDimension, number>>;
}

/** 인터뷰 질문 */
export interface ForgeQuestion {
  /** 고유 ID */
  id: string;
  /** 질문 텍스트 */
  text: string;
  /** 답변 선택지 */
  options: AnswerOption[];
  /** 이 질문이 표시될 조건 (이전 답변/스캔 결과 기반) */
  condition?: (answers: Record<string, number>, signals: ProjectSignals | null) => boolean;
}

// ── Forge Profile ───────────────────────────────────

/** Forge 프로필: 사용자 개인화 벡터 */
export interface ForgeProfile {
  /** 프로필 버전 */
  version: string;
  /** 생성 시각 */
  createdAt: string;
  /** 마지막 수정 시각 */
  updatedAt: string;
  /** 차원 벡터 */
  dimensions: DimensionVector;
  /** 프로젝트 스캔 결과 (마지막 스캔) */
  lastScan: ProjectSignals | null;
  /** 인터뷰 답변 기록 (질문ID -> 선택 인덱스) */
  interviewAnswers: Record<string, number>;
}

// ── Skill Overlay ────────────────────────────────────

/** 스킬 프롬프트 오버레이 */
export interface SkillOverlay {
  skillName: string;
  /** 프롬프트에 삽입할 행동 지시문 */
  behaviorModifiers: string[];
  /** 연속 파라미터 */
  parameters: Record<string, number | string | boolean>;
}

// ── Derived Config ──────────────────────────────────

/** 에이전트 설정 */
export interface AgentConfig {
  /** 에이전트 이름 */
  name: string;
  /** 활성화 여부 */
  enabled: boolean;
  /** 엄격도 (1-5) */
  strictness: number;
}

/** 에이전트 프롬프트 오버레이 */
export interface AgentOverlay {
  agentName: string;
  /** 프롬프트에 삽입할 행동 지시문 */
  behaviorModifiers: string[];
  /** 연속 파라미터 (0-1) */
  parameters: {
    strictness: number;
    verbosity: number;
    autonomy: number;
    depth: number;
  };
}

/** 훅 세부 설정 */
export interface HookTuning {
  hookName: string;
  enabled: boolean;
  parameters: Record<string, number | string | boolean>;
}

/** 프로필 벡터에서 파생된 구체적 하네스 설정 */
export interface DerivedConfig {
  /** 활성화할 에이전트 목록 */
  agents: AgentConfig[];
  /** 훅 심각도 수준 */
  hookSeverity: 'relaxed' | 'balanced' | 'strict';
  /** 모델 라우팅 프리셋 */
  routingPreset: 'cost-saving' | 'default' | 'max-quality';
  /** 철학 원칙 (자동 생성) */
  principles: Record<string, { belief: string; generates: string[] }>;
  /** 커뮤니케이션 상세도 */
  verbosity: 'terse' | 'balanced' | 'verbose';
  /** 에이전트 프롬프트 오버레이 (forge 프로필 기반 행동 조정) */
  agentOverlays: AgentOverlay[];
  /** 스킬 프롬프트 오버레이 (forge 프로필 기반 행동 조정) */
  skillOverlays: SkillOverlay[];
  /** forge 프로필 기반 규칙 파일 */
  tunedRules: Array<{ filename: string; content: string }>;
  /** 훅별 세부 설정 */
  hookTuning: HookTuning[];
}
