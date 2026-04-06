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

/** ~/.compound/me/ — 개인 공간 */
export const ME_DIR = path.join(COMPOUND_HOME, 'me');

/** ~/.compound/me/philosophy.json — 개인 철학 */
export const ME_PHILOSOPHY = path.join(ME_DIR, 'philosophy.json');

/** ~/.compound/me/solutions/ — 개인 솔루션 */
export const ME_SOLUTIONS = path.join(ME_DIR, 'solutions');

/** ~/.compound/me/behavior/ — 개인 행동 패턴 */
export const ME_BEHAVIOR = path.join(ME_DIR, 'behavior');

/** ~/.compound/me/rules/ — 개인 규칙 */
export const ME_RULES = path.join(ME_DIR, 'rules');

/** ~/.compound/packs/ — 팀 팩 저장소 */
export const PACKS_DIR = path.join(COMPOUND_HOME, 'packs');

/** ~/.compound/state/ — 상태 파일 디렉토리 */
export const STATE_DIR = path.join(COMPOUND_HOME, 'state');

/** ~/.compound/sessions/ — 세션 로그 */
export const SESSIONS_DIR = path.join(COMPOUND_HOME, 'sessions');

/** ~/.compound/config.json — 글로벌 설정 */
export const GLOBAL_CONFIG = path.join(COMPOUND_HOME, 'config.json');

/** ~/.compound/lab/ — Lab 적응형 최적화 엔진 데이터 */
export const LAB_DIR = path.join(COMPOUND_HOME, 'lab');

/** ~/.compound/lab/events.jsonl — Lab 이벤트 로그 (JSONL) */
export const LAB_EVENTS = path.join(LAB_DIR, 'events.jsonl');

/** ~/.compound/me/forge-profile.json — 글로벌 Forge 프로필 */
export const FORGE_PROFILE = path.join(ME_DIR, 'forge-profile.json');

// ── v1 경로 ──

/** ~/.tenetx/me/ — v1 개인 공간 */
export const V1_ME_DIR = path.join(TENETX_HOME, 'me');

/** ~/.tenetx/me/forge-profile.json — v1 Profile */
export const V1_PROFILE = path.join(V1_ME_DIR, 'forge-profile.json');

/** ~/.tenetx/me/rules/ — v1 Rule Store */
export const V1_RULES_DIR = path.join(V1_ME_DIR, 'rules');

/** ~/.tenetx/me/behavior/ — v1 Evidence Store */
export const V1_EVIDENCE_DIR = path.join(V1_ME_DIR, 'behavior');

/** ~/.tenetx/me/recommendations/ — v1 Pack Recommendation */
export const V1_RECOMMENDATIONS_DIR = path.join(V1_ME_DIR, 'recommendations');

/** ~/.tenetx/me/solutions/ — v1 Compound Knowledge */
export const V1_SOLUTIONS_DIR = path.join(V1_ME_DIR, 'solutions');

/** ~/.tenetx/state/ — v1 상태 디렉토리 */
export const V1_STATE_DIR = path.join(TENETX_HOME, 'state');

/** ~/.tenetx/state/sessions/ — v1 Session Effective State */
export const V1_SESSIONS_DIR = path.join(V1_STATE_DIR, 'sessions');

/** ~/.tenetx/state/raw-logs/ — v1 Raw Log */
export const V1_RAW_LOGS_DIR = path.join(V1_STATE_DIR, 'raw-logs');

/** ~/.tenetx/config.json — v1 글로벌 설정 */
export const V1_GLOBAL_CONFIG = path.join(TENETX_HOME, 'config.json');

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
