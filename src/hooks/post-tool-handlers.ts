/**
 * Tenetx — PostToolUse Handlers (extracted from post-tool-use.ts)
 *
 * Compound negative/success 신호 감지, 컨텍스트 실패 카운터,
 * 솔루션 negative evidence 업데이트 등 post-tool 분석 핸들러.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../core/logger.js';
import { atomicWriteJSON } from './shared/atomic-write.js';
import { sanitizeId } from './shared/sanitize-id.js';
import { incrementEvidence } from '../engine/solution-writer.js';
import { detectErrorPattern } from './post-tool-use.js';
import { STATE_DIR } from '../core/paths.js';

const log = createLogger('post-tool-handlers');
const CONTEXT_SIGNALS_PATH = path.join(STATE_DIR, 'context-signals.json');

/** 세션의 실패 카운터 증가 (컨텍스트 신호 수집) */
export function incrementFailureCounter(sessionId: string): void {
  try {
    let signals: Record<string, unknown> = {};
    if (fs.existsSync(CONTEXT_SIGNALS_PATH)) {
      signals = JSON.parse(fs.readFileSync(CONTEXT_SIGNALS_PATH, 'utf-8'));
      if (signals.sessionId !== sessionId) signals = {};
    }
    signals.sessionId = sessionId;
    signals.previousFailures = ((signals.previousFailures as number) ?? 0) + 1;
    signals.updatedAt = new Date().toISOString();
    atomicWriteJSON(CONTEXT_SIGNALS_PATH, signals);
  } catch (e) { log.debug('context signals write failed — failure count may be lost', e); }
}

/** Compound v3: detect negative signals after tool execution */
export function checkCompoundNegative(toolName: string, toolResponse: string, sessionId: string): void {
  if (toolName !== 'Bash') return;
  if (!toolResponse || toolResponse.length < 5) return;

  const negativePatterns = [
    /error\s*TS\d+/i,
    /BUILD FAILED/i,
    /test.*fail/i,
    /FAIL\s+tests?\//i,
    /npm ERR!/i,
    /exit code [1-9]/i,
    /compilation error/i,
    /SyntaxError/i,
  ];

  const isNegative = negativePatterns.some(p => p.test(toolResponse));
  if (!isNegative) return;

  const cachePath = path.join(STATE_DIR, `injection-cache-${sanitizeId(sessionId)}.json`);
  if (!fs.existsSync(cachePath)) return;

  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    if (!Array.isArray(cache.solutions)) return;

    const experiments = cache.solutions.filter((s: { status: string }) => s.status === 'experiment');
    for (const sol of experiments) {
      const allTerms = [...(sol.identifiers ?? []), ...(sol.tags ?? [])].filter((t: string) => t.length >= 4);
      const isRelated = allTerms.length === 0 || allTerms.some((term: string) => toolResponse.toLowerCase().includes(term.toLowerCase()));
      if (!isRelated) continue;

      updateNegativeEvidence(sol.name);
    }
  } catch (e) {
    log.debug('compound negative 체크 실패', e);
  }
}

/** Compound v3: Micro-extraction — detect success moments and return hint */
export function getCompoundSuccessHint(toolName: string, toolResponse: string, sessionId: string): string {
  if (toolName !== 'Bash' || !toolResponse) return '';
  if (detectErrorPattern(toolResponse)) return '';

  const hints: string[] = [];

  if (/\d+\s*(passed|tests?\s*passed)|all\s*tests?\s*pass/i.test(toolResponse) && !/fail|error/i.test(toolResponse)) {
    hints.push('Tests passed — record effective patterns with /compound');
  }
  if (/build\s*(succeeded|success|done)|compiled?\s*successfully/i.test(toolResponse)) {
    hints.push('Build success — record implementation patterns with /compound');
  }

  try {
    if (fs.existsSync(CONTEXT_SIGNALS_PATH)) {
      const signals = JSON.parse(fs.readFileSync(CONTEXT_SIGNALS_PATH, 'utf-8'));
      if (signals.sessionId === sessionId && ((signals.previousFailures as number) ?? 0) >= 2) {
        hints.push('Error resolved after multiple failures — record the root cause and fix with /compound');
        signals.previousFailures = 0;
        atomicWriteJSON(CONTEXT_SIGNALS_PATH, signals);
      }
    }
  } catch (e) { log.debug('error resolution detection failed', e); }

  if (hints.length === 0) return '';
  return `<compound-success-hint>\n${hints.map(h => `- ${h}`).join('\n')}\n</compound-success-hint>`;
}

/**
 * Update negative evidence counter in solution file.
 * PR2b: solution-writer.incrementEvidence로 위임. lock + fresh re-read + atomic write.
 */
export function updateNegativeEvidence(solutionName: string): void {
  incrementEvidence(solutionName, 'negative');
}
