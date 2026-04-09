/**
 * Tenetx v1 — Config Injector
 *
 * v1 설계: Rule Renderer + Profile 기반 규칙 생성.
 * philosophy/scope/pack ��반 직접 규칙 생성은 제거됨.
 *
 * Authoritative: docs/plans/2026-04-03-tenetx-rule-renderer-spec.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_BEHAVIOR, ME_DIR, ME_RULES } from './paths.js';
import { createLogger } from './logger.js';
import { parseSolutionV3 } from '../engine/solution-format.js';
import { containsPromptInjection } from '../hooks/prompt-injection-filter.js';
import { RULE_FILE_CAPS, truncateContent } from '../hooks/shared/injection-caps.js';

const log = createLogger('config-injector');

/** 프로젝트 맵 타입 */
interface ProjectMap {
  summary: {
    name: string;
    totalFiles: number;
    totalLines: number;
    framework?: string;
    packageManager?: string;
    languages: Record<string, number>;
  };
  entryPoints: string[];
  directories: Array<{ path: string; purpose?: string }>;
}

/**
 * 디렉토리의 .md 파일에서 규칙 첫 줄(요약)을 추출.
 * trusted=false일 때 프롬프트 인젝션 스캔 적용.
 */
function loadRulesFromDir(dir: string, trusted = true): string[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(dir, f);
        if (fs.lstatSync(filePath).isSymbolicLink()) return null;

        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseSolutionV3(content);
        const body = parsed ? parsed.content : stripFrontmatter(content);

        if (!trusted) {
          if (containsPromptInjection(body)) {
            log.debug(`규칙 파일 인젝션 감지 — 차단: ${filePath}`);
            return null;
          }
        }

        const firstLine = firstMeaningfulLine(body);
        return firstLine ?? f.replace('.md', '');
      })
      .filter((rule): rule is string => Boolean(rule));
  } catch (e) {
    log.debug(`규칙 디렉토리 읽기 실패: ${dir}`, e);
    return [];
  }
}

function stripFrontmatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) return content;
  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) return content;
  return trimmed.slice(endIdx + 3);
}

function firstMeaningfulLine(content: string): string | null {
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '## Context' || line === '## Content') continue;
    return line.replace(/^#+\s*/, '').trim();
  }
  return null;
}

/** 프로젝트 맵에서 에이전트용 요약 생성 */
function loadProjectMapSummary(cwd: string): string | null {
  const mapPath = path.join(cwd, '.compound', 'project-map.json');
  if (!fs.existsSync(mapPath)) return null;

  try {
    const map: ProjectMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    const { summary } = map;
    const lines: string[] = [];

    lines.push(`- Project: ${summary.name} (${summary.totalFiles} files, ${summary.totalLines.toLocaleString()} lines)`);
    if (summary.framework) lines.push(`- Framework: ${summary.framework}`);
    if (summary.packageManager) lines.push(`- Package manager: ${summary.packageManager}`);

    const topLangs = Object.entries(summary.languages)
      .sort((a, b) => b[1] - a[1])
      .filter(([l]) => l !== 'other')
      .slice(0, 3);
    if (topLangs.length > 0) {
      lines.push(`- Languages: ${topLangs.map(([l, n]) => `${l}(${n} lines)`).join(', ')}`);
    }

    if (map.entryPoints.length > 0) {
      lines.push(`- Entry points: ${map.entryPoints.slice(0, 5).join(', ')}`);
    }

    const topDirs = map.directories
      .filter(d => d.purpose && !d.path.includes('/'))
      .slice(0, 8);
    if (topDirs.length > 0) {
      lines.push('- Directories:');
      for (const dir of topDirs) {
        lines.push(`  - \`${dir.path}/\` — ${dir.purpose}`);
      }
    }

    return lines.join('\n');
  } catch {
    return null;
  }
}

// ── v1 Static Rules ──

/** 보안 규칙 (정적 — v1 GLOBAL_SAFETY_RULES와 동일 맥락) */
export function generateSecurityRules(): string {
  return [
    '# Tenetx — Security Rules',
    '',
    '## Dangerous Command Warning',
    '- Always confirm before executing destructive commands like `rm -rf`, `git push --force`, `DROP TABLE`',
    '- Double confirmation required for production environment access',
    '',
    '## Secret Key Protection',
    '- Do not commit sensitive information such as `.env`, `credentials.json`, API keys',
    '- Manage through environment variables or a secrets manager',
    '- Detect hardcoded secrets during code review',
    '',
  ].join('\n');
}

