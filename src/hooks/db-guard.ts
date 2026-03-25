#!/usr/bin/env node
/**
 * Tenetx — PreToolUse: DB Guard Hook
 *
 * Bash 도구 실행 전 위험한 SQL 명령어를 감지하여 차단 또는 경고합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readStdinJSON } from './shared/read-stdin.js';
import { atomicWriteJSON } from './shared/atomic-write.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');
const FAIL_COUNTER_PATH = path.join(STATE_DIR, 'db-guard-fail-counter.json');
const FAIL_CLOSE_THRESHOLD = 3;

interface PreToolInput {
  tool_name?: string;
  toolName?: string;
  tool_input?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
}

export interface SqlPattern {
  pattern: RegExp;
  description: string;
  severity: 'block' | 'warn';
}

export const DANGEROUS_SQL_PATTERNS: SqlPattern[] = [
  { pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/i, description: 'DROP TABLE/DATABASE/SCHEMA', severity: 'block' },
  { pattern: /TRUNCATE\s+TABLE/i, description: 'TRUNCATE TABLE', severity: 'block' },
  { pattern: /DELETE\s+FROM\s+\w+/i, description: 'DELETE FROM (WHERE clause required)', severity: 'block' },
  { pattern: /ALTER\s+TABLE\s+\w+\s+DROP\s+COLUMN/i, description: 'ALTER TABLE DROP COLUMN', severity: 'warn' },
  { pattern: /UPDATE\s+\w+\s+SET/i, description: 'UPDATE SET (WHERE clause required)', severity: 'warn' },
];

/** SQL 명령어 위험도 검사 (순수 함수) */
export function checkDangerousSql(
  toolName: string,
  toolInput: Record<string, unknown> | string,
): { action: 'block' | 'warn' | 'pass'; description?: string } {
  if (toolName !== 'Bash') return { action: 'pass' };

  const command = typeof toolInput === 'string'
    ? toolInput
    : (toolInput.command as string ?? '');

  // 주석 제거 후 SQL에 대해 패턴 매칭 (주석 안 키워드 오차단 방지)
  const sqlWithoutComments = command
    .replace(/--[^\n]*/g, '')           // 라인 주석 제거
    .replace(/\/\*[\s\S]*?\*\//g, '');  // 블록 주석 제거

  for (const { pattern, description, severity } of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(sqlWithoutComments)) {
      // DELETE/UPDATE — SQL 본문에서 WHERE 절이 있으면 통과
      if (/DELETE\s+FROM/i.test(sqlWithoutComments) && /\bWHERE\s+/i.test(sqlWithoutComments)) continue;
      if (/UPDATE\s+\w+\s+SET/i.test(sqlWithoutComments) && /\bWHERE\s+/i.test(sqlWithoutComments)) continue;
      return { action: severity, description };
    }
  }
  return { action: 'pass' };
}

/** 연속 파싱 실패 카운터 */
function getAndIncrementFailCount(): number {
  try {
    let count = 0;
    if (fs.existsSync(FAIL_COUNTER_PATH)) {
      const data = JSON.parse(fs.readFileSync(FAIL_COUNTER_PATH, 'utf-8'));
      count = (data.count ?? 0) + 1;
    } else {
      count = 1;
    }
    atomicWriteJSON(FAIL_COUNTER_PATH, { count, updatedAt: new Date().toISOString() });
    return count;
  } catch { return 1; }
}

function resetFailCount(): void {
  try { if (fs.existsSync(FAIL_COUNTER_PATH)) fs.unlinkSync(FAIL_COUNTER_PATH); } catch { /* fail counter reset failed — counter stays elevated but next parse success resets it */ }
}

async function main(): Promise<void> {
  const data = await readStdinJSON<PreToolInput>();
  if (!data) {
    const failCount = getAndIncrementFailCount();
    if (failCount >= FAIL_CLOSE_THRESHOLD) {
      console.log(JSON.stringify({ result: 'reject', reason: `[Tenetx] DB Guard: stdin parse failed ${failCount} consecutive times — blocking for safety.` }));
    } else {
      process.stderr.write(`[ch-hook] db-guard stdin parse failed (${failCount}/${FAIL_CLOSE_THRESHOLD})\n`);
      console.log(JSON.stringify({ result: 'approve' }));
    }
    return;
  }
  resetFailCount();

  const toolName = data.tool_name ?? data.toolName ?? '';
  const toolInput = data.tool_input ?? data.toolInput ?? {};

  const check = checkDangerousSql(toolName, toolInput);
  if (check.action === 'block') {
    console.log(JSON.stringify({
      result: 'reject',
      reason: `[Tenetx] Dangerous SQL blocked: ${check.description}`,
    }));
    return;
  }
  if (check.action === 'warn') {
    console.log(JSON.stringify({
      result: 'approve',
      message: `<compound-sql-warning>\n[Tenetx] ⚠ Dangerous SQL detected: ${check.description}\nProceed with caution.\n</compound-sql-warning>`,
    }));
    return;
  }

  console.log(JSON.stringify({ result: 'approve' }));
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] DB Guard error: ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(JSON.stringify({ result: 'approve', message: '[Tenetx] DB Guard: internal error — approving to avoid blocking.' }));
});
