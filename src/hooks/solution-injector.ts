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
import { withFileLock, withFileLockSync, FileLockError } from './shared/file-lock.js';
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
    if (!fs.existsSync(cachePath)) return { injected: new Set(), totalInjectedChars: 0 };

    const data: SessionCacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const age = data.updatedAt ? Date.now() - new Date(data.updatedAt).getTime() : Infinity;
    if (Number.isFinite(age) && age <= 24 * 60 * 60 * 1000) {
      return { injected: new Set(data.injected ?? []), totalInjectedChars: data.totalInjectedChars ?? 0 };
    }

    // M-1 fix: 만료 unlink를 lock 안에서 fresh updatedAt 재검증 후에만.
    // 이전 lock 없는 unlink는 다른 hook이 막 만든 fresh cache를 삭제할 수 있었음.
    try {
      withFileLockSync(cachePath, () => {
        if (!fs.existsSync(cachePath)) return;
        const fresh: SessionCacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        const freshAge = fresh.updatedAt ? Date.now() - new Date(fresh.updatedAt).getTime() : Infinity;
        if (!Number.isFinite(freshAge) || freshAge > 24 * 60 * 60 * 1000) {
          // 정말 만료된 경우에만 unlink
          fs.unlinkSync(cachePath);
        }
      });
    } catch (e) {
      if (e instanceof FileLockError) {
        log.warn('session cache GC lock 실패 — skip', e);
      }
    }
    return { injected: new Set(), totalInjectedChars: 0 };
  } catch (e) { log.debug('캐시 읽기 실패', e); }
  return { injected: new Set(), totalInjectedChars: 0 };
}

interface SessionCacheCommitResult {
  /**
   * commit 상태:
   *   'committed'     — 정상적으로 lock 안에서 disk 갱신 완료
   *   'lock-failed'   — file lock 획득 실패 (stale recovery, timeout 등). disk는 변경 안 됨.
   *   'error'         — lock은 잡았으나 parse/write 실패. disk 상태 불명확.
   * caller는 'lock-failed' 시 retry하거나 fail-open 처리해야 한다.
   */
  status: 'committed' | 'lock-failed' | 'error';
  /**
   * 이번 호출에서 disk에 실제로 새로 추가된 entries.
   * caller는 이 list로만 evidence.injected counter를 갱신해야 한다.
   * 다른 hook이 이미 같은 entry를 추가했다면 그 entry는 newlyAdded에 포함되지 않는다.
   */
  newlyAdded: Array<{ name: string; chars: number }>;
  /**
   * disk에 저장된 fresh totalInjectedChars.
   * status='committed'일 때만 정확한 값. 그 외엔 0 또는 fallback.
   */
  totalInjectedChars: number;
}

/**
 * 새로 inject할 entries를 disk session cache에 commit한다.
 *
 * H-1 + M-3 fix:
 *   - 이전 saveSessionCache는 caller의 메모리 set 전체를 저장 + Math.max로 chars 합산
 *     → disjoint write 합산 손실로 budget cap이 헐거워졌음 (H-1)
 *   - 또한 두 hook이 거의 동시에 같은 솔루션을 inject 후보로 보면 둘 다
 *     evidence.injected를 증가시켜 중복 카운트 (M-3)
 *
 * 이번 fix:
 *   1. caller는 "이번에 추가하려는 entries (name+chars)"만 전달
 *   2. lock 안에서 disk fresh를 읽어 이미 있는 name은 제외
 *   3. 새로 추가된 것만 newlyAdded로 반환
 *   4. disk의 fresh chars + newlyAdded chars를 합산해 새 total로 저장
 *   5. caller는 newlyAdded로만 evidence.injected counter 갱신 → 중복 차단
 */
/**
 * Test-only export: 격리된 회귀 테스트가 inline 재구현 대신 실 함수를 호출할 수 있도록
 * 한다 (L-1 fix — PR2c-1 라운드 2 code-reviewer 발견).
 */
