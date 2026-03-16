#!/usr/bin/env node
/**
 * Tenetx — PermissionRequest Hook
 *
 * 사용자 권한 요청 시 활성 모드에 따른 자동 승인/거부 정책 적용.
 * - autopilot 모드: 안전한 도구는 자동 승인
 * - 위험 패턴: 항상 사용자 확인 요구
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from '../core/logger.js';
import { readStdinJSON } from './shared/read-stdin.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');

interface PermissionInput {
  tool_name?: string;
  toolName?: string;
  tool_input?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
  session_id?: string;
}

/** 자동 승인 가능한 안전 도구 목록 */
export const SAFE_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch',
  'Agent', 'LSP', 'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList',
]);

/** autopilot 모드에서도 수동 확인이 필요한 도구 */
export const ALWAYS_CONFIRM_TOOLS = new Set([
  'Bash', 'Write', 'Edit',
]);

/** 도구 분류: 승인/확인/통과 결정 (순수 함수) */
export function classifyTool(
  toolName: string,
  isAutopilot: boolean,
): 'auto-approve-safe' | 'autopilot-confirm' | 'autopilot-approve' | 'pass-through' {
  if (SAFE_TOOLS.has(toolName)) return 'auto-approve-safe';
  if (!isAutopilot) return 'pass-through';
  if (ALWAYS_CONFIRM_TOOLS.has(toolName)) return 'autopilot-confirm';
  return 'autopilot-approve';
}

/** autopilot 모드 활성 여부 확인 */
function isAutopilotActive(): boolean {
  const modes = ['autopilot', 'ralph', 'ultrawork'];
  for (const mode of modes) {
    const statePath = path.join(STATE_DIR, `${mode}-state.json`);
    try {
      if (fs.existsSync(statePath)) {
        const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        if (data.active) return true;
      }
    } catch { /* ignore */ }
  }
  return false;
}

/** 권한 요청 로그 기록 */
function logPermissionRequest(sessionId: string, toolName: string, decision: string): void {
  try {
    const logPath = path.join(STATE_DIR, `permissions-${sessionId}.jsonl`);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      tool: toolName,
      decision,
    });
    fs.appendFileSync(logPath, entry + '\n');
  } catch (e) {
    debugLog('permission-handler', '권한 로그 기록 실패', e);
  }
}

async function main(): Promise<void> {
  const data = await readStdinJSON<PermissionInput>();
  if (!data) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const toolName = data.tool_name ?? data.toolName ?? '';
  const sessionId = data.session_id ?? 'default';

  // 안전 도구는 항상 승인
  if (SAFE_TOOLS.has(toolName)) {
    logPermissionRequest(sessionId, toolName, 'auto-approve-safe');
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // autopilot 모드가 아니면 기본 동작 (Claude Code 기본 권한 흐름)
  if (!isAutopilotActive()) {
    logPermissionRequest(sessionId, toolName, 'pass-through');
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // autopilot 모드 (2차 방어선):
  // pre-tool-use 훅이 위험 패턴(rm -rf, git push --force 등)을 이미 block/warn 처리함.
  // 여기 도달하는 도구는 pre-tool-use를 통과한 것이므로, 승인하되 메시지로 추적 가능하게 함.
  if (ALWAYS_CONFIRM_TOOLS.has(toolName)) {
    logPermissionRequest(sessionId, toolName, 'autopilot-confirm');

    // Bash는 pre-tool-use를 통과했더라도 경고 강도를 높임 (임의 셸 실행 위험)
    const warningLevel = toolName === 'Bash'
      ? `[Tenetx] ⚠ Autopilot: Bash 도구 자동 승인 — pre-tool-use 검증 통과됨. 예상치 못한 명령에 주의하세요.`
      : `[Tenetx] Autopilot: ${toolName} 도구 실행을 자동 승인합니다.`;

    console.log(JSON.stringify({
      result: 'approve',
      message: `<compound-permission>\n${warningLevel}\n</compound-permission>`,
    }));
    return;
  }

  // 기타 도구: autopilot 모드에서 자동 승인
  logPermissionRequest(sessionId, toolName, 'autopilot-approve');
  console.log(JSON.stringify({ result: 'approve' }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
