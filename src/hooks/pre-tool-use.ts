#!/usr/bin/env node
/**
 * Tenet — PreToolUse Hook
 *
 * 도구 실행 전 위험 명령어 차단 및 컨텍스트 리마인더 주입.
 * - rm -rf, git push --force 등 위험 패턴 감지
 * - 활성 모드 상태 리마인더 주입
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from '../core/logger.js';
import { readStdinJSON } from './shared/read-stdin.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');
const FAIL_COUNTER_PATH = path.join(STATE_DIR, 'pre-tool-fail-counter.json');
const FAIL_CLOSE_THRESHOLD = 3; // 연속 3회 파싱 실패 시에만 reject

interface PreToolInput {
  tool_name?: string;
  toolName?: string;
  tool_input?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
  session_id?: string;
  cwd?: string;
}

interface DangerousPatternEntry {
  pattern: RegExp;
  description: string;
  severity: 'block' | 'warn';
}

/** JSON에서 패턴 로드 (패키지 내장 + 사용자 커스텀 병합) */
function loadDangerousPatterns(): DangerousPatternEntry[] {
  const results: DangerousPatternEntry[] = [];

  // 1. 패키지 내장 패턴 (dangerous-patterns.json)
  try {
    const builtinPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'dangerous-patterns.json');
    const raw: Array<{ pattern: string; description: string; severity: string; flags?: string }> =
      JSON.parse(fs.readFileSync(builtinPath, 'utf-8'));
    for (const entry of raw) {
      results.push({
        pattern: new RegExp(entry.pattern, entry.flags ?? ''),
        description: entry.description,
        severity: entry.severity as 'block' | 'warn',
      });
    }
  } catch {
    // JSON 로드 실패 시 하드코딩 폴백 (최소 안전장치)
    results.push(
      { pattern: /rm\s+(-rf|-fr)\s+[/~]/, description: 'rm -rf on root/home path', severity: 'block' },
      { pattern: /curl\s+.*\|\s*(ba)?sh/, description: 'curl pipe to shell', severity: 'block' },
      { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, description: 'fork bomb', severity: 'block' },
    );
  }

  // 2. 사용자 커스텀 패턴 (~/.compound/dangerous-patterns.json)
  try {
    const customPath = path.join(os.homedir(), '.compound', 'dangerous-patterns.json');
    if (fs.existsSync(customPath)) {
      const custom: Array<{ pattern: string; description: string; severity: string; flags?: string }> =
        JSON.parse(fs.readFileSync(customPath, 'utf-8'));
      for (const entry of custom) {
        results.push({
          pattern: new RegExp(entry.pattern, entry.flags ?? ''),
          description: entry.description,
          severity: entry.severity as 'block' | 'warn',
        });
      }
    }
  } catch {
    debugLog('pre-tool-use', '사용자 커스텀 위험 패턴 로드 실패');
  }

  return results;
}

/** 위험 Bash 명령어 패턴 (패키지 내장 + 사용자 커스텀 병합) */
export const DANGEROUS_PATTERNS: DangerousPatternEntry[] = loadDangerousPatterns();

const REMINDER_INTERVAL = 10; // 10회 호출당 1회 리마인더
const REMINDER_COUNTER_PATH = path.join(STATE_DIR, 'reminder-counter.json');

/** 위험 명령어 검사 (순수 함수) */
export function checkDangerousCommand(
  toolName: string,
  toolInput: Record<string, unknown> | string,
): { action: 'block' | 'warn' | 'pass'; description?: string; command?: string } {
  if (toolName !== 'Bash') return { action: 'pass' };

  const command = typeof toolInput === 'string'
    ? toolInput
    : (toolInput.command as string ?? '');

  for (const { pattern, description, severity } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { action: severity, description, command: command.slice(0, 100) };
    }
  }
  return { action: 'pass' };
}

