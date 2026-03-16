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
    // staged + unstaged 변경 (execFileSync로 인젝션 방지)
    const { execFileSync } = require('node:child_process');
    let output = '';
    try {
      output = (execFileSync('git', ['diff', '--numstat', 'HEAD'], { cwd, encoding: 'utf-8', timeout: 10_000 }) as string).trim();
    } catch {
      try {
        output = (execFileSync('git', ['diff', '--numstat', '--cached'], { cwd, encoding: 'utf-8', timeout: 10_000 }) as string).trim();
      } catch { /* no git */ }
    }

    if (!output) return [];

    return output.split('\n').filter(Boolean).map(line => {
      const [add, del, filePath] = line.split('\t');
      const additions = add === '-' ? 0 : parseInt(add, 10);
      const deletions = del === '-' ? 0 : parseInt(del, 10);

      return {
        path: filePath,
        status: additions > 0 && deletions === 0 ? 'added' as const :
          deletions > 0 && additions === 0 ? 'deleted' as const : 'modified' as const,
        additions,
        deletions,
      };
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
  checklist.push('변경된 코드의 의도가 명확한가?');

  if (changeTypes.has('new-feature') || changeTypes.has('implementation')) {
    checklist.push('새 기능에 대한 테스트가 추가되었는가?');
    checklist.push('에러 처리가 적절한가?');
  }

  if (changeTypes.has('refactor')) {
    checklist.push('리팩터링 전후 동작이 동일한가?');
    checklist.push('기존 테스트가 여전히 통과하는가?');
  }

  if (changeTypes.has('dependency')) {
    checklist.push('새 의존성의 라이선스가 호환되는가?');
    checklist.push('알려진 취약점이 없는가?');
  }

  if (changeTypes.has('migration')) {
    checklist.push('마이그레이션이 롤백 가능한가?');
    checklist.push('기존 데이터와의 호환성 확인');
  }

  if (changeSize === 'large') {
    checklist.push('변경 범위가 너무 넓지 않은가? 분할 검토 필요');
    checklist.push('영향 범위 분석이 완료되었는가?');
  }

  // 보안 관련 파일 체크
  const securityFiles = files.filter(f =>
    f.path.includes('auth') || f.path.includes('security') ||
    f.path.includes('permission') || f.path.includes('token') ||
    f.path.includes('password') || f.path.includes('secret')
  );
  if (securityFiles.length > 0) {
    checklist.push('보안 관련 변경 — 보안 리뷰 필수');
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
      ? `${changedFiles.length}개 파일 변경 감지 (${classifyChangeSize(changedFiles)})`
      : '변경 파일 없음',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  steps.push(collectStep);

  if (changedFiles.length === 0) {
    return {
      loopName: 'review',
      status: 'passed',
      steps,
      summary: '변경 없음 — 리뷰 불필요',
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
      ? `${totalViolations}건의 제약 위반 발견`
      : '제약 검사 통과';
    constraintStep.completedAt = new Date().toISOString();
    steps.push(constraintStep);
  }

  // Step 3: 체크리스트 생성
  const checklist = generateReviewChecklist(changedFiles);
  const checklistStep: LoopStep = {
    name: 'review-checklist',
    status: 'passed',
    message: `${checklist.length}개 항목 체크리스트 생성`,
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
    suggestions.unshift(`⚠ ${reviewPoints.length}건의 리뷰 포인트 발견`);
  }

  return {
    loopName: 'review',
    status,
    steps,
    summary: `${changedFiles.length}파일 리뷰, ${reviewPoints.length}건 지적`,
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
    lines.push('리뷰 체크리스트:');
    for (const s of result.suggestions) {
      lines.push(`  ${s}`);
    }
  }

  return lines.join('\n');
}
