/**
 * Tenetx — Codex Tmux Spawner
 *
 * Codex CLI를 tmux 분할 패널에 자율 실행합니다.
 * Claude와 Codex가 각자 독립적인 작업을 병렬 수행합니다.
 *
 * 사용 시나리오:
 *   - /tenetx:team에서 독립 태스크를 Codex에 위임
 *   - tenetx codex-spawn "작업 설명" 으로 직접 스폰
 */

import { execSync, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from './logger.js';
import { checkProviderAvailability, loadProviderConfigs } from '../engine/provider.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');
const CODEX_STATE_PATH = path.join(STATE_DIR, 'codex-spawns.json');

export interface CodexSpawnResult {
  success: boolean;
  paneId?: string;
  error?: string;
}

interface CodexSpawnState {
  spawns: Array<{
    paneId: string;
    task: string;
    cwd: string;
    startedAt: string;
    status: 'running' | 'done' | 'unknown';
  }>;
}

/** tmux 환경 여부 확인 */
export function isTmux(): boolean {
  return !!process.env.TMUX;
}

/** Codex CLI 사용 가능 여부 확인 */
export function isCodexAvailable(): { available: boolean; reason?: string } {
  // 1. codex CLI 존재 확인
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(whichCmd, ['codex'], { encoding: 'utf-8', timeout: 3000 });
  } catch {
    return { available: false, reason: 'Codex CLI가 설치되어 있지 않습니다 (npm i -g @openai/codex)' };
  }

  // 2. 인증 확인 (codex login)
  const codexConfig = loadProviderConfigs().find(c => c.name === 'codex');
  if (codexConfig) {
    const check = checkProviderAvailability(codexConfig);
    if (!check.available) {
      return { available: false, reason: check.reason ?? 'Codex 인증 필요 (codex login)' };
    }
  }

  return { available: true };
}

/**
 * Codex를 tmux 분할 패널에 스폰
 *
 * @param task - Codex에게 전달할 작업 설명
 * @param options - 스폰 옵션
 * @returns 스폰 결과
 */
