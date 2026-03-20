#!/usr/bin/env node
/**
 * Tenetx — Session Recovery Hook
 *
 * Claude Code SessionStart 훅으로 등록.
 * 이전 세션에서 활성화된 지속 모드(ralph, autopilot, ultrawork)의
 * 상태를 복구하여 작업을 자동 재개합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from '../core/logger.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');

export interface Checkpoint {
  sessionId: string;
  mode: string;
  modifiedFiles: string[];
  lastToolCall: string;
  toolCallCount: number;
  timestamp: string;
  cwd: string;
}

/** 체크포인트 저장 */
export function saveCheckpoint(data: Checkpoint): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const filePath = path.join(STATE_DIR, `checkpoint-${data.sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data));
  } catch (e) {
    debugLog('session-recovery', '체크포인트 저장 실패', e);
  }
}

/** Checkpoint 구조 검증 */
function isValidCheckpoint(data: unknown): data is Checkpoint {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.sessionId === 'string' &&
    typeof d.timestamp === 'string' &&
    typeof d.mode === 'string' &&
    typeof d.cwd === 'string' &&
    Array.isArray(d.modifiedFiles) &&
    typeof d.lastToolCall === 'string' &&
    typeof d.toolCallCount === 'number'
  );
}

/** ModeState 구조 검증 */
function isValidModeState(data: unknown): data is ModeState {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.active === 'boolean' && typeof d.startedAt === 'string';
}

/** 체크포인트 로드 */
export function loadCheckpoint(sessionId: string): Checkpoint | null {
  try {
    const filePath = path.join(STATE_DIR, `checkpoint-${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      const data: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!isValidCheckpoint(data)) {
        debugLog('session-recovery', '체크포인트 구조 검증 실패', { sessionId });
        return null;
      }
      return data;
    }
  } catch (e) {
    debugLog('session-recovery', '체크포인트 로드 실패', e);
  }
  return null;
}

/** 오래된 체크포인트 삭제 */
export function cleanStaleCheckpoints(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  let cleaned = 0;
  try {
    if (!fs.existsSync(STATE_DIR)) return 0;
    const files = fs.readdirSync(STATE_DIR).filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(STATE_DIR, file);
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!isValidCheckpoint(parsed)) {
          // 구조 검증 실패한 파일도 정리
          try { fs.unlinkSync(filePath); cleaned++; } catch { /* ignore */ }
          continue;
        }
        const age = now - new Date(parsed.timestamp).getTime();
        if (age > maxAgeMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {
        // 파싱 실패한 파일도 정리
        try { fs.unlinkSync(filePath); cleaned++; } catch { /* ignore */ }
      }
    }
  } catch (e) {
    debugLog('session-recovery', '스테일 체크포인트 정리 실패', e);
  }
  return cleaned;
}

interface ModeState {
  active: boolean;
  startedAt: string;
  prompt?: string;
  sessionId?: string;
  stage?: string;
  completedSteps?: string[];
}

const PERSISTENT_MODES = ['ralph', 'autopilot', 'ultrawork', 'team', 'pipeline'];

