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

/** 체크포인트 로드 */
export function loadCheckpoint(sessionId: string): Checkpoint | null {
  try {
    const filePath = path.join(STATE_DIR, `checkpoint-${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Checkpoint;
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
        const data: Checkpoint = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const age = now - new Date(data.timestamp).getTime();
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

const PERSISTENT_MODES = ['ralph', 'autopilot', 'ultrawork', 'team', 'pipeline', 'ccg', 'ralplan', 'deep-interview'];

async function main(): Promise<void> {
  // SessionStart 훅은 stdin으로 세션 정보를 받음
  const chunks: string[] = [];
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    chunks.push(chunk as string);
  }

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
      const state: ModeState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
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
        `\n이전 세션의 ${mode} 모드가 복구되었습니다.` +
        `\n시작: ${state.startedAt} (${elapsedMinutes}분 전)` +
        (state.prompt ? `\n원래 요청: ${state.prompt}` : '') +
        (state.stage ? `\n현재 단계: ${state.stage}` : '') +
        (state.completedSteps?.length ? `\n완료된 단계: ${state.completedSteps.join(', ')}` : '') +
        `\n\n이전 작업을 이어서 진행하세요. 중단하려면 "canceltenetx"를 입력하세요.` +
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
        const cp: Checkpoint = JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), 'utf-8'));
        const age = Date.now() - new Date(cp.timestamp).getTime();
        if (age > 24 * 60 * 60 * 1000) {
          fs.unlinkSync(path.join(STATE_DIR, file));
          continue;
        }
        const elapsedMin = Math.round(age / 60000);
        recoveryMessages.push(
          `<compound-checkpoint session="${cp.sessionId}">` +
          `\n미완료 체크포인트 발견 (${elapsedMin}분 전)` +
          `\n- 수정 파일: ${cp.modifiedFiles.length}개` +
          `\n- 도구 호출: ${cp.toolCallCount}회` +
          `\n- 마지막 도구: ${cp.lastToolCall}` +
          `\n- 작업 디렉토리: ${cp.cwd}` +
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
        `\n이전 세션(${pending.promptCount ?? '?'}회 프롬프트)에서 compound loop가 예약되었습니다.` +
        `\n\`tenetx compound\`를 실행하여 패턴/솔루션을 추출하세요.` +
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
        const content = fs.readFileSync(path.join(handoffDir, latest), 'utf-8');
        recoveryMessages.push(
          `<compound-handoff file="${latest}">\n${content}\n</compound-handoff>`
        );
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
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
