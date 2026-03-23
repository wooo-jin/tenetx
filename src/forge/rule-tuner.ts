/**
 * Tenetx Forge — Rule Tuner
 *
 * 차원 벡터에서 .claude/rules/ 에 삽입할 규칙 파일을 동적 생성.
 * 각 차원이 여러 규칙에 영향을 미치는 연속적 매핑.
 *
 * 규칙은 구체적이고 실행 가능 — 모호한 지시가 아닌
 * 정확한 형식과 기준을 명시.
 */

import type { DimensionVector } from './types.js';

// ── Types ───────────────────────────────────────────

export interface TunedRule {
  filename: string;
  content: string;
}

// ── Helpers ─────────────────────────────────────────

/** 중립에서의 편차 */
function deviation(value: number): number {
  return Math.abs(value - 0.5);
}

/** 선형 보간 */
function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

// ── Rule Generators ─────────────────────────────────

/** 커뮤니케이션 규칙 생성 */
function communicationRule(dims: DimensionVector): TunedRule | null {
  const comm = dims.communicationStyle ?? 0.5;
  if (deviation(comm) < 0.1) return null;

  const lines: string[] = ['# Tenetx Forge — Communication Style', '<!-- forge-tuned -->', ''];

  if (comm >= 0.5) {
    // terse 방향
    const maxSentences = Math.round(lerp(comm, 5, 2));
    lines.push('## Response Format');
    lines.push(`- Keep responses under ${maxSentences} sentences unless showing code`);
    if (comm >= 0.65) lines.push('- No preamble ("Let me...", "I will now...") or trailing summary paragraphs');
    if (comm >= 0.75) lines.push('- Use bullet points exclusively. No prose paragraphs. No transition sentences between sections.');
    if (comm >= 0.85) lines.push('- Omit all meta-commentary: no "I will now...", "Let me...", "Here is...", "As you can see..." phrases');
    if (comm >= 0.9) lines.push('- Responses under 3 sentences. No greeting, no sign-off. Code blocks only when asked or when they add essential clarity.');
    lines.push('- Code over explanation when code is clear');
    if (comm >= 0.7) lines.push('- For code review findings: use format [SEVERITY] file:line — issue. No additional explanation unless the fix is non-obvious.');
    if (comm >= 0.8) lines.push('- Skip positive feedback entirely. Only report problems.');
  } else {
    // verbose 방향
    lines.push('## Response Format');
    lines.push('- Explain the reasoning behind code changes and design decisions');
    if (comm <= 0.35) lines.push('- Include alternative approaches considered with pros/cons for each');
    if (comm <= 0.25) lines.push('- Document all assumptions and constraints explicitly. List preconditions for complex operations.');
    if (comm <= 0.2) lines.push('- For each decision, explain: what problem it solves, what alternatives exist, what trade-offs were made, and what risks remain');
    lines.push('- Provide context for non-obvious decisions');
    if (comm <= 0.35) lines.push('- Use inline code comments to explain complex logic. Comments should explain "why" not "what".');
    if (comm <= 0.25) lines.push('- Include examples for abstract concepts. Show usage alongside API definitions.');
  }

  return { filename: 'forge-communication.md', content: lines.join('\n') };
}

