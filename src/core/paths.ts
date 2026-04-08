import * as os from 'node:os';
import * as path from 'node:path';

const HOME = os.homedir();

/** ~/.claude/ — Claude Code 설정 디렉토리 */
export const CLAUDE_DIR = path.join(HOME, '.claude');

/** ~/.claude/settings.json — Claude Code 설정 파일 */
export const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

/** ~/.compound/ — 레거시 하네스 홈 (v1 이전) */
export const COMPOUND_HOME = path.join(HOME, '.compound');

/** ~/.tenetx/ — v1 하네스 홈 디렉토리 */
export const TENETX_HOME = path.join(HOME, '.tenetx');

/** ~/.tenetx/me/ — 개인 공간 (v5.1: ~/.compound/ → ~/.tenetx/ 통합) */
export const ME_DIR = path.join(TENETX_HOME, 'me');

/** ~/.tenetx/me/philosophy.json — 개인 철학 */
export const ME_PHILOSOPHY = path.join(ME_DIR, 'philosophy.json');

/** ~/.tenetx/me/solutions/ — 개인 솔루션 */
export const ME_SOLUTIONS = path.join(ME_DIR, 'solutions');

/** ~/.tenetx/me/behavior/ — 개인 행동 패턴 */
export const ME_BEHAVIOR = path.join(ME_DIR, 'behavior');

/** ~/.tenetx/me/rules/ — 개인 규칙 */
export const ME_RULES = path.join(ME_DIR, 'rules');

/** ~/.tenetx/packs/ — 팀 팩 저장소 */
export const PACKS_DIR = path.join(TENETX_HOME, 'packs');

/** ~/.tenetx/state/ — 상태 파일 디렉토리 */
export const STATE_DIR = path.join(TENETX_HOME, 'state');

/**
 * ~/.tenetx/state/match-eval-log.jsonl — JSONL ranking-decision log for the
 * bootstrap evaluator and offline matcher debugging. Written best-effort by
 * `src/engine/match-eval-log.ts`; never on the hook critical path.
 */
export const MATCH_EVAL_LOG_PATH = path.join(STATE_DIR, 'match-eval-log.jsonl');

/** ~/.tenetx/sessions/ — 세션 로그 */
export const SESSIONS_DIR = path.join(TENETX_HOME, 'sessions');

/** ~/.tenetx/config.json — 글로벌 설정 */
export const GLOBAL_CONFIG = path.join(TENETX_HOME, 'config.json');

/** ~/.tenetx/lab/ — Lab 적응형 최적화 엔진 데이터 */
export const LAB_DIR = path.join(TENETX_HOME, 'lab');

/** ~/.tenetx/lab/events.jsonl — Lab 이벤트 로그 (JSONL) */
export const LAB_EVENTS = path.join(LAB_DIR, 'events.jsonl');

/** ~/.tenetx/me/forge-profile.json — 글로벌 Forge 프로필 */
export const FORGE_PROFILE = path.join(ME_DIR, 'forge-profile.json');

// ── v1 호환 경로 (ME_*와 동일 — 점진 제거 예정) ──

/** @deprecated use ME_DIR */
export const V1_ME_DIR = ME_DIR;

/** @deprecated use FORGE_PROFILE */
export const V1_PROFILE = FORGE_PROFILE;

/** @deprecated use ME_RULES */
export const V1_RULES_DIR = ME_RULES;

/** @deprecated use ME_BEHAVIOR */
export const V1_EVIDENCE_DIR = ME_BEHAVIOR;

/** ~/.tenetx/me/recommendations/ — Pack Recommendation */
export const V1_RECOMMENDATIONS_DIR = path.join(ME_DIR, 'recommendations');

/** @deprecated use ME_SOLUTIONS */
export const V1_SOLUTIONS_DIR = ME_SOLUTIONS;

/** @deprecated use STATE_DIR */
export const V1_STATE_DIR = STATE_DIR;

/** ~/.tenetx/state/sessions/ — Session Effective State */
export const V1_SESSIONS_DIR = path.join(STATE_DIR, 'sessions');

/** ~/.tenetx/state/raw-logs/ — Raw Log */
export const V1_RAW_LOGS_DIR = path.join(STATE_DIR, 'raw-logs');

/** @deprecated use GLOBAL_CONFIG */
export const V1_GLOBAL_CONFIG = GLOBAL_CONFIG;

// ── 레거시 ──

/** 모든 실행 모드 이름 (cancel/recovery 시 사용) */
export const ALL_MODES = [
  'ralph', 'autopilot', 'ultrawork', 'team', 'pipeline',
  'ccg', 'ralplan', 'deep-interview', 'ecomode',
] as const;

/** {repo}/.compound/ — 프로젝트 로컬 디렉토리 */
export function projectDir(cwd: string): string {
  return path.join(cwd, '.compound');
}

/** {repo}/.compound/pack.link — 팀 팩 연결 파일 */
export function packLinkPath(cwd: string): string {
  return path.join(projectDir(cwd), 'pack.link');
}

/** {repo}/.compound/philosophy.json — 프로젝트별 철학 */
export function projectPhilosophyPath(cwd: string): string {
  return path.join(projectDir(cwd), 'philosophy.json');
}

/** {repo}/.compound/forge-profile.json — 프로젝트별 Forge 프로필 */
export function projectForgeProfilePath(cwd: string): string {
  return path.join(projectDir(cwd), 'forge-profile.json');
}