export function commitSessionCacheEntries(
  sessionId: string,
  newEntries: Array<{ name: string; chars: number }>,
): SessionCacheCommitResult {
  const cachePath = getSessionCachePath(sessionId);
  let result: SessionCacheCommitResult = {
    status: 'lock-failed',
    newlyAdded: [],
    totalInjectedChars: 0,
  };
  try {
    withFileLockSync(cachePath, () => {
      // Lock 안에서 fresh re-read
      let freshInjected = new Set<string>();
      let freshChars = 0;
      let hadExpiredFresh = false;
      try {
        if (fs.existsSync(cachePath)) {
          const fresh: SessionCacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          // L-2 fix: 만료된 fresh는 무시 (24h 초과).
          // M-2 fix: loadSessionCache와 일관되게 lock 안에서 unlink (GC).
          const age = fresh.updatedAt ? Date.now() - new Date(fresh.updatedAt).getTime() : Infinity;
          if (Number.isFinite(age) && age <= 24 * 60 * 60 * 1000) {
            if (Array.isArray(fresh.injected)) {
              for (const name of fresh.injected) {
                if (typeof name === 'string') freshInjected.add(name);
              }
            }
            if (typeof fresh.totalInjectedChars === 'number') {
              freshChars = fresh.totalInjectedChars;
            }
          } else {
            hadExpiredFresh = true;
          }
        }
      } catch (e) { log.debug('session cache fresh re-read 실패', e); }

      if (hadExpiredFresh) {
        // M-2 fix: 만료된 cache는 unlink해 load/commit 간 일관성 유지.
        // load는 unlink, commit도 unlink — 두 함수의 만료 처리가 정합.
        try { fs.unlinkSync(cachePath); } catch { /* 다른 hook이 이미 처리 */ }
      }

      // disjoint만 필터링 — 이미 disk에 있으면 다른 hook이 먼저 추가한 것
      const newlyAdded = newEntries.filter(e => !freshInjected.has(e.name));
      const addedChars = newlyAdded.reduce((sum, e) => sum + e.chars, 0);
      const mergedInjected = new Set(freshInjected);
      for (const e of newlyAdded) mergedInjected.add(e.name);
      const newTotal = freshChars + addedChars;

      atomicWriteJSON(cachePath, {
        injected: [...mergedInjected],
        totalInjectedChars: newTotal,
        updatedAt: new Date().toISOString(),
      }, { mode: 0o600, dirMode: 0o700 });

      result = { status: 'committed', newlyAdded, totalInjectedChars: newTotal };
    });
  } catch (e) {
    if (e instanceof FileLockError) {
      log.warn(`session cache lock 실패 — write skipped`, e);
      result = { status: 'lock-failed', newlyAdded: [], totalInjectedChars: 0 };
    } else {
      log.debug('session cache 저장 실패', e);
      result = { status: 'error', newlyAdded: [], totalInjectedChars: 0 };
    }
  }
  return result;
}

/** XML 속성/내용 이스케이프 */

// readSolutionContent 제거됨 — Progressive Disclosure로 전문 읽기 불필요
// Tier 3(전문)은 MCP compound-read가 담당

/**
 * 기존 injection cache에서 tags가 누락된 entry를 매칭 결과로 채운다.
 *
 * 호출 시점:
 *   - main()의 cache merge 단계 (in-place, 새 entry 추가와 함께)
 *   - matches.length === 0 early return 직전 (cache write만 수행)
 *
 * R3 sentinel 동작:
 *   - tags 키 자체가 없을 때만 backfill (`existing.tags === undefined`)
 *   - 빈 배열 (`tags: []`)은 정당한 상태로 보고 그대로 유지
 *   - 이전 `length === 0` 가드는 진짜 빈 tags 솔루션을 매번 무한 backfill 시도하던 결함
 *
 * 동시성: lock 없음 (PR1 의도). PR2에서 file lock으로 보호 예정.
 */