/** 자율성 규칙 생성 */
function autonomyRule(dims: DimensionVector): TunedRule | null {
  const autonomy = dims.autonomyPreference ?? 0.5;
  if (deviation(autonomy) < 0.1) return null;

  const lines: string[] = ['# Tenetx Forge — Autonomy Level', '<!-- forge-tuned -->', ''];

  if (autonomy >= 0.5) {
    lines.push('## Execution Policy');
    lines.push('- Execute without asking for confirmation on well-defined tasks');
    if (autonomy >= 0.65) lines.push('- Make judgment calls on implementation details (data structures, naming, patterns) autonomously');
    if (autonomy >= 0.75) lines.push('- Auto-fix lint errors, formatting issues, and unused imports without asking. Apply auto-fixable diagnostics immediately.');
    if (autonomy >= 0.85) lines.push('- Only stop for genuinely ambiguous requirements, destructive production operations, or tasks requiring business context not in the codebase');
    if (autonomy >= 0.9) lines.push('- No "Should I proceed?" or "Would you like me to..." questions. Act. Report results.');
    lines.push('- Fix obvious issues inline during implementation');
    if (autonomy >= 0.7) lines.push('- When multiple valid approaches exist, pick the one most consistent with existing codebase patterns. No need to present alternatives.');
  } else {
    lines.push('## Execution Policy');
    lines.push('- Show plan before executing multi-step operations');
    if (autonomy <= 0.35) lines.push('- Wait for explicit approval before each implementation step. Show proposed changes as diffs before applying.');
    if (autonomy <= 0.25) lines.push('- Ask before modifying any file not explicitly mentioned in the request. Never touch adjacent files without permission.');
    if (autonomy <= 0.2) lines.push('- Present alternatives with trade-offs and let the user choose the approach. Do not make architectural decisions independently.');
    lines.push('- Explain intent before making changes');
    if (autonomy <= 0.35) lines.push('- For multi-file changes, list all files that will be modified and the nature of each change before starting');
    if (autonomy <= 0.25) lines.push('- Never auto-apply suggestions. Present proposed changes and wait for "apply" or "approve" command.');
  }

  return { filename: 'forge-autonomy.md', content: lines.join('\n') };
}

/** 품질 규칙 생성 */
function qualityRule(dims: DimensionVector): TunedRule | null {
  const quality = dims.qualityFocus ?? 0.5;
  if (deviation(quality) < 0.1) return null;

  const lines: string[] = ['# Tenetx Forge — Quality Standards', '<!-- forge-tuned -->', ''];

  if (quality >= 0.5) {
    const coverageTarget = Math.round(lerp(quality, 40, 90));
    lines.push('## Quality Gates');
    lines.push(`- Target test coverage: ${coverageTarget}% on changed code paths`);
    if (quality >= 0.65) lines.push('- Write tests alongside or before implementation. Each new public function gets at least one happy-path and one error-path test.');
    if (quality >= 0.75) lines.push('- Verify build, lint, and type-check all pass before marking any task complete. Zero warnings policy on changed files.');
    if (quality >= 0.85) lines.push('- Include branch coverage, not just line coverage. Test boundary conditions (empty input, max values, null/undefined).');
    lines.push('- Review edge cases and error handling for business-critical functions');
    if (quality >= 0.8) lines.push('- No PR without test coverage on changed code paths. Block merge if coverage drops below threshold.');
    if (quality >= 0.9) lines.push('- Mutation testing for critical business logic. Every conditional branch must have a test that would fail if the condition were inverted.');
  } else {
    lines.push('## Quality Standards');
    lines.push('- Focus on core functionality first. Working code is the priority over perfect code.');
    if (quality <= 0.35) lines.push('- Tests optional for exploratory code, one-off scripts, and generated boilerplate');
    if (quality <= 0.25) lines.push('- Skip test boilerplate for scripts under 50 lines. No coverage requirements for prototypes. Focus on working code, not perfect code.');
    if (quality <= 0.2) lines.push('- Skip lint fixes that do not affect functionality. Formatting is auto-fixable and not worth manual attention.');
    lines.push('- Working code is the priority over perfect code');
    if (quality <= 0.3) lines.push('- No formal code review required for changes under 50 lines or config-only changes');
    if (quality <= 0.25) lines.push('- Smoke test the happy path only. Edge cases and error paths can be addressed when bugs are reported.');
  }

  return { filename: 'forge-quality.md', content: lines.join('\n') };
}

