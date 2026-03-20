/**
 * Review Loop — 변경 자동 리뷰 루프
 *
 * Git diff 기반으로 변경된 파일을 분석하고 리뷰 포인트를 생성합니다.
 * - 변경 규모 분류 (small/medium/large)
 * - 파일별 변경 유형 추론
 * - 리뷰 체크리스트 자동 생성
 * - 제약 위반 교차 검사
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
// child_process는 getChangedFiles 내부에서 require()로 사용
import { runConstraintsOnFile, constraintConfigPath } from '../constraints/constraint-runner.js';
import type { LoopResult, LoopStep, ReviewLoopOptions } from './types.js';

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

export interface ReviewPoint {
  file: string;
  category: 'logic' | 'security' | 'performance' | 'style' | 'constraint';
  severity: 'high' | 'medium' | 'low';
  message: string;
}

/** Git에서 변경된 파일 목록 추출 */
export function getChangedFiles(cwd: string): ChangedFile[] {
  try {
    // git 리포지토리 여부 확인 (비 git 디렉토리에서 경고 출력 방지)
    const { execFileSync } = require('node:child_process');
    try {
      execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe', timeout: 5_000 });
    } catch {
      return [];
    }

    type GitArgs = [string, string[]];
    const numstatArgs: GitArgs[] = [
      ['git', ['diff', '--numstat', 'HEAD']],
      ['git', ['diff', '--numstat', '--cached']],
    ];
    const nameStatusArgs: GitArgs[] = [
      ['git', ['diff', '--name-status', 'HEAD']],
      ['git', ['diff', '--name-status', '--cached']],
    ];

    let numstatOutput = '';
    let nameStatusOutput = '';

    for (let i = 0; i < numstatArgs.length; i++) {
      try {
        numstatOutput = (execFileSync(numstatArgs[i][0], numstatArgs[i][1], { cwd, encoding: 'utf-8', timeout: 10_000 }) as string).trim();
        nameStatusOutput = (execFileSync(nameStatusArgs[i][0], nameStatusArgs[i][1], { cwd, encoding: 'utf-8', timeout: 10_000 }) as string).trim();
        if (numstatOutput) break;
      } catch { /* try next */ }
    }

    if (!numstatOutput) return [];

    // --name-status 결과를 맵으로 파싱 (A/M/D/R)
    const statusMap = new Map<string, 'added' | 'modified' | 'deleted' | 'renamed'>();
    for (const line of nameStatusOutput.split('\n').filter(Boolean)) {
      const [code, ...parts] = line.split('\t');
      const filePath = parts[parts.length - 1];
      if (!filePath) continue;
      if (code.startsWith('A')) statusMap.set(filePath, 'added');
      else if (code.startsWith('D')) statusMap.set(filePath, 'deleted');
      else if (code.startsWith('R')) statusMap.set(filePath, 'renamed');
      else statusMap.set(filePath, 'modified');
    }

    return numstatOutput.split('\n').filter(Boolean).map(line => {
      const [add, del, filePath] = line.split('\t');
      const additions = add === '-' ? 0 : parseInt(add, 10);
      const deletions = del === '-' ? 0 : parseInt(del, 10);

      // name-status에서 실제 상태를 우선 사용; 없으면 숫자 통계로 폴백
      const status = statusMap.get(filePath) ?? (
        deletions > 0 && additions === 0 ? 'deleted' as const : 'modified' as const
      );

      return { path: filePath, status, additions, deletions };
    });
  } catch {
    return [];
  }
}

/** 변경 규모 분류 */
export function classifyChangeSize(files: ChangedFile[]): 'small' | 'medium' | 'large' {
  const totalChanges = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  if (totalChanges <= 50 && files.length <= 3) return 'small';
  if (totalChanges <= 300 && files.length <= 10) return 'medium';
  return 'large';
}

/** 파일 변경 유형 추론 */
function inferChangeType(file: ChangedFile): string {
  const name = path.basename(file.path);
  const ext = path.extname(file.path);

  if (name.includes('.test.') || name.includes('.spec.')) return 'test';
  if (name === 'package.json' || name.includes('lock')) return 'dependency';
  if (['.md', '.txt', '.rst'].includes(ext)) return 'documentation';
  if (['.json', '.yaml', '.yml', '.toml'].includes(ext)) return 'config';
  if (name.includes('migration')) return 'migration';
  if (file.status === 'added') return 'new-feature';
  if (file.additions > 0 && file.deletions > 0) return 'refactor';
  return 'implementation';
}