function backfillCacheTagsOnDisk(
  cachePath: string,
  allMatched: Array<{ name: string; tags: string[] }>,
): void {
  if (allMatched.length === 0) return;
  if (!fs.existsSync(cachePath)) return;
  // PR2c-1: withFileLockSync로 read-modify-write 보호.
  try {
    withFileLockSync(cachePath, () => {
      const existing = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (!Array.isArray(existing.solutions)) return;

      const matchedByName = new Map(allMatched.map(m => [m.name, m]));
      let mutated = false;
      const updated = existing.solutions.map((sol: { name: string; tags?: unknown }) => {
        // R3 sentinel: tags 키 자체가 없을 때만 backfill.
        if (sol.tags !== undefined) return sol;
        const fresh = matchedByName.get(sol.name);
        if (!fresh) return sol;
        mutated = true;
        // R5: defensive copy로 fresh.tags reference 공유 차단.
        return { ...sol, tags: [...fresh.tags] };
      });

      if (!mutated) return;
      atomicWriteJSON(cachePath, {
        solutions: updated,
        updatedAt: new Date().toISOString(),
      }, { mode: 0o600, dirMode: 0o700 });
    });
  } catch (e) {
    if (e instanceof FileLockError) {
      log.warn('injection cache backfill lock 실패 — write skipped', e);
    } else {
      log.debug('injection cache backfill 실패', e);
    }
  }
}

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
  // H-1 fix: `let`으로 재할당을 허락하되, commit 이후 fresh total로 갱신된다.
  // 이전엔 dead variable이었음 (선언 후 재할당 없음).
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
  // allMatched는 backfill 용도로 보존: 이미 injected된 entry라도 같은 솔루션이
  // 다시 매칭되면 그 정보로 cache의 missing tags를 채울 수 있다.
  // matches는 새 주입 후보 (이미 injected는 제외).
  const allMatched = matchSolutions(input.prompt, scope, cwd);
  const matches = allMatched.filter(m => !injected.has(m.name));

  // 신규 주입할 게 없어도 backfill은 수행한다.
  // R2 fix: matches.length === 0인 경우에도 allMatched에 정보가 있으면
  // 기존 cache의 missing tags를 채울 수 있다. 이전엔 이 경로를 놓쳐서
  // backfill fix가 절반만 적용된 상태였다 (Codex/code-reviewer 발견).
  if (matches.length === 0) {
    const earlyCachePath = path.join(STATE_DIR, `injection-cache-${sanitizeId(sessionId)}.json`);
    backfillCacheTagsOnDisk(earlyCachePath, allMatched);
    console.log(approve());
    return;
  }

  // 어댑티브 프롬프트당 솔루션 수 제한, experiment는 1개 제한
  let experimentCount = 0;
  const toInject: typeof matches = [];
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
  const candidateEntries: Array<{ name: string; chars: number }> = [];
  for (const sol of toInject) {
    // Tier 2: 한 줄 요약만 생성 (전문 읽기 없음 → 토큰 대폭 절감)
    const summary = `${sol.name} [${sol.type}|${sol.confidence.toFixed(2)}]: ${sol.matchedTags.slice(0, 5).join(', ')}`;
    summaries.set(sol.name, summary);
    candidateEntries.push({ name: sol.name, chars: summary.length });
  }

  // H-1 + M-3 fix: lock 안 disjoint 검증으로 새로 추가된 entry만 반환받는다.
  // 다른 hook이 같은 sessionId로 동시에 같은 솔루션을 inject했다면 이 hook의
  // commit에서는 newlyAdded에 포함되지 않아 evidence 중복 카운트가 차단된다.
  const commitResult = commitSessionCacheEntries(sessionId, candidateEntries);

  // M-1 fix: lock 실패와 정상 0건을 구분.
  // lock-failed / error: disk 상태 불명 → fail-open으로 approve 하되 warn으로 가시화
  if (commitResult.status !== 'committed') {
    log.warn(`session cache commit ${commitResult.status} — hook approving without injection`);
    console.log(approve());
    return;
  }

  // H-1 fix: commit 이후 fresh disk total로 caller 변수 갱신.
  // 이전엔 dead variable이라 budget cap이 caller-side stale 값에 의존했다.
  totalInjectedChars = commitResult.totalInjectedChars;

  // toInject은 commit 결과의 newlyAdded만 의미 있음 — evidence/cache 갱신은 이 list 기준
  const newlyAddedNames = new Set(commitResult.newlyAdded.map(e => e.name));
  const effectiveToInject = toInject.filter(sol => newlyAddedNames.has(sol.name));

  // 다른 hook이 모두 먼저 inject했다면 effectiveToInject가 0 — 출력할 게 없음
  if (effectiveToInject.length === 0) {
    console.log(approve());
    return;
  }

  // Save injection cache for Code Reflection (Phase 2) — cumulative merge
  // PR2c-1: withFileLock으로 read-modify-write 보호. 동시 hook이 같은 cache를
  // 만지면 last-writer-wins로 _sessionCounted 등 비트가 사라질 수 있었음.
  const injectionCachePath = path.join(STATE_DIR, `injection-cache-${sanitizeId(sessionId)}.json`);
  try {
    await withFileLock(injectionCachePath, () => {
      // Lock 안에서 fresh re-read
      let existingSolutions: Array<{ name: string; identifiers: string[]; tags?: string[]; status: string; injectedAt: string; _sessionCounted?: boolean }> = [];
      try {
        if (fs.existsSync(injectionCachePath)) {
          const existing = JSON.parse(fs.readFileSync(injectionCachePath, 'utf-8'));
          if (Array.isArray(existing.solutions)) existingSolutions = existing.solutions;
        }
      } catch (e) { log.debug('injection cache 읽기 실패 — 기존 캐시 없이 새로 시작', e); }

      // R5: defensive copy로 SolutionMatch.tags / .identifiers reference 공유 차단.
      // M-3 fix: effectiveToInject는 commitSessionCacheEntries가 검증한 disjoint set만 포함.
      const newSolutions = effectiveToInject.map(sol => ({
        name: sol.name,
        identifiers: [...sol.identifiers],
        tags: [...sol.tags],
        status: sol.status,
        injectedAt: new Date().toISOString(),
      }));

      // BACKFILL: existing entry에 tags 키 자체가 없으면 fresh로 채움.
      const matchedByName = new Map(allMatched.map(m => [m.name, m]));
      const existingNames = new Set(existingSolutions.map(s => s.name));
      const merged = [
        ...existingSolutions.map(existing => {
          if (existing.tags !== undefined) return existing;
          const fresh = matchedByName.get(existing.name);
          if (!fresh) return existing;
          return { ...existing, tags: [...fresh.tags] };
        }),
        ...newSolutions.filter(s => !existingNames.has(s.name)),
      ];

      const injectionData = {
        solutions: merged,
        updatedAt: new Date().toISOString(),
      };
      // mode 0o600 + dirMode 0o700 — STATE_DIR auto-detect 의존성을 명시화
      atomicWriteJSON(injectionCachePath, injectionData, { mode: 0o600, dirMode: 0o700 });
    });
  } catch (e) {
    if (e instanceof FileLockError) {
      log.warn(`injection cache lock 실패 — write skipped`, e);
    } else {
      log.debug('injection cache 저장 실패', e);
    }
  }

  // Update evidence.injected counters on solution files.
  // M-3 fix: effectiveToInject(commit이 검증한 disjoint set)만 evidence 갱신 →
  // 동시 hook이 같은 솔루션을 inject해도 한 번만 카운트됨.
  try {
    const { updateSolutionEvidence } = await import('./pre-tool-use.js');
    for (const sol of effectiveToInject) {
      updateSolutionEvidence(sol.name, 'injected');
    }
  } catch (e) { log.debug('evidence.injected counter 업데이트 실패', e); }

  // Progressive Disclosure: Tier 1(인덱스) + Tier 2(매칭 요약) push
  // Tier 3(전문)은 compound-read MCP tool로 pull
  // effectiveToInject 사용 — 다른 hook이 이미 inject한 솔루션은 사용자에게 다시 push 안 함
  const injections = effectiveToInject.map(sol => {
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