/** 위험 관리 규칙 생성 */
function riskRule(dims: DimensionVector): TunedRule | null {
  const risk = dims.riskTolerance ?? 0.5;
  if (deviation(risk) < 0.1) return null;

  const lines: string[] = ['# Tenetx Forge — Risk Management', '<!-- forge-tuned -->', ''];

  if (risk < 0.5) {
    lines.push('## Safety Requirements');
    if (risk <= 0.25) lines.push('- Always confirm before destructive operations (rm -rf, force-push, DROP TABLE, git reset --hard). Create backup before proceeding.');
    if (risk <= 0.3) lines.push('- Review diff before every commit. Verify no unintended changes are staged. Use `git add -p` over `git add .`.');
    lines.push('- Prefer small incremental changes (under 200 lines) over large refactors');
    if (risk <= 0.2) lines.push('- Create backups before modifying critical configuration files, database schemas, or deployment configs');
    if (risk <= 0.35) lines.push('- Run full test suite before committing. Verify no regressions in unrelated modules.');
    if (risk <= 0.25) lines.push('- Database migrations require rollback procedure documentation. Test both up and down migrations.');
    if (risk <= 0.3) lines.push('- Never push directly to main/master. Always use feature branches with PR review.');
  } else {
    lines.push('## Execution Speed');
    lines.push('- Minimize confirmation prompts for routine operations');
    if (risk >= 0.65) lines.push('- Accept calculated risks for faster iteration. Ship behind feature flags to reduce blast radius.');
    if (risk >= 0.75) lines.push('- Trust CI pipeline to catch issues post-commit. No need to run full test suite locally for every change.');
    if (risk >= 0.85) lines.push('- Hotfixes can go straight to main with post-merge review. Speed of fix delivery outweighs process compliance.');
    lines.push('- Quick fixes are acceptable for non-critical issues');
    if (risk >= 0.7) lines.push('- Breaking changes are acceptable when they simplify the codebase. Prefer clean breaks over backward-compatible shims.');
    if (risk >= 0.8) lines.push('- Work-in-progress commits are fine. Fixup and squash before merge if needed, but do not block on commit cleanliness.');
  }

  return { filename: 'forge-risk.md', content: lines.join('\n') };
}

/** 추상화 규칙 생성 */
function abstractionRule(dims: DimensionVector): TunedRule | null {
  const abstraction = dims.abstractionLevel ?? 0.5;
  if (deviation(abstraction) < 0.1) return null;

  const lines: string[] = ['# Tenetx Forge — Abstraction Level', '<!-- forge-tuned -->', ''];

  if (abstraction >= 0.5) {
    lines.push('## Design Standards');
    if (abstraction >= 0.65) lines.push('- Define interfaces and type contracts before writing implementation code');
    if (abstraction >= 0.7) lines.push('- Apply SOLID principles. Single Responsibility for classes/modules. Dependency Inversion for cross-module communication.');
    lines.push('- Consider extensibility and separation of concerns for modules with multiple responsibilities');
    if (abstraction >= 0.75) lines.push('- Document architectural decisions inline. Use ADR format for significant choices: context, decision, consequences.');
    if (abstraction >= 0.85) lines.push('- Apply appropriate design patterns (Strategy, Observer, Factory) for recurring problems. Name patterns explicitly in comments.');
    if (abstraction >= 0.9) lines.push('- Create module boundary documentation. Define which modules may import from which. Enforce dependency direction rules.');
  } else {
    lines.push('## Implementation Standards');
    lines.push('- No speculative abstractions — implement only what is needed for the current feature');
    if (abstraction <= 0.35) lines.push('- Prefer direct implementation over design patterns. No Factory/Strategy/Observer for single-use cases.');
    if (abstraction <= 0.25) lines.push('- Flat is better than nested. Maximum 2 levels of indirection. If you need to trace 3 files to understand a flow, flatten it.');
    lines.push('- Remove unused code aggressively — no "might need later" code');
    if (abstraction <= 0.25) lines.push('- Inline small utilities (under 10 lines). A clear inline block is better than a named function with a context-switch cost.');
    if (abstraction <= 0.3) lines.push('- Do not create utility/helper files for single-use functions. Keep logic close to where it is used.');
    if (abstraction <= 0.2) lines.push('- Reject new abstractions in code review unless the reviewer can show 3+ existing call sites that would benefit.');
  }

  return { filename: 'forge-abstraction.md', content: lines.join('\n') };
}

// ── Public API ──────────────────────────────────────

const ALL_RULE_GENERATORS = [
  communicationRule,
  autonomyRule,
  qualityRule,
  riskRule,
  abstractionRule,
];

/** 차원 벡터에서 규칙 파일 목록 생성 */
export function generateTunedRules(dims: DimensionVector): TunedRule[] {
  const rules: TunedRule[] = [];

  for (const generator of ALL_RULE_GENERATORS) {
    const rule = generator(dims);
    if (rule) rules.push(rule);
  }

  return rules;
}
