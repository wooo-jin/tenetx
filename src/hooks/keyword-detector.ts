#!/usr/bin/env node
/**
 * Tenet — Keyword Detector Hook
 *
 * Claude Code UserPromptSubmit 훅으로 등록.
 * 사용자 프롬프트에서 매직 키워드를 감지하여 해당 스킬을 주입합니다.
 *
 * stdin: JSON { prompt: string, ... }
 * stdout: JSON { result: "block"|"approve", message?: string }
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from '../core/logger.js';
import { readStdinJSON } from './shared/read-stdin.js';
import { sanitizeForDetection } from './shared/sanitize.js';
import { ModelRouter } from '../engine/router.js';
import type { RoutingPreset } from '../engine/router.js';
import { loadPhilosophyForProject } from '../core/philosophy-loader.js';
import { loadGlobalConfig } from '../core/global-config.js';

const COMPOUND_HOME = path.join(os.homedir(), '.compound');
const STATE_DIR = path.join(COMPOUND_HOME, 'state');

interface HookInput {
  prompt: string;
  session_id?: string;
  cwd?: string;
}

interface KeywordMatch {
  type: 'skill' | 'inject' | 'cancel';
  keyword: string;
  skill?: string;
  prompt?: string;
  message?: string;
}

// sanitizeForDetection은 shared/sanitize.ts에서 import

// ── 키워드 우선순위 (높은 것부터) ──
// "team", "analyze" 등 일상어와 겹치는 키워드는 명시적 접두어 필요

export const KEYWORD_PATTERNS: Array<{
  pattern: RegExp;
  keyword: string;
  type: 'skill' | 'inject' | 'cancel';
  skill?: string;
}> = [
  // 취소
  { pattern: /\b(canceltenet|stoptenet|cancel[- ]?compound)\b/i, keyword: 'cancel', type: 'cancel' },

  // 핵심 모드 — "team"은 단독 사용 시 오탐 가능하므로 명시적 패턴만
  { pattern: /\bralph\b/i, keyword: 'ralph', type: 'skill', skill: 'ralph' },
  { pattern: /\bautopilot\b/i, keyword: 'autopilot', type: 'skill', skill: 'autopilot' },
  { pattern: /(?:\bteam[- ]?mode\b|(?:^|\s)--team\b)/i, keyword: 'team', type: 'skill', skill: 'team' },

  // 확장 모드
  { pattern: /\b(ulw|ultrawork)\b/i, keyword: 'ultrawork', type: 'skill', skill: 'ultrawork' },
  { pattern: /\bccg\b/i, keyword: 'ccg', type: 'skill', skill: 'ccg' },
  { pattern: /\bralplan\b/i, keyword: 'ralplan', type: 'skill', skill: 'ralplan' },
  { pattern: /\bdeep[- ]?interview\b/i, keyword: 'deep-interview', type: 'skill', skill: 'deep-interview' },
  { pattern: /\bpipeline[- ]?mode\b/i, keyword: 'pipeline', type: 'skill', skill: 'pipeline' },

  // 인젝션 모드
  { pattern: /\bultrathink\b/i, keyword: 'ultrathink', type: 'inject' },
  { pattern: /\bdeepsearch\b/i, keyword: 'deepsearch', type: 'inject' },
  { pattern: /(?:^|\s)tdd(?:\s+(?:모드|mode|방식|으로|해|해줘|시작|적용)|\s*$)/im, keyword: 'tdd', type: 'inject' },
  { pattern: /(?:code[- ]?review|코드\s*리뷰)\s*(?:해|해줘|시작|해봐|부탁|mode|모드)/i, keyword: 'code-review', type: 'inject' },
  { pattern: /(?:security[- ]?review|보안\s*리뷰|보안\s*검토)\s*(?:해|해줘|시작|해봐|부탁|mode|모드)/i, keyword: 'security-review', type: 'inject' },
];

// ── 인젝션 메시지 ──

const INJECT_MESSAGES: Record<string, string> = {
  ultrathink: `<compound-think-mode>
EXTENDED THINKING MODE ACTIVATED.
Before responding, engage in deep, thorough reasoning. Consider multiple approaches,
evaluate trade-offs, and explore edge cases. Your thinking should be comprehensive
and rigorous. Take your time — quality over speed.
</compound-think-mode>`,

  deepsearch: `<compound-deepsearch>
DEEP SEARCH MODE ACTIVATED.
Perform comprehensive codebase exploration before answering:
1. Use Glob to map the full directory structure
2. Use Grep to find all relevant patterns and references
3. Read key files to understand architecture
4. Cross-reference findings across files
5. Present a complete, evidence-based analysis
</compound-deepsearch>`,

  tdd: `<compound-tdd>
TDD MODE ACTIVATED.
Follow strict Test-Driven Development:
1. Write the failing test FIRST (Red)
2. Write the minimum code to pass (Green)
3. Refactor while keeping tests green (Refactor)
4. Repeat for each requirement
Never write implementation before tests.
</compound-tdd>`,

  'code-review': `<compound-code-review>
CODE REVIEW MODE ACTIVATED.
Perform thorough code review with severity ratings:
- 🔴 CRITICAL: Security vulnerabilities, data loss risks, crashes
- 🟡 MAJOR: Logic errors, performance issues, missing error handling
- 🔵 MINOR: Style, naming, documentation improvements
- 💡 SUGGESTION: Optional enhancements
Provide file:line references for every finding.
</compound-code-review>`,

  'security-review': `<compound-security-review>
SECURITY REVIEW MODE ACTIVATED.
Check for OWASP Top 10 and common vulnerabilities:
1. Injection (SQL, XSS, Command)
2. Broken Authentication / Authorization
3. Sensitive Data Exposure
4. Security Misconfiguration
5. Insecure Dependencies
6. Secrets in code (API keys, tokens, passwords)
7. Input validation gaps
8. Unsafe deserialization
Rate each finding: CRITICAL / HIGH / MEDIUM / LOW
</compound-security-review>`,
};

// ── 스킬 파일 로드 ──

function loadSkillContent(skillName: string): string | null {
  // 스킬 파일 검색 순서: 프로젝트 > 글로벌
  const searchPaths = [
    path.join(process.cwd(), '.compound', 'skills', `${skillName}.md`),
    path.join(process.cwd(), 'skills', `${skillName}.md`),
    path.join(os.homedir(), '.compound', 'skills', `${skillName}.md`),
  ];

  // tenet 패키지 내장 스킬
  const pkgSkillPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..', '..', 'skills', `${skillName}.md`
  );
  searchPaths.push(pkgSkillPath);

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  }
  return null;
}

// ── 키워드 감지 ──

export function detectKeyword(prompt: string): KeywordMatch | null {
  // 코드 블록, URL, XML 태그 등을 제거한 순수 텍스트에서만 감지
  const sanitized = sanitizeForDetection(prompt);
  const lower = sanitized.toLowerCase();

  for (const entry of KEYWORD_PATTERNS) {
    if (entry.pattern.test(lower)) {
      // 원본 프롬프트에서 키워드만 제거 (entry.keyword는 단순 문자열이므로 안전)
      const extractedPrompt = prompt.replace(new RegExp(`\\b${entry.keyword}\\b`, 'gi'), '').trim();

      if (entry.type === 'cancel') {
        return { type: 'cancel', keyword: entry.keyword, message: '[Tenet] 모드가 중단되었습니다.' };
      }

      if (entry.type === 'inject') {
        return {
          type: 'inject',
          keyword: entry.keyword,
          message: INJECT_MESSAGES[entry.keyword] ?? '',
        };
      }

      return {
        type: 'skill',
        keyword: entry.keyword,
        skill: entry.skill,
        prompt: extractedPrompt,
      };
    }
  }

  return null;
}

// ── 상태 관리 ──

function saveState(key: string, data: unknown): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, `${key}.json`), JSON.stringify(data, null, 2));
}

function clearState(key: string): void {
  const p = path.join(STATE_DIR, `${key}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/** skill-cache 파일 모두 정리 */
