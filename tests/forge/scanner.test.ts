import { describe, it, expect } from 'vitest';
import { scanProject, formatScanResult } from '../../src/forge/scanner.js';
import type { ProjectSignals } from '../../src/forge/types.js';

// ── formatScanResult (pure function, no mocks needed) ──

function makeSignals(overrides: Partial<{
  totalCommits: number;
  recentCommits: number;
  avgCommitMsgLength: number;
  branchCount: number;
  tagCount: number;
  branchStrategy: 'trunk' | 'gitflow' | 'feature-branch' | 'unknown';
  manager: string;
  totalDeps: number;
  devDeps: number;
  typeDefs: number;
  hasLinter: boolean;
  hasFormatter: boolean;
  hasTypeChecker: boolean;
  linterConfig: string[];
  formatterConfig: string[];
  testPattern: 'colocated' | 'separate' | 'both' | 'none';
  testFramework: string[];
  hasCI: boolean;
  hasPreCommitHook: boolean;
  maxDirDepth: number;
  srcDirCount: number;
  hasDocs: boolean;
  hasReadme: boolean;
  hasChangelog: boolean;
  isMonorepo: boolean;
}> = {}): ProjectSignals {
  return {
    git: {
      totalCommits: overrides.totalCommits ?? 100,
      recentCommits: overrides.recentCommits ?? 20,
      avgCommitMsgLength: overrides.avgCommitMsgLength ?? 40,
      branchCount: overrides.branchCount ?? 5,
      tagCount: overrides.tagCount ?? 3,
      branchStrategy: overrides.branchStrategy ?? 'feature-branch',
    },
    dependencies: {
      manager: (overrides.manager as ProjectSignals['dependencies']['manager']) ?? 'npm',
      totalDeps: overrides.totalDeps ?? 10,
      devDeps: overrides.devDeps ?? 5,
      typeDefs: overrides.typeDefs ?? 2,
      hasLinter: overrides.hasLinter ?? true,
      hasFormatter: overrides.hasFormatter ?? true,
      hasTypeChecker: overrides.hasTypeChecker ?? true,
    },
    codeStyle: {
      linterConfig: overrides.linterConfig ?? ['eslint'],
      formatterConfig: overrides.formatterConfig ?? ['prettier'],
      testPattern: overrides.testPattern ?? 'separate',
      testFramework: overrides.testFramework ?? ['vitest'],
      hasCI: overrides.hasCI ?? true,
      hasPreCommitHook: overrides.hasPreCommitHook ?? false,
    },
    architecture: {
      maxDirDepth: overrides.maxDirDepth ?? 4,
      srcDirCount: overrides.srcDirCount ?? 6,
      hasDocs: overrides.hasDocs ?? false,
      hasReadme: overrides.hasReadme ?? true,
      hasChangelog: overrides.hasChangelog ?? false,
      isMonorepo: overrides.isMonorepo ?? false,
    },
    scannedAt: '2026-03-26T00:00:00.000Z',
  };
}

