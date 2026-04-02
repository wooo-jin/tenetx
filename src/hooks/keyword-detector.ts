#!/usr/bin/env node
/**
 * Tenetx — Keyword Detector Hook
 *
 * Claude Code UserPromptSubmit 훅으로 등록.
 * 사용자 프롬프트에서 매직 키워드를 감지하여 해당 스킬을 주입합니다.
 *
 * stdin: JSON { prompt: string, ... }
 * stdout: JSON { result: "block"|"approve", message?: string }
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../core/logger.js';

const log = createLogger('keyword-detector');
import { readStdinJSON } from './shared/read-stdin.js';
import { isHookEnabled } from './hook-config.js';
import { truncateContent, INJECTION_CAPS } from './shared/injection-caps.js';
import { sanitizeForDetection } from './shared/sanitize.js';
import { recordModeUsage } from '../engine/prompt-learner.js';
import { loadPackConfigs } from '../core/pack-config.js';
import { ALL_MODES, COMPOUND_HOME, PACKS_DIR, STATE_DIR } from '../core/paths.js';
import { atomicWriteJSON } from './shared/atomic-write.js';
import { escapeAllXmlTags } from './prompt-injection-filter.js';
import { getSkillConflicts } from '../core/plugin-detector.js';
import { approve, approveWithContext, failOpen } from './shared/hook-response.js';

/** Escape a string for safe use in XML attribute values */
function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface HookInput {
  prompt: string;
  session_id?: string;
  cwd?: string;
}

export interface KeywordMatch {
  type: 'skill' | 'inject' | 'cancel';
  keyword: string;
  skill?: string;
  prompt?: string;
  message?: string;
}

const WORKFLOW_TRACKED_INJECTS = new Set(['benchmark']);

