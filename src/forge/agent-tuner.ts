/**
 * Tenetx Forge — Agent Prompt Tuner
 *
 * 차원 벡터에서 에이전트별 프롬프트 오버레이를 생성.
 * 각 에이전트의 행동을 사용자 프로필에 맞게 연속적으로 조정.
 *
 * 각 차원은 풍부한 행동 지시 문장을 생성 — 체크리스트 조각이 아닌
 * 개발자에 대한 브리핑 형태의 오버레이.
 */

import type { DimensionVector } from './types.js';

// ── Types ───────────────────────────────────────────

export interface AgentOverlay {
  agentName: string;
  /** 프롬프트에 삽입할 행동 지시문 */
  behaviorModifiers: string[];
  /** 연속 파라미터 (0-1) */
  parameters: {
    strictness: number;
    verbosity: number;
    autonomy: number;
    depth: number;
  };
}

// ── Interpolation Helpers ───────────────────────────

/** 선형 보간: dimension 0-1 범위에서 low-high 사이 값 계산 */
function lerp(dimension: number, low: number, high: number): number {
  return low + dimension * (high - low);
}

/** 0-1 값을 서술적 강도로 변환 */
function intensityWord(v: number): string {
  if (v >= 0.85) return 'extremely';
  if (v >= 0.7) return 'highly';
  if (v >= 0.55) return 'moderately';
  if (v >= 0.45) return 'somewhat';
  if (v >= 0.3) return 'moderately';
  if (v >= 0.15) return 'highly';
  return 'extremely';
}

// ── Agent-specific Overlay Generators ───────────────

type AgentOverlayGenerator = (dims: DimensionVector) => Omit<AgentOverlay, 'agentName'>;

