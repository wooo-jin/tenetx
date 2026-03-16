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
import { debugLog } from '../core/logger.js';
import { readStdinJSON } from './shared/read-stdin.js';
import { recordToolUsage, formatCost, formatTokenCount, cleanStaleUsageFiles } from '../engine/token-tracker.js';
import { runConstraintsOnFile, formatViolations } from '../engine/constraints/constraint-runner.js';

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
}

/** 세션별 파일 경로 */
function getModifiedFilesPath(sessionId: string): string {
  return path.join(STATE_DIR, `modified-files-${sessionId}.json`);
}

/** 수정된 파일 목록 로드 */
function loadModifiedFiles(sessionId: string): ModifiedFilesState {
  try {
    const filePath = getModifiedFilesPath(sessionId);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { sessionId, files: {} };
}

/** 수정된 파일 목록 저장 */
function saveModifiedFiles(state: ModifiedFilesState): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(getModifiedFilesPath(state.sessionId), JSON.stringify(state));
}

/** 에러 패턴 감지 */
export const ERROR_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /ENOENT|no such file/i, description: '파일 없음' },
  { pattern: /EACCES|permission denied/i, description: '권한 없음' },
  { pattern: /ENOSPC|no space left/i, description: '디스크 공간 부족' },
  { pattern: /syntax error|SyntaxError/i, description: '구문 오류' },
  { pattern: /segmentation fault|SIGSEGV/i, description: '세그멘테이션 폴트' },
  { pattern: /out of memory|OOM/i, description: '메모리 부족' },
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
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(CONTEXT_SIGNALS_PATH, JSON.stringify(signals));
  } catch { /* ignore */ }
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

  // 토큰/비용 추적 (모든 도구 호출)
  const messages: string[] = [];
  try {
    const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
    const usage = recordToolUsage(sessionId, inputStr.length, toolResponse.length, data.model_id);

    // 100회마다 오래된 usage 파일 정리 (매 호출 I/O 방지)
    if (usage.toolCalls % 100 === 0) cleanStaleUsageFiles();

    // 50회 호출마다 비용 요약 메시지 수집 (early return 하지 않음)
    if (usage.toolCalls % 50 === 0) {
      const totalTokens = formatTokenCount(usage.inputTokens + usage.outputTokens);
      const cost = formatCost(usage.estimatedCost);
      messages.push(`<compound-cost-info>\n[Tenetx] 세션 토큰 현황: ${totalTokens} (${usage.toolCalls}회 호출), 추정 비용: ${cost}\n</compound-cost-info>`);
    }
  } catch (e) {
    debugLog('post-tool-use', '토큰 추적 실패', e);
  }

  // 파일 변경 추적 (Write, Edit 도구)
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = (toolInput.file_path as string) ?? (toolInput.filePath as string) ?? '';
    if (filePath) {
      try {
        const state = loadModifiedFiles(sessionId);
        const { count } = trackModifiedFile(state, filePath, toolName);
        saveModifiedFiles(state);

        // 같은 파일 5회 이상 수정 시 경고
        if (count >= 5) {
          messages.push(`<compound-tool-warning>\n[Tenetx] ⚠ ${path.basename(filePath)}을 ${count}회 수정했습니다.\n전체 구조를 재설계한 뒤 재시작하는 것을 고려하세요.\n</compound-tool-warning>`);
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
          debugLog('post-tool-use', '제약 검사 실패', ce);
        }
      } catch (e) {
        debugLog('post-tool-use', '파일 변경 추적 실패', e);
      }
    }
  }

  // Bash 도구 실행 결과 에러 감지
  if (toolName === 'Bash' && toolResponse) {
    const errorMatch = detectErrorPattern(toolResponse);
    if (errorMatch) {
      // 컨텍스트 신호에 실패 카운터 기록 (route() 에스컬레이션용)
      incrementFailureCounter(sessionId);
      messages.push(`<compound-tool-info>\n[Tenetx] 실행 결과에 "${errorMatch.description}" 패턴 감지됨. 확인이 필요할 수 있습니다.\n</compound-tool-info>`);
    }
  }

  // 수집된 메시지를 합성하여 출력
  if (messages.length > 0) {
    console.log(JSON.stringify({ result: 'approve', message: messages.join('\n') }));
  } else {
    console.log(JSON.stringify({ result: 'approve' }));
  }
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
