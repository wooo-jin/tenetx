#!/usr/bin/env node
/**
 * Tenetx — PreToolUse Hook
 *
 * 도구 실행 전 위험 명령어 차단 및 컨텍스트 리마인더 주입.
 * - rm -rf, git push --force 등 위험 패턴 감지
 * - 활성 모드 상태 리마인더 주입
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';

const log = createLogger('pre-tool-use');
import { HookError } from '../core/errors.js';
import { readStdinJSON } from './shared/read-stdin.js';
import { atomicWriteJSON } from './shared/atomic-write.js';
import { sanitizeId } from './shared/sanitize-id.js';
import { track } from '../lab/tracker.js';

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

/** RegExp 안전성 검증 (ReDoS 방지) — 매칭/비매칭 양쪽 모두 테스트 */
function isSafeRegex(pattern: string, flags: string): boolean {
  try {
    const re = new RegExp(pattern, flags);
    const testStr = 'a'.repeat(25);
    // 매칭 성공 케이스
    let start = Date.now();
    re.test(testStr);
    if (Date.now() - start >= 100) return false;
    // 매칭 실패 케이스 (ReDoS는 주로 여기서 발생)
    start = Date.now();
    re.test(`${testStr}!`);
    return Date.now() - start < 100;
  } catch {
    return false;
  }
}

/** JSON에서 패턴 로드 (패키지 내장 + 사용자 커스텀 병합) */
function loadDangerousPatterns(): DangerousPatternEntry[] {
  const results: DangerousPatternEntry[] = [];

  // 1. 패키지 내장 패턴 (dangerous-patterns.json)
  try {
    const builtinPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dangerous-patterns.json');
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
        if (!isSafeRegex(entry.pattern, entry.flags ?? '')) {
          log.debug(`사용자 커스텀 패턴 건너뜀 (ReDoS 위험): ${entry.description}`);
          continue;
        }
        results.push({
          pattern: new RegExp(entry.pattern, entry.flags ?? ''),
          description: entry.description,
          severity: entry.severity as 'block' | 'warn',
        });
      }
    }
  } catch {
    log.debug('사용자 커스텀 위험 패턴 로드 실패');
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
    let count: number;
    if (fs.existsSync(REMINDER_COUNTER_PATH)) {
      const data = JSON.parse(fs.readFileSync(REMINDER_COUNTER_PATH, 'utf-8'));
      count = (data.count ?? 0) + 1;
    } else {
      // 파일 없음 = 최초 호출: 1부터 시작하여 10번째 호출에 첫 리마인더 표시
      count = 1;
    }
    atomicWriteJSON(REMINDER_COUNTER_PATH, { count });
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
          reminders.push(`[${mode}] mode active`);
        }
      } catch { /* skip corrupt files */ }
    }
  } catch (e) {
    log.debug('상태 디렉토리 읽기 실패', e);
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
    atomicWriteJSON(FAIL_COUNTER_PATH, { count, updatedAt: new Date().toISOString() });
    return count;
  } catch { return 1; }
}

function resetFailCount(): void {
  try { if (fs.existsSync(FAIL_COUNTER_PATH)) fs.unlinkSync(FAIL_COUNTER_PATH); } catch (e) { log.debug('fail counter reset failed — counter stays elevated', e); }
}

/** Compound v3: detect if Edit/Write code reflects injected solution identifiers */
function checkCompoundReflection(toolName: string, toolInput: Record<string, unknown>, sessionId: string): void {
  // Only check Edit and Write tools
  if (toolName !== 'Edit' && toolName !== 'Write') return;

  const code = String(toolInput.new_string ?? toolInput.content ?? '');
  if (!code || code.length < 10) return;

  // Load injection cache
  const cachePath = path.join(STATE_DIR, `injection-cache-${sanitizeId(sessionId)}.json`);
  if (!fs.existsSync(cachePath)) return;

  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    if (!Array.isArray(cache.solutions)) return;

    for (const sol of cache.solutions) {
      if (!Array.isArray(sol.identifiers) || sol.identifiers.length === 0) continue;

      // Require at least 2 identifiers to match, each 6+ chars (reduce false positives)
      // Short identifiers (e.g. "Error", "state") are too common and cause false reflection counts
      const minMatch = Math.min(2, sol.identifiers.length);
      const matchCount = sol.identifiers.filter(
        (id: string) => id.length >= 6 && code.includes(id)
      ).length;

      if (matchCount >= minMatch) {
        track('compound-reflected', sessionId, {
          solutionName: sol.name,
          matchedIdentifiers: matchCount,
          totalIdentifiers: sol.identifiers.length,
        });

        // Update evidence in solution file
        updateSolutionEvidence(sol.name, 'reflected');

        // Update sessions counter once per session per solution
        if (!sol._sessionCounted) {
          updateSolutionEvidence(sol.name, 'sessions');
          sol._sessionCounted = true;
          // Persist the flag back to injection-cache
          atomicWriteJSON(cachePath, cache);
        }
      }
    }
  } catch (e) {
    log.debug('compound reflection 체크 실패', e);
  }
}

