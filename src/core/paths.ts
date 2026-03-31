import * as os from 'node:os';
import * as path from 'node:path';

const HOME = os.homedir();

/** ~/.claude/ — Claude Code 설정 디렉토리 */
export const CLAUDE_DIR = path.join(HOME, '.claude');

/** ~/.claude/settings.json — Claude Code 설정 파일 */
export const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

/** ~/.compound/ — 하네스 홈 디렉토리 */
export const COMPOUND_HOME = path.join(HOME, '.compound');

/** ~/.compound/me/ — 개인 공간 */
export const ME_DIR = path.join(COMPOUND_HOME, 'me');

/** ~/.compound/me/philosophy.json — 개인 철학 */
export const ME_PHILOSOPHY = path.join(ME_DIR, 'philosophy.json');

/** ~/.compound/me/solutions/ — 개인 솔루션 */
export const ME_SOLUTIONS = path.join(ME_DIR, 'solutions');

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

/** 모든 실행 모드 이름 (cancel/recovery 시 사용) */
export const ALL_MODES = [
  'ralph', 'autopilot', 'ultrawork', 'team', 'pipeline',
  'ccg', 'ralplan', 'deep-interview',
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
