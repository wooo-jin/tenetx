/**
 * Tenetx Forge — Project Signal Scanner
 *
 * 프로젝트 디렉토리를 분석하여 ProjectSignals를 추출.
 * git 히스토리, 의존성, 코드 스타일, 아키텍처를 파악.
 * 외부 의존성 없이 node 내장 모듈만 사용.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type {
  ProjectSignals,
  GitSignals,
  DependencySignals,
  CodeStyleSignals,
  ArchitectureSignals,
} from './types.js';

// ── Git Signals ─────────────────────────────────────

function execGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function scanGit(cwd: string): GitSignals {
  const defaults: GitSignals = {
    totalCommits: 0,
    recentCommits: 0,
    avgCommitMsgLength: 0,
    branchCount: 0,
    tagCount: 0,
    branchStrategy: 'unknown',
  };

  // git 저장소인지 확인
  const isRepo = execGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (isRepo !== 'true') return defaults;

  // 총 커밋 수
  const totalStr = execGit(cwd, ['rev-list', '--count', 'HEAD']);
  const totalCommits = parseInt(totalStr, 10) || 0;

  // 최근 30일 커밋 수
  const recentStr = execGit(cwd, ['rev-list', '--count', '--since=30.days', 'HEAD']);
  const recentCommits = parseInt(recentStr, 10) || 0;

  // 평균 커밋 메시지 길이 (최근 50개)
  const messages = execGit(cwd, ['log', '--format=%s', '-50']);
  const msgLines = messages.split('\n').filter(Boolean);
  const avgCommitMsgLength = msgLines.length > 0
    ? Math.round(msgLines.reduce((sum, m) => sum + m.length, 0) / msgLines.length)
    : 0;

  // 브랜치 수
  const branches = execGit(cwd, ['branch', '--list']);
  const branchCount = branches.split('\n').filter(Boolean).length;

  // 태그 수
  const tags = execGit(cwd, ['tag', '--list']);
  const tagCount = tags.split('\n').filter(Boolean).length;

  // 브랜치 전략 추정
  let branchStrategy: GitSignals['branchStrategy'] = 'unknown';
  const branchNames = branches.toLowerCase();
  if (branchNames.includes('develop') || branchNames.includes('release/')) {
    branchStrategy = 'gitflow';
  } else if (branchNames.includes('feature/') || branchNames.includes('feat/')) {
    branchStrategy = 'feature-branch';
  } else if (branchCount <= 2) {
    branchStrategy = 'trunk';
  }

  return { totalCommits, recentCommits, avgCommitMsgLength, branchCount, tagCount, branchStrategy };
}

// ── Dependency Signals ──────────────────────────────

function scanDependencies(cwd: string): DependencySignals {
  const defaults: DependencySignals = {
    manager: 'none',
    totalDeps: 0,
    devDeps: 0,
    typeDefs: 0,
    hasLinter: false,
    hasFormatter: false,
    hasTypeChecker: false,
  };

  // npm/yarn/pnpm
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = Object.keys(pkg.dependencies ?? {});
      const devDepsKeys = Object.keys(pkg.devDependencies ?? {});
      const allDeps = [...deps, ...devDepsKeys];

      // 패키지 매니저 판별
      let manager: DependencySignals['manager'] = 'npm';
      if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) manager = 'pnpm';
      else if (fs.existsSync(path.join(cwd, 'yarn.lock'))) manager = 'yarn';

      const linters = ['eslint', 'biome', 'tslint', 'oxlint', '@biomejs/biome'];
      const formatters = ['prettier', 'biome', '@biomejs/biome', 'dprint'];
      const typeCheckers = ['typescript', 'flow-bin'];

      return {
        manager,
        totalDeps: deps.length,
        devDeps: devDepsKeys.length,
        typeDefs: allDeps.filter(d => d.startsWith('@types/')).length,
        hasLinter: linters.some(l => allDeps.includes(l)),
        hasFormatter: formatters.some(f => allDeps.includes(f)),
        hasTypeChecker: typeCheckers.some(t => allDeps.includes(t)),
      };
    } catch {
      return { ...defaults, manager: 'npm' };
    }
  }

  // Go
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    return { ...defaults, manager: 'go', hasTypeChecker: true };
  }

  // Rust
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    return { ...defaults, manager: 'cargo', hasTypeChecker: true };
  }

  // Python
  if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
    return { ...defaults, manager: 'pip' };
  }

  return defaults;
}

// ── Code Style Signals ──────────────────────────────

function scanCodeStyle(cwd: string): CodeStyleSignals {
  const linterConfigs: string[] = [];
  const formatterConfigs: string[] = [];
  const testFrameworks: string[] = [];

  // 린터 설정 탐지
  const linterFiles: Array<[string, string]> = [
    ['.eslintrc', 'eslint'], ['.eslintrc.js', 'eslint'], ['.eslintrc.json', 'eslint'],
    ['.eslintrc.cjs', 'eslint'], ['.eslintrc.yml', 'eslint'], ['eslint.config.js', 'eslint'],
    ['eslint.config.mjs', 'eslint'], ['eslint.config.ts', 'eslint'],
    ['biome.json', 'biome'], ['biome.jsonc', 'biome'],
    ['.oxlintrc.json', 'oxlint'],
  ];
  for (const [file, name] of linterFiles) {
    if (fs.existsSync(path.join(cwd, file))) linterConfigs.push(name);
  }

  // 포매터 설정 탐지
  const formatterFiles: Array<[string, string]> = [
    ['.prettierrc', 'prettier'], ['.prettierrc.js', 'prettier'],
    ['.prettierrc.json', 'prettier'], ['.prettierrc.yml', 'prettier'],
    ['prettier.config.js', 'prettier'], ['prettier.config.mjs', 'prettier'],
    ['biome.json', 'biome'], ['biome.jsonc', 'biome'],
    ['dprint.json', 'dprint'],
  ];
  for (const [file, name] of formatterFiles) {
    if (fs.existsSync(path.join(cwd, file))) formatterConfigs.push(name);
  }

  // 테스트 패턴 탐지
  let testPattern: CodeStyleSignals['testPattern'] = 'none';
  const hasTestDir = fs.existsSync(path.join(cwd, '__tests__'))
    || fs.existsSync(path.join(cwd, 'tests'))
    || fs.existsSync(path.join(cwd, 'test'));
  const hasSrcTestFiles = checkForColocatedTests(cwd);

  if (hasTestDir && hasSrcTestFiles) testPattern = 'both';
  else if (hasSrcTestFiles) testPattern = 'colocated';
  else if (hasTestDir) testPattern = 'separate';

  // 테스트 프레임워크 탐지
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ];
      const frameworks: Array<[string, string]> = [
        ['vitest', 'vitest'], ['jest', 'jest'], ['mocha', 'mocha'],
        ['ava', 'ava'], ['tap', 'tap'], ['@playwright/test', 'playwright'],
        ['cypress', 'cypress'],
      ];
      for (const [dep, name] of frameworks) {
        if (allDeps.includes(dep)) testFrameworks.push(name);
      }
    } catch { /* ignore */ }
  }

  // CI 탐지
  const hasCI = fs.existsSync(path.join(cwd, '.github', 'workflows'))
    || fs.existsSync(path.join(cwd, '.gitlab-ci.yml'))
    || fs.existsSync(path.join(cwd, 'Jenkinsfile'))
    || fs.existsSync(path.join(cwd, '.circleci'));

  // pre-commit 훅 탐지
  const hasPreCommitHook = fs.existsSync(path.join(cwd, '.husky'))
    || fs.existsSync(path.join(cwd, '.pre-commit-config.yaml'))
    || fs.existsSync(path.join(cwd, '.lefthook.yml'));

  return {
    linterConfig: [...new Set(linterConfigs)],
    formatterConfig: [...new Set(formatterConfigs)],
    testPattern,
    testFramework: testFrameworks,
    hasCI,
    hasPreCommitHook,
  };
}

