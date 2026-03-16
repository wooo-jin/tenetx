/**
 * tenetx scan — 프로젝트 스캔 CLI
 *
 * 프로젝트 구조 맵 생성 + 제약 검사 통합.
 * - tenetx scan              → 프로젝트 맵 생성 + .compound/project-map.json 저장
 * - tenetx scan --constraints → 아키텍처 제약 검사
 * - tenetx scan --md          → Markdown 형식 출력
 * - tenetx scan --init-constraints → 기본 constraints.json 생성
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateProjectMap, formatMapAsMarkdown } from '../engine/knowledge/map-generator.js';
import { runConstraintsOnProject, constraintConfigPath, formatViolations, generateDefaultConfig } from '../engine/constraints/constraint-runner.js';
import { projectDir } from './paths.js';

export async function handleScan(args: string[]): Promise<void> {
  const cwd = process.cwd();

  // tenetx scan --init-constraints
  if (args.includes('--init-constraints')) {
    initConstraints(cwd);
    return;
  }

  // tenetx scan --constraints
  if (args.includes('--constraints')) {
    runConstraints(cwd);
    return;
  }

  // 기본: 프로젝트 맵 생성
  console.log('\n  Tenetx — Project Scan\n');
  console.log(`  스캔 대상: ${cwd}\n`);

  const map = generateProjectMap({ cwd });

  // .compound/project-map.json 저장
  const outDir = projectDir(cwd);
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'project-map.json');
  fs.writeFileSync(jsonPath, JSON.stringify(map, null, 2));
  console.log(`  ✓ 맵 저장: ${path.relative(cwd, jsonPath)}`);

  // --md: Markdown 출력
  if (args.includes('--md')) {
    const mdPath = path.join(outDir, 'project-map.md');
    fs.writeFileSync(mdPath, formatMapAsMarkdown(map));
    console.log(`  ✓ Markdown: ${path.relative(cwd, mdPath)}`);
  }

  // 요약 출력
  const { summary } = map;
  console.log('');
  console.log(`  프로젝트: ${summary.name}`);
  console.log(`  파일: ${summary.totalFiles}개, 줄: ${summary.totalLines.toLocaleString()}`);
  if (summary.framework) console.log(`  프레임워크: ${summary.framework}`);
  if (summary.packageManager) console.log(`  패키지 매니저: ${summary.packageManager}`);

  // 언어 분포
  const topLangs = Object.entries(summary.languages)
    .sort((a, b) => b[1] - a[1])
    .filter(([l]) => l !== 'other')
    .slice(0, 5);
  if (topLangs.length > 0) {
    console.log(`  언어: ${topLangs.map(([l, n]) => `${l}(${n}줄)`).join(', ')}`);
  }

  console.log(`  진입점: ${map.entryPoints.length > 0 ? map.entryPoints.join(', ') : '(없음)'}`);
  console.log(`  의존성: ${map.dependencies.filter(d => d.type === 'production').length} prod, ${map.dependencies.filter(d => d.type === 'development').length} dev`);

  // 제약 설정 존재 시 자동 검사
  if (fs.existsSync(constraintConfigPath(cwd))) {
    console.log('');
    runConstraints(cwd);
  }

  console.log('');
}

function initConstraints(cwd: string): void {
  const configPath = constraintConfigPath(cwd);
  if (fs.existsSync(configPath)) {
    console.log(`  이미 존재합니다: ${path.relative(cwd, configPath)}`);
    return;
  }

  const config = generateDefaultConfig();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  ✓ 기본 제약 생성: ${path.relative(cwd, configPath)}`);
  console.log(`  ${config.rules.length}개 규칙 포함 (편집하여 커스터마이즈 가능)`);
}

function runConstraints(cwd: string): void {
  const configPath = constraintConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    console.log('  제약 설정이 없습니다. `tenetx scan --init-constraints`로 생성하세요.');
    return;
  }

  console.log('  제약 검사 실행...');
  const result = runConstraintsOnProject(cwd);

  console.log(`  검사: ${result.checkedFiles}개 파일, 통과: ${result.passedFiles}개`);

  if (result.violations.length > 0) {
    console.log('');
    console.log(formatViolations(result.violations));
  } else {
    console.log('  ✓ 모든 제약을 통과했습니다.');
  }
}