export function shouldTrackWorkflowActivation(match: KeywordMatch): boolean {
  if (match.type === 'inject') return WORKFLOW_TRACKED_INJECTS.has(match.keyword);
  return match.type === 'skill';
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
  // 취소 — cancel-ralph 등 복합 취소를 단일 키워드보다 먼저 매칭
  { pattern: /\b(canceltenetx|stoptenetx|cancel[- ]?compound)\b/i, keyword: 'cancel', type: 'cancel' },
  { pattern: /\bcancel[- ]?ralph\b|랄프\s*(?:취소|중단|종료|멈춰)/i, keyword: 'cancel-ralph', type: 'cancel' },

  // 핵심 모드 — ralph는 명시적 모드 호출만 매칭 (false positive 방지)
  { pattern: /(?:^|\n)\s*ralph\s*$|ralph\s+(?:mode|모드|해|해줘|시작|실행)/im, keyword: 'ralph', type: 'skill', skill: 'ralph' },
  { pattern: /\bautopilot\b/i, keyword: 'autopilot', type: 'skill', skill: 'autopilot' },
  { pattern: /(?:\bteam[- ]?mode\b|(?:^|\s)--team\b)/i, keyword: 'team', type: 'skill', skill: 'team' },

  // 확장 모드
  { pattern: /\b(ulw|ultrawork)\b/i, keyword: 'ultrawork', type: 'skill', skill: 'ultrawork' },
  { pattern: /\bccg\b/i, keyword: 'ccg', type: 'skill', skill: 'ccg' },
  { pattern: /\bralplan\b/i, keyword: 'ralplan', type: 'skill', skill: 'ralplan' },
  { pattern: /\bdeep[- ]?interview\b/i, keyword: 'deep-interview', type: 'skill', skill: 'deep-interview' },
  { pattern: /\bpipeline\b/i, keyword: 'pipeline', type: 'skill', skill: 'pipeline' },
  { pattern: /\b(ecomode|에코\s*모드|토큰\s*절약)\b/i, keyword: 'ecomode', type: 'skill', skill: 'ecomode' },

  // 인젝션 모드
  { pattern: /\bultrathink\b/i, keyword: 'ultrathink', type: 'inject' },
  { pattern: /\bdeepsearch\b/i, keyword: 'deepsearch', type: 'inject' },
  { pattern: /(?:^|\s)tdd(?:\s+(?:모드|mode|방식|으로|해|해줘|시작|적용)|\s*$)/im, keyword: 'tdd', type: 'skill', skill: 'tdd' },
  { pattern: /(?:code[- ]?review|코드\s*리뷰)\s*(?:해|해줘|시작|해봐|부탁|mode|모드)/i, keyword: 'code-review', type: 'skill', skill: 'code-review' },
  { pattern: /(?:security[- ]?review|보안\s*리뷰|보안\s*검토)\s*(?:해|해줘|시작|해봐|부탁|mode|모드)/i, keyword: 'security-review', type: 'skill', skill: 'security-review' },

  // 실용 스킬 — 명시적 모드 호출만 매칭 (일상 단어 false positive 방지)
  { pattern: /\bgit[- ]?master\b/i, keyword: 'git-master', type: 'skill', skill: 'git-master' },
  { pattern: /\b(benchmark|벤치마크)\s*(?:mode|모드|해|해줘|시작|실행|돌려)|성능\s*측정/i, keyword: 'benchmark', type: 'inject' },
  { pattern: /\b(migrate|마이그레이션)\s*(?:mode|모드|해|해줘|시작|실행|진행)/i, keyword: 'migrate', type: 'skill', skill: 'migrate' },
  { pattern: /\b(debug[- ]?detective|디버그\s*탐정|체계적\s*디버깅)\b/i, keyword: 'debug-detective', type: 'skill', skill: 'debug-detective' },
  { pattern: /\b(refactor|리팩토링|리팩터)\s*(?:mode|모드|해|해줘|시작|실행|진행)/i, keyword: 'refactor', type: 'skill', skill: 'refactor' },
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

  'git-master': `<compound-git-master>
GIT MASTER MODE ACTIVATED.
Apply atomic commit strategy and clean history management:
1. One commit = one logical change (atomic)
2. Follow Conventional Commits: feat/fix/refactor/docs/chore(<scope>): <subject>
3. Use interactive rebase (git rebase -i) to clean up WIP commits before pushing
4. Never force-push to shared branches (main, develop)
5. Use git bisect for systematic bug hunt across commits
Commit message format: <type>(<scope>): <subject> — imperative, 50 chars max
</compound-git-master>`,

  benchmark: `<compound-benchmark>
BENCHMARK MODE ACTIVATED.
Measure performance with statistical rigor:
1. Collect baseline metrics FIRST (before any changes)
2. Run minimum 30 iterations (skip first 5 as warmup)
3. Calculate: avg, p95, p99, min, max
4. Measure: execution time (performance.now()), memory (process.memoryUsage()), bundle size
5. Output before/after comparison table with delta percentages
6. Use same environment for both measurements to ensure validity
</compound-benchmark>`,

  migrate: `<compound-migrate>
MIGRATION MODE ACTIVATED.
Follow the 5-phase safe migration workflow:
1. ANALYZE: Document current state, identify breaking changes, map affected files
2. PLAN: Decompose into atomic steps, define rollback triggers (error rate > N%)
3. BACKUP: Create DB dump + git tag as restore point before any changes
4. EXECUTE: Apply Expand-Contract pattern for zero-downtime DB changes
5. VERIFY: Run E2E tests, check data integrity, validate performance regression
Rollback criteria: error rate spike, latency > 2x baseline, data inconsistency
</compound-migrate>`,

  'debug-detective': `<compound-debug-detective>
DEBUG DETECTIVE MODE ACTIVATED.
Follow the Reproduce → Isolate → Fix → Verify loop:
1. REPRODUCE: Document exact conditions, input, expected vs actual, reproduction rate
2. ISOLATE: Classify error type (runtime/type/logic/async), use git bisect for regression
3. FIX: Address root cause (not symptoms), minimize change scope
4. VERIFY: Add regression test, confirm fix in staging before production
Error classification:
- Runtime: TypeError/ReferenceError → trace stack
- Logic: wrong output → add intermediate logging
- Async: race condition → check Promise chain, event ordering
Never guess — always reproduce first.
</compound-debug-detective>`,

  refactor: `<compound-refactor>
REFACTOR MODE ACTIVATED.
Safe refactoring with test-first approach:
1. SECURE TESTS: Characterization tests for untested code before touching anything
2. IDENTIFY SMELLS: Long functions (>50 lines), duplication, deep nesting (>3), magic numbers
3. APPLY SOLID: Single responsibility, Open-closed, Liskov, Interface segregation, Dependency inversion
4. REFACTOR CATALOG: Extract Method, Move Method, Replace Conditional with Polymorphism
5. VERIFY: Run full test suite after each refactoring step
Rules:
- Never mix refactoring + feature changes in the same commit
- One refactoring pattern per commit
- Keep tests green at all times
</compound-refactor>`,
};

