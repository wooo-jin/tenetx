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
import { debugLog } from '../core/logger.js';

/**
 * Ecomode에서 사용할 Haiku 모델 ID.
 * 모델 출시 시 여기만 업데이트하면 됨.
 * 최종 업데이트: 2026-03-19 (claude-haiku-4-5-20251001)
 */
const ECO_MODEL_ID = 'claude-haiku-4-5-20251001';

export type ExecutionMode =
  | 'normal'
  | 'autopilot'
  | 'ralph'
  | 'team'
  | 'ultrawork'
  | 'pipeline'
  | 'ccg'
  | 'ralplan'
  | 'deep-interview'
  | 'ecomode';

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
  ecomode: {
    name: 'ecomode',
    description: '토큰 절약 모드 (Haiku 우선, 간결한 응답)',
    claudeArgs: ['--model', ECO_MODEL_ID],
    envOverrides: { COMPOUND_MODE: 'ecomode', COMPOUND_ECO: '1' },
    principle: 'focus-resources-on-judgment',
    persistent: false,
  },
};

/** 내장 모드 이름 집합 — 팩 충돌 감지 기준선 */
const BUILTIN_MODE_NAMES = new Set<string>(Object.keys(MODE_CONFIGS));

/** 모드별 설정 반환 (composedOf 병합 없이 원본 반환) */
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
    '--eco': 'ecomode',
    '-a': 'autopilot',
    '-r': 'ralph',
    '-t': 'team',
    '-u': 'ultrawork',
    '-p': 'pipeline',
    '-e': 'ecomode',
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
  const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
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
    } catch { /* 개별 워크플로우 파일 로드 실패는 무시하고 다음 파일 계속 처리 */ }
  }

  return workflows;
}

/** 팩 워크플로우를 런타임 모드에 등록 */
export function registerPackWorkflows(workflows: ModeConfig[]): string[] {
  const skipped: string[] = [];
  for (const wf of workflows) {
    if (BUILTIN_MODE_NAMES.has(wf.name)) {
      // 내장 모드와 충돌 — 등록 스킵
      skipped.push(wf.name);
      debugLog('modes', `팩 워크플로우 "${wf.name}" 내장 모드와 충돌 — 스킵`);
    } else if (wf.name in MODE_CONFIGS) {
      // 팩 간 충돌 — 먼저 등록된 팩이 승리하므로 경고 출력
      skipped.push(wf.name);
      debugLog('modes', `[경고] 팩 워크플로우 이름 충돌: "${wf.name}" — 이미 다른 팩이 등록함. 먼저 등록된 팩이 우선합니다.`);
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

/**
 * composedOf를 재귀적으로 병합한 유효 모드 설정을 반환합니다.
 *
 * 사용 가이드:
 *   - Claude 실행 시 실제 적용할 인자/환경변수가 필요하면 이 함수를 사용하세요.
 *   - 단순 메타데이터(description, principle 등) 조회는 getModeConfig으로 충분합니다.
 *
 * 예시:
 *   const effective = getEffectiveModeConfig('autopilot');
 *   // autopilot + ralph + ultrawork의 claudeArgs/envOverrides가 모두 병합됨
 *
 * 병합 규칙:
 * - claudeArgs: 하위 모드 → 상위 모드 순서로 연결 (상위가 뒤에서 오버라이드)
 * - envOverrides: 하위 모드 → 상위 모드 순서로 Object.assign (상위 우선)
 * - persistent: 하나라도 true면 true
 * - description: "[합성] 원본설명 (포함: 하위모드1, 하위모드2)" 형태로 표시
 *
 * @see resolveComposed — 내부 재귀 병합 구현 (경로 기반 visited로 다이아몬드 의존성 지원)
 */
export function getEffectiveModeConfig(mode: ExecutionMode): ModeConfig {
  const base = MODE_CONFIGS[mode];
  if (!base) {
    throw new Error(`Unknown mode: ${mode}`);
  }
  if (!base.composedOf || base.composedOf.length === 0) {
    return { ...base };
  }

  const visited = new Set<string>();
  const resolved = resolveComposed(base, visited);
  return resolved;
}

function resolveComposed(config: ModeConfig, visited: Set<string>): ModeConfig {
  if (!config.composedOf || config.composedOf.length === 0) {
    return { ...config };
  }

  // 하위 모드들을 재귀적으로 resolve
  let mergedClaudeArgs: string[] = [];
  let mergedEnvOverrides: Record<string, string> = {};
  let mergedPersistent = false;
  const includedNames: string[] = [];

  for (const childName of config.composedOf) {
    if (visited.has(childName)) continue; // 순환 참조(사이클) 방지

    const childConfig = MODE_CONFIGS[childName as ExecutionMode];
    if (!childConfig) continue;

    // 경로 기반 복사: 이 재귀 경로에서만 childName을 방문한 것으로 표시.
    // 전역 visited를 공유하면 다이아몬드 의존성(A→B→D, A→C→D)에서
    // B가 D를 먼저 방문한 뒤 C의 D 방문이 차단되므로 경로별 복사가 필요.
    const pathVisited = new Set([...visited, config.name]);
    const resolved = resolveComposed(childConfig, pathVisited);
    mergedClaudeArgs = [...mergedClaudeArgs, ...resolved.claudeArgs];
    mergedEnvOverrides = { ...mergedEnvOverrides, ...resolved.envOverrides };
    if (resolved.persistent) mergedPersistent = true;
    includedNames.push(childName);
  }

  // 상위 모드가 하위를 오버라이드
  const effectiveClaudeArgs = [...mergedClaudeArgs, ...config.claudeArgs];
  const effectiveEnvOverrides = { ...mergedEnvOverrides, ...config.envOverrides };
  const effectivePersistent = config.persistent || mergedPersistent;

  const composedLabel = includedNames.length > 0
    ? ` (포함: ${includedNames.join(', ')})`
    : '';

  return {
    name: config.name,
    description: `[합성] ${config.description}${composedLabel}`,
    claudeArgs: deduplicateArgs(effectiveClaudeArgs),
    envOverrides: effectiveEnvOverrides,
    principle: config.principle,
    persistent: effectivePersistent,
    composedOf: config.composedOf,
  };
}

/** claudeArgs에서 동일 플래그의 중복을 제거 (뒤에 오는 값이 우선) */
function deduplicateArgs(args: string[]): string[] {
  const flagMap = new Map<string, string | null>();
  const result: string[] = [];

  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith('--')) {
      const flag = args[i];
      // 다음 인자가 값인지 확인 (다음 인자가 --로 시작하지 않으면 값)
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flagMap.set(flag, args[i + 1]);
        i += 2;
      } else {
        flagMap.set(flag, null);
        i += 1;
      }
    } else {
      result.push(args[i]);
      i += 1;
    }
  }

  // flag 순서 유지하며 재구성
  const flagResult: string[] = [];
  for (const [flag, value] of flagMap) {
    flagResult.push(flag);
    if (value !== null) flagResult.push(value);
  }

  return [...flagResult, ...result];
}
