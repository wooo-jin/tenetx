/**
 * Tenetx Forge — Philosophy Tuner
 *
 * 차원 벡터에서 세분화된 철학 원칙을 동적 생성.
 * 이산적 프리셋 대신 연속 차원값에 따라 완전히 다른 원칙을 구성.
 *
 * 각 차원값은 의미있게 다른 원칙과 구체적이고 실행 가능한 항목을 생성.
 */

import type { DimensionVector } from './types.js';
import { deviation, lerp } from './shared-utils.js';

// ── Types ───────────────────────────────────────────

export interface TunedPrinciple {
  belief: string;
  generates: Array<
    | string
    | {
        hook?: string;
        routing?: string;
        alert?: string;
        step?: string;
        severity?: string;
        threshold?: number;
      }
  >;
  /** 이 원칙의 강도 (차원 편차로 결정, 0-1) */
  intensity: number;
}

/** 차원값에 따라 모델 선택 */
function routingModel(value: number): string {
  if (value >= 0.75) return 'opus';
  if (value >= 0.45) return 'sonnet';
  return 'haiku';
}

// ── Principle Generators ────────────────────────────

type PrincipleGenerator = (dims: DimensionVector) => [string, TunedPrinciple] | null;

/** risk-tolerance 기반 원칙 */
const riskPrinciple: PrincipleGenerator = (dims) => {
  const risk = dims.riskTolerance ?? 0.5;
  const dev = deviation(risk);
  if (dev < 0.1) return null; // 중립이면 생략

  const intensity = dev * 2; // 0-1 정규화

  if (risk < 0.5) {
    // 보수적: 안전 우선
    const severity = risk <= 0.25 ? 'critical' : 'high';
    return [
      'defensive-development',
      {
        belief:
          risk <= 0.25
            ? 'Every change is a potential risk — verify before committing'
            : risk <= 0.35
              ? 'Changes should be safe and reviewed before applying'
              : 'Moderate caution — verify changes that touch critical paths',
        generates: [
          { hook: 'pre-commit-validation', severity },
          { routing: `code-review: ${routingModel(1 - risk)}` },
          risk <= 0.2
            ? { alert: 'Destructive operations (rm -rf, DROP TABLE, force-push) require explicit confirmation and backup creation' }
            : risk <= 0.3
              ? { alert: 'Destructive operations require confirmation. Create rollback plan for database changes.' }
              : 'Prefer small incremental changes over large refactors',
          risk <= 0.25
            ? { step: 'Run full test suite before every commit. Verify no regressions in unrelated modules.' }
            : 'Run tests on modified modules before committing',
          risk <= 0.2
            ? { step: 'Require approval for database migrations. Back up affected tables before schema changes.' }
            : risk <= 0.35
              ? 'Review migrations carefully. Test rollback procedures.'
              : 'Review diff before committing changes to shared interfaces',
        ],
        intensity,
      },
    ];
  }

  // 공격적: 속도 우선
  return [
    'move-fast',
    {
      belief:
        risk >= 0.8
          ? 'Speed of iteration matters more than perfect safety — ship and iterate'
          : risk >= 0.65
            ? 'Ship quickly, iterate based on feedback'
            : 'Move efficiently with reasonable caution on critical paths',
      generates: [
        { routing: `implement: ${routingModel(risk)}` },
        { hook: 'fast-feedback', severity: risk >= 0.75 ? 'info' : 'low' },
        risk >= 0.8
          ? 'Minimize all confirmation dialogs. Auto-approve routine operations. Only interrupt for destructive production changes.'
          : risk >= 0.65
            ? 'Minimize confirmation dialogs for routine operations. Quick yes/no for non-destructive changes.'
            : 'Reduce confirmation prompts for well-understood operations',
        risk >= 0.8
          ? { step: 'Trust CI to catch issues. Commit and push without waiting for local test results on non-critical changes.' }
          : 'Quick manual verification is sufficient for most changes',
        risk >= 0.75
          ? 'Hotfixes can go straight to main with post-merge review. Feature flags over long-lived branches.'
          : 'Ship behind feature flags when possible to reduce blast radius',
      ],
      intensity,
    },
  ];
};

