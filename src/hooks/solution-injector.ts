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

interface HookInput {
  prompt: string;
  session_id?: string;
}

const COMPOUND_HOME = path.join(os.homedir(), '.compound');
const STATE_DIR = path.join(COMPOUND_HOME, 'state');
const MAX_SOLUTIONS_PER_SESSION = 10;
const MAX_SOLUTION_LENGTH = 1500; // 솔루션당 최대 글자 수

/** 세션별 이미 주입된 솔루션 추적 (중복 방지) */
function getSessionCachePath(sessionId: string): string {
  return path.join(STATE_DIR, `solution-cache-${sessionId}.json`);
}

function loadSessionCache(sessionId: string): Set<string> {
  const cachePath = getSessionCachePath(sessionId);
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (data.updatedAt && Date.now() - new Date(data.updatedAt).getTime() > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(cachePath);
        return new Set();
      }
      return new Set(data.injected ?? []);
    }
  } catch (e) { debugLog('solution-injector', '캐시 읽기 실패', e); }
  return new Set();
}

function saveSessionCache(sessionId: string, injected: Set<string>): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(getSessionCachePath(sessionId), JSON.stringify({
    injected: [...injected],
    updatedAt: new Date().toISOString(),
  }));
}

/** 솔루션 파일 내용을 읽어서 요약 + 본문 반환 */
function readSolutionContent(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (content.length <= MAX_SOLUTION_LENGTH) return content;
    return content.slice(0, MAX_SOLUTION_LENGTH) + '\n\n... (truncated)';
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
  const injected = loadSessionCache(sessionId);

  if (injected.size >= MAX_SOLUTIONS_PER_SESSION) {
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

  // 최대 3개까지 주입 (컨텍스트 오버로드 방지)
  const toInject = matches.slice(0, Math.min(3, MAX_SOLUTIONS_PER_SESSION - injected.size));

  for (const sol of toInject) {
    injected.add(sol.name);
  }
  saveSessionCache(sessionId, injected);

  // 솔루션 내용을 Claude 컨텍스트에 주입
  const injections = toInject.map(sol => {
    const content = readSolutionContent(sol.path);
    const scopeLabel = sol.scope === 'me' ? '개인' : sol.scope === 'team' ? '팀' : '프로젝트';
    return `<compound-solution name="${sol.name}" scope="${scopeLabel}" relevance="${sol.relevance.toFixed(2)}">\n${content}\n</compound-solution>`;
  }).join('\n\n');

  const header = `아래는 이전 작업에서 축적된 관련 솔루션입니다. 현재 작업에 참고하세요:\n\n`;

  console.log(JSON.stringify({
    result: 'approve',
    message: header + injections,
  }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] solution-injector: ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
