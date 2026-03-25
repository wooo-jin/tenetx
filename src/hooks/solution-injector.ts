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
import * as os from 'node:os';
import { readStdinJSON } from './shared/read-stdin.js';
import { matchSolutions } from '../engine/solution-matcher.js';
import { resolveScope } from '../core/scope-resolver.js';
import { debugLog } from '../core/logger.js';
import { sanitizeId } from './shared/sanitize-id.js';
import { atomicWriteJSON } from './shared/atomic-write.js';
import { filterSolutionContent } from './prompt-injection-filter.js';
import { recordPrompt } from '../engine/prompt-learner.js';
import { incrementWorkflowCounter } from '../engine/workflow-compound.js';
import { track } from '../lab/tracker.js';

interface HookInput {
  prompt: string;
  session_id?: string;
}

const COMPOUND_HOME = path.join(os.homedir(), '.compound');
const STATE_DIR = path.join(COMPOUND_HOME, 'state');
const MAX_SOLUTIONS_PER_SESSION = 10;
const MAX_SOLUTION_LENGTH = 1500; // 솔루션당 최대 글자 수
const MAX_INJECTED_CHARS_PER_SESSION = 8000; // 세션당 총 주입 문자 수 상한 (~2K tokens)

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
  } catch (e) { debugLog('solution-injector', '캐시 읽기 실패', e); }
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
function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 솔루션 파일 내용을 읽어서 요약 + 본문 반환 */
function readSolutionContent(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    const truncated = content.length <= MAX_SOLUTION_LENGTH
      ? content
      : `${content.slice(0, MAX_SOLUTION_LENGTH)}\n\n... (truncated)`;
    const filtered = filterSolutionContent(truncated);
    if (!filtered.safe) return ''; // skip unsafe content
    return filtered.sanitized;
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const input = await readStdinJSON<HookInput>();
  if (!input?.prompt) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const sessionId = input.session_id ?? 'default';

  // Record prompt for pattern learning (non-blocking)
  try { recordPrompt(input.prompt, sessionId); } catch (e) { debugLog('solution-injector', 'prompt 기록 실패 — pattern learning 누락', e); }
  try { incrementWorkflowCounter('prompt'); } catch (e) { debugLog('solution-injector', 'workflow prompt counter 증가 실패', e); }

  const cache = loadSessionCache(sessionId);
  const injected = cache.injected;
  let totalInjectedChars = cache.totalInjectedChars;

  if (injected.size >= MAX_SOLUTIONS_PER_SESSION || totalInjectedChars >= MAX_INJECTED_CHARS_PER_SESSION) {
    if (totalInjectedChars >= MAX_INJECTED_CHARS_PER_SESSION) {
      debugLog('solution-injector', `세션 토큰 상한 도달: ${totalInjectedChars} chars`);
    }
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // 현재 작업 디렉토리 (환경변수에서 가져오거나 프로세스 cwd 사용)
  const cwd = process.env.COMPOUND_CWD ?? process.cwd();
  const scope = resolveScope(cwd);

  // 프롬프트와 관련된 솔루션 매칭
  const matches = matchSolutions(input.prompt, scope, cwd)
    .filter(m => !injected.has(m.name));

  if (matches.length === 0) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // 최대 3개까지 주입 (컨텍스트 오버로드 방지), experiment는 1개 제한
  let experimentCount = 0;
  const toInject = [];
  for (const sol of matches) {
    if (injected.has(sol.name)) continue;
    if (sol.status === 'experiment') {
      if (experimentCount >= 1) continue;
      experimentCount++;
    }
    toInject.push(sol);
    if (toInject.length >= Math.min(3, MAX_SOLUTIONS_PER_SESSION - injected.size)) break;
  }

  // Track injected chars for token cost guardrail
  let newChars = 0;
  for (const sol of toInject) {
    injected.add(sol.name);
    const content = readSolutionContent(sol.path);
    newChars += content.length;
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
    } catch (e) { debugLog('solution-injector', 'injection cache 읽기 실패 — 기존 캐시 없이 새로 시작', e); }

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
  } catch (e) { debugLog('solution-injector', 'injection cache 저장 실패', e); }

  // Update evidence.injected counters on solution files
  try {
    const { updateSolutionEvidence } = await import('./pre-tool-use.js');
    for (const sol of toInject) {
      updateSolutionEvidence(sol.name, 'injected');
    }
  } catch (e) { debugLog('solution-injector', 'evidence.injected counter 업데이트 실패', e); }

  // Lab event tracking for injected solutions
  for (const sol of toInject) {
    track('compound-injected', sessionId, {
      solutionName: sol.name,
      status: sol.status,
      confidence: sol.confidence,
      relevance: sol.relevance,
    });
  }

  // 솔루션 내용을 Claude 컨텍스트에 주입
  const injections = toInject.map(sol => {
    const content = readSolutionContent(sol.path);
    const scopeLabel = sol.scope === 'me' ? 'personal' : sol.scope === 'team' ? 'team' : 'project';
    return `<compound-solution name="${escapeXmlAttr(sol.name)}" status="${sol.status}" confidence="${sol.confidence.toFixed(2)}" type="${sol.type}" scope="${scopeLabel}" relevance="${sol.relevance.toFixed(2)}">\n${content}\n</compound-solution>`;
  }).join('\n\n');

  const header = `Below are relevant solutions accumulated from previous work. Refer to these for the current task:\n\n`;

  console.log(JSON.stringify({
    result: 'approve',
    message: header + injections,
  }));
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] solution-injector: ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(JSON.stringify({ result: 'approve' }));
});