/** quality-focus 기반 원칙 */
const qualityPrinciple: PrincipleGenerator = (dims) => {
  const quality = dims.qualityFocus ?? 0.5;
  const dev = deviation(quality);
  if (dev < 0.1) return null;

  const intensity = dev * 2;

  if (quality >= 0.5) {
    // 품질 중시
    const coverageThreshold = Math.round(lerp(quality, 40, 90));
    return [
      'thorough-quality',
      {
        belief:
          quality >= 0.8
            ? 'Quality and correctness are non-negotiable — every line of code must earn its place'
            : quality >= 0.65
              ? 'Invest in quality where it matters most — critical paths deserve thorough validation'
              : 'Balance quality with velocity — test what matters, skip what does not',
        generates: [
          quality >= 0.75
            ? { step: 'Write tests before implementation (TDD). Red-Green-Refactor cycle for all new logic.' }
            : quality >= 0.6
              ? 'Write tests alongside implementation. Each new function gets at least one test.'
              : 'Write tests for complex logic and error paths',
          { hook: 'test-coverage-check', threshold: coverageThreshold },
          quality >= 0.8
            ? { step: 'Review edge cases, boundary conditions, and error paths for every public function. Document invariants.' }
            : 'Review edge cases and error paths for business-critical functions',
          quality >= 0.85
            ? { step: 'Verify build, lint, type-check, and formatting all pass before marking any task complete. Zero warnings policy.' }
            : quality >= 0.7
              ? 'Verify build, lint, and type-check pass before completion'
              : 'Verify build passes. Fix lint errors on changed files.',
          quality >= 0.9
            ? { alert: 'No PR without test coverage on changed code paths. Block merge if coverage drops below threshold.' }
            : quality >= 0.75
              ? { alert: 'Test coverage is required on all new business logic. Track coverage trends.' }
              : 'Test coverage is recommended for non-trivial changes',
        ],
        intensity,
      },
    ];
  }

  // 속도 중시
  return [
    'pragmatic-speed',
    {
      belief:
        quality <= 0.2
          ? 'Working software now beats perfect software later — prototype first, polish never'
          : quality <= 0.35
            ? 'Good enough is good enough — focus on working code, optimize later'
            : 'Balance between shipping speed and minimum quality bar',
      generates: [
        { routing: `implement: ${routingModel(quality)}` },
        quality <= 0.2
          ? 'Focus on core functionality only. No error handling beyond crash prevention. No input validation for internal APIs.'
          : quality <= 0.35
            ? 'Focus on core functionality first. Basic error handling for user-facing paths only.'
            : 'Focus on core functionality. Add error handling for likely failure paths.',
        quality <= 0.25
          ? { step: 'Skip tests entirely for exploratory code, scripts, and one-off utilities. Tests only for shipped production APIs.' }
          : quality <= 0.4
            ? 'Write minimal happy-path tests for critical features only'
            : 'Write tests for business-critical paths. Skip edge case coverage.',
        quality <= 0.2
          ? 'Iterate quickly. Ship the first working version. Do not refine until user feedback arrives.'
          : 'Iterate quickly, refine based on feedback',
        quality <= 0.25
          ? { alert: 'Skip test boilerplate for prototype scripts. No coverage requirements for code under 100 lines.' }
          : 'Reduce ceremony for non-critical changes. No formal review for config changes.',
      ],
      intensity,
    },
  ];
};

