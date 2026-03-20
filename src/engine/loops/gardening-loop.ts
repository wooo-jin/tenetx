/**
 * Gardening Loop — 지식 유지보수 루프
 *
 * 프로젝트 지식 맵의 신선도를 검사하고 유지보수 제안을 생성합니다.
 * - project-map.json 신선도 체크 (마지막 생성 이후 변경 감지)
 * - 고아 파일 탐지 (import 그래프에서 고립된 파일)
 * - constraints.json과 실제 구조 정합성 검사
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectDir } from '../../core/paths.js';
import type { LoopResult, LoopStep, GardeningLoopOptions } from './types.js';
import type { ProjectMap } from '../knowledge/types.js';

/** project-map.json 신선도 검사 */
export function checkMapFreshness(cwd: string): {
  exists: boolean;
  ageHours: number;
  stale: boolean;
  changedFilesSince: number;
} {
  const mapPath = path.join(projectDir(cwd), 'project-map.json');

  if (!fs.existsSync(mapPath)) {
    return { exists: false, ageHours: Infinity, stale: true, changedFilesSince: 0 };
  }

  try {
    const map: ProjectMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    const generatedAt = new Date(map.generatedAt);
    const ageHours = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60);

    // git으로 마지막 맵 생성 이후 변경 파일 수 확인
    let changedFilesSince = 0;
    try {
      const { execFileSync } = require('node:child_process');
      const since = generatedAt.toISOString();
      const output = (execFileSync('git', [
        'log', `--since=${since}`, '--name-only', '--pretty=format:',
      ], { cwd, encoding: 'utf-8', timeout: 5000 }) as string).trim();
      const uniqueFiles = new Set(output.split('\n').filter(Boolean));
      changedFilesSince = uniqueFiles.size;
    } catch { /* git 없을 수 있음 */ }

    // 24시간 이상 또는 10개 이상 변경 시 stale
    const stale = ageHours > 24 || changedFilesSince > 10;

    return { exists: true, ageHours, stale, changedFilesSince };
  } catch {
    return { exists: true, ageHours: Infinity, stale: true, changedFilesSince: 0 };
  }
}

/** 고아 파일 탐지 — import 그래프에서 다른 파일에 의해 참조되지 않는 파일 */
export function detectOrphanFiles(cwd: string): string[] {
  const mapPath = path.join(projectDir(cwd), 'project-map.json');
  if (!fs.existsSync(mapPath)) return [];

  try {
    const map: ProjectMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));

    // 모든 import 타겟 수집
    const importedPaths = new Set<string>();
    for (const file of map.files) {
      for (const imp of file.imports) {
        if (imp.startsWith('.')) {
          // 상대 경로를 절대로 변환
          const dir = path.dirname(file.path);
          const resolved = path.normalize(path.join(dir, imp))
            .replace(/\.(js|ts|tsx|jsx)$/, '');
          importedPaths.add(resolved);
          // index 파일 변형도 추가
          importedPaths.add(path.join(resolved, 'index'));
        }
      }
    }

    // 진입점은 고아가 아님
    const entrySet = new Set(map.entryPoints.map(e => e.replace(/\.(js|ts|tsx|jsx)$/, '')));

    // 소스 파일 중 참조되지 않은 파일 탐지
    const orphans: string[] = [];
    const sourceExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];

    for (const file of map.files) {
      const ext = path.extname(file.path);
      if (!sourceExts.includes(ext)) continue;

      // 테스트 파일, 설정 파일 제외
      const basename = path.basename(file.path);
      if (basename.includes('.test.') || basename.includes('.spec.')) continue;
      if (basename.startsWith('.')) continue;

      const normalized = file.path.replace(/\.(js|ts|tsx|jsx)$/, '');

      // 진입점이면 건너뛰기
      if (entrySet.has(normalized)) continue;
      // index 파일은 건너뛰기
      if (basename.replace(/\.\w+$/, '') === 'index') continue;

      // 다른 파일에 의해 import되는지 확인
      const isImported = importedPaths.has(normalized);
      if (!isImported) {
        orphans.push(file.path);
      }
    }

    return orphans;
  } catch {
    return [];
  }
}