async function main(): Promise<void> {
  // SessionStart 훅은 stdin으로 세션 정보를 받음 (타임아웃 포함)
  const chunks: string[] = [];
  process.stdin.setEncoding('utf-8');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      resolve();
    }, 2000);
    process.stdin.on('data', (chunk) => chunks.push(String(chunk)));
    process.stdin.on('end', () => { clearTimeout(timeout); resolve(); });
  });

  if (!fs.existsSync(STATE_DIR)) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // 활성 모드 찾기
  const recoveryMessages: string[] = [];

  for (const mode of PERSISTENT_MODES) {
    const statePath = path.join(STATE_DIR, `${mode}-state.json`);
    if (!fs.existsSync(statePath)) continue;

    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (!isValidModeState(parsed)) {
        debugLog('session-recovery', `상태 파일 구조 검증 실패: ${mode}`);
        continue;
      }
      const state: ModeState = parsed;
      if (!state.active) continue;

      // 24시간 이상 경과한 상태는 만료
      const startedAt = new Date(state.startedAt).getTime();
      const elapsed = Date.now() - startedAt;
      if (elapsed > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(statePath);
        continue;
      }

      const elapsedMinutes = Math.round(elapsed / 60000);
      recoveryMessages.push(
        `<compound-recovery mode="${mode}">` +
        `\n${mode} mode from previous session has been recovered.` +
        `\nStarted: ${state.startedAt} (${elapsedMinutes} minutes ago)` +
        (state.prompt ? `\nOriginal request: ${state.prompt}` : '') +
        (state.stage ? `\nCurrent stage: ${state.stage}` : '') +
        (state.completedSteps?.length ? `\nCompleted steps: ${state.completedSteps.join(', ')}` : '') +
        `\n\nContinue the previous work. To stop, type "canceltenetx".` +
        `\n</compound-recovery>`
      );
    } catch (e) {
      debugLog('session-recovery', `상태 파일 파싱 실패`, e);
    }
  }

  // 미완료 체크포인트 감지
  try {
    const checkpointFiles = fs.readdirSync(STATE_DIR)
      .filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));
    for (const file of checkpointFiles) {
      try {
        const parsedCp: unknown = JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), 'utf-8'));
        if (!isValidCheckpoint(parsedCp)) {
          debugLog('session-recovery', `체크포인트 파일 구조 검증 실패: ${file}`);
          continue;
        }
        const cp: Checkpoint = parsedCp;
        const age = Date.now() - new Date(cp.timestamp).getTime();
        if (age > 24 * 60 * 60 * 1000) {
          fs.unlinkSync(path.join(STATE_DIR, file));
          continue;
        }
        const elapsedMin = Math.round(age / 60000);
        recoveryMessages.push(
          `<compound-checkpoint session="${cp.sessionId}">` +
          `\nIncomplete checkpoint found (${elapsedMin} minutes ago)` +
          `\n- Modified files: ${cp.modifiedFiles.length}` +
          `\n- Tool calls: ${cp.toolCallCount}` +
          `\n- Last tool: ${cp.lastToolCall}` +
          `\n- Working directory: ${cp.cwd}` +
          `\n</compound-checkpoint>`
        );
      } catch { /* 개별 파일 파싱 실패 무시 */ }
    }
  } catch (e) {
    debugLog('session-recovery', '체크포인트 스캔 실패', e);
  }

  // pending-compound 마커 확인 (이전 세션에서 compound loop 필요 표시)
  const pendingPath = path.join(STATE_DIR, 'pending-compound.json');
  if (fs.existsSync(pendingPath)) {
    try {
      const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
      recoveryMessages.push(
        `<compound-pending>` +
        `\nCompound loop was scheduled in the previous session (${pending.promptCount ?? '?'} prompts).` +
        `\nRun \`tenetx compound\` to extract patterns/solutions.` +
        `\n</compound-pending>`
      );
      // 마커 삭제 (한 번만 안내)
      fs.unlinkSync(pendingPath);
    } catch (e) {
      debugLog('session-recovery', 'pending-compound 마커 읽기 실패', e);
    }
  }

  // 핸드오프 파일 확인
  const handoffDir = path.join(os.homedir(), '.compound', 'handoffs');
  if (fs.existsSync(handoffDir)) {
    try {
      const handoffs = fs.readdirSync(handoffDir)
        .filter(f => f.endsWith('.md'))
        .sort();

      if (handoffs.length > 0) {
        const latest = handoffs[handoffs.length - 1];
        const latestPath = path.join(handoffDir, latest);
        const content = fs.readFileSync(latestPath, 'utf-8');
        recoveryMessages.push(
          `<compound-handoff file="${latest}">\n${content}\n</compound-handoff>`
        );
        // 마커 삭제 (한 번만 안내 — pending-compound.json과 동일 패턴)
        try { fs.unlinkSync(latestPath); } catch (e) { debugLog('session-recovery', 'handoff 파일 삭제 실패', e); }
      }
    } catch (e) { debugLog('session-recovery', 'handoff 파일 읽기 실패', e); }
  }

  if (recoveryMessages.length > 0) {
    console.log(JSON.stringify({
      result: 'approve',
      message: recoveryMessages.join('\n\n'),
    }));
  } else {
    console.log(JSON.stringify({ result: 'approve' }));
  }
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(JSON.stringify({ result: 'approve' }));
});