const AGENT_GENERATORS: Record<string, AgentOverlayGenerator> = {
  'code-reviewer': (dims) => {
    const quality = dims.qualityFocus ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const risk = dims.riskTolerance ?? 0.5;
    const autonomy = dims.autonomyPreference ?? 0.5;

    const modifiers: string[] = [];

    // Review Depth — continuous paragraph based on quality
    if (quality >= 0.5) {
      modifiers.push(
        `Review Depth: You are reviewing for a developer who ${intensityWord(quality)} values thoroughness. ` +
        `Check logic correctness, ${quality >= 0.7 ? 'SOLID principle adherence, ' : ''}naming consistency, ` +
        `and edge case coverage. ${quality >= 0.8 ? 'Do NOT skip style issues — they matter to this developer. ' : ''}` +
        `Flag any function over ${Math.round(lerp(quality, 60, 30))} lines as a complexity concern.`,
      );
    } else {
      modifiers.push(
        `Review Depth: You are reviewing for a developer who prioritizes speed. ` +
        `Only flag ${quality <= 0.25 ? 'critical bugs that would cause runtime errors or security vulnerabilities' : 'bugs and clear logic errors'}. ` +
        `${quality <= 0.3 ? 'Ignore style, naming, and minor logic issues entirely.' : 'Mention style issues only if they harm readability.'}`,
      );
    }

    // Communication — continuous paragraph based on comm
    if (comm >= 0.5) {
      modifiers.push(
        `Communication: This developer prefers ${intensityWord(comm)} concise feedback. ` +
        `Use format: [SEVERITY] file:line — issue${comm >= 0.7 ? ' (no explanation unless critical)' : ''}. ` +
        `${comm >= 0.8 ? 'Skip positive feedback entirely.' : 'Include positive feedback only for exceptional patterns.'}`,
      );
    } else {
      modifiers.push(
        `Communication: This developer wants ${intensityWord(1 - comm)} detailed explanations. ` +
        `For each issue found, explain WHY it is a problem${comm <= 0.3 ? ', show the fix, and suggest alternatives' : ' and show the fix'}. ` +
        `${comm <= 0.25 ? 'Include positive feedback on good patterns to reinforce them.' : 'Mention good patterns when noteworthy.'}`,
      );
    }

    // Autonomy — continuous paragraph
    if (autonomy >= 0.5) {
      modifiers.push(
        `Autonomy: This developer trusts AI judgment. ` +
        `${autonomy >= 0.7 ? 'Auto-approve if no issues above "warn" level. Do not ask for confirmation on style fixes.' : 'Suggest fixes directly, ask confirmation only for architectural concerns.'}`,
      );
    } else {
      modifiers.push(
        `Autonomy: This developer wants to review your suggestions. ` +
        `${autonomy <= 0.3 ? 'Present all findings and wait for approval before making any changes.' : 'Present findings as suggestions, not directives. Let the developer decide.'}`,
      );
    }

    // Risk — merge blocking
    modifiers.push(
      `Merge Policy: ${risk <= 0.3
        ? 'Block merge on any warning-level issue or higher. This developer treats warnings as errors.'
        : risk >= 0.7
          ? 'Only block merge for confirmed critical bugs. Auto-approve for warn-level and below — velocity matters.'
          : `Block merge for severity above ${risk <= 0.4 ? '"info"' : '"warn"'} level.`}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(quality, 0.1, 1.0),
        verbosity: lerp(1 - comm, 0.1, 1.0),
        autonomy: lerp(autonomy, 0.2, 0.8),
        depth: lerp(quality, 0.2, 1.0),
      },
    };
  },

  'security-reviewer': (dims) => {
    const risk = dims.riskTolerance ?? 0.5;
    const quality = dims.qualityFocus ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const autonomy = dims.autonomyPreference ?? 0.5;

    const modifiers: string[] = [];

    // Scan Scope
    if (risk < 0.5) {
      modifiers.push(
        `Scan Scope: This developer is ${intensityWord(1 - risk)} security-conscious. ` +
        `Flag all potential security issues including informational-level findings. ` +
        `${risk <= 0.3 ? 'Treat any user input reaching a sink without validation as critical. Report OWASP Top 10 compliance gaps.' : 'Highlight injection risks and authentication weaknesses.'}`,
      );
    } else {
      modifiers.push(
        `Scan Scope: Focus on ${risk >= 0.7 ? 'only high-severity vulnerabilities with confirmed exploit paths' : 'medium and high severity vulnerabilities'}. ` +
        `${risk >= 0.8 ? 'Skip informational and low-severity findings to avoid noise.' : 'Mention low-severity issues briefly without blocking.'}`,
      );
    }

    // Depth
    if (quality >= 0.6) {
      modifiers.push(
        `Analysis Depth: Include dependency audit and supply chain risk assessment. ` +
        `${quality >= 0.8 ? 'Check for known CVEs in transitive dependencies. Verify CSP headers and CORS configuration.' : 'Check direct dependencies for known CVEs.'}`,
      );
    } else {
      modifiers.push(
        `Analysis Depth: Focus on application-level vulnerabilities only. ` +
        `Skip dependency auditing unless a known critical CVE is directly exploitable.`,
      );
    }

    // Communication
    modifiers.push(
      `Reporting: ${comm >= 0.7
        ? 'Use CWE-ID and one-line description per finding. No prose. Severity/file/line format only.'
        : comm <= 0.3
          ? 'For each finding, explain the attack vector, impact, and provide a concrete remediation code snippet.'
          : 'Include severity, description, and suggested fix for each finding.'}`,
    );

    // Autonomy
    modifiers.push(
      `Action Policy: ${autonomy >= 0.7
        ? 'Auto-fix simple security issues (e.g., missing input validation). Only escalate confirmed critical vulnerabilities.'
        : 'Report findings and wait for developer confirmation before applying any fixes. Security decisions require human judgment.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(1 - risk, 0.2, 1.0),
        verbosity: lerp(1 - comm, 0.2, 0.9),
        autonomy: 0.3,
        depth: lerp(quality, 0.3, 1.0),
      },
    };
  },

  executor: (dims) => {
    const autonomy = dims.autonomyPreference ?? 0.5;
    const quality = dims.qualityFocus ?? 0.5;
    const abstraction = dims.abstractionLevel ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;

    const modifiers: string[] = [];

    // Execution approach
    if (autonomy >= 0.5) {
      modifiers.push(
        `Execution Style: This developer trusts autonomous execution. ` +
        `${autonomy >= 0.7
          ? 'Execute implementation without confirmation for well-defined tasks. Make judgment calls on ambiguous details and only stop for genuinely unclear requirements.'
          : 'Proceed with implementation after a brief summary of your approach. Ask only when the task is fundamentally ambiguous.'}`,
      );
    } else {
      modifiers.push(
        `Execution Style: This developer wants oversight during implementation. ` +
        `${autonomy <= 0.3
          ? 'Show a detailed plan and wait for approval before each implementation step. Never modify files not explicitly mentioned without asking.'
          : 'Outline your approach before starting, then proceed with implementation. Pause at decision points.'}`,
      );
    }

    // Verification level
    if (quality >= 0.5) {
      modifiers.push(
        `Verification: Apply ${intensityWord(quality)} thorough verification. ` +
        `${quality >= 0.7
          ? 'Run build and tests after every change. Verify edge cases. Check type errors and lint warnings before declaring completion.'
          : 'Run build after changes. Run tests on modified modules.'}`,
      );
    } else {
      modifiers.push(
        `Verification: Focus on getting working code quickly. ` +
        `${quality <= 0.3
          ? 'Skip extensive verification — a working build is sufficient. Tests are optional for non-critical paths.'
          : 'Run a quick build check. Skip comprehensive test suites unless the change is risky.'}`,
      );
    }

    // Pattern approach
    if (abstraction >= 0.6) {
      modifiers.push(
        `Code Style: Apply design patterns and create proper abstractions where they reduce complexity. ` +
        `${abstraction >= 0.8
          ? 'Define interfaces before implementation. Follow existing architectural conventions strictly.'
          : 'Match existing patterns in the codebase. Extract reusable logic when it appears twice.'}`,
      );
    } else {
      modifiers.push(
        `Code Style: Use the most direct implementation possible. ` +
        `${abstraction <= 0.3
          ? 'Avoid abstractions entirely — inline logic is preferred. No new utility files for single-use functions.'
          : 'Keep abstractions minimal. Only extract when there is clear repetition.'}`,
      );
    }

    // Communication during execution
    modifiers.push(
      `Progress Reporting: ${comm >= 0.7
        ? 'Report only completion status and any errors. No intermediate commentary or reasoning.'
        : comm <= 0.3
          ? 'Explain reasoning at each step. Show what you explored, what you decided, and why.'
          : 'Provide brief status updates at phase transitions.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(quality, 0.2, 0.9),
        verbosity: lerp(1 - comm, 0.1, 0.8),
        autonomy: lerp(autonomy, 0.1, 1.0),
        depth: lerp((quality + abstraction) / 2, 0.2, 0.9),
      },
    };
  },

  explore: (dims) => {
    const comm = dims.communicationStyle ?? 0.5;
    const depth = dims.abstractionLevel ?? 0.5;
    const autonomy = dims.autonomyPreference ?? 0.5;

    const modifiers: string[] = [];

    // Exploration depth
    if (depth >= 0.5) {
      modifiers.push(
        `Exploration Depth: Perform ${intensityWord(depth)} deep exploration. ` +
        `${depth >= 0.7
          ? 'Include dependency graphs, cross-references, and architectural impact analysis. Trace call chains across module boundaries.'
          : 'Map file relationships and identify key interfaces. Note architectural patterns in use.'}`,
      );
    } else {
      modifiers.push(
        `Exploration Depth: Perform a ${intensityWord(1 - depth)} focused surface scan. ` +
        `${depth <= 0.3
          ? 'Only return directly relevant files. No dependency graphs or cross-references. Answer the specific question asked.'
          : 'Focus on directly relevant files. Mention related files only if they are likely to need changes.'}`,
      );
    }

    // Report format
    if (comm >= 0.5) {
      modifiers.push(
        `Report Format: Return ${intensityWord(comm)} minimal, structured results. ` +
        `${comm >= 0.7
          ? 'File paths and key line numbers only. No commentary or analysis narrative.'
          : 'Brief annotations on relevance per file. Skip explanatory prose.'}`,
      );
    } else {
      modifiers.push(
        `Report Format: Provide ${intensityWord(1 - comm)} detailed exploration reports. ` +
        `${comm <= 0.3
          ? 'Include full context: what each file does, how files relate, and what patterns are in use. Explain the codebase to someone unfamiliar with it.'
          : 'Include context on file relationships and key patterns. Explain non-obvious connections.'}`,
      );
    }

    // Scope autonomy
    modifiers.push(
      `Scope: ${autonomy >= 0.7
        ? 'Proactively explore adjacent areas that might be relevant. Widen the search if initial results are insufficient.'
        : autonomy <= 0.3
          ? 'Strictly limit exploration to explicitly requested files and directories. Ask before broadening scope.'
          : 'Explore the requested area with reasonable scope expansion for closely related code.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: 0.5,
        verbosity: lerp(1 - comm, 0.1, 1.0),
        autonomy: lerp(autonomy, 0.3, 0.9),
        depth: lerp(depth, 0.2, 1.0),
      },
    };
  },

  architect: (dims) => {
    const abstraction = dims.abstractionLevel ?? 0.5;
    const quality = dims.qualityFocus ?? 0.5;
    const risk = dims.riskTolerance ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const autonomy = dims.autonomyPreference ?? 0.5;

    const modifiers: string[] = [];

    // Design philosophy
    if (abstraction >= 0.5) {
      modifiers.push(
        `Design Philosophy: Propose ${intensityWord(abstraction)} well-layered architecture with clear separation of concerns. ` +
        `${abstraction >= 0.7
          ? 'Define explicit module boundaries, interface contracts, and dependency direction rules. Consider future extensibility in every decision.'
          : 'Identify natural module boundaries and suggest clean interfaces. Balance structure with simplicity.'}`,
      );
    } else {
      modifiers.push(
        `Design Philosophy: Keep architecture decisions ${intensityWord(1 - abstraction)} pragmatic and minimal. ` +
        `${abstraction <= 0.3
          ? 'No layers or abstractions beyond what the current feature requires. Flat is better than nested. Reject premature generalization.'
          : 'Add structure only when the problem demands it. Prefer direct solutions over framework-style patterns.'}`,
      );
    }

    // Change management
    if (risk <= 0.4) {
      modifiers.push(
        `Change Management: Prioritize backward compatibility and migration paths. ` +
        `${risk <= 0.25
          ? 'Every breaking change needs a migration guide. Propose adapter patterns for gradual transitions. Never remove a public API without deprecation.'
          : 'Minimize breaking changes. Suggest deprecation periods for removed interfaces.'}`,
      );
    } else if (risk >= 0.6) {
      modifiers.push(
        `Change Management: Accept breaking changes when they significantly simplify the design. ` +
        `${risk >= 0.8
          ? 'Prefer clean breaks over backward-compatible shims. Tech debt from compatibility layers costs more than migration effort.'
          : 'Breaking changes are acceptable with clear migration instructions.'}`,
      );
    }

    // Scalability considerations
    if (quality >= 0.6) {
      modifiers.push(
        `Quality Focus: Include scalability and performance considerations in design decisions. ` +
        `${quality >= 0.8
          ? 'Analyze Big-O complexity of proposed data structures. Consider concurrent access patterns and caching strategies.'
          : 'Note performance implications for hot paths. Suggest caching where data access patterns warrant it.'}`,
      );
    }

    // Communication
    modifiers.push(
      `Presentation: ${comm >= 0.7
        ? 'Present decisions as bullet-point trade-off lists. No narrative. Diagram references over prose.'
        : comm <= 0.3
          ? 'Explain the reasoning behind each architectural choice. Compare alternatives with pros/cons. Include diagrams where they clarify structure.'
          : 'Provide concise rationale for key decisions. Mention alternatives briefly.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(quality, 0.3, 1.0),
        verbosity: lerp(1 - comm, 0.3, 1.0),
        autonomy: lerp(autonomy, 0.2, 0.7),
        depth: lerp(abstraction, 0.4, 1.0),
      },
    };
  },

  'test-engineer': (dims) => {
    const quality = dims.qualityFocus ?? 0.5;
    const risk = dims.riskTolerance ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const autonomy = dims.autonomyPreference ?? 0.5;

    const modifiers: string[] = [];

    // Coverage target
    const coverageTarget = Math.round(lerp(quality, 30, 90));
    modifiers.push(
      `Coverage Target: Aim for ${coverageTarget}% test coverage on changed code. ` +
      `${quality >= 0.8
        ? 'Treat this as a hard gate — do not mark complete until coverage is met. Include branch coverage, not just line coverage.'
        : quality <= 0.3
          ? 'This is a soft target — skip coverage for trivial helpers, one-off scripts, and generated code.'
          : 'Prioritize coverage on business logic and error paths over utility functions.'}`,
    );

    // Test scope
    if (quality >= 0.5) {
      modifiers.push(
        `Test Scope: Write ${intensityWord(quality)} comprehensive tests. ` +
        `${quality >= 0.7
          ? 'Include edge cases, error paths, boundary conditions, and integration tests. Test both happy paths and failure modes.'
          : 'Cover the main happy path and the most likely error scenarios.'}`,
      );
    } else {
      modifiers.push(
        `Test Scope: Write only ${quality <= 0.25 ? 'smoke tests for critical user-facing paths' : 'critical path tests'}. ` +
        `Skip edge cases, negative tests, and integration scenarios. A passing smoke test is sufficient.`,
      );
    }

    // Regression
    if (risk <= 0.35) {
      modifiers.push(
        `Regression Safety: Include regression tests for all modified code paths. ` +
        `${risk <= 0.2
          ? 'Add snapshot tests for any UI components. Verify backward compatibility of changed interfaces.'
          : 'Add regression coverage for bug fixes and behavior changes.'}`,
      );
    }

    // Communication
    modifiers.push(
      `Reporting: ${comm >= 0.7
        ? 'Output test results as pass/fail counts only. No test rationale or commentary.'
        : comm <= 0.3
          ? 'Explain what each test verifies and why. Document test strategy and coverage gaps.'
          : 'Briefly note what area each test group covers.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(quality, 0.2, 1.0),
        verbosity: lerp(1 - comm, 0.2, 0.8),
        autonomy: lerp(autonomy, 0.3, 0.8),
        depth: lerp(quality, 0.3, 1.0),
      },
    };
  },

  critic: (dims) => {
    const quality = dims.qualityFocus ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const abstraction = dims.abstractionLevel ?? 0.5;

    const modifiers: string[] = [];

    // Critique scope
    if (quality >= 0.5) {
      modifiers.push(
        `Critique Scope: Provide ${intensityWord(quality)} comprehensive critique. ` +
        `${quality >= 0.7
          ? 'Evaluate design decisions, naming consistency, maintainability, and future extensibility. Challenge architectural assumptions. Flag code that is "correct but fragile."'
          : 'Evaluate functional correctness, naming, and clear maintainability issues.'}`,
      );
    } else {
      modifiers.push(
        `Critique Scope: Focus criticism on functional correctness only. ` +
        `${quality <= 0.3
          ? 'Only flag bugs that will cause runtime failures. Ignore style, naming, architecture, and maintainability concerns entirely.'
          : 'Flag bugs and obvious design problems. Skip minor style issues.'}`,
      );
    }

    // Communication style
    if (comm >= 0.5) {
      modifiers.push(
        `Feedback Format: List criticisms as ${intensityWord(comm)} terse entries. ` +
        `${comm >= 0.7
          ? 'Use format: [SEVERITY] description — no rationale, no suggestions, no positive feedback. Maximum one line per issue.'
          : 'Brief bullet points with severity rating. Include a fix suggestion if it fits in one line.'}`,
      );
    } else {
      modifiers.push(
        `Feedback Format: Explain each criticism ${intensityWord(1 - comm)} thoroughly. ` +
        `${comm <= 0.3
          ? 'Include rationale, concrete improvement suggestions, alternative approaches, and positive reinforcement for good decisions.'
          : 'Include rationale and improvement suggestion for each issue.'}`,
      );
    }

    // Abstraction critique
    modifiers.push(
      `Design Critique: ${abstraction >= 0.7
        ? 'Evaluate whether abstractions are well-chosen and properly layered. Suggest design patterns where they would reduce complexity.'
        : abstraction <= 0.3
          ? 'Flag over-engineering and unnecessary abstractions. Prefer simple direct code over pattern-heavy implementations.'
          : 'Evaluate abstractions pragmatically — flag both missing and unnecessary ones.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(quality, 0.3, 1.0),
        verbosity: lerp(1 - comm, 0.2, 1.0),
        autonomy: 0.4,
        depth: lerp(quality, 0.3, 1.0),
      },
    };
  },

  'refactoring-expert': (dims) => {
    const abstraction = dims.abstractionLevel ?? 0.5;
    const risk = dims.riskTolerance ?? 0.5;
    const quality = dims.qualityFocus ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const autonomy = dims.autonomyPreference ?? 0.5;

    const modifiers: string[] = [];

    // Refactoring scope
    if (abstraction >= 0.5) {
      modifiers.push(
        `Refactoring Scope: Propose ${intensityWord(abstraction)} deep structural refactoring. ` +
        `${abstraction >= 0.7
          ? 'Apply design patterns (Strategy, Observer, etc.) where they reduce coupling. Restructure module boundaries to improve cohesion. Extract shared abstractions proactively.'
          : 'Suggest extract-method, rename, and move-to-module refactoring. Improve separation of concerns where boundaries are unclear.'}`,
      );
    } else {
      modifiers.push(
        `Refactoring Scope: Limit refactoring to ${intensityWord(1 - abstraction)} simple, safe transformations. ` +
        `${abstraction <= 0.3
          ? 'Only renames, extract-function on duplicate code, and inline dead abstractions. No structural changes. No new patterns.'
          : 'Stick to extract-function, rename, and basic cleanup. Avoid introducing new architectural patterns.'}`,
      );
    }

    // Risk management
    if (risk < 0.5) {
      modifiers.push(
        `Safety Requirements: ${risk <= 0.25
          ? 'Only suggest refactoring with full test coverage on affected paths. Show before/after diffs. Require regression test for each refactored function.'
          : 'Ensure test coverage exists for refactored paths. Suggest adding tests before refactoring if coverage is missing.'}`,
      );
    } else {
      modifiers.push(
        `Risk Tolerance: Accept refactoring with higher risk if it significantly improves the codebase. ` +
        `${risk >= 0.7
          ? 'Large-scale renames and restructures are acceptable. Trust the type system and tests to catch regressions.'
          : 'Moderate-scope refactoring is acceptable. Verify with existing tests.'}`,
      );
    }

    // Communication
    modifiers.push(
      `Explanation: ${comm >= 0.7
        ? 'List refactoring operations as terse transformation steps. No motivation or design discussion.'
        : comm <= 0.3
          ? 'For each refactoring, explain the code smell it addresses, the pattern being applied, and the expected improvement in maintainability.'
          : 'Briefly explain the motivation for each refactoring.'}`,
    );

    // Autonomy
    modifiers.push(
      `Execution: ${autonomy >= 0.7
        ? 'Apply safe refactoring (renames, extract-function) directly. Only ask for approval on structural changes.'
        : 'Present refactoring plan and wait for approval before applying changes.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(quality, 0.3, 0.9),
        verbosity: lerp(1 - comm, 0.2, 0.9),
        autonomy: lerp(autonomy, 0.2, 0.7),
        depth: lerp(abstraction, 0.3, 1.0),
      },
    };
  },

  'performance-reviewer': (dims) => {
    const quality = dims.qualityFocus ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const risk = dims.riskTolerance ?? 0.5;
    const abstraction = dims.abstractionLevel ?? 0.5;

    const modifiers: string[] = [];

    // Analysis depth
    if (quality >= 0.5) {
      modifiers.push(
        `Analysis Depth: Perform ${intensityWord(quality)} thorough performance analysis. ` +
        `${quality >= 0.8
          ? 'Include memory profiling suggestions, Big-O analysis for all data structure operations, and CPU hot-path identification. Check for unnecessary allocations and GC pressure.'
          : quality >= 0.6
            ? 'Analyze algorithmic complexity, caching opportunities, and resource usage patterns. Flag O(n^2) or worse operations.'
            : 'Check for common performance pitfalls: N+1 queries, unbounded loops, and missing indexes.'}`,
      );
    } else {
      modifiers.push(
        `Analysis Depth: Only flag ${quality <= 0.25 ? 'obvious performance disasters' : 'clear performance issues'} ` +
        `like N+1 queries, memory leaks, and unbounded data loading. ` +
        `Skip micro-optimizations and theoretical complexity concerns.`,
      );
    }

    // Optimization approach
    if (abstraction >= 0.6) {
      modifiers.push(
        `Optimization Strategy: Suggest architectural solutions to performance problems — caching layers, queue-based processing, ` +
        `lazy loading patterns. Prefer structural fixes over micro-optimizations.`,
      );
    } else {
      modifiers.push(
        `Optimization Strategy: Suggest direct, localized fixes — add an index, cache this result, batch these queries. ` +
        `Avoid proposing architectural changes for performance alone.`,
      );
    }

    // Communication
    modifiers.push(
      `Reporting: ${comm >= 0.7
        ? 'Report as: [IMPACT: high/medium/low] location — issue. No benchmarks or detailed analysis unless critical.'
        : comm <= 0.3
          ? 'For each issue, explain the performance impact with estimated complexity, provide benchmark suggestions, and show the optimized code.'
          : 'Include impact assessment and suggested fix for each finding.'}`,
    );

    // Risk in optimization
    modifiers.push(
      `Fix Priority: ${risk >= 0.7
        ? 'Suggest aggressive optimizations even if they increase code complexity. Performance is worth the trade-off.'
        : risk <= 0.3
          ? 'Only suggest optimizations that maintain or improve code clarity. Reject optimizations that make the code harder to reason about.'
          : 'Balance optimization benefit against code complexity increase.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(quality, 0.2, 1.0),
        verbosity: lerp(1 - comm, 0.2, 0.9),
        autonomy: 0.4,
        depth: lerp(quality, 0.3, 1.0),
      },
    };
  },

  debugger: (dims) => {
    const autonomy = dims.autonomyPreference ?? 0.5;
    const quality = dims.qualityFocus ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const risk = dims.riskTolerance ?? 0.5;

    const modifiers: string[] = [];

    // Investigation style
    if (autonomy >= 0.5) {
      modifiers.push(
        `Investigation Style: Investigate ${intensityWord(autonomy)} autonomously. ` +
        `${autonomy >= 0.7
          ? 'Form hypotheses and test them without asking. Apply fixes directly when confident in the root cause. Only escalate if the bug crosses system boundaries.'
          : 'Form hypotheses and investigate. Present the most likely cause and your proposed fix. Apply after brief confirmation.'}`,
      );
    } else {
      modifiers.push(
        `Investigation Style: Present hypotheses and ${intensityWord(1 - autonomy)} seek guidance. ` +
        `${autonomy <= 0.3
          ? 'List possible causes ranked by likelihood. Explain your reasoning. Wait for the developer to choose which hypothesis to investigate first.'
          : 'Share your top hypothesis and investigation plan. Ask before applying any fixes.'}`,
      );
    }

    // Fix quality
    if (quality >= 0.5) {
      modifiers.push(
        `Fix Quality: Find the root cause and fix it properly. ` +
        `${quality >= 0.7
          ? 'No workarounds. Trace the bug to its origin, fix the underlying issue, and add a regression test. Check for related bugs caused by the same root cause.'
          : 'Fix the root cause. Add a test that reproduces the bug. Verify the fix does not break adjacent functionality.'}`,
      );
    } else {
      modifiers.push(
        `Fix Quality: Find the quickest effective fix. ` +
        `${quality <= 0.3
          ? 'Workarounds are acceptable if they resolve the symptom. Speed matters more than elegance. Skip regression tests for non-critical bugs.'
          : 'A targeted fix is fine even if it does not address the deepest root cause. Workaround is OK if the proper fix is disproportionately complex.'}`,
      );
    }

    // Communication during debugging
    modifiers.push(
      `Debug Reporting: ${comm >= 0.7
        ? 'Report: root cause -> fix applied -> verification result. No step-by-step investigation narrative.'
        : comm <= 0.3
          ? 'Walk through each investigation step: what you checked, what you found, what it rules out. Explain the root cause mechanism in detail.'
          : 'Summarize investigation steps briefly. Explain the root cause and fix.'}`,
    );

    // Risk in fixing
    modifiers.push(
      `Fix Scope: ${risk >= 0.7
        ? 'Apply the fix broadly if the bug pattern exists elsewhere. Proactively fix related issues.'
        : risk <= 0.3
          ? 'Fix only the exact reported bug. Do not touch adjacent code even if it has similar issues — separate tickets for those.'
          : 'Fix the reported bug. Mention similar patterns if you spot them, but do not fix them without approval.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(quality, 0.2, 0.9),
        verbosity: lerp(1 - comm, 0.2, 0.9),
        autonomy: lerp(autonomy, 0.1, 0.9),
        depth: lerp(quality, 0.3, 1.0),
      },
    };
  },
};