/** autonomy-preference 기반 원칙 */
const autonomyPrinciple: PrincipleGenerator = (dims) => {
  const autonomy = dims.autonomyPreference ?? 0.5;
  const dev = deviation(autonomy);
  if (dev < 0.1) return null;

  const intensity = dev * 2;

  if (autonomy < 0.5) {
    // 감독 선호
    return [
      'supervised-execution',
      {
        belief:
          autonomy <= 0.2
            ? 'AI should propose, human should decide — every action needs explicit approval'
            : autonomy <= 0.35
              ? 'Keep the human in the loop for important decisions — AI executes under supervision'
              : 'Collaborate on decisions — AI proposes, human confirms',
        generates: [
          autonomy <= 0.25
            ? { step: 'Show detailed plan with file changes, estimated impact, and risk assessment before executing multi-step operations' }
            : autonomy <= 0.4
              ? { step: 'Outline approach before non-trivial changes. Show which files will be modified.' }
              : 'Summarize intent before acting on multi-file changes',
          autonomy <= 0.3
            ? 'Ask for confirmation on every non-trivial change. Present alternatives and let the user choose.'
            : 'Ask for confirmation on changes that affect multiple modules or public APIs',
          autonomy <= 0.2
            ? { step: 'Explain reasoning before implementation. Show the "why" not just the "what." Never modify files not explicitly mentioned.' }
            : autonomy <= 0.35
              ? 'Explain intent before making changes to core logic. Summarize what will change.'
              : 'Summarize intent before acting on non-obvious changes',
          autonomy <= 0.15
            ? { alert: 'Never auto-apply changes without explicit approval. Present diffs and wait for "apply" command.' }
            : autonomy <= 0.3
              ? 'Prefer explicit confirmation for file modifications. Show diff before applying.'
              : 'Confirm before modifying shared interfaces or configuration files',
        ],
        intensity,
      },
    ];
  }

  // 자율 선호
  return [
    'autonomous-execution',
    {
      belief:
        autonomy >= 0.85
          ? 'AI should act decisively with minimal interruption — trust is earned through results'
          : autonomy >= 0.7
            ? 'Execute efficiently, ask only when genuinely ambiguous'
            : 'Work independently on clear tasks, check in on ambiguous ones',
      generates: [
        autonomy >= 0.8
          ? 'Execute without confirmation for all well-defined tasks. Make judgment calls on implementation details without asking.'
          : 'Execute without confirmation for well-defined tasks. Briefly note your approach before starting.',
        autonomy >= 0.75
          ? 'Make design judgment calls autonomously. Choose data structures, patterns, and naming independently.'
          : 'Make judgment calls on implementation details. Ask only for architectural decisions.',
        autonomy >= 0.85
          ? { step: 'Only ask when the task is fundamentally ambiguous or requires business context not available in the codebase. No "should I proceed?" questions.' }
          : autonomy >= 0.7
            ? 'Only ask when genuinely unsure about requirements. Skip all "should I continue?" prompts.'
            : 'Only ask when genuinely unsure. No unnecessary confirmation prompts.',
        autonomy >= 0.9
          ? { step: 'Auto-apply all fixes: lint errors, formatting, type errors, and minor bugs. Auto-fix import organization and unused variable cleanup.' }
          : autonomy >= 0.7
            ? 'Auto-apply fixes for lint errors, formatting, and obvious bugs. Fix inline without asking.'
            : 'Fix obvious issues inline during implementation',
      ],
      intensity,
    },
  ];
};

