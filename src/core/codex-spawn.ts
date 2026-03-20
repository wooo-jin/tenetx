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

import { execFileSync } from 'node:child_process';
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
  /** 출력 캡처 파일 경로 (captureOutput 옵션 사용 시) */
  outputPath?: string;
  /** 완료 마커 파일 경로 (완료 감지용) */
  markerPath?: string;
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
    return { available: false, reason: 'Codex CLI is not installed (npm i -g @openai/codex)' };
  }

  // 2. 인증 확인 (codex login)
  const codexConfig = loadProviderConfigs().find(c => c.name === 'codex');
  if (codexConfig) {
    const check = checkProviderAvailability(codexConfig);
    if (!check.available) {
      return { available: false, reason: check.reason ?? 'Codex authentication required (codex login)' };
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
    /** true면 Codex 출력을 파일로 캡처 (CCG 합성용) */
    captureOutput?: boolean;
    /** 캡처 완료 후 패널 자동 닫기 대기 시간 (초, 기본 3) */
    autoCloseDelay?: number;
  } = {},
): CodexSpawnResult {
  const {
    cwd = process.cwd(),
    split = 'horizontal',
    sizePercent = 50,
    model,
    captureOutput = false,
    autoCloseDelay = 3,
  } = options;

  // 사전 조건 확인
  if (!isTmux()) {
    return { success: false, error: 'Not inside a tmux session. Please run inside tmux.' };
  }

  const codexCheck = isCodexAvailable();
  if (!codexCheck.available) {
    return { success: false, error: codexCheck.reason };
  }

  // 완료 마커 파일 (Codex 완료 감지용)
  const markerId = `codex-${Date.now()}`;
  const markerPath = path.join(STATE_DIR, `${markerId}.done`);

  // 출력 캡처 파일 (CCG용) — Codex 네이티브 -o 옵션 사용
  const outputPath = captureOutput
    ? path.join(STATE_DIR, `${markerId}.output.md`)
    : undefined;

  // Codex 명령어 인자 배열 구성.
  // execFileSync로 tmux에 직접 인자를 전달하되, tmux 내부에서는 sh -c를 통해 스크립트를 실행.
  // task 문자열은 작은따옴표 이스케이프("'\\''")로 보호됨.
  const codexArgs: string[] = ['exec', '--full-auto'];
  if (model) {
    codexArgs.push('-m', model);
  }
  if (outputPath) {
    codexArgs.push('-o', outputPath);
  }
  codexArgs.push(task);

  // tmux 패널에서 실행할 sh -c 스크립트
  // task는 codexArgs 배열에 별도 인자로 이미 포함되므로
  // 스크립트 내에서는 TENETX_TASK 환경변수를 통해 안전하게 표시
  const taskPreview = task.slice(0, 100).replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  const codexArgsSh = codexArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
  const fullCmd = [
    `cd '${cwd.replace(/'/g, "'\\''")}'`,
    `printf '\\033[1;36m[tenetx] Codex teammate starting\\033[0m\\n'`,
    `printf '\\033[0;33mTask: %s\\033[0m\\n' '${taskPreview}'`,
    `printf '%s\\n' '---'`,
    `codex ${codexArgsSh}`,
    `printf '\\n\\033[1;32m[tenetx] Codex task complete\\033[0m\\n'`,
    `touch '${markerPath}'`,
    `printf 'Closing pane in %ds...\\n' '${autoCloseDelay}'`,
    `sleep ${autoCloseDelay}`,
  ].join(' && ');

  // tmux split
  const splitFlag = split === 'horizontal' ? '-h' : '-v';

  try {
    // execFileSync로 tmux 바이너리에 직접 인자 전달 (Node→tmux 구간은 셸 보간 없음).
    // tmux는 전달받은 'sh', '-c', fullCmd 인자로 내부 셸을 띄우므로
    // fullCmd 안의 task 내용은 작은따옴표 이스케이프로 반드시 보호해야 함.
    const result = execFileSync(
      'tmux',
      ['split-window', splitFlag, '-p', String(sizePercent), '-P', '-F', '#{pane_id}', 'sh', '-c', fullCmd],
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();

    const paneId = result;
    debugLog('codex-spawn', `Codex 패널 스폰: ${paneId}, 작업: ${task.slice(0, 50)}${captureOutput ? ' [캡처 모드]' : ''}`);

    // 상태 저장
    saveSpawnState(paneId, task, cwd);

    return { success: true, paneId, outputPath, markerPath };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugLog('codex-spawn', `tmux split failed: ${msg}`);
    return { success: false, error: `tmux pane split failed: ${msg}` };
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
      const panes = execFileSync('tmux', ['list-panes', '-a', '-F', '#{pane_id}'], { encoding: 'utf-8' });
      panes.trim().split('\n').forEach(p => activePanes.add(p.trim()));
    } catch { /* tmux 없으면 빈 셋 */ }

    return state.spawns.filter(s => activePanes.has(s.paneId));
  } catch {
    return [];
  }
}

/**
 * Codex 스폰 완료를 대기하고 캡처된 출력을 반환
 * CCG 합성 모드에서 사용
 *
 * @param markerPath - 완료 마커 파일 경로
 * @param outputPath - 출력 캡처 파일 경로
 * @param timeoutMs - 최대 대기 시간 (기본 120초)
 * @returns 캡처된 출력 내용, 타임아웃 시 null
 */
export async function waitForCodexOutput(
  markerPath: string,
  outputPath: string,
  timeoutMs = 120_000,
): Promise<string | null> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2초 간격

  while (Date.now() - startTime < timeoutMs) {
    if (fs.existsSync(markerPath)) {
      // 완료됨 — 출력 파일 읽기
      try {
        if (fs.existsSync(outputPath)) {
          return fs.readFileSync(outputPath, 'utf-8');
        }
        return '(no output file)';
      } catch (e) {
        debugLog('codex-spawn', `출력 파일 읽기 실패: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  debugLog('codex-spawn', `Codex 완료 대기 타임아웃 (${timeoutMs}ms)`);
  // 타임아웃이어도 부분 출력 반환 시도
  if (fs.existsSync(outputPath)) {
    try {
      return `${fs.readFileSync(outputPath, 'utf-8')}\n\n(⚠ Timeout — partial output)`;
    } catch { /* ignore */ }
  }
  return null;
}

// ── CLI 핸들러 ──

export async function handleCodexSpawn(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
  tenetx codex-spawn — Spawn Codex in a tmux pane

  Usage:
    tenetx codex-spawn "task description"
    tenetx codex-spawn --status          Check active panes
    tenetx codex-spawn --model o3 "task"  Specify model

  Requirements:
    - Run inside a tmux session
    - Codex CLI installed (npm i -g @openai/codex)
    - Codex authenticated (codex login)
`);
    return;
  }

  if (args.includes('--status')) {
    const active = getActiveCodexPanes();
    if (active.length === 0) {
      console.log('  No active Codex panes');
    } else {
      console.log(`  Active Codex panes (${active.length}):`);
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
    console.log('  A task description is required.');
    return;
  }

  console.log(`\n  Spawning Codex teammate...`);
  const result = spawnCodexPane(task, { model });

  if (result.success) {
    console.log(`  ✓ Codex running in pane ${result.paneId}`);
    console.log(`  Task: ${task.slice(0, 80)}`);
  } else {
    console.log(`  ✗ Failed: ${result.error}`);
  }
}
