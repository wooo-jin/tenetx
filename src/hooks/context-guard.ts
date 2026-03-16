#!/usr/bin/env node
/**
 * Tenetx — Context Guard Hook
 *
 * Claude Code Stop 훅으로 등록.
 * context window limit, edit error 등 실행 중 에러를 감지하여
 * 사용자에게 경고하고 상태를 보존합니다.
 *
 * 또한 UserPromptSubmit에서 현재 대화 길이를 추적하여
 * context 한계에 접근 시 preemptive 경고를 제공합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from '../core/logger.js';
import { readStdinJSON } from './shared/read-stdin.js';

const COMPOUND_HOME = path.join(os.homedir(), '.compound');
const STATE_DIR = path.join(COMPOUND_HOME, 'state');
const CONTEXT_STATE_PATH = path.join(STATE_DIR, 'context-guard.json');

interface ContextState {
  promptCount: number;
  totalChars: number;
  lastWarningAt: number;
  sessionId: string;
}

// 경고 임계값: 프롬프트 50회 또는 총 문자 수 200K 이상
const PROMPT_WARNING_THRESHOLD = 50;
const CHARS_WARNING_THRESHOLD = 200_000;
const WARNING_COOLDOWN_MS = 10 * 60 * 1000; // 10분 쿨다운

/** 경고 표시 여부 판정 (순수 함수) */
export function shouldWarn(
  contextPercent: { promptCount: number; totalChars: number; lastWarningAt: number },
  thresholds: { promptThreshold?: number; charsThreshold?: number; cooldownMs?: number } = {},
): boolean {
  const promptThreshold = thresholds.promptThreshold ?? PROMPT_WARNING_THRESHOLD;
  const charsThreshold = thresholds.charsThreshold ?? CHARS_WARNING_THRESHOLD;
  const cooldownMs = thresholds.cooldownMs ?? WARNING_COOLDOWN_MS;
  const now = Date.now();
  return (
    (contextPercent.promptCount >= promptThreshold || contextPercent.totalChars >= charsThreshold) &&
    (now - contextPercent.lastWarningAt > cooldownMs)
  );
}

/** 경고 메시지 생성 (순수 함수) */
export function buildContextWarningMessage(promptCount: number, totalChars: number): string {
  return `<compound-context-warning>\n[Tenetx] Context 한계 접근 경고: ${promptCount}회 프롬프트, ${Math.round(totalChars / 1000)}K 문자.\n중요한 진행 상황이 있다면 지금 저장하세요:\n- canceltenetx로 모드 상태 초기화 후 새 세션 시작\n- 또는 현재 작업 계속 진행 (자동 compaction 발생 가능)\n</compound-context-warning>`;
}

function loadContextState(sessionId: string): ContextState {
  try {
    if (fs.existsSync(CONTEXT_STATE_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONTEXT_STATE_PATH, 'utf-8'));
      if (data.sessionId === sessionId) return data;
    }
  } catch (e) { debugLog('context-guard', 'context state 파일 읽기/파싱 실패', e); }
  return { promptCount: 0, totalChars: 0, lastWarningAt: 0, sessionId };
}

function saveContextState(state: ContextState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(CONTEXT_STATE_PATH, JSON.stringify(state));
}

async function main(): Promise<void> {
  const input = await readStdinJSON<{ prompt?: string; session_id?: string; stop_hook_type?: string; error?: string }>();
  if (!input) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const sessionId = input.session_id ?? 'default';

  // Stop 훅: stop_hook_type이 있으면 처리
  if (input.stop_hook_type) {
    // 에러가 포함된 경우: context limit 감지
    if (input.error) {
      const errorMsg = input.error;
      if (/context.*limit|token.*limit|conversation.*too.*long/i.test(errorMsg)) {
        saveHandoff(sessionId, 'context-limit', errorMsg);
        console.log(JSON.stringify({
          result: 'approve',
          message: `[Tenetx] Context limit에 도달했습니다. 현재 상태가 ~/.compound/handoffs/에 저장되었습니다.\n새 세션에서 이전 작업을 자동으로 복구합니다.`,
        }));
        return;
      }
    }

    // 정상 종료 시 compound loop 마커 생성 (옵트인)
    if (input.stop_hook_type === 'user' || input.stop_hook_type === 'end_turn') {
      if (process.env.COMPOUND_AUTO_COMPOUND === '1') {
        markPendingCompound(sessionId);
      }
    }

    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // error만 있는 경우 (stop_hook_type 없이)
  if (input.error) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // UserPromptSubmit 훅: 대화 길이 추적
  if (input.prompt) {
    const state = loadContextState(sessionId);
    state.promptCount++;
    state.totalChars += input.prompt.length;

    if (shouldWarn(state)) {
      state.lastWarningAt = Date.now();
      saveContextState(state);
      console.log(JSON.stringify({
        result: 'approve',
        message: buildContextWarningMessage(state.promptCount, state.totalChars),
      }));
      return;
    }

    saveContextState(state);
  }

  console.log(JSON.stringify({ result: 'approve' }));
}

/** 세션 종료 후 compound loop 실행이 필요함을 마킹 */
function markPendingCompound(sessionId: string): void {
  try {
    // 세션이 5분 이상이었는지 확인 (context state의 promptCount로 추정)
    const state = loadContextState(sessionId);
    if (state.promptCount < 5) return; // 너무 짧은 세션은 건너뛰기

    const markerPath = path.join(STATE_DIR, 'pending-compound.json');
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify({
      sessionId,
      promptCount: state.promptCount,
      timestamp: new Date().toISOString(),
    }));
  } catch (e) {
    debugLog('context-guard', 'pending-compound 마커 생성 실패', e);
  }
}

function saveHandoff(sessionId: string, reason: string, detail: string): void {
  const handoffDir = path.join(COMPOUND_HOME, 'handoffs');
  fs.mkdirSync(handoffDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const handoffPath = path.join(handoffDir, `${timestamp}-${reason}.md`);

  // 활성 모드 상태 수집
  const stateDir = path.join(COMPOUND_HOME, 'state');
  const activeStates: string[] = [];
  if (fs.existsSync(stateDir)) {
    for (const f of fs.readdirSync(stateDir)) {
      if (f.endsWith('-state.json') && !f.startsWith('skill-cache-') && !f.startsWith('context-guard')) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(stateDir, f), 'utf-8'));
          if (data.active) {
            activeStates.push(`- ${f.replace('-state.json', '')}: ${data.prompt ?? 'no prompt'}`);
          }
        } catch (e) { debugLog('context-guard', `상태 파일 파싱 실패: ${f}`, e); }
      }
    }
  }

  const content = [
    `# Handoff: ${reason}`,
    `- Session: ${sessionId}`,
    `- Time: ${new Date().toISOString()}`,
    `- Reason: ${detail}`,
    '',
    '## Active Modes',
    activeStates.length > 0 ? activeStates.join('\n') : '- none',
    '',
    '## Recovery Instructions',
    '새 세션에서 자동으로 복구됩니다 (session-recovery 훅).',
    '수동 복구: 이전 작업의 마지막 상태를 확인하고 이어서 진행하세요.',
  ].join('\n');

  fs.writeFileSync(handoffPath, content);
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