/** 카운터 기반 리마인더 표시 여부 판정 (순수 함수 — I/O 없음) */
export function shouldShowReminder(count: number, interval: number = REMINDER_INTERVAL): boolean {
  return count > 0 && count % interval === 0;
}

/** 카운터 기반 리마인더 표시 여부 (I/O 포함 — main에서 사용) */
function shouldShowReminderIO(): boolean {
  try {
    let count = 0;
    if (fs.existsSync(REMINDER_COUNTER_PATH)) {
      const data = JSON.parse(fs.readFileSync(REMINDER_COUNTER_PATH, 'utf-8'));
      count = (data.count ?? 0) + 1;
    }
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(REMINDER_COUNTER_PATH, JSON.stringify({ count }));
    return shouldShowReminder(count);
  } catch {
    return false;
  }
}

/** 활성 모드 상태를 리마인더로 수집 */
function getActiveReminders(): string[] {
  const reminders: string[] = [];

  if (!fs.existsSync(STATE_DIR)) return reminders;

  try {
    for (const f of fs.readdirSync(STATE_DIR)) {
      if (!f.endsWith('-state.json') || f.startsWith('context-guard') || f.startsWith('skill-cache')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf-8'));
        if (data.active) {
          const mode = f.replace('-state.json', '');
          reminders.push(`[${mode}] 모드 활성 중`);
        }
      } catch { /* skip corrupt files */ }
    }
  } catch (e) {
    debugLog('pre-tool-use', '상태 디렉토리 읽기 실패', e);
  }

  return reminders;
}

/** 연속 파싱 실패 카운터 관리 */
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
    // graceful fail-close: 연속 실패 카운터 기반
    const failCount = getAndIncrementFailCount();
    if (failCount >= FAIL_CLOSE_THRESHOLD) {
      console.log(JSON.stringify({ result: 'reject', reason: `[Tenet] PreToolUse: stdin 파싱 ${failCount}회 연속 실패 — 안전을 위해 차단합니다.` }));
    } else {
      process.stderr.write(`[ch-hook] stdin 파싱 실패 (${failCount}/${FAIL_CLOSE_THRESHOLD}), approve로 통과\n`);
      console.log(JSON.stringify({ result: 'approve', message: `[Tenet] ⚠ PreToolUse stdin 파싱 실패 (${failCount}/${FAIL_CLOSE_THRESHOLD})` }));
    }
    return;
  }
  // 정상 파싱 성공 시 연속 실패 카운터 리셋
  resetFailCount();

  const toolName = data.tool_name ?? data.toolName ?? '';
  const toolInput = data.tool_input ?? data.toolInput ?? {};

  // Bash 도구: 위험 명령어 감지
  const check = checkDangerousCommand(toolName, toolInput);
  if (check.action === 'block') {
    console.log(JSON.stringify({
      result: 'reject',
      reason: `[Tenet] 위험 명령어 차단: ${check.description}\n명령어: ${check.command}`,
    }));
    return;
  }
  if (check.action === 'warn') {
    console.log(JSON.stringify({
      result: 'approve',
      message: `<compound-tool-warning>\n[Tenet] ⚠ 위험 명령어 감지: ${check.description}\n확인 후 진행하세요.\n</compound-tool-warning>`,
    }));
    return;
  }

  // 활성 모드 리마인더 (10회 호출당 1회 — 결정적 카운터 기반)
  const reminders = getActiveReminders();
  if (reminders.length > 0 && shouldShowReminderIO()) {
    console.log(JSON.stringify({
      result: 'approve',
      message: `<compound-reminder>\n${reminders.join('\n')}\n</compound-reminder>`,
    }));
    return;
  }

  console.log(JSON.stringify({ result: 'approve' }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  // fail-close: 예외 발생 시 안전하게 차단
  console.log(JSON.stringify({ result: 'reject', reason: '[Tenet] PreToolUse: 내부 오류 — 안전을 위해 차단합니다.' }));
});