/** 가드닝 루프 실행 */
export function runGardeningLoop(options: GardeningLoopOptions): LoopResult {
  const {
    cwd,
    checkMapFreshness: doCheckFreshness = true,
    detectOrphans = true,
  } = options;

  const steps: LoopStep[] = [];
  const suggestions: string[] = [];
  let hasIssues = false;

  // Step 1: 맵 신선도 검사
  if (doCheckFreshness) {
    const freshness = checkMapFreshness(cwd);
    const step: LoopStep = {
      name: 'map-freshness',
      status: freshness.exists ? (freshness.stale ? 'failed' : 'passed') : 'failed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    if (!freshness.exists) {
      step.message = '프로젝트 맵이 없습니다. `tenetx scan`을 실행하세요.';
      suggestions.push('`tenetx scan`으로 프로젝트 맵을 생성하세요.');
      hasIssues = true;
    } else if (freshness.stale) {
      const hours = Math.round(freshness.ageHours);
      step.message = `맵이 오래되었습니다 (${hours}시간 경과, ${freshness.changedFilesSince}파일 변경)`;
      suggestions.push('`tenetx scan`으로 프로젝트 맵을 갱신하세요.');
      hasIssues = true;
    } else {
      const hours = Math.round(freshness.ageHours);
      step.message = `맵 최신 (${hours}시간 전 생성)`;
    }

    steps.push(step);
  }

  // Step 2: 고아 파일 탐지
  if (detectOrphans) {
    const orphans = detectOrphanFiles(cwd);
    const step: LoopStep = {
      name: 'orphan-detection',
      status: orphans.length > 0 ? 'failed' : 'passed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    if (orphans.length > 0) {
      step.message = `${orphans.length}개 고아 파일 발견: ${orphans.slice(0, 5).join(', ')}`;
      suggestions.push(`고아 파일 검토: ${orphans.slice(0, 3).join(', ')}${orphans.length > 3 ? ` 외 ${orphans.length - 3}개` : ''}`);
      hasIssues = true;
    } else {
      step.message = '고아 파일 없음';
    }

    steps.push(step);
  }

  // Step 3: constraints.json 존재 여부
  const constraintsPath = path.join(projectDir(cwd), 'constraints.json');
  if (!fs.existsSync(constraintsPath)) {
    const step: LoopStep = {
      name: 'constraints-config',
      status: 'skipped',
      message: '제약 설정 없음 — `tenetx scan --init-constraints`로 생성 가능',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    steps.push(step);
    suggestions.push('`tenetx scan --init-constraints`로 제약 규칙을 설정하세요.');
  }

  const passedSteps = steps.filter(s => s.status === 'passed').length;
  const status = hasIssues ? 'partial' : 'passed';

  return {
    loopName: 'gardening',
    status,
    steps,
    summary: `${passedSteps}/${steps.length} 항목 양호`,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/** 가드닝 결과를 메시지로 포맷 */
export function formatGardeningResult(result: LoopResult): string {
  const lines: string[] = [];
  const icon = result.status === 'passed' ? '🌱' : '🪴';

  lines.push(`${icon} Gardening Loop: ${result.summary}`);
  lines.push('');

  for (const step of result.steps) {
    const stepIcon = step.status === 'passed' ? '✓' :
      step.status === 'failed' ? '✗' : '○';
    lines.push(`  ${stepIcon} ${step.name}: ${step.message ?? step.status}`);
  }

  if (result.suggestions && result.suggestions.length > 0) {
    lines.push('');
    lines.push('유지보수 제안:');
    for (const s of result.suggestions) {
      lines.push(`  → ${s}`);
    }
  }

  return lines.join('\n');
}