function cleanSkillCaches(): void {
  if (!fs.existsSync(STATE_DIR)) return;
  try {
    for (const f of fs.readdirSync(STATE_DIR)) {
      if (f.startsWith('skill-cache-')) {
        fs.unlinkSync(path.join(STATE_DIR, f));
      }
    }
  } catch (e) { debugLog('keyword-detector', 'skill-cache 파일 삭제 실패', e); }
}

// ── 메인 ──

/** 컨텍스트 신호 로드 (post-tool-use가 기록한 실패 카운터 등) */
function loadContextSignals(): { previousFailures?: number; conversationTurns?: number } {
  const signalsPath = path.join(STATE_DIR, 'context-signals.json');
  try {
    if (fs.existsSync(signalsPath)) {
      return JSON.parse(fs.readFileSync(signalsPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

/** 프롬프트에 대한 모델 추천 생성 */
export function getModelRecommendation(prompt: string, cwd?: string): string {
  try {
    const effectiveCwd = cwd ?? process.env.COMPOUND_CWD ?? process.cwd();
    const { philosophy } = loadPhilosophyForProject(effectiveCwd);
    // 환경변수에서 프리셋 우선 확인 (파일 I/O 절감)
    const envPreset = process.env.COMPOUND_ROUTING_PRESET as RoutingPreset | undefined;
    const routingPreset = envPreset ?? (loadGlobalConfig().modelRouting as RoutingPreset | undefined);
    const router = new ModelRouter(philosophy, routingPreset);
    const contextSignals = loadContextSignals();
    const result = router.route(prompt, contextSignals);
    return `\n[Tenet] 권장 모델: **${result.tier}** (source: ${result.source}, category: ${result.category}${result.score ? `, score: ${result.score.total}` : ''})`;
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

  const match = detectKeyword(input.prompt);

  if (!match) {
    // 키워드 없음 → 통과
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  if (match.type === 'cancel') {
    // 모든 모드 상태 초기화 (ralplan, deep-interview 포함)
    for (const mode of ['ralph', 'autopilot', 'ultrawork', 'team', 'pipeline', 'ccg', 'ralplan', 'deep-interview']) {
      clearState(`${mode}-state`);
    }
    // skill-cache 파일도 정리 (재주입 가능하도록)
    cleanSkillCaches();
    console.log(JSON.stringify({
      result: 'approve',
      message: match.message,
    }));
    return;
  }

  if (match.type === 'inject') {
    // 메시지 주입
    console.log(JSON.stringify({
      result: 'approve',
      message: match.message,
    }));
    return;
  }

  // 스킬 주입
  if (match.skill) {
    const skillContent = loadSkillContent(match.skill);
    const effectiveCwd = input.cwd ?? process.env.COMPOUND_CWD ?? process.cwd();
    const modelRec = getModelRecommendation(match.prompt ?? input.prompt, effectiveCwd);

    // 상태 저장
    saveState(`${match.skill}-state`, {
      active: true,
      startedAt: new Date().toISOString(),
      prompt: match.prompt,
      sessionId: input.session_id,
    });

    if (skillContent) {
      console.log(JSON.stringify({
        result: 'approve',
        message: `<compound-skill name="${match.skill}">\n${skillContent}\n</compound-skill>${modelRec}\n\nUser request: ${match.prompt}`,
      }));
    } else {
      console.log(JSON.stringify({
        result: 'approve',
        message: `[Tenet] ${match.keyword} 모드 활성화됨.${modelRec}\n\nUser request: ${match.prompt}`,
      }));
    }
    return;
  }

  console.log(JSON.stringify({ result: 'approve' }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
