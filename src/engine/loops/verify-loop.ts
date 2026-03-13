/**
 * Verify Loop — 자동 검증 루프
 *
 * Ralph/Autopilot 모드의 Step 3(Verify/Fix)를 구조화합니다.
 * 1. 타입 체크 (tsc --noEmit)
 * 2. 빌드 검사
 * 3. 테스트 실행
 * 4. 아키텍처 제약 검사 (Phase A 연동)
 *
 * 각 단계의 성공/실패를 구조화된 결과로 반환하여
 * 에이전트가 자율적으로 fix 사이클을 수행할 수 있게 합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { runConstraintsOnProject, formatViolations, constraintConfigPath } from '../constraints/constraint-runner.js';
import type { LoopResult, LoopStep, VerifyLoopOptions } from './types.js';

/** 프로젝트 빌드/테스트 명령어 자동 감지 */
export function detectCommands(cwd: string): { build?: string; test?: string; typeCheck?: string } {
  const pkgPath = path.join(cwd, 'package.json');

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const scripts = pkg.scripts ?? {};
      return {
        build: scripts.build ? 'npm run build' : undefined,
        test: scripts.test ? 'npm test' : undefined,
        typeCheck: scripts.typecheck ?? scripts['type-check']
          ? `npm run ${scripts.typecheck ? 'typecheck' : 'type-check'}`
          : (fs.existsSync(path.join(cwd, 'tsconfig.json')) ? 'npx tsc --noEmit' : undefined),
      };
    } catch { /* fallthrough */ }
  }

  // Python
  if (fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
    return {
      test: fs.existsSync(path.join(cwd, 'pytest.ini')) || fs.existsSync(path.join(cwd, 'pyproject.toml'))
        ? 'pytest' : undefined,
      typeCheck: 'mypy .',
    };
  }

  // Go
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    return {
      build: 'go build ./...',
      test: 'go test ./...',
    };
  }

  return {};
}

/** 명령어 실행 후 결과 반환 */
function runCommand(command: string, cwd: string): { success: boolean; output: string } {
  try {
    const output = execSync(command, {
      cwd,
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    return { success: true, output: output.slice(0, 2000) };
  } catch (err) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    const output = (execErr.stderr ?? execErr.stdout ?? execErr.message ?? '').slice(0, 2000);
    return { success: false, output };
  }
}

/** 검증 루프 실행 */
export function runVerifyLoop(options: VerifyLoopOptions): LoopResult {
  const {
    cwd,
    checkConstraints = true,
    checkTypes = true,
  } = options;

  const detected = detectCommands(cwd);
  const buildCmd = options.buildCommand ?? detected.build;
  const testCmd = options.testCommand ?? detected.test;
  const typeCheckCmd = detected.typeCheck;

  const steps: LoopStep[] = [];
  const suggestions: string[] = [];

  // Step 1: 타입 체크
  if (checkTypes && typeCheckCmd) {
    const step: LoopStep = { name: 'type-check', status: 'running', startedAt: new Date().toISOString() };
    const result = runCommand(typeCheckCmd, cwd);
    step.status = result.success ? 'passed' : 'failed';
    step.message = result.success ? '타입 체크 통과' : `타입 오류:\n${result.output}`;
    step.completedAt = new Date().toISOString();
    steps.push(step);
    if (!result.success) {

      suggestions.push('타입 오류를 먼저 수정하세요.');
    }
  }

  // Step 2: 빌드
  if (buildCmd) {
    const step: LoopStep = { name: 'build', status: 'running', startedAt: new Date().toISOString() };
    const result = runCommand(buildCmd, cwd);
    step.status = result.success ? 'passed' : 'failed';
    step.message = result.success ? '빌드 성공' : `빌드 실패:\n${result.output}`;
    step.completedAt = new Date().toISOString();
    steps.push(step);
    if (!result.success) {

      suggestions.push('빌드 오류를 수정하세요.');
    }
  }

  // Step 3: 테스트
  if (testCmd) {
    const step: LoopStep = { name: 'test', status: 'running', startedAt: new Date().toISOString() };
    const result = runCommand(testCmd, cwd);
    step.status = result.success ? 'passed' : 'failed';
    step.message = result.success ? '테스트 통과' : `테스트 실패:\n${result.output}`;
    step.completedAt = new Date().toISOString();
    steps.push(step);
    if (!result.success) {

      suggestions.push('실패한 테스트를 수정하세요.');
    }
  }

  // Step 4: 아키텍처 제약 검사
  if (checkConstraints && fs.existsSync(constraintConfigPath(cwd))) {
    const step: LoopStep = { name: 'constraints', status: 'running', startedAt: new Date().toISOString() };
    const constraintResult = runConstraintsOnProject(cwd);
    const errors = constraintResult.violations.filter(v => v.severity === 'error');

    if (errors.length > 0) {
      step.status = 'failed';
      step.message = formatViolations(constraintResult.violations);

      suggestions.push(`${errors.length}건의 제약 위반을 수정하세요.`);
    } else if (constraintResult.violations.length > 0) {
      step.status = 'passed'; // warn은 pass 처리
      step.message = `경고 ${constraintResult.violations.length}건 (error 없음)`;
    } else {
      step.status = 'passed';
      step.message = `${constraintResult.checkedFiles}개 파일 제약 통과`;
    }
    step.completedAt = new Date().toISOString();
    steps.push(step);
  }

  const passedSteps = steps.filter(s => s.status === 'passed').length;
  const failedSteps = steps.filter(s => s.status === 'failed').length;

  const status = failedSteps === 0 ? 'passed' : (passedSteps > 0 ? 'partial' : 'failed');
  const summary = `${passedSteps}/${steps.length} 단계 통과` +
    (failedSteps > 0 ? `, ${failedSteps} 실패` : '');

  return {
    loopName: 'verify',
    status,
    steps,
    summary,
    violations: steps.find(s => s.name === 'constraints')
      ? undefined : undefined,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/** 검증 결과를 에이전트용 메시지로 포맷 */
export function formatVerifyResult(result: LoopResult): string {
  const lines: string[] = [];
  const icon = result.status === 'passed' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';

  lines.push(`${icon} Verify Loop: ${result.summary}`);
  lines.push('');

  for (const step of result.steps) {
    const stepIcon = step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : '○';
    lines.push(`  ${stepIcon} ${step.name}: ${step.message ?? step.status}`);
  }

  if (result.suggestions && result.suggestions.length > 0) {
    lines.push('');
    lines.push('권장 조치:');
    for (const s of result.suggestions) {
      lines.push(`  → ${s}`);
    }
  }

  return lines.join('\n');
}
