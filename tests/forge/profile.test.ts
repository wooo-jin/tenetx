import { describe, it, expect } from 'vitest';
import { signalsToDimensions, formatDimensions } from '../../src/forge/profile.js';
import { defaultDimensionVector } from '../../src/forge/dimensions.js';
import type { ProjectSignals } from '../../src/forge/types.js';

function makeSignals(overrides: Partial<{
  hasCI: boolean;
  hasPreCommitHook: boolean;
  hasLinter: boolean;
  tagCount: number;
  branchStrategy: 'trunk' | 'gitflow' | 'feature-branch' | 'unknown';
  recentCommits: number;
  testPattern: 'colocated' | 'separate' | 'both' | 'none';
  testFramework: string[];
  hasTypeChecker: boolean;
  typeDefs: number;
  maxDirDepth: number;
  isMonorepo: boolean;
  srcDirCount: number;
  hasDocs: boolean;
  hasChangelog: boolean;
  avgCommitMsgLength: number;
}>): ProjectSignals {
  return {
    git: {
      totalCommits: 100,
      recentCommits: overrides.recentCommits ?? 20,
      avgCommitMsgLength: overrides.avgCommitMsgLength ?? 40,
      branchCount: 5,
      tagCount: overrides.tagCount ?? 0,
      branchStrategy: overrides.branchStrategy ?? 'unknown',
    },
    dependencies: {
      manager: 'npm',
      totalDeps: 10,
      devDeps: 5,
      typeDefs: overrides.typeDefs ?? 0,
      hasLinter: overrides.hasLinter ?? false,
      hasFormatter: false,
      hasTypeChecker: overrides.hasTypeChecker ?? false,
    },
    codeStyle: {
      linterConfig: [],
      formatterConfig: [],
      testPattern: overrides.testPattern ?? 'none',
      testFramework: overrides.testFramework ?? [],
      hasCI: overrides.hasCI ?? false,
      hasPreCommitHook: overrides.hasPreCommitHook ?? false,
    },
    architecture: {
      maxDirDepth: overrides.maxDirDepth ?? 3,
      srcDirCount: overrides.srcDirCount ?? 2,
      hasDocs: overrides.hasDocs ?? false,
      hasReadme: true,
      hasChangelog: overrides.hasChangelog ?? false,
      isMonorepo: overrides.isMonorepo ?? false,
    },
    scannedAt: new Date().toISOString(),
  };
}

describe('signalsToDimensions', () => {
  it('returns a vector with all 5 core dimensions', () => {
    const signals = makeSignals({});
    const v = signalsToDimensions(signals);
    expect(v).toHaveProperty('riskTolerance');
    expect(v).toHaveProperty('autonomyPreference');
    expect(v).toHaveProperty('qualityFocus');
    expect(v).toHaveProperty('abstractionLevel');
    expect(v).toHaveProperty('communicationStyle');
  });

  it('keeps all values clamped to 0-1 range', () => {
    const signals = makeSignals({
      hasCI: true, hasPreCommitHook: true, hasLinter: true,
      tagCount: 10, branchStrategy: 'gitflow', recentCommits: 80,
      testPattern: 'both', testFramework: ['vitest', 'jest'], hasTypeChecker: true,
      typeDefs: 10, maxDirDepth: 7, isMonorepo: true, srcDirCount: 15,
      hasDocs: true, hasChangelog: true, avgCommitMsgLength: 100,
    });
    const v = signalsToDimensions(signals);
    for (const key of Object.keys(v)) {
      expect(v[key]).toBeGreaterThanOrEqual(0);
      expect(v[key]).toBeLessThanOrEqual(1);
    }
  });

  it('CI presence lowers riskTolerance below 0.5', () => {
    const withCI = signalsToDimensions(makeSignals({ hasCI: true }));
    const withoutCI = signalsToDimensions(makeSignals({ hasCI: false }));
    expect(withCI.riskTolerance).toBeLessThan(withoutCI.riskTolerance);
  });

  it('pre-commit hook presence lowers riskTolerance', () => {
    const with_ = signalsToDimensions(makeSignals({ hasPreCommitHook: true }));
    const without = signalsToDimensions(makeSignals({ hasPreCommitHook: false }));
    expect(with_.riskTolerance).toBeLessThan(without.riskTolerance);
  });

  it('tests present raises qualityFocus above baseline', () => {
    const withTests = signalsToDimensions(makeSignals({
      testPattern: 'separate',
      testFramework: ['vitest'],
    }));
    const withoutTests = signalsToDimensions(makeSignals({
      testPattern: 'none',
      testFramework: [],
    }));
    expect(withTests.qualityFocus).toBeGreaterThan(withoutTests.qualityFocus);
  });

  it('high recent commits raises autonomyPreference', () => {
    const highCommits = signalsToDimensions(makeSignals({ recentCommits: 70 }));
    const lowCommits = signalsToDimensions(makeSignals({ recentCommits: 5 }));
    expect(highCommits.autonomyPreference).toBeGreaterThan(lowCommits.autonomyPreference);
  });

  it('monorepo raises abstractionLevel', () => {
    const monorepo = signalsToDimensions(makeSignals({ isMonorepo: true }));
    const single = signalsToDimensions(makeSignals({ isMonorepo: false }));
    expect(monorepo.abstractionLevel).toBeGreaterThan(single.abstractionLevel);
  });

  it('trunk strategy raises riskTolerance, gitflow lowers it', () => {
    const trunk = signalsToDimensions(makeSignals({ branchStrategy: 'trunk' }));
    const gitflow = signalsToDimensions(makeSignals({ branchStrategy: 'gitflow' }));
    expect(trunk.riskTolerance).toBeGreaterThan(gitflow.riskTolerance);
  });

  it('long commit messages lower communicationStyle (more verbose)', () => {
    const long = signalsToDimensions(makeSignals({ avgCommitMsgLength: 80 }));
    const short = signalsToDimensions(makeSignals({ avgCommitMsgLength: 10 }));
    expect(long.communicationStyle).toBeLessThan(short.communicationStyle);
  });
});

describe('formatDimensions', () => {
  it('returns a non-empty string', () => {
    const v = defaultDimensionVector();
    const result = formatDimensions(v);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes all dimension labels', () => {
    const v = defaultDimensionVector();
    const result = formatDimensions(v);
    expect(result).toContain('위험 감수도');
    expect(result).toContain('자율성 선호');
    expect(result).toContain('품질 초점');
    expect(result).toContain('추상화 수준');
    expect(result).toContain('커뮤니케이션');
  });

  it('includes the numeric value for each dimension', () => {
    const v = defaultDimensionVector();
    const result = formatDimensions(v);
    expect(result).toContain('0.50');
  });

  it('includes ASCII bar characters in output', () => {
    const v = defaultDimensionVector();
    const result = formatDimensions(v);
    expect(result).toContain('[');
    expect(result).toContain(']');
  });
});