/** src/ 내에 *.test.* 또는 *.spec.* 파일이 있는지 확인 */
function checkForColocatedTests(cwd: string): boolean {
  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) return false;

  try {
    const entries = fs.readdirSync(srcDir, { recursive: true }) as string[];
    return entries.some(e => /\.(test|spec)\.\w+$/.test(String(e)));
  } catch {
    return false;
  }
}

// ── Architecture Signals ────────────────────────────

function scanArchitecture(cwd: string): ArchitectureSignals {
  let maxDirDepth = 0;
  let srcDirCount = 0;

  // src 디렉토리 깊이 측정
  const srcDir = path.join(cwd, 'src');
  if (fs.existsSync(srcDir)) {
    try {
      const entries = fs.readdirSync(srcDir, { recursive: true }) as string[];
      for (const entry of entries) {
        const depth = String(entry).split(path.sep).length;
        if (depth > maxDirDepth) maxDirDepth = depth;
        const fullPath = path.join(srcDir, String(entry));
        try {
          if (fs.statSync(fullPath).isDirectory()) srcDirCount++;
        } catch { /* stat 실패 무시 */ }
      }
    } catch { /* 디렉토리 순회 실패 무시 */ }
  }

  const hasDocs = fs.existsSync(path.join(cwd, 'docs'))
    || fs.existsSync(path.join(cwd, 'doc'));
  const hasReadme = fs.existsSync(path.join(cwd, 'README.md'))
    || fs.existsSync(path.join(cwd, 'readme.md'));
  const hasChangelog = fs.existsSync(path.join(cwd, 'CHANGELOG.md'))
    || fs.existsSync(path.join(cwd, 'CHANGES.md'));

  // 모노레포 탐지
  const isMonorepo = fs.existsSync(path.join(cwd, 'lerna.json'))
    || fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'))
    || fs.existsSync(path.join(cwd, 'packages'))
    || fs.existsSync(path.join(cwd, 'apps'));

  return { maxDirDepth, srcDirCount, hasDocs, hasReadme, hasChangelog, isMonorepo };
}

