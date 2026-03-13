#!/usr/bin/env node
/**
 * Tenet — PostToolUseFailure Hook
 *
 * 도구 실행 실패 시 자동 복구 안내 + 실패 패턴 분석.
 * - 반복 실패 감지 (같은 도구 3회 이상)
 * - 실패 원인별 복구 제안
 * - 컨텍스트 신호에 실패 카운터 기록
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
// debugLog는 향후 확장용으로 import 유지 가능하지만, 현재 미사용
import { readStdinJSON } from './shared/read-stdin.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');

interface FailureInput {
  tool_name?: string;
  toolName?: string;
  error?: string;
  tool_input?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
  session_id?: string;
}

interface FailureState {
  sessionId: string;
  failures: Record<string, { count: number; lastError: string; lastAt: string }>;
}

function getFailureStatePath(sessionId: string): string {
  return path.join(STATE_DIR, `tool-failures-${sessionId}.json`);
}

function loadFailureState(sessionId: string): FailureState {
  const p = getFailureStatePath(sessionId);
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data.sessionId === sessionId) return data;
    }
  } catch { /* ignore */ }
  return { sessionId, failures: {} };
}

function saveFailureState(state: FailureState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(getFailureStatePath(state.sessionId), JSON.stringify(state));
}

/** 실패 카운터 증가 (context-signals.json) */
function incrementFailureSignal(sessionId: string): void {
  const signalsPath = path.join(STATE_DIR, 'context-signals.json');
  try {
    let signals: Record<string, unknown> = {};
    if (fs.existsSync(signalsPath)) {
      signals = JSON.parse(fs.readFileSync(signalsPath, 'utf-8'));
      if (signals.sessionId !== sessionId) signals = {};
    }
    signals.sessionId = sessionId;
    signals.previousFailures = ((signals.previousFailures as number) ?? 0) + 1;
    signals.updatedAt = new Date().toISOString();
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(signalsPath, JSON.stringify(signals));
  } catch { /* ignore */ }
}

/** 에러 메시지 기반 복구 제안 */
function getRecoverySuggestion(error: string, toolName: string): string {
  const lower = error.toLowerCase();

  if (/timeout|timed out/.test(lower)) {
    return '타임아웃 발생. 더 작은 단위로 나누어 실행하세요.';
  }
  if (/enoent|no such file|not found/.test(lower)) {
    return '파일/경로가 존재하지 않습니다. 경로를 확인하세요.';
  }
  if (/eacces|permission denied/.test(lower)) {
    return '권한이 없습니다. 파일 권한을 확인하세요.';
  }
  if (/syntax error|syntaxerror/.test(lower)) {
    return '구문 오류입니다. 코드를 다시 확인하세요.';
  }
  if (/enospc|no space/.test(lower)) {
    return '디스크 공간이 부족합니다.';
  }
  if (/old_string.*not found|not unique/i.test(lower)) {
    return 'Edit 도구의 old_string이 파일에서 찾을 수 없습니다. Read로 현재 파일 내용을 확인한 후 다시 시도하세요.';
  }

  return `${toolName} 도구 실패. 다른 접근 방식을 시도하세요.`;
}

async function main(): Promise<void> {
  const data = await readStdinJSON<FailureInput>();
  if (!data) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const toolName = data.tool_name ?? data.toolName ?? 'Unknown';
  const error = data.error ?? '';
  const sessionId = data.session_id ?? 'default';

  // 실패 카운터 업데이트
  const state = loadFailureState(sessionId);
  if (!state.failures[toolName]) {
    state.failures[toolName] = { count: 0, lastError: '', lastAt: '' };
  }
  state.failures[toolName].count += 1;
  state.failures[toolName].lastError = error.slice(0, 200);
  state.failures[toolName].lastAt = new Date().toISOString();
  saveFailureState(state);

  // 컨텍스트 신호 업데이트
  incrementFailureSignal(sessionId);

  const failCount = state.failures[toolName].count;
  const suggestion = getRecoverySuggestion(error, toolName);

  // 3회 이상 반복 실패 시 강화된 경고
  if (failCount >= 3) {
    console.log(JSON.stringify({
      result: 'approve',
      message: `<compound-failure-warning>\n[Tenet] ⚠ ${toolName} 도구가 세션 내 ${failCount}회 실패했습니다.\n복구 제안: ${suggestion}\n다른 접근 방식을 시도하거나, 문제를 분석한 후 재시도하세요.\n</compound-failure-warning>`,
    }));
    return;
  }

  // 일반 실패 안내
  console.log(JSON.stringify({
    result: 'approve',
    message: `<compound-failure-info>\n[Tenet] ${toolName} 실패 (${failCount}회). ${suggestion}\n</compound-failure-info>`,
  }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