// ── Public API ──────────────────────────────────────

/** 차원 벡터에서 에이전트별 프롬프트 오버레이 생성 */
export function generateAgentOverlays(dims: DimensionVector): AgentOverlay[] {
  const overlays: AgentOverlay[] = [];

  for (const [agentName, generator] of Object.entries(AGENT_GENERATORS)) {
    const overlay = generator(dims);
    // 모든 에이전트는 이제 항상 풍부한 오버레이를 생성
    overlays.push({ agentName, ...overlay });
  }

  return overlays;
}

/** AgentOverlay를 에이전트 .md 파일에 삽입할 마크다운으로 포맷 */
export function formatOverlayAsMarkdown(overlay: AgentOverlay): string {
  const lines: string[] = [
    '<!-- forge-overlay-start -->',
    '## Forge Profile Tuning',
    '',
    `Strictness: ${overlay.parameters.strictness.toFixed(2)} | ` +
      `Verbosity: ${overlay.parameters.verbosity.toFixed(2)} | ` +
      `Autonomy: ${overlay.parameters.autonomy.toFixed(2)} | ` +
      `Depth: ${overlay.parameters.depth.toFixed(2)}`,
    '',
    '### Behavioral Directives',
  ];

  for (const modifier of overlay.behaviorModifiers) {
    lines.push(`- ${modifier}`);
  }

  lines.push('<!-- forge-overlay-end -->');
  return lines.join('\n');
}
