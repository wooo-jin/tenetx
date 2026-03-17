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

import * as fs from 'node:fs';
import * as path from 'node:path';

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

/** CLI 인자에서 모드 파싱 (내장 + 팩 워크플로우 동적 플래그) */
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

  // 동적 등록된 팩 워크플로우도 --{name} 플래그로 사용 가능
  for (const key of Object.keys(MODE_CONFIGS)) {
    const flag = `--${key}`;
    if (!(flag in modeFlags)) {
      modeFlags[flag] = key as ExecutionMode;
    }
  }

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

/** 팩에서 커스텀 워크플로우 로드 */
export function loadPackWorkflows(packDir: string): ModeConfig[] {
  const workflowsDir = path.join(packDir, 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];

  const workflows: ModeConfig[] = [];
  try {
    const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(workflowsDir, file), 'utf-8');
      const def = JSON.parse(raw) as Partial<ModeConfig>;
      if (!def.name || !def.description) continue;

      workflows.push({
        name: def.name as ExecutionMode,
        description: def.description,
        claudeArgs: def.claudeArgs ?? [],
        envOverrides: {
          COMPOUND_MODE: def.name,
          ...(def.envOverrides ?? {}),
        },
        principle: def.principle ?? '-',
        persistent: def.persistent ?? false,
        composedOf: def.composedOf,
      });
    }
  } catch { /* 워크플로우 로드 실패는 무시 */ }

  return workflows;
}

/** 팩 워크플로우를 런타임 모드에 등록 */
export function registerPackWorkflows(workflows: ModeConfig[]): string[] {
  const skipped: string[] = [];
  for (const wf of workflows) {
    if (wf.name in MODE_CONFIGS) {
      skipped.push(wf.name);
    } else {
      (MODE_CONFIGS as Record<string, ModeConfig>)[wf.name] = wf;
    }
  }
  return skipped;
}

/** 모든 모드 목록 (내장 + 팩 워크플로우) */
export function listModes(): ModeConfig[] {
  return Object.values(MODE_CONFIGS);
}
