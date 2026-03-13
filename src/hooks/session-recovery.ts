#!/usr/bin/env node
/**
 * Tenet — Session Recovery Hook
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
        `\n\n이전 작업을 이어서 진행하세요. 중단하려면 "canceltenet"를 입력하세요.` +
        `\n</compound-recovery>`
      );
    } catch (e) {
      debugLog('session-recovery', `상태 파일 파싱 실패`, e);
    }
  }

  // pending-compound 마커 확인 (이전 세션에서 compound loop 필요 표시)
  const pendingPath = path.join(STATE_DIR, 'pending-compound.json');
  if (fs.existsSync(pendingPath)) {
    try {
      const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
      recoveryMessages.push(
        `<compound-pending>` +
        `\n이전 세션(${pending.promptCount ?? '?'}회 프롬프트)에서 compound loop가 예약되었습니다.` +
        `\n\`tenet compound\`를 실행하여 패턴/솔루션을 추출하세요.` +
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
