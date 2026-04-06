#!/usr/bin/env node
/**
 * Tenetx — Solution Injector Hook
 *
 * Claude Code UserPromptSubmit 훅으로 등록.
 * 사용자 프롬프트에 관련된 축적 솔루션을 Claude 컨텍스트에 자동 주입합니다.
 *
 * knowledge-comes-to-you 원칙: 필요한 지식은 찾아와야 한다
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readStdinJSON } from './shared/read-stdin.js';
import { isHookEnabled } from './hook-config.js';
import { matchSolutions } from '../engine/solution-matcher.js';
import { resolveScope } from '../core/scope-resolver.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('solution-injector');
import { sanitizeId } from './shared/sanitize-id.js';
import { atomicWriteJSON } from './shared/atomic-write.js';
// filterSolutionContent는 MCP solution-reader에서 사용 (Tier 3)
// v1: recordPrompt (regex 선호 감지) 제거
import { calculateBudget } from './shared/context-budget.js';
import { writeSignal } from './shared/plugin-signal.js';
import { approve, approveWithContext, failOpen } from './shared/hook-response.js';
import { STATE_DIR } from '../core/paths.js';

interface HookInput {
  prompt: string;
  session_id?: string;
}
const MAX_SOLUTIONS_PER_SESSION = 10;

/** 세션별 이미 주입된 솔루션 추적 (중복 방지) */
function getSessionCachePath(sessionId: string): string {
  return path.join(STATE_DIR, `solution-cache-${sanitizeId(sessionId)}.json`);
}

interface SessionCacheData {
  injected: string[];
  totalInjectedChars: number;
  updatedAt: string;
}

function loadSessionCache(sessionId: string): { injected: Set<string>; totalInjectedChars: number } {
  const cachePath = getSessionCachePath(sessionId);
  try {
    if (fs.existsSync(cachePath)) {
      const data: SessionCacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      const age = data.updatedAt ? Date.now() - new Date(data.updatedAt).getTime() : Infinity;
      if (!Number.isFinite(age) || age > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(cachePath);
        return { injected: new Set(), totalInjectedChars: 0 };
      }
      return { injected: new Set(data.injected ?? []), totalInjectedChars: data.totalInjectedChars ?? 0 };
    }
  } catch (e) { log.debug('캐시 읽기 실패', e); }
  return { injected: new Set(), totalInjectedChars: 0 };
}

function saveSessionCache(sessionId: string, injected: Set<string>, totalInjectedChars: number): void {
  atomicWriteJSON(getSessionCachePath(sessionId), {
    injected: [...injected],
    totalInjectedChars,
    updatedAt: new Date().toISOString(),
  });
}

/** XML 속성/내용 이스케이프 */

// readSolutionContent 제거됨 — Progressive Disclosure로 전문 읽기 불필요
// Tier 3(전문)은 MCP compound-read가 담당