describe('formatScanResult', () => {
  it('returns a non-empty string', () => {
    const result = formatScanResult(makeSignals());
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes git section with commit count', () => {
    const result = formatScanResult(makeSignals({ totalCommits: 42 }));
    expect(result).toContain('Git:');
    expect(result).toContain('42');
  });

  it('includes recent commit count in git section', () => {
    const result = formatScanResult(makeSignals({ recentCommits: 15 }));
    expect(result).toContain('recent 30d: 15');
  });

  it('includes branch strategy', () => {
    const result = formatScanResult(makeSignals({ branchStrategy: 'gitflow' }));
    expect(result).toContain('gitflow');
  });

  it('includes dependencies section with manager', () => {
    const result = formatScanResult(makeSignals({ manager: 'pnpm' }));
    expect(result).toContain('Dependencies:');
    expect(result).toContain('pnpm');
  });

  it('includes dependency and devDeps counts', () => {
    const result = formatScanResult(makeSignals({ totalDeps: 25, devDeps: 10 }));
    expect(result).toContain('deps: 25');
    expect(result).toContain('devDeps: 10');
  });

  it('includes code style section with linter names', () => {
    const result = formatScanResult(makeSignals({ linterConfig: ['eslint', 'biome'] }));
    expect(result).toContain('Code Style:');
    expect(result).toContain('eslint, biome');
  });

  it('includes formatter config names', () => {
    const result = formatScanResult(makeSignals({ formatterConfig: ['prettier'] }));
    expect(result).toContain('prettier');
  });

  it('includes test pattern and framework', () => {
    const result = formatScanResult(makeSignals({
      testPattern: 'colocated',
      testFramework: ['jest'],
    }));
    expect(result).toContain('colocated');
    expect(result).toContain('jest');
  });

  it('shows none when no test framework', () => {
    const result = formatScanResult(makeSignals({ testFramework: [] }));
    expect(result).toContain('none');
  });

  it('includes CI and pre-commit status', () => {
    const result = formatScanResult(makeSignals({ hasCI: true, hasPreCommitHook: true }));
    expect(result).toContain('CI: true');
    expect(result).toContain('pre-commit: true');
  });

  it('includes architecture section', () => {
    const result = formatScanResult(makeSignals({ maxDirDepth: 5, srcDirCount: 8 }));
    expect(result).toContain('Architecture:');
    expect(result).toContain('dir depth: 5');
    expect(result).toContain('src dirs: 8');
  });

  it('includes monorepo status', () => {
    const result = formatScanResult(makeSignals({ isMonorepo: true }));
    expect(result).toContain('monorepo: true');
  });

  it('includes ast section when ast data is present', () => {
    const signals = makeSignals();
    signals.architecture.ast = {
      functionCount: 50,
      classCount: 10,
      tryCatchCount: 5,
      engine: 'ast-grep',
    };
    const result = formatScanResult(signals);
    expect(result).toContain('ast (ast-grep)');
    expect(result).toContain('functions 50');
    expect(result).toContain('classes 10');
  });

  it('does not include ast section when ast data is absent', () => {
    const result = formatScanResult(makeSignals());
    expect(result).not.toContain('ast (');
  });

  it('includes average commit message length', () => {
    const result = formatScanResult(makeSignals({ avgCommitMsgLength: 55 }));
    expect(result).toContain('55 chars');
  });

  it('omits linters line when linterConfig is empty', () => {
    const result = formatScanResult(makeSignals({ linterConfig: [] }));
    expect(result).not.toContain('linters:');
  });

  it('omits formatters line when formatterConfig is empty', () => {
    const result = formatScanResult(makeSignals({ formatterConfig: [] }));
    expect(result).not.toContain('formatters:');
  });
});

// ── scanProject (real file system, run against current repo) ──

describe('scanProject', () => {
  it('returns a valid ProjectSignals structure for the current project', () => {
    const cwd = process.cwd();
    const result = scanProject(cwd);

    expect(result).toHaveProperty('git');
    expect(result).toHaveProperty('dependencies');
    expect(result).toHaveProperty('codeStyle');
    expect(result).toHaveProperty('architecture');
    expect(result).toHaveProperty('scannedAt');
  });

  it('detects git repository in the current project', () => {
    const result = scanProject(process.cwd());
    expect(result.git.totalCommits).toBeGreaterThan(0);
  });

  it('detects npm as package manager for this project', () => {
    const result = scanProject(process.cwd());
    expect(['npm', 'pnpm', 'yarn']).toContain(result.dependencies.manager);
  });

  it('detects vitest as test framework for this project', () => {
    const result = scanProject(process.cwd());
    expect(result.codeStyle.testFramework).toContain('vitest');
  });

  it('detects separate test pattern for this project', () => {
    const result = scanProject(process.cwd());
    // This project has tests/ directory
    expect(['separate', 'both']).toContain(result.codeStyle.testPattern);
  });

  it('returns scannedAt as a valid ISO date', () => {
    const result = scanProject(process.cwd());
    expect(new Date(result.scannedAt).toISOString()).toBe(result.scannedAt);
  });

  it('returns empty signals for non-existent directory', () => {
    const result = scanProject('/tmp/nonexistent-tenetx-test-dir');
    expect(result.git.totalCommits).toBe(0);
    expect(result.dependencies.manager).toBe('none');
  });

  it('detects README in the current project', () => {
    const result = scanProject(process.cwd());
    expect(result.architecture.hasReadme).toBe(true);
  });
});
