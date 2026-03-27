#!/usr/bin/env node
/**
 * Tenetx — PostToolUse Hook
 *
 * 도구 실행 후 결과 검증 + 파일 변경 추적.
 * - Write/Edit 도구의 파일 변경 기록
 * - 실행 결과의 에러 패턴 감지
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
import { runConstraintsOnFile, formatViolations } from '../engine/constraints/constraint-runner.js';
import { saveCheckpoint } from './session-recovery.js';
import { track, trackSessionMetrics } from '../lab/tracker.js';
import { recordWriteContent } from '../engine/prompt-learner.js';
import { incrementWorkflowCounter, checkWorkflowCompletion } from '../engine/workflow-compound.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');

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

/** 세션별 파일 경로 */
function getModifiedFilesPath(sessionId: string): string {
  return path.join(STATE_DIR, `modified-files-${sanitizeId(sessionId)}.json`);
}

/** 수정된 파일 목록 로드 */
function loadModifiedFiles(sessionId: string): ModifiedFilesState {
  try {
    const filePath = getModifiedFilesPath(sessionId);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) { log.debug('modified files state load failed — starting fresh', e); }
  return { sessionId, files: {}, toolCallCount: 0 };
}

/** 수정된 파일 목록 저장 */
function saveModifiedFiles(state: ModifiedFilesState): void {
  atomicWriteJSON(getModifiedFilesPath(state.sessionId), state);
}

/** 에러 패턴 감지 */
export const ERROR_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /ENOENT|no such file/i, description: 'file not found' },
  { pattern: /EACCES|permission denied/i, description: 'permission denied' },
  { pattern: /ENOSPC|no space left/i, description: 'disk space insufficient' },
  { pattern: /syntax error|SyntaxError/i, description: 'syntax error' },
  { pattern: /segmentation fault|SIGSEGV/i, description: 'segmentation fault' },
  { pattern: /out of memory|OOM/i, description: 'out of memory' },
];

/** 에러 패턴 감지 (순수 함수) */
export function detectErrorPattern(text: string): { pattern: RegExp; description: string } | null {
  for (const entry of ERROR_PATTERNS) {
    if (entry.pattern.test(text)) return entry;
  }
  return null;
}

/** 파일 수정 추적 상태 업데이트 (순수 함수 — state 객체를 변이하여 반환) */
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

const CONTEXT_SIGNALS_PATH = path.join(STATE_DIR, 'context-signals.json');

/** 세션의 실패 카운터 증가 (컨텍스트 신호 수집) */
function incrementFailureCounter(sessionId: string): void {
  try {
    let signals: Record<string, unknown> = {};
    if (fs.existsSync(CONTEXT_SIGNALS_PATH)) {
      signals = JSON.parse(fs.readFileSync(CONTEXT_SIGNALS_PATH, 'utf-8'));
      if (signals.sessionId !== sessionId) signals = {};
    }
    signals.sessionId = sessionId;
    signals.previousFailures = ((signals.previousFailures as number) ?? 0) + 1;
    signals.updatedAt = new Date().toISOString();
    atomicWriteJSON(CONTEXT_SIGNALS_PATH, signals);
  } catch (e) { log.debug('context signals write failed — failure count may be lost', e); }
}

/** Compound v3: detect negative signals after tool execution */
function checkCompoundNegative(toolName: string, toolResponse: string, sessionId: string): void {
  // Only check Bash tool responses for errors
  if (toolName !== 'Bash') return;
  if (!toolResponse || toolResponse.length < 5) return;

  // Check for build/test failure patterns
  const negativePatterns = [
    /error\s*TS\d+/i,           // TypeScript errors
    /BUILD FAILED/i,
    /test.*fail/i,
    /FAIL\s+tests?\//i,         // Vitest/Jest test failures
    /npm ERR!/i,
    /exit code [1-9]/i,
    /compilation error/i,
    /SyntaxError/i,
  ];

  const isNegative = negativePatterns.some(p => p.test(toolResponse));
  if (!isNegative) return;

  // Load injection cache to find recently injected solutions
  const cachePath = path.join(STATE_DIR, `injection-cache-${sanitizeId(sessionId)}.json`);
  if (!fs.existsSync(cachePath)) return;

  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    if (!Array.isArray(cache.solutions)) return;

    // Only attribute to experiment solutions (verified+ are trusted)
    const experiments = cache.solutions.filter((s: { status: string }) => s.status === 'experiment');
    for (const sol of experiments) {
      // Only attribute if error output is related to this solution
      const allTerms = [...(sol.identifiers ?? []), ...(sol.tags ?? [])].filter((t: string) => t.length >= 4);
      const isRelated = allTerms.length === 0 || allTerms.some((term: string) => toolResponse.toLowerCase().includes(term.toLowerCase()));
      if (!isRelated) continue;

      track('compound-negative', sessionId, {
        solutionName: sol.name,
        signal: 'build-or-test-failure',
        toolResponse: toolResponse.slice(0, 200),
      });

      // Update evidence.negative in solution file
      updateNegativeEvidence(sol.name);
    }
  } catch (e) {
    log.debug('compound negative 체크 실패', e);
  }
}