// ── 스킬 파일 로드 ──

function loadSkillContent(skillName: string): string | null {
  // 스킬 파일 검색 순서: 프로젝트 > 연결된 팩 > 글로벌 팩 > 글로벌 > 패키지 내장
  const searchPaths = [
    path.join(process.cwd(), '.compound', 'skills', `${skillName}.md`),
    path.join(process.cwd(), 'skills', `${skillName}.md`),
  ];

  // 연결된 팩의 스킬 경로 수집 (skill-injector의 collectSkills와 동일한 방식)
  try {
    const connectedPacks = loadPackConfigs(process.cwd());
    for (const pack of connectedPacks) {
      // 프로젝트 네임스페이스 우선, 글로벌 팩 폴백
      const nsPath = path.join(process.cwd(), '.compound', 'packs', pack.name, 'skills', `${skillName}.md`);
      const globalPath = path.join(PACKS_DIR, pack.name, 'skills', `${skillName}.md`);
      searchPaths.push(nsPath, globalPath);
    }
  } catch {
    // 팩 설정 로드 실패 시 무시
  }

  // 사용자 개인 스킬 경로
  searchPaths.push(path.join(os.homedir(), '.compound', 'me', 'skills', `${skillName}.md`));

  // 글로벌 스킬 경로
  searchPaths.push(path.join(COMPOUND_HOME, 'skills', `${skillName}.md`));

  // tenetx 패키지 내장 스킬
  const pkgSkillPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', '..', 'commands', `${skillName}.md`
  );
  searchPaths.push(pkgSkillPath);

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      // Security: symlink을 통한 임의 파일 읽기 방지
      try { if (fs.lstatSync(p).isSymbolicLink()) continue; } catch { continue; }
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
      // entry.keyword의 RegExp 특수문자를 이스케이프하여 안전하게 사용
      const escapedKeyword = entry.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // g 플래그 제거: 첫 번째 매치만 제거하여 코드블록 내 동일 키워드 보존
      const extractedPrompt = prompt.replace(new RegExp(`\\b${escapedKeyword}\\b`, 'i'), '').trim();

      if (entry.type === 'cancel') {
        return { type: 'cancel', keyword: entry.keyword, message: '[Tenetx] Mode cancelled.' };
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
  atomicWriteJSON(path.join(STATE_DIR, `${key}.json`), data);
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
  } catch (e) { log.debug('skill-cache 파일 삭제 실패', e); }
}

// ── 메인 ──

