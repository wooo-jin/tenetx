#!/usr/bin/env node
/**
 * Tenetx — PostToolUse Hook
 *
 * 도구 실행 후 결과 검증 + 파일 변경 추적.
 * Compound/workflow 핸들러는 ./post-tool-handlers.ts에 분리.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../core/logger.js';

const log = createLogger('post-tool-use');
import { readStdinJSON } from './shared/read-stdin.js';
import { sanitizeId } from './shared/sanitize-id.js';
import { atomicWriteJSON } from './shared/atomic-write.js';
import { saveCheckpoint } from './session-recovery.js';
// v1: recordWriteContent (regex 선호 감지) 제거
import { incrementFailureCounter, checkCompoundNegative, getCompoundSuccessHint } from './post-tool-handlers.js';
import { isHookEnabled } from './hook-config.js';
import { approve, approveWithWarning, failOpen } from './shared/hook-response.js';
import { STATE_DIR } from '../core/paths.js';

// ── Types ──

interface PostToolInput {
  tool_name?: string;
  toolName?: string;
  tool_input?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
  tool_response?: string;
  toolOutput?: string;
  session_id?: string;
  cwd?: string;
  model_id?: string;
}

interface ModifiedFilesState {
  sessionId: string;
  files: Record<string, { count: number; lastModified: string; tool: string }>;
  toolCallCount: number;
}

// ── State management ──

function getModifiedFilesPath(sessionId: string): string {
  return path.join(STATE_DIR, `modified-files-${sanitizeId(sessionId)}.json`);
}

function loadModifiedFiles(sessionId: string): ModifiedFilesState {
  try {
    const filePath = getModifiedFilesPath(sessionId);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) { log.debug('modified files state load failed — starting fresh', e); }
  return { sessionId, files: {}, toolCallCount: 0 };
}

function saveModifiedFiles(state: ModifiedFilesState): void {
  atomicWriteJSON(getModifiedFilesPath(state.sessionId), state);
}

// ── Exported utilities ──

export const ERROR_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /ENOENT|no such file/i, description: 'file not found' },
  { pattern: /EACCES|permission denied/i, description: 'permission denied' },
  { pattern: /ENOSPC|no space left/i, description: 'disk space insufficient' },
  { pattern: /syntax error|SyntaxError/i, description: 'syntax error' },
  { pattern: /segmentation fault|SIGSEGV/i, description: 'segmentation fault' },
  { pattern: /out of memory|OOM/i, description: 'out of memory' },
];

export function detectErrorPattern(text: string): { pattern: RegExp; description: string } | null {
  for (const entry of ERROR_PATTERNS) {
    if (entry.pattern.test(text)) return entry;
  }
  return null;
}

export function trackModifiedFile(
  state: ModifiedFilesState,
  filePath: string,
  toolName: string,
): { state: ModifiedFilesState; count: number } {
  const existing = state.files[filePath];
  const count = (existing?.count ?? 0) + 1;
  state.files[filePath] = {
    count,
    lastModified: new Date().toISOString(),
    tool: toolName,
  };
  return { state, count };
}

// ── Main flow ──

async function main(): Promise<void> {
  const data = await readStdinJSON<PostToolInput>();
  if (!data) {
    console.log(approve());
    return;
  }
  if (!isHookEnabled('post-tool-use')) {
    console.log(approve());
    return;
  }

  const toolName = data.tool_name ?? data.toolName ?? '';
  const toolInput = data.tool_input ?? data.toolInput ?? {};
  const toolResponse = data.tool_response ?? data.toolOutput ?? '';
  const sessionId = data.session_id ?? 'default';

  const modState = loadModifiedFiles(sessionId);
  modState.toolCallCount = (modState.toolCallCount ?? 0) + 1;

  const messages: string[] = [];

  // 1. Checkpoint (every 5 calls)
  if (modState.toolCallCount % 5 === 0) {
    try {
      saveCheckpoint({
        sessionId, mode: 'active',
        modifiedFiles: Object.keys(modState.files),
        lastToolCall: toolName,
        toolCallCount: modState.toolCallCount,
        timestamp: new Date().toISOString(),
        cwd: data.cwd ?? process.env.COMPOUND_CWD ?? process.cwd(),
      });
    } catch (e) { log.debug('체크포인트 저장 실패', e); }
  }

  // 2. File change tracking (Write, Edit)
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = (toolInput.file_path as string) ?? (toolInput.filePath as string) ?? '';
    if (filePath) {
      try {
        const { count } = trackModifiedFile(modState, filePath, toolName);
        if (count >= 5) {
          messages.push(`<compound-tool-warning>\n[Tenetx] ⚠ ${path.basename(filePath)} has been modified ${count} times.\nConsider redesigning the overall structure and restarting.\n</compound-tool-warning>`);
        }
      } catch (e) { log.debug('파일 변경 추적 실패', e); }
    }
    // v1: regex 기반 write content 학습 제거. Evidence 기반으로 전환됨.
  }

  // 4. Bash error detection
  if (toolName === 'Bash' && toolResponse) {
    const errorMatch = detectErrorPattern(toolResponse);
    if (errorMatch) {
      incrementFailureCounter(sessionId);
      messages.push(`<compound-tool-info>\n[Tenetx] Error pattern detected in execution result: "${errorMatch.description}". Review may be needed.\n</compound-tool-info>`);
    }
  }

  // 5. Compound negative signal (non-blocking)
  try { checkCompoundNegative(toolName, toolResponse, sessionId); } catch (e) { log.debug('compound negative check 실패', e); }

  // 6. Compound success hint (non-blocking)
  try {
    const successHint = getCompoundSuccessHint(toolName, toolResponse, sessionId);
    if (successHint) messages.push(successHint);
  } catch (e) { log.debug('success hint generation 실패', e); }

  saveModifiedFiles(modState);

  if (messages.length > 0) {
    console.log(approveWithWarning(messages.join('\n')));
  } else {
    console.log(approve());
  }
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(failOpen());
});