/** 리뷰 체크리스트 생성 */
export function generateReviewChecklist(files: ChangedFile[]): string[] {
  const checklist: string[] = [];
  const changeTypes = new Set(files.map(f => inferChangeType(f)));
  const changeSize = classifyChangeSize(files);

  // 기본 체크리스트
  checklist.push('Is the intent of the changed code clear?');

  if (changeTypes.has('new-feature') || changeTypes.has('implementation')) {
    checklist.push('Are tests added for the new feature?');
    checklist.push('Is error handling adequate?');
  }

  if (changeTypes.has('refactor')) {
    checklist.push('Does behavior remain the same before and after refactoring?');
    checklist.push('Do existing tests still pass?');
  }

  if (changeTypes.has('dependency')) {
    checklist.push('Is the license of the new dependency compatible?');
    checklist.push('Are there no known vulnerabilities?');
  }

  if (changeTypes.has('migration')) {
    checklist.push('Is the migration rollback-safe?');
    checklist.push('Verify compatibility with existing data');
  }

  if (changeSize === 'large') {
    checklist.push('Is the change scope too broad? Consider splitting');
    checklist.push('Has the impact analysis been completed?');
  }

  // 보안 관련 파일 체크
  const securityFiles = files.filter(f =>
    f.path.includes('auth') || f.path.includes('security') ||
    f.path.includes('permission') || f.path.includes('token') ||
    f.path.includes('password') || f.path.includes('secret')
  );
  if (securityFiles.length > 0) {
    checklist.push('Security-related change — security review required');
  }

  return checklist;
}

/** 리뷰 루프 실행 */
export function runReviewLoop(options: ReviewLoopOptions): LoopResult {
  const { cwd, depth = 'standard' } = options;
  const steps: LoopStep[] = [];
  const reviewPoints: ReviewPoint[] = [];

  // Step 1: 변경 파일 수집
  const changedFiles = options.changedFiles
    ? options.changedFiles.map(p => ({ path: p, status: 'modified' as const, additions: 0, deletions: 0 }))
    : getChangedFiles(cwd);

  const collectStep: LoopStep = {
    name: 'collect-changes',
    status: changedFiles.length > 0 ? 'passed' : 'skipped',
    message: changedFiles.length > 0
      ? `${changedFiles.length} changed files detected (${classifyChangeSize(changedFiles)})`
      : 'No changed files',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  steps.push(collectStep);

  if (changedFiles.length === 0) {
    return {
      loopName: 'review',
      status: 'passed',
      steps,
      summary: 'No changes — review not needed',
    };
  }

  // Step 2: 제약 검사 (constraints.json 있을 때)
  if (fs.existsSync(constraintConfigPath(cwd))) {
    const constraintStep: LoopStep = {
      name: 'constraint-check',
      status: 'running',
      startedAt: new Date().toISOString(),
    };

    let totalViolations = 0;
    for (const file of changedFiles) {
      if (file.status === 'deleted') continue;
      const absPath = path.isAbsolute(file.path) ? file.path : path.join(cwd, file.path);
      if (!fs.existsSync(absPath)) continue;

      const result = runConstraintsOnFile(absPath, cwd);
      for (const v of result.violations) {
        totalViolations++;
        reviewPoints.push({
          file: v.filePath,
          category: 'constraint',
          severity: v.severity === 'error' ? 'high' : 'medium',
          message: v.message,
        });
      }
    }

    constraintStep.status = totalViolations > 0 ? 'failed' : 'passed';
    constraintStep.message = totalViolations > 0
      ? `${totalViolations} constraint violations found`
      : 'Constraint check passed';
    constraintStep.completedAt = new Date().toISOString();
    steps.push(constraintStep);
  }

  // Step 3: 체크리스트 생성
  const checklist = generateReviewChecklist(changedFiles);
  const checklistStep: LoopStep = {
    name: 'review-checklist',
    status: 'passed',
    message: `${checklist.length}-item checklist generated`,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  steps.push(checklistStep);

  // Step 4: 변경 유형별 통계
  if (depth !== 'quick') {
    const typeStats = new Map<string, number>();
    for (const file of changedFiles) {
      const type = inferChangeType(file);
      typeStats.set(type, (typeStats.get(type) ?? 0) + 1);
    }

    const statsStep: LoopStep = {
      name: 'change-analysis',
      status: 'passed',
      message: [...typeStats.entries()].map(([t, c]) => `${t}:${c}`).join(', '),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    steps.push(statsStep);
  }

  const failedSteps = steps.filter(s => s.status === 'failed').length;
  const status = failedSteps > 0 ? 'partial' : 'passed';

  const suggestions = checklist.map(c => `☐ ${c}`);
  if (reviewPoints.length > 0) {
    suggestions.unshift(`⚠ ${reviewPoints.length} review points found`);
  }

  return {
    loopName: 'review',
    status,
    steps,
    summary: `${changedFiles.length} files reviewed, ${reviewPoints.length} issues found`,
    violations: reviewPoints.length,
    suggestions,
  };
}

/** 리뷰 결과를 에이전트용 메시지로 포맷 */
export function formatReviewResult(result: LoopResult): string {
  const lines: string[] = [];
  const icon = result.status === 'passed' ? '✅' : '⚠️';

  lines.push(`${icon} Review Loop: ${result.summary}`);
  lines.push('');

  for (const step of result.steps) {
    const stepIcon = step.status === 'passed' ? '✓' :
      step.status === 'failed' ? '✗' : '○';
    lines.push(`  ${stepIcon} ${step.name}: ${step.message ?? step.status}`);
  }

  if (result.suggestions && result.suggestions.length > 0) {
    lines.push('');
    lines.push('Review Checklist:');
    for (const s of result.suggestions) {
      lines.push(`  ${s}`);
    }
  }

  return lines.join('\n');
}