/** Compound v3: Micro-extraction — detect success moments and return hint */
function getCompoundSuccessHint(toolName: string, toolResponse: string, sessionId: string): string {
  if (toolName !== 'Bash' || !toolResponse) return '';
  if (detectErrorPattern(toolResponse)) return '';

  const hints: string[] = [];

  if (/\d+\s*(passed|tests?\s*passed)|all\s*tests?\s*pass/i.test(toolResponse) && !/fail|error/i.test(toolResponse)) {
    hints.push('Tests passed — record effective patterns with /compound');
  }
  if (/build\s*(succeeded|success|done)|compiled?\s*successfully/i.test(toolResponse)) {
    hints.push('Build success — record implementation patterns with /compound');
  }

  // Error resolution detection: had previous failures, now succeeding
  try {
    if (fs.existsSync(CONTEXT_SIGNALS_PATH)) {
      const signals = JSON.parse(fs.readFileSync(CONTEXT_SIGNALS_PATH, 'utf-8'));
      if (signals.sessionId === sessionId && ((signals.previousFailures as number) ?? 0) >= 2) {
        hints.push('Error resolved after multiple failures — record the root cause and fix with /compound');
        signals.previousFailures = 0;
        atomicWriteJSON(CONTEXT_SIGNALS_PATH, signals);
      }
    }
  } catch (e) { log.debug('error resolution detection failed', e); }

  if (hints.length === 0) return '';
  return `<compound-success-hint>\n${hints.map(h => `- ${h}`).join('\n')}\n</compound-success-hint>`;
}

/** Update negative evidence counter in solution file */
function updateNegativeEvidence(solutionName: string): void {
  try {
    const { parseSolutionV3, serializeSolutionV3 } = require('../engine/solution-format.js') as typeof import('../engine/solution-format.js');
    const dirs = [
      path.join(os.homedir(), '.compound', 'me', 'solutions'),
      path.join(os.homedir(), '.compound', 'me', 'rules'),
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.includes(`name: "${solutionName}"`) && !content.includes(`name: ${solutionName}`)) continue;

        const solution = parseSolutionV3(content);
        if (!solution) return;
        solution.frontmatter.evidence.negative += 1;
        solution.frontmatter.updated = new Date().toISOString().split('T')[0];
        fs.writeFileSync(filePath, serializeSolutionV3(solution), 'utf-8');
        return;
      }
    }
  } catch (e) {
    log.debug(`negative evidence 업데이트 실패: ${solutionName}`, e);
  }
}

