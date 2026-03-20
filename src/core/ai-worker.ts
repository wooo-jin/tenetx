/**
 * AI Worker — 크로스AI 워커 관리
 *
 * tmux 또는 child_process로 Gemini/Codex/Claude CLI를 백그라운드 실행.
 * 워커 상태를 ~/.compound/state/workers.json에 저장.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { STATE_DIR } from './paths.js';

export interface AIWorker {
  id: string;
  type: 'gemini' | 'codex' | 'claude';
  pid?: number;
  tmuxPane?: string;
  status: 'running' | 'done' | 'error';
  startedAt: string;
  prompt?: string;
}

export interface WorkerManager {
  spawn(type: AIWorker['type'], prompt: string): Promise<AIWorker>;
  list(): AIWorker[];
  kill(id: string): boolean;
  getOutput(id: string): string | null;
}

const WORKERS_FILE = path.join(STATE_DIR, 'workers.json');
const WORKER_OUTPUT_DIR = path.join(STATE_DIR, 'worker-output');

/** 워커 CLI 커맨드 맵 */
function getWorkerCommand(type: AIWorker['type'], prompt: string): { cmd: string; args: string[] } {
  switch (type) {
    case 'gemini':
      return { cmd: 'gemini', args: [prompt] };
    case 'codex':
      return { cmd: 'codex', args: ['exec', prompt] };
    case 'claude':
      return { cmd: 'claude', args: ['--print', prompt] };
  }
}

/** tmux 사용 가능 여부 확인 */
export function isTmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { stdio: 'pipe' });
    return !!process.env.TMUX;
  } catch {
    return false;
  }
}