/** abstraction-level 기반 원칙 */
const abstractionPrinciple: PrincipleGenerator = (dims) => {
  const abstraction = dims.abstractionLevel ?? 0.5;
  const dev = deviation(abstraction);
  if (dev < 0.1) return null;

  const intensity = dev * 2;

  if (abstraction >= 0.5) {
    // 설계 중시
    return [
      'design-first',
      {
        belief:
          abstraction >= 0.8
            ? 'Good architecture prevents future problems — invest in structure now to save time later'
            : abstraction >= 0.65
              ? 'Think about structure before writing code — well-chosen abstractions reduce total effort'
              : 'Balance structure with pragmatism — abstract when patterns repeat',
        generates: [
          abstraction >= 0.75
            ? { step: 'Define interfaces and type contracts before writing implementation. Document module boundaries and dependency rules.' }
            : abstraction >= 0.6
              ? { step: 'Consider the interface before implementation. Sketch the public API signature first.' }
              : 'Plan the interface before implementing complex functions',
          abstraction >= 0.7
            ? 'Consider extensibility, separation of concerns, and dependency inversion in every new module. Apply SOLID principles.'
            : 'Consider separation of concerns for modules with multiple responsibilities',
          abstraction >= 0.85
            ? { step: 'Document architectural decisions with rationale and alternatives considered. Create ADRs for significant design choices.' }
            : abstraction >= 0.7
              ? 'Note key design choices in code comments. Document non-obvious trade-offs.'
              : 'Note key design choices for future reference',
          abstraction >= 0.9
            ? { routing: 'architect: opus' }
            : abstraction >= 0.75
              ? 'Involve architect for changes that affect module boundaries or introduce new dependencies'
              : 'Involve architect for complex cross-module changes',
        ],
        intensity,
      },
    ];
  }

  // 실용 중시
  return [
    'pragmatic-implementation',
    {
      belief:
        abstraction <= 0.2
          ? 'Build only what is needed right now — nothing more, nothing speculative'
          : abstraction <= 0.35
            ? 'Prefer direct implementation over patterns — solve the problem at hand'
            : 'Keep it simple — add structure only when complexity demands it',
      generates: [
        abstraction <= 0.2
          ? 'No speculative abstractions under any circumstances. If it is used once, do not extract it. Inline everything possible.'
          : abstraction <= 0.35
            ? 'No speculative abstractions. Extract only when the same pattern appears three or more times.'
            : 'Avoid premature abstractions. Extract when clear duplication exists.',
        abstraction <= 0.25
          ? 'Prefer direct implementation over design patterns. Flat code is better than layered code. No factory, strategy, or observer patterns for single-use cases.'
          : 'Prefer direct implementation over design patterns for simple cases',
        abstraction <= 0.25
          ? { step: 'Remove unused code aggressively. Delete dead functions, unused imports, and empty modules. No "might need later" code.' }
          : abstraction <= 0.4
            ? 'Remove unused code. Keep the codebase lean.'
            : 'Keep code lean. Remove clearly dead code.',
        abstraction <= 0.2
          ? 'Inline small utilities instead of extracting functions. A 5-line inline block is clearer than a named function with 5 lines.'
          : abstraction <= 0.35
            ? 'Avoid unnecessary helpers. Only extract when the extracted function has a clear, reusable purpose.'
            : 'Avoid unnecessary helper functions for one-off logic',
      ],
      intensity,
    },
  ];
};

/** communication-style 기반 원칙 */
const communicationPrinciple: PrincipleGenerator = (dims) => {
  const comm = dims.communicationStyle ?? 0.5;
  const dev = deviation(comm);
  if (dev < 0.1) return null;

  const intensity = dev * 2;

  if (comm >= 0.5) {
    // 간결
    return [
      'concise-communication',
      {
        belief:
          comm >= 0.8
            ? "Brevity is respect for the reader's time — every word must earn its place"
            : comm >= 0.65
              ? 'Be concise when the code speaks for itself'
              : 'Keep responses focused — lead with the answer',
        generates: [
          comm >= 0.8
            ? 'Code over explanation. If the code is clear, no explanation is needed. Comments only for non-obvious "why" decisions.'
            : 'Code over explanation when code is clear. Brief comments for complex logic.',
          comm >= 0.75
            ? 'Bullet points over paragraphs. Maximum 2 bullets per topic. No transition sentences.'
            : comm >= 0.6
              ? 'Bullet points over paragraphs. Keep explanations focused on the key point.'
              : 'Keep explanations focused. No unnecessary preamble.',
          comm >= 0.85
            ? { step: 'Skip all obvious context. No "First, let me..." or "I will now..." phrases. No trailing summary. Start with the answer or code.' }
            : comm >= 0.7
              ? 'Skip obvious context. No preamble or trailing summary.'
              : 'Omit unnecessary preamble. Lead with the answer.',
          comm >= 0.9
            ? { alert: 'Responses under 3 sentences unless showing code. No greeting, no sign-off, no meta-commentary about what you are doing.' }
            : comm >= 0.75
              ? 'Keep responses short. Code blocks only when asked or when they add clarity.'
              : 'Keep responses concise. Use code blocks for non-trivial examples.',
        ],
        intensity,
      },
    ];
  }

  // 상세
  return [
    'detailed-communication',
    {
      belief:
        comm <= 0.2
          ? 'Clear explanation prevents misunderstanding — invest in context to avoid costly miscommunication'
          : comm <= 0.35
            ? 'Provide enough context for understanding — the reader should not need to ask follow-ups'
            : 'Balance clarity with conciseness — explain non-obvious decisions',
      generates: [
        comm <= 0.2
          ? 'Explain reasoning and trade-offs for every decision. Include what was considered and rejected. Show the decision-making process.'
          : comm <= 0.35
            ? 'Explain reasoning and trade-offs for important decisions. Mention key alternatives considered.'
            : 'Explain reasoning for non-obvious decisions. Note key trade-offs.',
        comm <= 0.25
          ? { step: 'Provide full context for every decision: what problem it solves, what alternatives exist, what trade-offs were made, and what risks remain.' }
          : comm <= 0.4
            ? 'Add context for non-obvious decisions. Explain "why" not just "what."'
            : 'Add context for decisions that might surprise the reader',
        comm <= 0.3
          ? 'Include examples and alternatives when relevant. Show both the recommended approach and at least one alternative with pros/cons.'
          : 'Include examples when they clarify the approach',
        comm <= 0.2
          ? { step: 'Document assumptions explicitly. List preconditions, postconditions, and invariants for complex operations.' }
          : comm <= 0.35
            ? 'Note key assumptions. Document preconditions for non-obvious operations.'
            : 'Note key assumptions when they affect the solution',
      ],
      intensity,
    },
  ];
};

