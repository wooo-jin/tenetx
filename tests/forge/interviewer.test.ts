import { describe, it, expect } from 'vitest';
import {
  answersToDeltas,
  getActiveQuestions,
  applyPresetAnswers,
  FORGE_QUESTIONS,
} from '../../src/forge/interviewer.js';
import { CORE_DIMENSIONS } from '../../src/forge/dimensions.js';
import type { ProjectSignals } from '../../src/forge/types.js';

function makeMinimalSignals(overrides: Partial<ProjectSignals['codeStyle']> = {}): ProjectSignals {
  return {
    git: {
      totalCommits: 50,
      recentCommits: 20,
      avgCommitMsgLength: 40,
      branchCount: 3,
      tagCount: 0,
      branchStrategy: 'unknown',
    },
    dependencies: {
      manager: 'npm',
      totalDeps: 10,
      devDeps: 3,
      typeDefs: 0,
      hasLinter: false,
      hasFormatter: false,
      hasTypeChecker: false,
    },
    codeStyle: {
      linterConfig: [],
      formatterConfig: [],
      testPattern: 'none',
      testFramework: [],
      hasCI: false,
      hasPreCommitHook: false,
      ...overrides,
    },
    architecture: {
      maxDirDepth: 3,
      srcDirCount: 2,
      hasDocs: false,
      hasReadme: true,
      hasChangelog: false,
      isMonorepo: false,
    },
    scannedAt: new Date().toISOString(),
  };
}

describe('answersToDeltas', () => {
  it('returns a vector with all 5 core dimensions', () => {
    const result = answersToDeltas({});
    for (const dim of CORE_DIMENSIONS) {
      expect(result).toHaveProperty(dim);
    }
  });

  it('returns neutral (all 0.5) vector when no answers provided', () => {
    const result = answersToDeltas({});
    for (const dim of CORE_DIMENSIONS) {
      expect(result[dim]).toBe(0.5);
    }
  });

  it('applies deltas for the first question answer (ai-code-edit)', () => {
    // Option 0: "거의 수정 없이 그대로 사용" -> autonomyPreference +0.25, qualityFocus -0.20
    const result = answersToDeltas({ 'ai-code-edit': 0 });
    expect(result.autonomyPreference).toBeCloseTo(0.75);
    expect(result.qualityFocus).toBeCloseTo(0.3);
  });

  it('applies deltas for the "always thorough review" answer (ai-code-edit idx 2)', () => {
    // Option 2: "항상 로직까지 꼼꼼히 검토" -> autonomyPreference -0.25, qualityFocus +0.25
    const result = answersToDeltas({ 'ai-code-edit': 2 });
    expect(result.autonomyPreference).toBeCloseTo(0.25);
    expect(result.qualityFocus).toBeCloseTo(0.75);
  });

  it('ignores answers with out-of-range option index', () => {
    const result = answersToDeltas({ 'ai-code-edit': 99 });
    for (const dim of CORE_DIMENSIONS) {
      expect(result[dim]).toBe(0.5);
    }
  });

  it('ignores answers for non-existent question IDs', () => {
    const result = answersToDeltas({ 'nonexistent-question': 0 });
    for (const dim of CORE_DIMENSIONS) {
      expect(result[dim]).toBe(0.5);
    }
  });

  it('applies cumulative deltas from multiple questions', () => {
    // ai-code-edit option 2: qualityFocus +0.15
    // pre-commit-check option 2: qualityFocus +0.1 = total +0.25
    const result = answersToDeltas({ 'ai-code-edit': 2, 'pre-commit-check': 2 });
    expect(result.qualityFocus).toBeGreaterThan(0.5);
  });

  it('clamps dimension values to 0-1 range after multiple deltas', () => {
    // Select all "high autonomy" options
    const answers: Record<string, number> = {};
    for (const q of FORGE_QUESTIONS) {
      // Select the option that maximizes autonomyPreference
      let bestIdx = 0;
      let bestDelta = -Infinity;
      for (let i = 0; i < q.options.length; i++) {
        const delta = q.options[i].deltas.autonomyPreference ?? 0;
        if (delta > bestDelta) {
          bestDelta = delta;
          bestIdx = i;
        }
      }
      answers[q.id] = bestIdx;
    }
    const result = answersToDeltas(answers);
    for (const dim of CORE_DIMENSIONS) {
      expect(result[dim]).toBeGreaterThanOrEqual(0);
      expect(result[dim]).toBeLessThanOrEqual(1);
    }
  });
});

describe('getActiveQuestions', () => {
  it('returns all unconditional questions when no signals and no answers', () => {
    const questions = getActiveQuestions({}, null);
    const unconditional = FORGE_QUESTIONS.filter(q => !q.condition);
    // All unconditional questions should appear
    for (const q of unconditional) {
      expect(questions.some(aq => aq.id === q.id)).toBe(true);
    }
  });

  it('includes test-timing question when project has test framework', () => {
    const signals = makeMinimalSignals({ testFramework: ['vitest'] });
    const questions = getActiveQuestions({}, signals);
    expect(questions.some(q => q.id === 'test-timing')).toBe(true);
  });

  it('excludes test-timing question when project has no tests and signals provided', () => {
    // test-timing condition: signals === null OR testFramework.length > 0 OR testPattern !== 'none'
    const signals = makeMinimalSignals({ testFramework: [], testPattern: 'none' });
    const questions = getActiveQuestions({}, signals);
    expect(questions.some(q => q.id === 'test-timing')).toBe(false);
  });

  it('includes all questions when signals is null', () => {
    const questions = getActiveQuestions({}, null);
    expect(questions.length).toBeGreaterThanOrEqual(FORGE_QUESTIONS.filter(q => !q.condition).length);
  });

  it('returns an array (never throws)', () => {
    expect(() => getActiveQuestions({}, null)).not.toThrow();
    expect(Array.isArray(getActiveQuestions({}, null))).toBe(true);
  });
});

describe('applyPresetAnswers', () => {
  it('returns answers and dimensions objects', () => {
    const result = applyPresetAnswers({}, null);
    expect(result).toHaveProperty('answers');
    expect(result).toHaveProperty('dimensions');
  });

  it('applies valid preset answers to active questions', () => {
    const preset = { 'ai-code-edit': 0 };
    const result = applyPresetAnswers(preset, null);
    expect(result.answers['ai-code-edit']).toBe(0);
  });

  it('computes dimensions from the preset answers', () => {
    // ai-code-edit option 0 -> autonomyPreference +0.25
    const result = applyPresetAnswers({ 'ai-code-edit': 0 }, null);
    expect(result.dimensions.autonomyPreference).toBeCloseTo(0.75);
  });

  it('ignores preset answers with invalid option indices', () => {
    const result = applyPresetAnswers({ 'ai-code-edit': 99 }, null);
    expect(result.answers['ai-code-edit']).toBeUndefined();
  });

  it('ignores preset answers for questions excluded by condition', () => {
    const signals = makeMinimalSignals({ testFramework: [], testPattern: 'none' });
    const preset = { 'test-timing': 3 }; // TDD option
    const result = applyPresetAnswers(preset, signals);
    // test-timing should be excluded when signals has no tests
    expect(result.answers['test-timing']).toBeUndefined();
  });

  it('returns neutral dimensions when no preset answers match', () => {
    const result = applyPresetAnswers({ 'nonexistent': 0 }, null);
    for (const dim of CORE_DIMENSIONS) {
      expect(result.dimensions[dim]).toBe(0.5);
    }
  });
});
