/**
 * 실행 모드 — 철학 원칙에서 파생된 작업 방식
 *
 * normal:         일반 대화형 (기본)
 * autopilot:      5단계 파이프라인 (understand-before-act)
 * ralph:          완료 보장 + verify/fix loop (capitalize-on-failure)
 * team:           전문 에이전트 병렬 분업 (decompose-to-control)
 * ultrawork:      최대 병렬성 버스트 (focus-resources-on-judgment)
 * pipeline:       순차 단계별 처리 (decompose-to-control)
 * ccg:            3-모델 합성 교차검증
 * ralplan:        합의 기반 설계 계획 (understand-before-act)
 * deep-interview: Socratic 요구사항 명확화 (understand-before-act)
 */

export type ExecutionMode =
  | 'normal'
  | 'autopilot'
  | 'ralph'
  | 'team'
  | 'ultrawork'
  | 'pipeline'
  | 'ccg'
  | 'ralplan'
  | 'deep-interview';

export interface ModeConfig {
  name: ExecutionMode;
  description: string;
  claudeArgs: string[];
  envOverrides: Record<string, string>;
  principle: string;
  persistent: boolean;       // 세션 간 상태 유지 여부
  composedOf?: string[];     // 내부적으로 포함하는 다른 모드
}

const MODE_CONFIGS: Record<ExecutionMode, ModeConfig> = {
  normal: {
    name: 'normal',
    description: '일반 대화형 작업',
    claudeArgs: [],
    envOverrides: {},
    principle: '-',
    persistent: false,
  },
  autopilot: {
    name: 'autopilot',
    description: '5단계 자율 실행 (탐색→계획→실행→QA→검증)',
    claudeArgs: ['--allowedTools', 'Edit,Write,Bash,Read,Glob,Grep,Agent'],
    envOverrides: { COMPOUND_MODE: 'autopilot' },
    principle: 'understand-before-act',
    persistent: true,
    composedOf: ['ralph', 'ultrawork'],
  },
  ralph: {
    name: 'ralph',
    description: 'PRD 기반 반복 + verify/fix loop (완료 보장)',
    claudeArgs: [],
    envOverrides: { COMPOUND_MODE: 'ralph' },
    principle: 'capitalize-on-failure',
    persistent: true,
    composedOf: ['ultrawork'],
  },
  team: {
    name: 'team',
    description: '전문 에이전트 단계별 파이프라인 (plan→prd→exec→verify→fix)',
    claudeArgs: [],
    envOverrides: {
      COMPOUND_MODE: 'team',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
    },
    principle: 'decompose-to-control',
    persistent: true,
  },
  ultrawork: {
    name: 'ultrawork',
    description: '최대 병렬성 버스트 (독립 작업 동시 실행)',
    claudeArgs: [],
    envOverrides: { COMPOUND_MODE: 'ultrawork' },
    principle: 'focus-resources-on-judgment',
    persistent: true,
  },
  pipeline: {
    name: 'pipeline',
    description: '순차 단계별 처리 (다단계 변환/마이그레이션)',
    claudeArgs: [],
    envOverrides: { COMPOUND_MODE: 'pipeline' },
    principle: 'decompose-to-control',
    persistent: true,
  },
  ccg: {
    name: 'ccg',
    description: 'Claude-Codex-Gemini 3-모델 합성 교차검증',
    claudeArgs: [],
    envOverrides: { COMPOUND_MODE: 'ccg' },
    principle: 'focus-resources-on-judgment',
    persistent: false,
  },
  ralplan: {
    name: 'ralplan',
    description: '합의 기반 설계 (Planner→Architect→Critic 루프)',
    claudeArgs: [],
    envOverrides: { COMPOUND_MODE: 'ralplan' },
    principle: 'understand-before-act',
    persistent: false,
  },
  'deep-interview': {
    name: 'deep-interview',
    description: 'Socratic 요구사항 명확화 (모호성 점수 기반)',
    claudeArgs: [],
    envOverrides: { COMPOUND_MODE: 'deep-interview' },
    principle: 'understand-before-act',
    persistent: false,
  },
};

/** 모드별 설정 반환 */
export function getModeConfig(mode: ExecutionMode): ModeConfig {
  return MODE_CONFIGS[mode];
}

/** CLI 인자에서 모드 파싱 */
export function parseMode(args: string[]): { mode: ExecutionMode; cleanArgs: string[] } {
  const modeFlags: Record<string, ExecutionMode> = {
    '--autopilot': 'autopilot',
    '--ralph': 'ralph',
    '--team': 'team',
    '--ultrawork': 'ultrawork',
    '--pipeline': 'pipeline',
    '--ccg': 'ccg',
    '--ralplan': 'ralplan',
    '--deep-interview': 'deep-interview',
    '--normal': 'normal',
    '-a': 'autopilot',
    '-r': 'ralph',
    '-t': 'team',
    '-u': 'ultrawork',
    '-p': 'pipeline',
  };

  let mode: ExecutionMode = 'normal';
  const cleanArgs: string[] = [];

  for (const arg of args) {
    if (arg in modeFlags) {
      mode = modeFlags[arg];
    } else {
      cleanArgs.push(arg);
    }
  }

  return { mode, cleanArgs };
}

/** 모든 모드 목록 */
export function listModes(): ModeConfig[] {
  return Object.values(MODE_CONFIGS);
}