/** 안티패턴 감지 규칙 (정적) */
export function generateAntiPatternRules(): string {
  return [
    '# Tenetx — Anti-Pattern Detection',
    '',
    '## Repeated Edit Warning',
    '- Stop immediately when editing the same file 3+ times → full structure redesign required',
    '- For 5+ edits, always check current state with Read before replacing with a single Write',
    '',
    '## Error Suppression Warning',
    '- No empty catch blocks — at minimum log or re-throw',
    '- Minimize suppression comments like eslint-disable, @ts-ignore',
    '',
    '## Excessive Complexity Warning',
    '- Consider splitting single functions exceeding 50 lines',
    '- Apply early return pattern when nesting depth exceeds 4',
    '- No unnecessary abstraction — implement only what is currently needed',
    '',
  ].join('\n');
}

/** compound loop + 개인 규칙 (me/rules) 로드 */
export function generateCompoundRules(cwd: string): string {
  const lines: string[] = [
    '# Tenetx — Compound Loop',
    '',
  ];

  // 프로젝트 맵 요약 주입
  const mapSummary = loadProjectMapSummary(cwd);
  if (mapSummary) {
    lines.push('## Project Structure (auto-generated)');
    lines.push(mapSummary);
    lines.push('');
  }

  // 개인 규칙 로드
  const meRules = loadRulesFromDir(ME_RULES);
  if (meRules.length > 0) {
    lines.push('## Personal Rules (Me)');
    for (const rule of meRules) {
      lines.push(`- ${rule}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Phrases that indicate a "pattern" is actually echoing a Claude response
 * rather than a genuine user-behavior signal. Observed in production:
 * auto-compound was picking up snippets of its own output ("다음 대화에서
 * 분석하겠습니다", "3개 패턴을 메모리에 추가했습니다", "Step 1 완료") and
 * treating them as learned user patterns.
 *
 * C5 fix (2026-04-09): filter these at render time so they never reach
 * `~/.claude/rules/forge-behavioral.md`. The source files under
 * `~/.tenetx/me/behavior/` are left in place — this is a display-time
 * filter, not a data-mutation step, so a bad filter regex here can't
 * destroy legitimate history.
 *
 * Anchoring rules (H-2 fix):
 *   1. Every regex is either START-anchored (`^`) or requires a narrow
 *      prefix context. A bare `/분석하겠습니다/` would false-positive on
 *      a legit user pattern like "관련 문서를 분석하겠습니다" (the user
 *      stating their preference to analyze docs). Anchoring prevents
 *      this by requiring the phrase to be the *beginning* of the line,
 *      which is the actual Claude-response failure mode.
 *   2. Self-reference to the tool itself (`tenetx`/`compound`) is
 *      narrowed to meta-announcement shapes like "N개 패턴을 …에 추가"
 *      — a legit user rule like "use compound when refactoring" is
 *      NOT filtered. The earlier bare `/tenetx|compound/i` would have
 *      dropped any user pattern that happened to name the tool.
 *   3. English Claude-response templates are covered too. Auto-compound
 *      will eventually process mixed-language transcripts and the
 *      filter must catch English leakage as well as Korean.
 */
const SELF_REFERENTIAL_PATTERNS: readonly RegExp[] = Object.freeze([
  // Korean — Claude-voice announcements at line start.
  // Note: we deliberately DO NOT filter bare `/분석하겠습니다/` because
  // a user rule like "관련 문서를 분석하겠습니다" is a legitimate
  // user-voice statement. The "다음/이번/현재 (대화|세션|작업)에서"
  // prefix + "분석하겠습니다" suffix is Claude-voice; the prefix alone
  // is enough of a discriminator.
  /^관찰된 새로운 패턴 없습니다/,
  /^\d+개 패턴을.*(메모리|compound|tenetx).*(추가|기록)/,
  /^계획이 진행 중/,
  /^(다음|이번|현재) (대화|세션|작업)에서/,
  /^Step \d/,
  // English — Claude response templates at line start.
  /^I['\u2019]?ll\s+(analyze|review|check|update|add|create|run|fix)/i,
  /^Let me\s+(analyze|check|look|verify|update|add)/i,
  /^I['\u2019]?ve\s+(added|updated|created|fixed|completed)/i,
  // Object.freeze is defense-in-depth: the readonly type is compile-time
  // only. Freezing prevents runtime mutation by any other module loaded
  // in the same process from silently disabling the filter by pushing
  // an over-broad pattern or emptying the array.
]);

/**
 * Strip formatting that already exists in the source line BEFORE the
 * renderer adds its own prefix/suffix. Without this, a behavior file
 * whose content begins with `- **[의사결정]** ... (3회 관찰)` ends up
 * rendered as `- - **[의사결정]** ... (3회 관찰) (1회 관찰)` — double
 * bullet + double count observed in production.
 *
 * Exported under `__testOnly` below for C5 regression coverage.
 */
function normalizeDescription(raw: string): string {
  let desc = raw.trim();
  // Strip any number of leading bullet markers: `- `, `* `, `• `
  desc = desc.replace(/^(?:[-*•]\s+)+/, '');
  // Strip trailing inline "N회 관찰" suffixes (can be chained from
  // earlier render passes). Note the space before the paren.
  desc = desc.replace(/(?:\s*\(\d+회 관찰\))+$/, '');
  return desc.trim();
}

/**
 * 학습된 선호/사고 패턴을 규칙으로 변환.
 */
function generateBehavioralRules(): string {
  const lines: string[] = ['# Tenetx — Learned Patterns', '# auto-generated from observed interactions', ''];

  try {
    if (!fs.existsSync(ME_BEHAVIOR)) return lines.join('\n');

    const files = fs.readdirSync(ME_BEHAVIOR).filter(f => f.endsWith('.md'));
    const categories: Record<string, string[]> = {
      'Thinking Style': [],
      'Response Preferences': [],
      'Workflow': [],
    };

    for (const file of files) {
      const filePath = path.join(ME_BEHAVIOR, file);
      if (fs.lstatSync(filePath).isSymbolicLink()) continue;
      const raw = fs.readFileSync(filePath, 'utf-8');

      const trimmed = raw.trimStart();
      if (!trimmed.startsWith('---')) continue;
      const endIdx = trimmed.indexOf('---', 3);
      if (endIdx === -1) continue;
      const fm = trimmed.slice(3, endIdx);
      const body = trimmed.slice(endIdx + 3).trim();

      const kindMatch = fm.match(/^kind:\s*(.+)$/m);
      const countMatch = fm.match(/^observedCount:\s*(\d+)/m);
      const kind = kindMatch?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
      const observedCount = countMatch ? parseInt(countMatch[1], 10) : 0;

      const contentIdx = body.indexOf('## Content');
      const contentBody = contentIdx >= 0 ? body.slice(contentIdx + '## Content'.length) : body;
      const rawDesc = contentBody.split('\n').find(l => {
        const t = l.trim();
        return t.length >= 5 && !t.startsWith('##');
      });
      if (!rawDesc) continue;

      // C5: strip any pre-existing bullet/count formatting so we don't
      // stack `- -` and `(3회 관찰) (1회 관찰)` on re-render.
      const desc = normalizeDescription(rawDesc);
      if (desc.length < 5) continue;

      // C5: filter self-referential noise (Claude's own responses
      // captured as "user patterns").
      if (SELF_REFERENTIAL_PATTERNS.some(re => re.test(desc))) continue;

      // C5 security hardening (MEDIUM-1 from review): reject any
      // behavior-file content that looks like a prompt injection
      // payload. `generateCompoundRules`'s `loadRulesFromDir` already
      // runs this check with `trusted=false` — this mirrors it for
      // the auto-compound-populated behavior directory, which is a
      // higher-risk input source because payloads can be injected
      // indirectly via transcripts/commit messages that auto-compound
      // observes. Without this filter, a crafted user prompt could
      // cause a malicious instruction to be written into
      // `forge-behavioral.md` and re-injected on every session.
      if (containsPromptInjection(desc)) continue;

      const countStr = observedCount > 0
        ? ` (${observedCount}회 관찰)`
        : '';

      if (kind === 'thinking') {
        categories['Thinking Style'].push(`- ${desc}${countStr}`);
      } else if (kind === 'workflow') {
        // observedCount >= 3인 워크플로우는 directive 형태로 렌더링
        if (observedCount >= 3) {
          categories.Workflow.push(`- **[적용]** ${desc}${countStr}`);
        } else {
          categories.Workflow.push(`- ${desc}${countStr}`);
        }
      } else if (kind === 'preference') {
        categories['Response Preferences'].push(`- ${desc}${countStr}`);
      }
    }

    for (const [cat, items] of Object.entries(categories)) {
      if (items.length === 0) continue;
      lines.push(`## ${cat}`);
      if (cat === 'Workflow') {
        lines.push('> Items marked **[적용]** are confirmed patterns (3+ observations). Follow these as default workflow unless the user overrides.');
      }
      lines.push(...items);
      lines.push('');
    }
  } catch {
    // 행동 디렉토리 접근 실패 시 빈 규칙
  }

  return lines.length <= 3 ? '' : lines.join('\n');
}

/** 모든 규칙 파일을 생성하여 반환. v1RenderedRules가 있으면 포함. */
export function generateClaudeRuleFiles(cwd: string, v1RenderedRules?: string | null): Record<string, string> {
  const v1Rules = v1RenderedRules
    ? `# Tenetx v1 — Rendered Rules\n# auto-generated from profile + rule store\n\n${v1RenderedRules}`
    : null;

  // 정적 규칙 + compound
  const coreSections = [
    generateSecurityRules(),
    generateAntiPatternRules(),
    generateCompoundRules(cwd),
  ].filter(s => s.trim().length > 0);

  const rules: Record<string, string> = {
    'project-context.md': coreSections.join('\n\n---\n\n'),
  };

  // v1 rendered rules (profile 기반 개인화 규칙)
  if (v1Rules) {
    rules['v1-rules.md'] = v1Rules;
  }

  // 학습된 행동 패턴
  const behavioral = generateBehavioralRules();
  if (behavioral) {
    rules['forge-behavioral.md'] = behavioral;
  }

  // USER.md → 사용자 프로필 주입
  const userMdPath = path.join(ME_DIR, 'USER.md');
  try {
    if (fs.existsSync(userMdPath) && !fs.lstatSync(userMdPath).isSymbolicLink()) {
      const raw = fs.readFileSync(userMdPath, 'utf-8').trim();
      if (raw.length > 0) {
        const truncated = truncateContent(raw, RULE_FILE_CAPS.perRuleFile);
        rules['user-profile.md'] = [
          '# Tenetx — User Profile',
          '# auto-injected from ~/.tenetx/me/USER.md',
          '',
          truncated,
          '',
        ].join('\n');
      }
    }
  } catch (e) {
    log.debug('USER.md 로드 실���', e);
  }

  return rules;
}

/** 하위 호환: 단일 규칙 문자열 생성 */
export function generateClaudeRules(cwd: string, v1RenderedRules?: string | null): string {
  const files = generateClaudeRuleFiles(cwd, v1RenderedRules);
  return Object.values(files).join('\n');
}

/** tmux 키바인딩 등록 */
export async function registerTmuxBindings(): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync('tmux', ['bind-key', 'T', 'run-shell', 'tenetx me'], { stdio: 'ignore' });
  } catch (e) {
    log.debug('tmux 키바인딩 등��� 실패', e);
  }
}

/** 환경변수로 하네스 컨텍스트 전달 (v1) */
export function buildEnv(cwd: string, v1SessionId?: string): Record<string, string> {
  const env: Record<string, string> = {
    COMPOUND_HARNESS: '1',
    COMPOUND_CWD: cwd,
    TENETX_V1: '1',
  };
  if (v1SessionId) {
    env.TENETX_SESSION_ID = v1SessionId;
  }
  return env;
}

/**
 * Test-only exports for the C5 rendering pipeline. The ergonomic choice
 * over `export function normalizeDescription` is intentional: anything
 * reached via `__testOnly` is explicitly flagged as "not for production
 * callers" and easy to grep for in future refactors.
 */
export const __testOnly = {
  normalizeDescription,
  SELF_REFERENTIAL_PATTERNS,
};