/** 워커 상태 파일 로드 */
function loadWorkers(): AIWorker[] {
  try {
    if (!fs.existsSync(WORKERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

/** 워커 상태 파일 저장 (atomic write로 동시접근 안전) */
function saveWorkers(workers: AIWorker[]): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmpFile = `${WORKERS_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, JSON.stringify(workers, null, 2));
  fs.renameSync(tmpFile, WORKERS_FILE);
}

/** PID가 아직 실행 중인지 확인 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 워커 스폰 */
export async function spawnWorker(
  type: AIWorker['type'],
  prompt: string,
): Promise<AIWorker> {
  const id = crypto.randomUUID().slice(0, 8);
  const { cmd, args } = getWorkerCommand(type, prompt);
  const outputFile = path.join(WORKER_OUTPUT_DIR, `${id}.txt`);

  fs.mkdirSync(WORKER_OUTPUT_DIR, { recursive: true });

  const worker: AIWorker = {
    id,
    type,
    status: 'running',
    startedAt: new Date().toISOString(),
    prompt,
  };

  if (isTmuxAvailable()) {
    // tmux 모드: 새 pane에서 실행 (execFileSync로 명령 인젝션 방지)
    const paneName = `tenetx-worker-${id}`;
    try {
      // 워커 스크립트를 셸에 넘기지 않고, 출력 리다이렉션을 위해 sh -c 사용하되
      // 인자를 환경변수로 전달하여 인젝션 방지
      const workerScript = `exec ${cmd} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')} > '${outputFile.replace(/'/g, "'\\''")}' 2>&1`;
      const paneOutput = execFileSync('tmux', [
        'split-window', '-d', '-h', '-P', '-F', '#{pane_id}',
        'sh', '-c', workerScript,
      ], { stdio: 'pipe', encoding: 'utf-8' });
      // 실제 pane ID 저장 (예: %15)
      worker.tmuxPane = paneOutput.trim() || paneName;
    } catch {
      // tmux 실패 시 fallback to child_process
      return spawnWithChildProcess(worker, cmd, args, outputFile);
    }
  } else {
    return spawnWithChildProcess(worker, cmd, args, outputFile);
  }

  const workers = loadWorkers();
  workers.push(worker);
  saveWorkers(workers);
  return worker;
}

/** child_process로 워커 스폰 (tmux 미사용 시) */
function spawnWithChildProcess(
  worker: AIWorker,
  cmd: string,
  args: string[],
  outputFile: string,
): Promise<AIWorker> {
  return new Promise((resolve) => {
    const out = fs.openSync(outputFile, 'w');
    let settled = false;

    const child = spawn(cmd, args, {
      stdio: ['ignore', out, out],
      detached: true,
    });

    worker.pid = child.pid;
    child.unref();

    function finish(): void {
      if (settled) return;
      settled = true;
      const workers = loadWorkers();
      workers.push(worker);
      saveWorkers(workers);
      try { fs.closeSync(out); } catch { /* already closed */ }
      resolve(worker);
    }

    child.on('error', () => {
      worker.status = 'error';
      finish();
    });

    child.on('spawn', () => {
      finish();
    });
  });
}

/** 활성 워커 목록 (상태 동기화 포함) */
export function listWorkers(): AIWorker[] {
  const workers = loadWorkers();
  let changed = false;

  for (const w of workers) {
    if (w.status === 'running' && w.pid) {
      if (!isProcessAlive(w.pid)) {
        w.status = 'done';
        changed = true;
      }
    }
  }

  if (changed) saveWorkers(workers);
  return workers;
}

/** 워커 종료 */
export function killWorker(id: string): boolean {
  const workers = loadWorkers();
  const worker = workers.find(w => w.id === id);
  if (!worker) return false;

  if (worker.pid && isProcessAlive(worker.pid)) {
    try {
      process.kill(worker.pid, 'SIGTERM');
    } catch { /* ignore */ }
  }

  if (worker.tmuxPane) {
    try {
      execFileSync('tmux', ['kill-pane', '-t', worker.tmuxPane], { stdio: 'pipe' });
    } catch { /* ignore */ }
  }

  worker.status = 'done';
  saveWorkers(workers);
  return true;
}

/** 워커 ID 검증 (경로 조작 방지) */
function isValidWorkerId(id: string): boolean {
  return /^[a-f0-9]{8}$/.test(id);
}

/** 워커 출력 조회 */
export function getWorkerOutput(id: string): string | null {
  if (!isValidWorkerId(id)) return null;
  const outputFile = path.resolve(WORKER_OUTPUT_DIR, `${id}.txt`);
  // 경로 탈출 방지
  if (!outputFile.startsWith(path.resolve(WORKER_OUTPUT_DIR))) return null;
  try {
    if (!fs.existsSync(outputFile)) return null;
    return fs.readFileSync(outputFile, 'utf-8');
  } catch {
    return null;
  }
}

/** 완료된 오래된 워커 정리 (24시간+) */
export function cleanOldWorkers(): void {
  const workers = loadWorkers();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const filtered = workers.filter(w => {
    const age = new Date(w.startedAt).getTime();
    if (w.status !== 'running' && age < cutoff) {
      // 출력 파일도 삭제
      const outputFile = path.join(WORKER_OUTPUT_DIR, `${w.id}.txt`);
      try { fs.unlinkSync(outputFile); } catch { /* ignore */ }
      return false;
    }
    return true;
  });
  if (filtered.length !== workers.length) {
    saveWorkers(filtered);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CLI 핸들러
// ────────────────────────────────────────────────────────────────────────────

const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

export async function handleWorker(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'spawn') {
    const type = args[1] as AIWorker['type'];
    if (!type || !['gemini', 'codex', 'claude'].includes(type)) {
      console.error('  Usage: tenetx worker spawn <gemini|codex|claude> "prompt"');
      process.exit(1);
    }
    const prompt = args.slice(2).join(' ');
    if (!prompt) {
      console.error('  Please enter a prompt.');
      process.exit(1);
    }

    const worker = await spawnWorker(type, prompt);
    console.log(`\n  ${GREEN}✓${RST} Worker spawned: ${BOLD}${worker.id}${RST} (${worker.type})`);
    if (worker.pid) console.log(`  PID: ${worker.pid}`);
    console.log(`  Prompt: ${DIM}${prompt.slice(0, 80)}${RST}\n`);
    return;
  }

  if (sub === 'list' || !sub) {
    const workers = listWorkers();
    console.log('\n  Tenetx — AI Workers\n');

    if (workers.length === 0) {
      console.log('  No active workers.');
      console.log(`  ${DIM}tenetx worker spawn <gemini|codex|claude> "prompt"${RST}\n`);
      return;
    }

    for (const w of workers) {
      const statusIcon = w.status === 'running'
        ? `${GREEN}●${RST}`
        : w.status === 'error'
          ? `${RED}●${RST}`
          : `${YELLOW}○${RST}`;
      const pid = w.pid ? ` PID:${w.pid}` : '';
      console.log(`  ${statusIcon} ${BOLD}${w.id}${RST} [${w.type}] ${w.status}${pid}`);
      if (w.prompt) console.log(`    ${DIM}${w.prompt.slice(0, 80)}${RST}`);
    }
    console.log('');
    return;
  }

  if (sub === 'kill') {
    const id = args[1];
    if (!id) {
      console.error('  Usage: tenetx worker kill <id>');
      process.exit(1);
    }
    const success = killWorker(id);
    if (success) {
      console.log(`  ${GREEN}✓${RST} Worker terminated: ${id}`);
    } else {
      console.error(`  ${RED}✗${RST} Worker not found: ${id}`);
      process.exit(1);
    }
    return;
  }

  if (sub === 'output') {
    const id = args[1];
    if (!id) {
      console.error('  Usage: tenetx worker output <id>');
      process.exit(1);
    }
    const output = getWorkerOutput(id);
    if (output === null) {
      console.error(`  ${RED}✗${RST} Output not found: ${id}`);
      process.exit(1);
    } else {
      console.log(output);
    }
    return;
  }

  console.error('  Usage: tenetx worker <spawn|list|kill|output>');
  process.exit(1);
}