async function main(): Promise<void> {
  const data = await readStdinJSON<PostToolInput>();
  if (!data) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const toolName = data.tool_name ?? data.toolName ?? '';
  const toolInput = data.tool_input ?? data.toolInput ?? {};
  const toolResponse = data.tool_response ?? data.toolOutput ?? '';
  const sessionId = data.session_id ?? 'default';

  // 도구 호출 카운터 추적 + 체크포인트
  const modState = loadModifiedFiles(sessionId);
  modState.toolCallCount = (modState.toolCallCount ?? 0) + 1;

  const messages: string[] = [];

  // 5번째 도구 호출마다 체크포인트 자동 저장
  if (modState.toolCallCount % 5 === 0) {
    try {
      saveCheckpoint({
        sessionId,
        mode: 'active',
        modifiedFiles: Object.keys(modState.files),
        lastToolCall: toolName,
        toolCallCount: modState.toolCallCount,
        timestamp: new Date().toISOString(),
        cwd: data.cwd ?? process.env.COMPOUND_CWD ?? process.cwd(),
      });
    } catch (e) {
      log.debug('체크포인트 저장 실패', e);
    }
  }

  // 토큰/비용 추적 (모든 도구 호출)
  try {
    const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
    const usage = recordToolUsage(sessionId, inputStr, toolResponse, data.model_id);

    // Lab cost tracker에도 기록 (모델별 정밀 비용 추적)
    try {
      const modelKey = data.model_id ?? 'sonnet';
      const inTok = estimateTokens(inputStr);
      const outTok = estimateTokens(toolResponse);
      recordLabCost(sessionId, modelKey, inTok, outTok);
    } catch (e) { log.debug('lab cost tracker 기록 실패 — 모델별 비용 통계 누락', e); }

    // 100회마다 오래된 usage 파일 정리 (매 호출 I/O 방지)
    if (usage.toolCalls % 100 === 0) cleanStaleUsageFiles();

    // 50회 호출마다 비용 요약 메시지 수집 (early return 하지 않음)
    if (usage.toolCalls % 50 === 0) {
      const totalTokens = formatTokenCount(usage.inputTokens + usage.outputTokens);
      const cost = formatCost(usage.estimatedCost);
      messages.push(`<compound-cost-info>\n[Tenetx] Session token usage: ${totalTokens} (${usage.toolCalls} calls), estimated cost: ${cost}\n</compound-cost-info>`);
      // Lab 세션 메트릭 스냅샷 기록 (50 tool calls 단위)
      try {
        const activeAgents = (() => {
          try {
            const agentsPath = require('node:path').join(require('node:os').homedir(), '.compound', 'state', `active-agents-${sessionId}.json`);
            if (require('node:fs').existsSync(agentsPath)) {
              const agents = JSON.parse(require('node:fs').readFileSync(agentsPath, 'utf-8'));
              return Array.isArray(agents.agents) ? agents.agents.filter((a: { stoppedAt?: string }) => !a.stoppedAt).length : 0;
            }
          } catch { /* ignore */ }
          return 0;
        })();
        trackSessionMetrics(sessionId, usage.inputTokens, usage.outputTokens, usage.estimatedCost, 0, activeAgents, data.model_id ?? 'unknown');
      } catch { /* non-blocking */ }
    }
  } catch (e) {
    log.debug('토큰 추적 실패', e);
  }

  // 파일 변경 추적 (Write, Edit 도구)
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = (toolInput.file_path as string) ?? (toolInput.filePath as string) ?? '';
    if (filePath) {
      try {
        const { count } = trackModifiedFile(modState, filePath, toolName);

        // 같은 파일 5회 이상 수정 시 경고
        if (count >= 5) {
          messages.push(`<compound-tool-warning>\n[Tenetx] ⚠ ${path.basename(filePath)} has been modified ${count} times.\nConsider redesigning the overall structure and restarting.\n</compound-tool-warning>`);
        }

        // 아키텍처 제약 검사 (constraints.json 있을 때만)
        const effectiveCwd = data.cwd ?? process.env.COMPOUND_CWD ?? process.cwd();
        try {
          const constraintResult = runConstraintsOnFile(filePath, effectiveCwd);
          if (constraintResult.violations.length > 0) {
            const formatted = formatViolations(constraintResult.violations);
            messages.push(`<compound-constraint-violation>\n${formatted}\n</compound-constraint-violation>`);
          }
        } catch (ce) {
          log.debug('제약 검사 실패', ce);
        }
      } catch (e) {
        log.debug('파일 변경 추적 실패', e);
      }
    }

    // Record write content for non-developer pattern learning (non-blocking)
    try {
      const fp = String(toolInput.file_path ?? toolInput.filePath ?? '');
      const content = String(toolInput.content ?? toolInput.new_string ?? '');
      if (fp && content) recordWriteContent(fp, content, sessionId);
    } catch (e) { log.debug('write content 기록 실패 — pattern learning 누락', e); }
  }

  // Bash 도구 실행 결과 에러 감지
  if (toolName === 'Bash' && toolResponse) {
    const errorMatch = detectErrorPattern(toolResponse);
    if (errorMatch) {
      // 컨텍스트 신호에 실패 카운터 기록 (route() 에스컬레이션용)
      incrementFailureCounter(sessionId);
      messages.push(`<compound-tool-info>\n[Tenetx] Error pattern detected in execution result: "${errorMatch.description}". Review may be needed.\n</compound-tool-info>`);
    }
  }

  // Compound v3: Negative signal check (non-blocking)
  try { checkCompoundNegative(toolName, toolResponse, sessionId); } catch (e) { log.debug('compound negative check 실패', e); }

  // Workflow-compound integration: track tool calls and check completion
  try {
    incrementWorkflowCounter('toolCall');
    // Check for workflow completion every 20 tool calls
    if (modState.toolCallCount % 20 === 0) {
      checkWorkflowCompletion(sessionId);
    }
  } catch (e) { log.debug('workflow counter increment 실패', e); }

  // Compound v3: Micro-extraction hints on success moments (non-blocking)
  try {
    const successHint = getCompoundSuccessHint(toolName, toolResponse, sessionId);
    if (successHint) messages.push(successHint);
  } catch (e) { log.debug('success hint generation 실패', e); }

  // 상태 저장 (toolCallCount 포함)
  saveModifiedFiles(modState);

  // 수집된 메시지를 합성하여 출력
  if (messages.length > 0) {
    console.log(JSON.stringify({ result: 'approve', message: messages.join('\n') }));
  } else {
    console.log(JSON.stringify({ result: 'approve' }));
  }
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(JSON.stringify({ result: 'approve' }));
});