/** Update evidence counter in a solution file using parse-modify-serialize (safe approach) */
/** Exported for use by solution-injector */
export function updateSolutionEvidence(solutionName: string, field: 'reflected' | 'negative' | 'injected' | 'sessions' | 'reExtracted'): void {
  try {
    const { parseSolutionV3, serializeSolutionV3 } = require('../engine/solution-format.js') as typeof import('../engine/solution-format.js');
    const solutionDirs = [
      path.join(os.homedir(), '.compound', 'me', 'solutions'),
      path.join(os.homedir(), '.compound', 'me', 'rules'),
    ];

    for (const dir of solutionDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.includes(`name: "${solutionName}"`) && !content.includes(`name: ${solutionName}`)) continue;

        // Found — parse, modify, serialize (safe approach, no regex on content)
        const solution = parseSolutionV3(content);
        if (!solution) return;
        const ev = solution.frontmatter.evidence;
        if (field in ev) {
          (ev as unknown as Record<string, number>)[field] = ((ev as unknown as Record<string, number>)[field] ?? 0) + 1;
        }
        solution.frontmatter.updated = new Date().toISOString().split('T')[0];
        fs.writeFileSync(filePath, serializeSolutionV3(solution), 'utf-8');
        return;
      }
    }
  } catch (e) {
    log.debug(`evidence 업데이트 실패: ${solutionName}`, e);
  }
}

async function main(): Promise<void> {
  const data = await readStdinJSON<PreToolInput>();
  if (!data) {
    // graceful fail-close: consecutive failure counter
    const failCount = getAndIncrementFailCount();
    if (failCount >= FAIL_CLOSE_THRESHOLD) {
      console.log(JSON.stringify({ result: 'reject', reason: `[Tenetx] PreToolUse: stdin parse failed ${failCount} consecutive times — blocking for safety.` }));
    } else {
      process.stderr.write(`[ch-hook] stdin parse failed (${failCount}/${FAIL_CLOSE_THRESHOLD}), approving\n`);
      console.log(JSON.stringify({ result: 'approve', message: `[Tenetx] ⚠ PreToolUse stdin parse failed (${failCount}/${FAIL_CLOSE_THRESHOLD})` }));
    }
    return;
  }
  // 정상 파싱 성공 시 연속 실패 카운터 리셋
  resetFailCount();

  const toolName = data.tool_name ?? data.toolName ?? '';
  const toolInput = data.tool_input ?? data.toolInput ?? {};
  const sessionId = data.session_id ?? 'default';

  // Bash 도구: 위험 명령어 감지
  const check = checkDangerousCommand(toolName, toolInput);
  if (check.action === 'block') {
    console.log(JSON.stringify({
      result: 'reject',
      reason: `[Tenetx] Dangerous command blocked: ${check.description}\nCommand: ${check.command}`,
    }));
    return;
  }
  if (check.action === 'warn') {
    console.log(JSON.stringify({
      result: 'approve',
      message: `<compound-tool-warning>\n[Tenetx] ⚠ Dangerous command detected: ${check.description}\nProceed with caution.\n</compound-tool-warning>`,
    }));
    return;
  }

  // Compound v3: Code Reflection check (non-blocking)
  try { checkCompoundReflection(toolName, toolInput, sessionId); } catch (e) { log.debug('compound reflection check 실패', e); }

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
  const hookErr = new HookError(e instanceof Error ? e.message : String(e), {
    hookName: 'pre-tool-use', eventType: 'PreToolUse', cause: e,
  });
  process.stderr.write(`[ch-hook] ${hookErr.name}: ${hookErr.message}\n`);
  // fail-open: approve on internal error to avoid blocking all tool calls
  console.log(JSON.stringify({ result: 'approve', message: '[Tenetx] PreToolUse: internal error — approving to avoid blocking.' }));
});