/** 교차 차원 원칙: quality + risk 조합 */
const crossDimensionPrinciple: PrincipleGenerator = (dims) => {
  const quality = dims.qualityFocus ?? 0.5;
  const risk = dims.riskTolerance ?? 0.5;
  const autonomy = dims.autonomyPreference ?? 0.5;

  // 고품질 + 저위험 = 극도로 방어적
  if (quality >= 0.7 && risk <= 0.3) {
    return [
      'fortress-mode',
      {
        belief: 'Correctness is the foundation — every change must be proven safe before it ships',
        generates: [
          { routing: 'code-review: opus, security-review: opus' },
          { hook: 'pre-commit-validation', severity: 'critical' },
          { step: 'Require both unit and integration tests for new code. Mutation testing for critical business logic.' },
          { alert: 'No shortcuts — full validation pipeline required. Build + lint + type-check + test + coverage threshold must all pass.' },
          'Review all dependency updates for breaking changes and security advisories before merging',
        ],
        intensity: Math.min((quality - 0.5 + (0.5 - risk)) / 1.0, 1.0),
      },
    ];
  }

  // 저품질 + 고위험 + 고자율 = 극도로 빠른
  if (quality <= 0.3 && risk >= 0.7 && autonomy >= 0.7) {
    return [
      'blitz-mode',
      {
        belief: 'Ship first, fix later — velocity is everything. Perfect is the enemy of shipped.',
        generates: [
          { routing: 'implement: sonnet' },
          'Skip all ceremony — no formal reviews for changes under 100 lines. No PR description required.',
          'Auto-fix lint issues without asking. Auto-format on save. No manual style discussions.',
          'Commit frequently, even work-in-progress. Use fixup commits freely.',
          { alert: 'Production hotfixes skip the normal pipeline. Direct push to main with post-merge review.' },
        ],
        intensity: Math.min((0.5 - quality + (risk - 0.5) + (autonomy - 0.5)) / 1.5, 1.0),
      },
    ];
  }

  return null;
};

// ── All Generators ──────────────────────────────────

const ALL_GENERATORS: PrincipleGenerator[] = [
  riskPrinciple,
  qualityPrinciple,
  autonomyPrinciple,
  abstractionPrinciple,
  communicationPrinciple,
  crossDimensionPrinciple,
];

// ── Public API ──────────────────────────────────────

/** 차원 벡터에서 세분화된 철학 원칙 동적 생성 */
export function generateTunedPrinciples(dims: DimensionVector): Record<string, TunedPrinciple> {
  const principles: Record<string, TunedPrinciple> = {};

  for (const generator of ALL_GENERATORS) {
    const result = generator(dims);
    if (result) {
      const [key, principle] = result;
      principles[key] = principle;
    }
  }

  // 항상 포함: incremental-shipping (intensity는 중간)
  principles['incremental-shipping'] = {
    belief: 'Ship small, ship often',
    generates: [
      'Commit after every meaningful chunk',
      'Prefer working increments over large batches',
    ],
    intensity: 0.5,
  };

  return principles;
}
