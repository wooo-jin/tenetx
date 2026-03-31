#!/usr/bin/env node
/**
 * Tenetx — PostToolUse Hook
 *
 * 도구 실행 후 결과 검증 + 파일 변경 추적.
 * Compound/workflow 핸들러는 ./post-tool-handlers.ts에 분리.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';

const log = createLogger('post-tool-use');
import { readStdinJSON } from './shared/read-stdin.js';
import { sanitizeId } from './shared/sanitize-id.js';
import { atomicWriteJSON } from './shared/atomic-write.js';
import { recordToolUsage, formatCost, formatTokenCount, cleanStaleUsageFiles, estimateTokens } from '../engine/token-tracker.js';
import { recordTokenUsage as recordLabCost } from '../lab/cost-tracker.js';
import { saveCheckpoint } from './session-recovery.js';
import { trackSessionMetrics } from '../lab/tracker.js';
import { recordWriteContent } from '../engine/prompt-learner.js';
import { incrementWorkflowCounter, checkWorkflowCompletion } from '../engine/workflow-compound.js';
import { incrementFailureCounter, checkCompoundNegative, getCompoundSuccessHint } from './post-tool-handlers.js';
import { isHookEnabled } from './hook-config.js';
import { approve, failOpen } from './shared/hook-response.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');

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

  // 2. Token/cost tracking
  try {
    const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
    const usage = recordToolUsage(sessionId, inputStr, toolResponse, data.model_id);

    try {
      recordLabCost(sessionId, data.model_id ?? 'sonnet', estimateTokens(inputStr), estimateTokens(toolResponse));
    } catch (e) { log.debug('lab cost tracker 기록 실패', e); }

    if (usage.toolCalls % 100 === 0) cleanStaleUsageFiles();

    if (usage.toolCalls % 50 === 0) {
      messages.push(`<compound-cost-info>\n[Tenetx] Session token usage: ${formatTokenCount(usage.inputTokens + usage.outputTokens)} (${usage.toolCalls} calls), estimated cost: ${formatCost(usage.estimatedCost)}\n</compound-cost-info>`);
      try {
        const activeAgents = (() => {
          try {
            const agentsPath = path.join(os.homedir(), '.compound', 'state', `active-agents-${sessionId}.json`);
            if (fs.existsSync(agentsPath)) {
              const agents = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));
              return Array.isArray(agents.agents) ? agents.agents.filter((a: { stoppedAt?: string }) => !a.stoppedAt).length : 0;
            }
          } catch { /* ignore */ }
          return 0;
        })();
        trackSessionMetrics(sessionId, usage.inputTokens, usage.outputTokens, usage.estimatedCost, 0, activeAgents, data.model_id ?? 'unknown');
      } catch { /* non-blocking */ }
    }
  } catch (e) { log.debug('토큰 추적 실패', e); }

  // 3. File change tracking (Write, Edit)
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
    try {
      const fp = String(toolInput.file_path ?? toolInput.filePath ?? '');
      const content = String(toolInput.content ?? toolInput.new_string ?? '');
      if (fp && content) recordWriteContent(fp, content, sessionId);
    } catch (e) { log.debug('write content 기록 실패', e); }
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

  // 6. Workflow counter (non-blocking)
  try {
    incrementWorkflowCounter('toolCall');
    if (modState.toolCallCount % 20 === 0) checkWorkflowCompletion(sessionId);
  } catch (e) { log.debug('workflow counter increment 실패', e); }

  // 7. Compound success hint (non-blocking)
  try {
    const successHint = getCompoundSuccessHint(toolName, toolResponse, sessionId);
    if (successHint) messages.push(successHint);
  } catch (e) { log.debug('success hint generation 실패', e); }

  saveModifiedFiles(modState);

  if (messages.length > 0) {
    console.log(approve(messages.join('\n')));
  } else {
    console.log(approve());
  }
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(failOpen());
});