// ── Public API ──────────────────────────────────────

/** 프로젝트를 전체 스캔하여 ProjectSignals 반환 */
export function scanProject(cwd: string): ProjectSignals {
  return {
    git: scanGit(cwd),
    dependencies: scanDependencies(cwd),
    codeStyle: scanCodeStyle(cwd),
    architecture: scanArchitecture(cwd),
    scannedAt: new Date().toISOString(),
  };
}

/** 스캔 결과를 사람이 읽기 좋게 포맷 */
export function formatScanResult(signals: ProjectSignals): string {
  const lines: string[] = [];

  lines.push('  Git:');
  lines.push(`    commits: ${signals.git.totalCommits} (recent 30d: ${signals.git.recentCommits})`);
  lines.push(`    branches: ${signals.git.branchCount}, tags: ${signals.git.tagCount}`);
  lines.push(`    strategy: ${signals.git.branchStrategy}`);
  lines.push(`    avg commit msg: ${signals.git.avgCommitMsgLength} chars`);

  lines.push('  Dependencies:');
  lines.push(`    manager: ${signals.dependencies.manager}`);
  lines.push(`    deps: ${signals.dependencies.totalDeps}, devDeps: ${signals.dependencies.devDeps}`);
  lines.push(`    types: ${signals.dependencies.typeDefs}, linter: ${signals.dependencies.hasLinter}, formatter: ${signals.dependencies.hasFormatter}`);

  lines.push('  Code Style:');
  if (signals.codeStyle.linterConfig.length > 0) {
    lines.push(`    linters: ${signals.codeStyle.linterConfig.join(', ')}`);
  }
  if (signals.codeStyle.formatterConfig.length > 0) {
    lines.push(`    formatters: ${signals.codeStyle.formatterConfig.join(', ')}`);
  }
  lines.push(`    tests: ${signals.codeStyle.testPattern} (${signals.codeStyle.testFramework.join(', ') || 'none'})`);
  lines.push(`    CI: ${signals.codeStyle.hasCI}, pre-commit: ${signals.codeStyle.hasPreCommitHook}`);

  lines.push('  Architecture:');
  lines.push(`    dir depth: ${signals.architecture.maxDirDepth}, src dirs: ${signals.architecture.srcDirCount}`);
  lines.push(`    docs: ${signals.architecture.hasDocs}, readme: ${signals.architecture.hasReadme}, changelog: ${signals.architecture.hasChangelog}`);
  lines.push(`    monorepo: ${signals.architecture.isMonorepo}`);

  return lines.join('\n');
}