async function main(): Promise<void> {
  const input = await readStdinJSON<HookInput>();
  if (!isHookEnabled('keyword-detector')) {
    console.log(approve());
    return;
  }
  if (!input?.prompt) {
    console.log(approve());
    return;
  }

  const match = detectKeyword(input.prompt);
  const sessionId = input.session_id ?? 'unknown';

  if (!match) {
    console.log(approve());
    return;
  }

  // Cache conflict map once for the duration of this hook execution
  const skillConflicts = getSkillConflicts(input.cwd ?? process.env.COMPOUND_CWD ?? process.cwd());

  if (match.type === 'cancel') {
    const cancelCwd = input.cwd ?? process.env.COMPOUND_CWD ?? process.cwd();

    if (match.keyword === 'cancel-ralph') {
      // ralph만 취소
      clearState('ralph-state');
      const ralphLoopState = path.join(cancelCwd, '.claude', 'ralph-loop.local.md');
      try { fs.unlinkSync(ralphLoopState); } catch { /* 파일 없으면 무시 */ }
    } else {
      // 모든 모드 상태 초기화 (ralplan, deep-interview 포함)
      for (const mode of ALL_MODES) {
        clearState(`${mode}-state`);
      }
      const ralphLoopState = path.join(cancelCwd, '.claude', 'ralph-loop.local.md');
      try { fs.unlinkSync(ralphLoopState); } catch { /* 파일 없으면 무시 */ }
    }
    // skill-cache 파일도 정리 (재주입 가능하도록)
    cleanSkillCaches();
    console.log(approveWithContext(match.message ?? '[Tenetx] Mode cancelled.', 'UserPromptSubmit'));
    return;
  }

  if (match.type === 'inject') {
    // Plugin conflict check: inject 타입도 다른 플러그인과 충돌하면 스킵
    // (tdd, code-review 등이 OMC/superpowers와 이중 실행되는 것을 방지)
    const conflictPlugin = skillConflicts.get(match.keyword);
    if (conflictPlugin) {
      log.debug(`Skipping inject "${match.keyword}" — provided by ${conflictPlugin}`);
      console.log(approve());
      return;
    }
    if (shouldTrackWorkflowActivation(match)) {
      try { recordModeUsage(match.keyword, input.session_id ?? 'unknown'); } catch (e) { log.debug('inject mode usage 기록 실패', e); }
    }
    console.log(approveWithContext(match.message ?? `[Tenetx] ${match.keyword} mode activated.`, 'UserPromptSubmit'));
    return;
  }

  // 스킬 주입
  if (match.skill) {
    // Plugin conflict check: if a plugin already provides this skill, skip injection
    const conflictPlugin = skillConflicts.get(match.skill);
    if (conflictPlugin) {
      log.debug(`Skipping keyword "${match.keyword}" — skill provided by ${conflictPlugin}`);
      console.log(approve());
      return;
    }
    // Compound: mode usage 기록
    try { recordModeUsage(match.skill, input.session_id ?? 'unknown'); } catch (e) { log.debug('skill mode usage 기록 실패', e); }
    const skillContent = loadSkillContent(match.skill);
    const effectiveCwd = input.cwd ?? process.env.COMPOUND_CWD ?? process.cwd();

    // 상태 저장
    saveState(`${match.skill}-state`, {
      active: true,
      startedAt: new Date().toISOString(),
      prompt: match.prompt,
      sessionId: input.session_id,
    });

    // ralph 스킬 활성화 시 ralph-loop 플러그인 상태 파일도 생성
    if (match.skill === 'ralph') {
      const ralphLoopDir = path.join(effectiveCwd, '.claude');
      const ralphLoopState = path.join(ralphLoopDir, 'ralph-loop.local.md');
      fs.mkdirSync(ralphLoopDir, { recursive: true });
      const frontmatter = [
        '---',
        'active: true',
        'iteration: 1',
        `session_id: ${input.session_id ?? ''}`,
        'max_iterations: 0',
        'completion_promise: "TASK COMPLETE"',
        `started_at: "${new Date().toISOString()}"`,
        '---',
        '',
        match.prompt ?? input.prompt,
      ].join('\n');
      fs.writeFileSync(ralphLoopState, frontmatter);
    }

    if (skillContent) {
      const truncatedContent = truncateContent(skillContent, INJECTION_CAPS.skillContentMax);
      console.log(approveWithContext(`<compound-skill name="${escapeXmlAttr(match.skill)}">\n${escapeAllXmlTags(truncatedContent)}\n</compound-skill>\n\nUser request: ${match.prompt}`, 'UserPromptSubmit'));
    } else {
      console.log(approveWithContext(`[Tenetx] ${match.keyword} mode activated.\n\nUser request: ${match.prompt}`, 'UserPromptSubmit'));
    }
    return;
  }

  console.log(approve());
}

// ESM main guard: 다른 모듈에서 import 시 main() 실행 방지
// realpathSync로 symlink 해석 (플러그인 캐시가 symlink일 때 경로 불일치 방지)
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
    console.log(failOpen());
  });
}