export function spawnCodexPane(
  task: string,
  options: {
    cwd?: string;
    split?: 'horizontal' | 'vertical';
    sizePercent?: number;
    model?: string;
  } = {},
): CodexSpawnResult {
  const {
    cwd = process.cwd(),
    split = 'horizontal',
    sizePercent = 50,
    model,
  } = options;

  // 사전 조건 확인
  if (!isTmux()) {
    return { success: false, error: 'tmux 세션이 아닙니다. tmux 안에서 실행해주세요.' };
  }

  const codexCheck = isCodexAvailable();
  if (!codexCheck.available) {
    return { success: false, error: codexCheck.reason };
  }

  // Codex 명령어 구성
  const escapedTask = task.replace(/'/g, "'\\''");
  const modelArg = model ? ` -c model="${model}"` : '';
  const codexCmd = `codex exec --full-auto${modelArg} '${escapedTask}'`;

  // 완료 마커 파일 (Codex 완료 감지용)
  const markerId = `codex-${Date.now()}`;
  const markerPath = path.join(STATE_DIR, `${markerId}.done`);

  // tmux 패널에서 실행할 전체 명령어
  // Codex 실행 → 완료 시 마커 생성 → 3초 대기 후 패널 닫기
  const fullCmd = [
    `cd '${cwd.replace(/'/g, "'\\''")}'`,
    `echo '\\033[1;36m[tenetx] Codex 팀원 시작\\033[0m'`,
    `echo '\\033[0;33m작업: ${escapedTask.slice(0, 100)}\\033[0m'`,
    `echo '---'`,
    codexCmd,
    `echo '\\n\\033[1;32m[tenetx] Codex 작업 완료\\033[0m'`,
    `touch '${markerPath}'`,
    `echo '3초 후 패널을 닫습니다...'`,
    `sleep 3`,
  ].join(' && ');

  // tmux split
  const splitFlag = split === 'horizontal' ? '-h' : '-v';

  try {
    const result = execSync(
      `tmux split-window ${splitFlag} -p ${sizePercent} -P -F "#{pane_id}" '${fullCmd.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();

    const paneId = result;
    debugLog('codex-spawn', `Codex 패널 스폰: ${paneId}, 작업: ${task.slice(0, 50)}`);

    // 상태 저장
    saveSpawnState(paneId, task, cwd);

    return { success: true, paneId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugLog('codex-spawn', `tmux split 실패: ${msg}`);
    return { success: false, error: `tmux 패널 분할 실패: ${msg}` };
  }
}

/**
 * 여러 작업을 Codex 패널에 분배
 * 2개 이상이면 세로로 쌓기
 */
export function spawnMultipleCodexPanes(
  tasks: Array<{ task: string; cwd?: string; model?: string }>,
): CodexSpawnResult[] {
  const results: CodexSpawnResult[] = [];
  const maxPanes = 3; // 최대 3개 패널 (화면 한계)

  for (let i = 0; i < Math.min(tasks.length, maxPanes); i++) {
    const { task, cwd, model } = tasks[i];
    const result = spawnCodexPane(task, {
      cwd,
      model,
      split: i === 0 ? 'horizontal' : 'vertical',
      sizePercent: i === 0 ? 50 : Math.floor(100 / (tasks.length - i + 1)),
    });
    results.push(result);

    if (!result.success) break;
  }

  if (tasks.length > maxPanes) {
    debugLog('codex-spawn', `작업 ${tasks.length}개 중 ${maxPanes}개만 패널로 스폰 (화면 한계)`);
  }

  return results;
}

/** 스폰 상태 저장 */
function saveSpawnState(paneId: string, task: string, cwd: string): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  let state: CodexSpawnState = { spawns: [] };
  try {
    if (fs.existsSync(CODEX_STATE_PATH)) {
      state = JSON.parse(fs.readFileSync(CODEX_STATE_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }

  state.spawns.push({
    paneId,
    task: task.slice(0, 200),
    cwd,
    startedAt: new Date().toISOString(),
    status: 'running',
  });

  // 최근 20개만 유지
  if (state.spawns.length > 20) {
    state.spawns = state.spawns.slice(-20);
  }

  fs.writeFileSync(CODEX_STATE_PATH, JSON.stringify(state, null, 2));
}

/** 활성 Codex 패널 목록 조회 */
export function getActiveCodexPanes(): CodexSpawnState['spawns'] {
  try {
    if (!fs.existsSync(CODEX_STATE_PATH)) return [];
    const state: CodexSpawnState = JSON.parse(fs.readFileSync(CODEX_STATE_PATH, 'utf-8'));

    // tmux에 실제로 살아있는 패널만 필터
    const activePanes = new Set<string>();
    try {
      const panes = execSync('tmux list-panes -a -F "#{pane_id}"', { encoding: 'utf-8' });
      panes.trim().split('\n').forEach(p => activePanes.add(p.trim()));
    } catch { /* tmux 없으면 빈 셋 */ }

    return state.spawns.filter(s => activePanes.has(s.paneId));
  } catch {
    return [];
  }
}

// ── CLI 핸들러 ──

export async function handleCodexSpawn(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
  tenetx codex-spawn — Codex를 tmux 패널에 스폰

  사용법:
    tenetx codex-spawn "작업 설명"
    tenetx codex-spawn --status          활성 패널 확인
    tenetx codex-spawn --model o3 "작업"  모델 지정

  요구사항:
    - tmux 세션 안에서 실행
    - Codex CLI 설치 (npm i -g @openai/codex)
    - Codex 인증 (codex login)
`);
    return;
  }

  if (args.includes('--status')) {
    const active = getActiveCodexPanes();
    if (active.length === 0) {
      console.log('  활성 Codex 패널 없음');
    } else {
      console.log(`  활성 Codex 패널 ${active.length}개:`);
      for (const s of active) {
        console.log(`    ${s.paneId} — ${s.task.slice(0, 60)} (${s.startedAt})`);
      }
    }
    return;
  }

  // 모델 파싱
  let model: string | undefined;
  const modelIdx = args.indexOf('--model');
  if (modelIdx !== -1 && args[modelIdx + 1]) {
    model = args[modelIdx + 1];
    args.splice(modelIdx, 2);
  }

  const task = args.filter(a => !a.startsWith('--')).join(' ');
  if (!task) {
    console.log('  작업 설명이 필요합니다.');
    return;
  }

  console.log(`\n  Codex 팀원 스폰 중...`);
  const result = spawnCodexPane(task, { model });

  if (result.success) {
    console.log(`  ✓ 패널 ${result.paneId} 에서 Codex 실행 중`);
    console.log(`  작업: ${task.slice(0, 80)}`);
  } else {
    console.log(`  ✗ 실패: ${result.error}`);
  }
}
