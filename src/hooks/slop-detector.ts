#!/usr/bin/env node
/**
 * Tenetx — Slop Detector Hook (PostToolUse)
 *
 * Write/Edit 도구 실행 후 결과물에서 AI 슬롭 패턴을 감지합니다.
 * - TODO 주석 잔류, eslint-disable, @ts-expect-error, as any 등
 * - Empty catch blocks, unnecessary comments, console.log debug code
 */

import { readStdinJSON } from './shared/read-stdin.js';
import { debugLog } from '../core/logger.js';

interface PostToolInput {
  tool_name?: string;
  toolName?: string;
  tool_input?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
  tool_response?: string;
  toolOutput?: string;
  session_id?: string;
}

export const SLOP_PATTERNS: Array<{ pattern: RegExp; message: string; severity: 'warn' | 'info' }> = [
  { pattern: /\/\/\s*TODO:?\s*(implement|add|fix|handle)/i, message: 'Leftover TODO comment', severity: 'warn' },
  { pattern: /\/\/\s*eslint-disable/i, message: 'eslint-disable comment', severity: 'warn' },
  { pattern: /\/\/\s*@ts-ignore/i, message: '@ts-ignore comment', severity: 'warn' },
  { pattern: /as\s+any\b/g, message: '"as any" type assertion', severity: 'warn' },
  { pattern: /console\.(log|debug|info)\(/g, message: 'console.log debug code', severity: 'info' },
  { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/m, message: 'Empty catch block', severity: 'warn' },
  { pattern: /\/\*\*[\s\S]*?\*\/\s*\n\s*(\/\*\*[\s\S]*?\*\/)/m, message: 'Duplicate JSDoc', severity: 'info' },
  { pattern: /^\s*\/\/\s*(This|The|We|Here|Note:)\s/m, message: 'Unnecessary explanatory comment', severity: 'info' },
];

/** 텍스트에서 슬롭 패턴을 감지하여 메시지 목록 반환 (순수 함수) */
export function detectSlop(text: string): Array<{ message: string; severity: 'warn' | 'info' }> {
  const found: Array<{ message: string; severity: 'warn' | 'info' }> = [];
  const seen = new Set<string>();

  for (const entry of SLOP_PATTERNS) {
    // RegExp에 g 플래그가 있으면 lastIndex 리셋
    entry.pattern.lastIndex = 0;
    if (entry.pattern.test(text) && !seen.has(entry.message)) {
      seen.add(entry.message);
      found.push({ message: entry.message, severity: entry.severity });
    }
  }

  return found;
}

async function main(): Promise<void> {
  const data = await readStdinJSON<PostToolInput>();
  if (!data) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const toolName = data.tool_name ?? data.toolName ?? '';

  // Write/Edit 도구일 때만 검사
  if (toolName !== 'Write' && toolName !== 'Edit') {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const toolResponse = data.tool_response ?? data.toolOutput ?? '';
  const toolInput = data.tool_input ?? data.toolInput ?? {};

  // 검사 대상: 도구 입력의 content/new_string + 도구 응답
  const textsToCheck: string[] = [];
  if (typeof toolInput.content === 'string') textsToCheck.push(toolInput.content);
  if (typeof toolInput.new_string === 'string') textsToCheck.push(toolInput.new_string);
  if (toolResponse) textsToCheck.push(toolResponse);

  const combined = textsToCheck.join('\n');
  if (!combined) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  try {
    const detected = detectSlop(combined);

    if (detected.length > 0) {
      const lines = detected.map(d => {
        const icon = d.severity === 'warn' ? '⚠' : 'ℹ';
        return `- ${icon} ${d.message}`;
      });
      console.log(JSON.stringify({
        result: 'approve',
        message: `<compound-slop-warning>\n[Tenetx] AI 슬롭 감지:\n${lines.join('\n')}\n정리를 권장합니다.\n</compound-slop-warning>`,
      }));
    } else {
      console.log(JSON.stringify({ result: 'approve' }));
    }
  } catch (e) {
    debugLog('slop-detector', '슬롭 감지 실패', e);
    console.log(JSON.stringify({ result: 'approve' }));
  }
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(JSON.stringify({ result: 'approve' }));
});
