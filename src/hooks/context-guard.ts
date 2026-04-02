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
import { fileURLToPath } from 'node:url';
import { createLogger } from '../core/logger.js';
import { readStdinJSON } from './shared/read-stdin.js';
import { atomicWriteJSON } from './shared/atomic-write.js';
import { loadHookConfig, isHookEnabled } from './hook-config.js';
import { approve, approveWithContext, approveWithWarning, failOpen } from './shared/hook-response.js';
import { COMPOUND_HOME, STATE_DIR } from '../core/paths.js';

const log = createLogger('context-guard');
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
  return `<compound-context-warning>\n[Tenetx] Context limit approaching: ${promptCount} prompts, ${Math.round(totalChars / 1000)}K characters.\nIf you have important progress, save it now:\n- Use canceltenetx to reset mode state and start a new session\n- Or continue current work (auto compaction may occur)\n</compound-context-warning>`;
}

function loadContextState(sessionId: string): ContextState {
  try {
    if (fs.existsSync(CONTEXT_STATE_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONTEXT_STATE_PATH, 'utf-8'));
      if (data.sessionId === sessionId) return data;
    }
  } catch (e) { log.debug('context state 파일 읽기/파싱 실패', e); }
  return { promptCount: 0, totalChars: 0, lastWarningAt: 0, sessionId };
}

function saveContextState(state: ContextState): void {
  atomicWriteJSON(CONTEXT_STATE_PATH, state);
}

export async function main(): Promise<void> {
  const input = await readStdinJSON<{ prompt?: string; session_id?: string; stop_hook_type?: string; error?: string }>();
  if (!isHookEnabled('context-guard')) {
    console.log(approve());
    return;
  }
  if (!input) {
    console.log(approve());
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
        console.log(approveWithContext(`[Tenetx] Context limit reached. Current state has been saved to ~/.compound/handoffs/.\nThe previous work will be automatically recovered in the next session.`, 'UserPromptSubmit'));
        return;
      }
    }

    // 정상 종료 시: 의미 있는 세션이었으면 compound 안내
    if (input.stop_hook_type === 'user' || input.stop_hook_type === 'end_turn') {
      const state = loadContextState(sessionId);
      if (state.promptCount >= 10) {
        // 10 프롬프트 이상이면 의미 있는 세션 — compound 안내
        console.log(approveWithWarning(
          `[Tenetx] 이 세션에서 ${state.promptCount}개의 프롬프트를 처리했습니다. /compound 를 실행하면 이 세션의 학습 내용을 축적할 수 있습니다.`
        ));
        return;
      }
    }

    console.log(approve());
    return;
  }

  // error만 있는 경우 (stop_hook_type 없이)
  if (input.error) {
    console.log(approve());
    return;
  }

  // UserPromptSubmit 훅: 대화 길이 추적
  if (input.prompt) {
    const config = loadHookConfig('context-guard');
    // maxTokens가 설정되어 있으면 chars threshold로 사용 (토큰 ≈ 4자 기준 환산)
    const charsThreshold =
      typeof config?.maxTokens === 'number' ? config.maxTokens * 4 : undefined;

    const state = loadContextState(sessionId);
    state.promptCount++;
    state.totalChars += input.prompt.length;

    if (shouldWarn(state, charsThreshold !== undefined ? { charsThreshold } : {})) {
      state.lastWarningAt = Date.now();
      saveContextState(state);
      console.log(approveWithContext(buildContextWarningMessage(state.promptCount, state.totalChars), 'UserPromptSubmit'));
      return;
    }

    saveContextState(state);
  }

  console.log(approve());
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
        } catch (e) { log.debug(`상태 파일 파싱 실패: ${f}`, e); }
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
    'Automatically recovered in the next session (session-recovery hook).',
    'Manual recovery: Check the last state of the previous work and continue from there.',
  ].join('\n');

  fs.writeFileSync(handoffPath, content);
}

// ESM main guard: import 시 main() 실행 방지
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
    console.log(failOpen());
  });
}