async function main(): Promise<void> {
  const input = await readStdinJSON<HookInput>();
  if (!isHookEnabled('solution-injector')) {
    console.log(approve());
    return;
  }
  if (!input?.prompt) {
    console.log(approve());
    return;
  }

  const sessionId = input.session_id ?? 'default';

  // v1: 교정 감지 → correction-record 호출 유도 hint
  const correctionPatterns = /하지\s*마|그렇게\s*말고|앞으로는|이렇게\s*해|stop\s+doing|don'?t\s+do|always\s+do|never\s+do|아니\s*그게\s*아니라/i;
  if (correctionPatterns.test(input.prompt)) {
    try {
      writeSignal(sessionId, 'correction-detected', 0);
    } catch { /* non-critical */ }
  }

  // 어댑티브 버짓: 다른 플러그인 감지 시 주입��� ���동 축소
  const cwd = process.env.COMPOUND_CWD ?? process.cwd();
  const budget = calculateBudget(cwd);

  const cache = loadSessionCache(sessionId);
  const injected = cache.injected;
  let totalInjectedChars = cache.totalInjectedChars;

  if (injected.size >= MAX_SOLUTIONS_PER_SESSION || totalInjectedChars >= budget.solutionSessionMax) {
    if (totalInjectedChars >= budget.solutionSessionMax) {
      log.debug(`세션 토큰 상한 도달: ${totalInjectedChars}/${budget.solutionSessionMax} chars (factor=${budget.factor})`);
    }
    console.log(approve());
    return;
  }

  const scope = resolveScope(cwd);

  // 프롬프트와 관련된 솔루션 매칭
  const matches = matchSolutions(input.prompt, scope, cwd)
    .filter(m => !injected.has(m.name));

  if (matches.length === 0) {
    console.log(approve());
    return;
  }

  // 어댑티브 프롬프트당 솔루션 수 제한, experiment는 1개 제한
  let experimentCount = 0;
  const toInject = [];
  for (const sol of matches) {
    if (injected.has(sol.name)) continue;
    if (sol.status === 'experiment') {
      if (experimentCount >= 1) continue;
      experimentCount++;
    }
    toInject.push(sol);
    if (toInject.length >= Math.min(budget.solutionsPerPrompt, MAX_SOLUTIONS_PER_SESSION - injected.size)) break;
  }

  // Progressive Disclosure Tier 2: 요약만 push, 전문은 MCP compound-read로 pull
  // 근거: Anthropic "smallest set of high-signal tokens" + Cursor 46.9% 토큰 절감
  const summaries = new Map<string, string>();
  let newChars = 0;
  for (const sol of toInject) {
    injected.add(sol.name);
    // Tier 2: 한 줄 요약만 생성 (전문 읽기 없음 → 토큰 대폭 절감)
    const summary = `${sol.name} [${sol.type}|${sol.confidence.toFixed(2)}]: ${sol.matchedTags.slice(0, 5).join(', ')}`;
    summaries.set(sol.name, summary);
    newChars += summary.length;
  }
  totalInjectedChars += newChars;
  saveSessionCache(sessionId, injected, totalInjectedChars);

  // Save injection cache for Code Reflection (Phase 2) — cumulative merge
  const injectionCachePath = path.join(STATE_DIR, `injection-cache-${sanitizeId(sessionId)}.json`);
  try {
    // Load existing cache and merge (cumulative)
    let existingSolutions: Array<{ name: string; identifiers: string[]; status: string; injectedAt: string; _sessionCounted?: boolean }> = [];
    try {
      if (fs.existsSync(injectionCachePath)) {
        const existing = JSON.parse(fs.readFileSync(injectionCachePath, 'utf-8'));
        if (Array.isArray(existing.solutions)) existingSolutions = existing.solutions;
      }
    } catch (e) { log.debug('injection cache 읽기 실패 — 기존 캐시 없이 새로 시작', e); }

    const newSolutions = toInject.map(sol => ({
      name: sol.name,
      identifiers: sol.identifiers,
      status: sol.status,
      injectedAt: new Date().toISOString(),
    }));

    // Merge: add new, keep existing (dedup by name)
    const existingNames = new Set(existingSolutions.map(s => s.name));
    const merged = [
      ...existingSolutions,
      ...newSolutions.filter(s => !existingNames.has(s.name)),
    ];

    const injectionData = {
      solutions: merged,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJSON(injectionCachePath, injectionData);
  } catch (e) { log.debug('injection cache 저장 실패', e); }

  // Update evidence.injected counters on solution files
  try {
    const { updateSolutionEvidence } = await import('./pre-tool-use.js');
    for (const sol of toInject) {
      updateSolutionEvidence(sol.name, 'injected');
    }
  } catch (e) { log.debug('evidence.injected counter 업데이트 실패', e); }

  // Progressive Disclosure: Tier 1(인덱스) + Tier 2(매칭 요약) push
  // Tier 3(전문)은 compound-read MCP tool로 pull
  const injections = toInject.map(sol => {
    const summary = summaries.get(sol.name) ?? sol.name;
    return `- ${summary}`;
  }).join('\n');

  const header = `Matched solutions (compound-read로 전문 확인 시 더 정확한 구현 가능):\n`;
  const footer = `\n\nIMPORTANT: When you use compound knowledge above, briefly mention it naturally (e.g., "Based on accumulated patterns..." or "From past experience..."). This helps the user see compound learning in action.`;
  const fullInjection = header + injections + footer;

  // 플러그인 시그널 기록 (다른 플러그인이 참고할 수 있도록)
  try { writeSignal(sessionId, 'UserPromptSubmit', fullInjection.length); } catch (e) { log.debug('plugin signal 기록 실패', e); }

  console.log(approveWithContext(fullInjection, 'UserPromptSubmit'));
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] solution-injector: ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(failOpen());
});
