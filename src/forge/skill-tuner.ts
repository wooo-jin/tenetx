/**
 * Tenetx Forge — Skill Prompt Tuner
 *
 * 차원 벡터에서 스킬별 프롬프트 오버레이를 생성.
 * 각 스킬의 행동을 사용자 프로필에 맞게 연속적으로 조정.
 *
 * 각 차원은 풍부한 행동 지시 문장을 생성 — 체크리스트 조각이 아닌
 * 개발자에 대한 브리핑 형태의 오버레이.
 */

import type { DimensionVector } from './types.js';

// ── Types ───────────────────────────────────────────

export interface SkillOverlay {
  skillName: string;
  /** 프롬프트에 삽입할 행동 지시문 */
  behaviorModifiers: string[];
  /** 연속 파라미터 */
  parameters: Record<string, number | string | boolean>;
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

// ── Skill-specific Overlay Generators ───────────────

type SkillOverlayGenerator = (dims: DimensionVector) => Omit<SkillOverlay, 'skillName'>;

const SKILL_GENERATORS: Record<string, SkillOverlayGenerator> = {
  autopilot: (dims) => {
    const autonomy = dims.autonomyPreference ?? 0.5;
    const quality = dims.qualityFocus ?? 0.5;
    const risk = dims.riskTolerance ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;

    const modifiers: string[] = [];

    // Checkpoint behavior
    if (autonomy >= 0.5) {
      modifiers.push(
        `Checkpoint Policy: This developer trusts autonomous multi-phase execution. ` +
        `${autonomy >= 0.7
          ? 'Proceed through all phases without stopping. Only pause on errors or when a phase fails validation. Do not ask "should I continue?" between phases.'
          : 'Run phases sequentially with a brief status line between each. Pause only if a phase produces warnings.'}`,
      );
    } else {
      modifiers.push(
        `Checkpoint Policy: This developer wants control over phase transitions. ` +
        `${autonomy <= 0.3
          ? 'Pause and show a detailed summary after each phase. Wait for explicit "continue" before proceeding to the next phase. Show planned file changes before executing.'
          : 'Pause between major phases (planning -> implementation -> verification) and confirm before continuing.'}`,
      );
    }

    // Quality gates
    if (quality >= 0.5) {
      modifiers.push(
        `Quality Gates: Apply ${intensityWord(quality)} rigorous quality checks. ` +
        `${quality >= 0.7
          ? 'Always include Phase 3 QA: run build, lint, type-check, and tests. Enforce coverage threshold before marking complete. Fail the pipeline if any check does not pass.'
          : 'Run build and tests after implementation. Flag failures but do not block if only lint warnings remain.'}`,
      );
    } else {
      modifiers.push(
        `Quality Gates: Keep quality checks ${intensityWord(1 - quality)} lean. ` +
        `${quality <= 0.3
          ? 'Skip test boilerplate and coverage checks entirely. A successful build is the only hard gate. Move fast.'
          : 'Run a quick build check. Skip comprehensive test suites unless the change is high-risk.'}`,
      );
    }

    // Commit behavior
    modifiers.push(
      `Commit Behavior: ${risk <= 0.3
        ? 'Review each commit diff carefully before staging. Block auto-commit if any change looks unintended. Create granular commits with descriptive messages.'
        : risk >= 0.7
          ? 'Commit changes immediately after each phase. Batch related changes. Do not review diffs — trust the pipeline to catch issues.'
          : 'Stage and commit after each phase with a brief diff review. Group related changes.'}`,
    );

    // Progress reporting
    modifiers.push(
      `Progress Reporting: ${comm >= 0.7
        ? 'Report only phase transitions and final result. Suppress file-by-file status, reasoning, and intermediate logs entirely.'
        : comm <= 0.3
          ? 'Output detailed phase progress with file-by-file status, reasoning behind each decision, and a summary of what changed and why.'
          : 'Brief status line per phase: what was done, any issues found.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        autonomy: lerp(autonomy, 0.1, 1.0),
        qualityGate: lerp(quality, 0.1, 1.0),
        coverageTarget: Math.round(lerp(quality, 30, 90)),
        verbosity: lerp(1 - comm, 0.1, 1.0),
      },
    };
  },

  ralph: (dims) => {
    const autonomy = dims.autonomyPreference ?? 0.5;
    const risk = dims.riskTolerance ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;

    const modifiers: string[] = [];

    // Iteration control
    if (autonomy >= 0.5) {
      modifiers.push(
        `Iteration Control: Run iterations with ${intensityWord(autonomy)} high autonomy. ` +
        `${autonomy >= 0.7
          ? 'Execute multiple iterations before surfacing results. Only interrupt the loop for blockers that require user input or decisions outside the codebase.'
          : 'Run 2-3 iterations before checking in. Surface intermediate results only if they reveal a need to change direction.'}`,
      );
    } else {
      modifiers.push(
        `Iteration Control: Confirm with the developer at ${intensityWord(1 - autonomy)} frequent intervals. ` +
        `${autonomy <= 0.3
          ? 'After each iteration, show what changed, what improved, and what the next iteration would target. Wait for approval before continuing.'
          : 'Pause after every 2 iterations. Show a brief progress summary and ask whether to continue or adjust direction.'}`,
      );
    }

    // Refactoring aggressiveness
    if (risk >= 0.5) {
      modifiers.push(
        `Refactoring Style: Attempt ${intensityWord(risk)} aggressive improvements. ` +
        `${risk >= 0.7
          ? 'Pursue structural refactoring when it significantly improves the implementation — module splits, pattern changes, interface redesigns are all acceptable.'
          : 'Make meaningful improvements to structure when the benefit is clear. Moderate scope changes are fine.'}`,
      );
    } else {
      modifiers.push(
        `Refactoring Style: Use ${intensityWord(1 - risk)} minimal, safe changes only. ` +
        `${risk <= 0.3
          ? 'Avoid structural refactoring entirely. Stick to renames, extract-function, and small fixes. Do not reorganize modules or change interfaces.'
          : 'Keep changes conservative. Only extract or rename when the improvement is obvious and safe.'}`,
      );
    }

    // Communication
    modifiers.push(
      `Iteration Reporting: ${comm >= 0.7
        ? 'Suppress per-iteration commentary. Report only final completion status, total iterations, and any unresolved blockers.'
        : comm <= 0.3
          ? 'At each iteration explain: what was attempted, what worked/failed, what changed in the approach, and what the next step targets.'
          : 'Brief one-line status per iteration. Detailed report at completion.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        autonomy: lerp(autonomy, 0.1, 1.0),
        riskTolerance: lerp(risk, 0.1, 1.0),
        verbosity: lerp(1 - comm, 0.1, 1.0),
      },
    };
  },

  team: (dims) => {
    const autonomy = dims.autonomyPreference ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const quality = dims.qualityFocus ?? 0.5;

    const modifiers: string[] = [];

    // Worker independence
    if (autonomy >= 0.5) {
      modifiers.push(
        `Worker Coordination: Workers proceed with ${intensityWord(autonomy)} high independence. ` +
        `${autonomy >= 0.7
          ? 'Workers execute independently and in parallel. The coordinator reviews only the final integrated output. No inter-worker synchronization unless there is a file conflict.'
          : 'Workers execute their tasks independently. Coordinator reviews integration points after all workers complete.'}`,
      );
    } else {
      modifiers.push(
        `Worker Coordination: The coordinator maintains ${intensityWord(1 - autonomy)} tight oversight. ` +
        `${autonomy <= 0.3
          ? 'The coordinator must review each worker output before assigning the next task. Serialize dependent work. No parallel execution of tasks that touch the same module.'
          : 'The coordinator reviews worker outputs at checkpoints. Workers can proceed in parallel for independent modules.'}`,
      );
    }

    // Review step
    if (quality >= 0.6) {
      modifiers.push(
        `Review Pipeline: Add a dedicated review worker after all implementation workers complete. ` +
        `${quality >= 0.8
          ? 'The reviewer checks cross-worker consistency, integration correctness, and runs the full test suite. Block completion until all checks pass.'
          : 'The reviewer verifies integration points and runs affected tests.'}`,
      );
    } else {
      modifiers.push(
        `Review Pipeline: ${quality <= 0.3
          ? 'Skip dedicated review step. Rely on build/test pass as the quality gate. Trust workers to self-verify.'
          : 'A quick integration check is sufficient. No dedicated review worker needed for small tasks.'}`,
      );
    }

    // Team communication
    modifiers.push(
      `Team Reporting: ${comm >= 0.7
        ? 'Workers output one-line completion status only. No intermediate commentary. Coordinator produces a single summary at the end.'
        : comm <= 0.3
          ? 'Each worker outputs a detailed progress report including all steps taken, decisions made, and files modified. Coordinator synthesizes a comprehensive summary.'
          : 'Workers output brief completion summaries. Coordinator provides an overall status report.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        autonomy: lerp(autonomy, 0.1, 1.0),
        reviewDepth: lerp(quality, 0.1, 1.0),
        verbosity: lerp(1 - comm, 0.1, 1.0),
      },
    };
  },

  ultrawork: (dims) => {
    const comm = dims.communicationStyle ?? 0.5;
    const quality = dims.qualityFocus ?? 0.5;
    const autonomy = dims.autonomyPreference ?? 0.5;

    const modifiers: string[] = [];

    // Parallel agent reporting
    modifiers.push(
      `Agent Reporting: ${comm >= 0.7
        ? 'Suppress individual agent reports entirely. Output only the final integrated result with a one-line summary per agent contribution.'
        : comm <= 0.3
          ? 'Report each spawned agent result with full output including reasoning, files changed, and verification results. Show integration steps explicitly.'
          : 'Show a brief summary per agent (files changed, status). Full output only for agents that encountered issues.'}`,
    );

    // Build verification
    if (quality >= 0.5) {
      modifiers.push(
        `Verification: Apply ${intensityWord(quality)} thorough post-completion verification. ` +
        `${quality >= 0.7
          ? 'Run full build, test suite, lint, and type-check after all agents complete. Block completion report until every check passes. Re-run failed agents if tests fail.'
          : 'Run build and core test suite after all agents complete. Report failures but do not auto-retry.'}`,
      );
    } else {
      modifiers.push(
        `Verification: Keep verification ${intensityWord(1 - quality)} lightweight. ` +
        `${quality <= 0.3
          ? 'Run build only on directly modified files. Skip full test suite. A passing build on changed files is sufficient.'
          : 'Run build and directly affected tests only. Skip full suite to save time.'}`,
      );
    }

    // Autonomy in spawning
    modifiers.push(
      `Agent Spawning: ${autonomy >= 0.7
        ? 'Autonomously decide how many agents to spawn and how to partition work. Do not ask for approval on task decomposition.'
        : autonomy <= 0.3
          ? 'Show the proposed task decomposition and agent assignments before spawning. Wait for approval.'
          : 'Decompose and spawn agents for clear subtasks. Ask when decomposition is ambiguous.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        verbosity: lerp(1 - comm, 0.1, 1.0),
        qualityGate: lerp(quality, 0.1, 1.0),
      },
    };
  },

  'code-review': (dims) => {
    const quality = dims.qualityFocus ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const risk = dims.riskTolerance ?? 0.5;
    const autonomy = dims.autonomyPreference ?? 0.5;

    const modifiers: string[] = [];

    // Review depth
    if (quality >= 0.5) {
      modifiers.push(
        `Review Depth: Apply ${intensityWord(quality)} thorough code review. ` +
        `${quality >= 0.7
          ? 'Check SOLID principles, naming consistency, edge cases, test coverage, and long-term maintainability. Flag functions over 40 lines, deeply nested conditionals, and missing error handling.'
          : 'Check logic correctness, clear naming issues, and obvious edge cases. Note test coverage gaps for critical paths.'}`,
      );
    } else {
      modifiers.push(
        `Review Depth: Focus on ${quality <= 0.25 ? 'critical bugs and security issues only' : 'bugs and clear logic errors'}. ` +
        `Skip style, naming, and minor improvements. ${quality <= 0.3 ? 'A working change that does not introduce regressions is a passing review.' : ''}`,
      );
    }

    // Output format
    if (comm >= 0.5) {
      modifiers.push(
        `Output Format: Use ${intensityWord(comm)} concise review format. ` +
        `${comm >= 0.7
          ? 'Output severity rating only: [critical/warn/info] file:line — issue. No lengthy explanations, no positive feedback, no suggestions unless fixing is non-obvious.'
          : 'Brief description of each issue with severity. Include fix suggestion for non-obvious problems.'}`,
      );
    } else {
      modifiers.push(
        `Output Format: Provide ${intensityWord(1 - comm)} detailed analysis for each finding. ` +
        `${comm <= 0.3
          ? 'Explain why each issue matters, show the fix with code, suggest alternatives, and reinforce good patterns with positive feedback.'
          : 'Include rationale and suggested fix for each finding. Mention good patterns when noteworthy.'}`,
      );
    }

    // Merge blocking
    modifiers.push(
      `Merge Policy: ${risk <= 0.3
        ? 'Block merge on any warning-level finding or higher. Treat all warnings as potential production issues.'
        : risk >= 0.7
          ? 'Only block merge for confirmed critical bugs. Auto-approve for warn-level and below — shipping velocity matters.'
          : `Suggest blocking for severity above "${risk <= 0.45 ? 'info' : 'warn'}" level.`}`,
    );

    // Auto-apply
    modifiers.push(
      `Auto-Fix: ${autonomy >= 0.7
        ? 'Automatically fix style issues, formatting, and obvious bugs. Only flag issues that require design decisions.'
        : 'Present all findings as suggestions. Do not auto-fix — let the developer apply changes.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        strictness: lerp(quality, 0.1, 1.0),
        verbosity: lerp(1 - comm, 0.1, 1.0),
        riskThreshold: lerp(1 - risk, 0.1, 1.0),
      },
    };
  },

  tdd: (dims) => {
    const quality = dims.qualityFocus ?? 0.5;
    const comm = dims.communicationStyle ?? 0.5;
    const autonomy = dims.autonomyPreference ?? 0.5;

    const modifiers: string[] = [];

    // Coverage target
    const coverageTarget = Math.round(lerp(quality, 60, 90));
    modifiers.push(
      `Coverage Target: Aim for ${coverageTarget}% test coverage. ` +
      `${quality >= 0.8
        ? 'This is a hard gate — include branch coverage, not just line coverage. No completion until the target is met on all changed files.'
        : quality <= 0.3
          ? 'This is aspirational. Write critical-path tests first and stop when the risk is adequately covered.'
          : 'Prioritize coverage on business logic. Utility functions can have lower coverage.'}`,
    );

    // Test scope
    if (quality >= 0.5) {
      modifiers.push(
        `Test Scope: Write ${intensityWord(quality)} comprehensive tests. ` +
        `${quality >= 0.7
          ? 'Include edge cases, error paths, boundary conditions, and integration scenarios. Each public function needs at least one happy-path and one failure test.'
          : 'Cover the main happy path and the most important error scenarios. Skip exhaustive boundary testing.'}`,
      );
    } else {
      modifiers.push(
        `Test Scope: Write ${quality <= 0.25 ? 'critical-path smoke tests only' : 'essential path tests'}. ` +
        `Skip edge cases, negative paths, and integration scenarios. A passing test on the primary use case is sufficient.`,
      );
    }

    // TDD cycle communication
    modifiers.push(
      `Cycle Reporting: ${comm >= 0.7
        ? 'Run Red/Green/Refactor cycles silently. Report only final test results and coverage numbers. No per-cycle commentary.'
        : comm <= 0.3
          ? 'Explain Red/Green/Refactor reasoning at each cycle step. Show what test was written, why it fails, how the implementation satisfies it, and what was refactored.'
          : 'Brief status per cycle. Detailed explanation only when a cycle reveals a design insight.'}`,
    );

    // Autonomy in cycle
    modifiers.push(
      `Cycle Autonomy: ${autonomy >= 0.7
        ? 'Run all TDD cycles autonomously. Present the final test suite and implementation together.'
        : autonomy <= 0.3
          ? 'Show the test first (Red phase), wait for approval, then implement (Green), then propose refactoring before applying.'
          : 'Run cycles autonomously but pause to confirm direction after every 3 cycles.'}`,
    );

    return {
      behaviorModifiers: modifiers,
      parameters: {
        coverageTarget,
        strictness: lerp(quality, 0.2, 1.0),
        verbosity: lerp(1 - comm, 0.1, 0.9),
      },
    };
  },
};

// ── Public API ──────────────────────────────────────

/** 차원 벡터에서 스킬별 프롬프트 오버레이 생성 */
export function generateSkillOverlays(dims: DimensionVector): SkillOverlay[] {
  const overlays: SkillOverlay[] = [];

  for (const [skillName, generator] of Object.entries(SKILL_GENERATORS)) {
    const overlay = generator(dims);
    // 모든 스킬은 이제 항상 풍부한 오버레이를 생성
    overlays.push({ skillName, ...overlay });
  }

  return overlays;
}

/** SkillOverlay를 스킬 .md 파일에 삽입할 마크다운으로 포맷 */
export function formatSkillOverlayAsMarkdown(overlay: SkillOverlay): string {
  const paramLine = Object.entries(overlay.parameters)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? (v as number).toFixed(2) : v}`)
    .join(' | ');

  const lines: string[] = [
    '<!-- forge-overlay-start -->',
    '## Forge Profile Tuning',
    '',
    paramLine,
    '',
    '### Behavioral Directives',
  ];

  for (const modifier of overlay.behaviorModifiers) {
    lines.push(`- ${modifier}`);
  }

  lines.push('<!-- forge-overlay-end -->');
  return lines.join('\n');
}
