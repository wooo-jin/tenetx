#!/usr/bin/env node
/**
 * Tenet — PreToolUse: DB Guard Hook
 *
 * Bash 도구 실행 전 위험한 SQL 명령어를 감지하여 차단 또는 경고합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readStdinJSON } from './shared/read-stdin.js';

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
  { pattern: /DELETE\s+FROM\s+\w+/i, description: 'DELETE FROM (WHERE 절 필요)', severity: 'block' },
  { pattern: /ALTER\s+TABLE\s+\w+\s+DROP\s+COLUMN/i, description: 'ALTER TABLE DROP COLUMN', severity: 'warn' },
  { pattern: /UPDATE\s+\w+\s+SET/i, description: 'UPDATE SET (WHERE 절 필요)', severity: 'warn' },
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

  for (const { pattern, description, severity } of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(command)) {
      // DELETE/UPDATE — SQL 본문에서 WHERE 절이 있으면 통과
      // 주석(-- WHERE, /* WHERE */) 내 WHERE는 제외
      const sqlWithoutComments = command
        .replace(/--[^\n]*/g, '')           // 라인 주석 제거
        .replace(/\/\*[\s\S]*?\*\//g, '');  // 블록 주석 제거
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
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(FAIL_COUNTER_PATH, JSON.stringify({ count, updatedAt: new Date().toISOString() }));
    return count;
  } catch { return 1; }
}

function resetFailCount(): void {
  try { if (fs.existsSync(FAIL_COUNTER_PATH)) fs.unlinkSync(FAIL_COUNTER_PATH); } catch { /* ignore */ }
}

async function main(): Promise<void> {
  const data = await readStdinJSON<PreToolInput>();
  if (!data) {
    const failCount = getAndIncrementFailCount();
    if (failCount >= FAIL_CLOSE_THRESHOLD) {
      console.log(JSON.stringify({ result: 'reject', reason: `[Tenet] DB Guard: stdin 파싱 ${failCount}회 연속 실패 — 안전을 위해 차단합니다.` }));
    } else {
      process.stderr.write(`[ch-hook] db-guard stdin 파싱 실패 (${failCount}/${FAIL_CLOSE_THRESHOLD})\n`);
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
      reason: `[Tenet] 위험 SQL 차단: ${check.description}`,
    }));
    return;
  }
  if (check.action === 'warn') {
    console.log(JSON.stringify({
      result: 'approve',
      message: `<compound-sql-warning>\n[Tenet] ⚠ 위험 SQL 감지: ${check.description}\n확인 후 진행하세요.\n</compound-sql-warning>`,
    }));
    return;
  }

  console.log(JSON.stringify({ result: 'approve' }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'reject', reason: '[Tenet] DB Guard: 내부 오류 — 안전을 위해 차단합니다.' }));
});
