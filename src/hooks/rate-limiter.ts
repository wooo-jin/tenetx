#!/usr/bin/env node
/**
 * Tenetx — PreToolUse: Rate Limiter Hook
 *
 * MCP 도구 호출 빈도를 제한하여 남용을 방지합니다.
 * 기본 제한: 30회/분
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readStdinJSON } from './shared/read-stdin.js';
import { atomicWriteJSON } from './shared/atomic-write.js';
import { isHookEnabled } from './hook-config.js';
import { approve, deny, failOpen } from './shared/hook-response.js';
import { STATE_DIR } from '../core/paths.js';
const RATE_LIMIT_PATH = path.join(STATE_DIR, 'rate-limit.json');
const DEFAULT_LIMIT = 30; // calls per minute
const WINDOW_MS = 60_000; // 1 minute

interface PreToolInput {
  tool_name?: string;
  toolName?: string;
}

interface RateLimitState {
  calls: number[]; // timestamps in ms
}

/** 상태 파일 로드 (스키마 검증 포함) */
export function loadRateLimitState(): RateLimitState {
  try {
    if (fs.existsSync(RATE_LIMIT_PATH)) {
      const raw = JSON.parse(fs.readFileSync(RATE_LIMIT_PATH, 'utf-8'));
      // 스키마 검증: calls가 number 배열이어야 함
      if (raw && Array.isArray(raw.calls) && raw.calls.every((c: unknown) => typeof c === 'number')) {
        return raw;
      }
      // 손상된 상태 → 초기화
    }
  } catch { /* rate limit state parse failure — starting fresh, window resets (fail-open is safe here) */ }
  return { calls: [] };
}

/** 상태 파일 저장 (atomic write로 동시 세션 안전) */
export function saveRateLimitState(state: RateLimitState): void {
  atomicWriteJSON(RATE_LIMIT_PATH, state);
}

/** 오래된 호출 기록 정리 + 제한 초과 여부 판정 (순수 함수) */
export function checkRateLimit(
  state: RateLimitState,
  now: number = Date.now(),
  limit: number = DEFAULT_LIMIT,
): { exceeded: boolean; count: number; updatedState: RateLimitState } {
  // 1분 이전 호출 제거
  const cutoff = now - WINDOW_MS;
  const recentCalls = state.calls.filter(t => t > cutoff);

  // 초과 여부 먼저 판정 (현재 호출 추가 전 기준)
  const exceeded = recentCalls.length >= limit;

  // 거부된 호출은 윈도우에 추가하지 않음 — 승인된 호출만 기록
  if (!exceeded) {
    recentCalls.push(now);
  }

  return {
    exceeded,
    count: recentCalls.length + (exceeded ? 1 : 0),
    updatedState: { calls: recentCalls },
  };
}

async function main(): Promise<void> {
  const data = await readStdinJSON<PreToolInput>(1500); // Must finish within plugin.json timeout (2000ms)
  if (!data) {
    // stdin 파싱 실패 — 통과 (rate limiter는 fail-open)
    console.log(failOpen());
    return;
  }
  if (!isHookEnabled('rate-limiter')) {
    console.log(approve());
    return;
  }

  const toolName = data.tool_name ?? data.toolName ?? '';

  // MCP 도구만 추적 (mcp__ 접두사)
  if (!toolName.startsWith('mcp__')) {
    console.log(approve());
    return;
  }

  const state = loadRateLimitState();
  const { exceeded, count, updatedState } = checkRateLimit(state);

  // 거부된 호출은 상태를 저장하지 않음 (윈도우 누적 방지)
  if (!exceeded) {
    saveRateLimitState(updatedState);
  }

  if (exceeded) {
    console.log(deny(`[Tenetx] Rate limit exceeded (${count}/${DEFAULT_LIMIT}/min). Wait before retrying.`));
    return;
  }

  console.log(approve());
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(failOpen());
});
