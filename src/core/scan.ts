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
  console.log(`  Target: ${cwd}\n`);

  const map = generateProjectMap({ cwd });

  // .compound/project-map.json 저장
  const outDir = projectDir(cwd);
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'project-map.json');
  fs.writeFileSync(jsonPath, JSON.stringify(map, null, 2));
  console.log(`  ✓ Map saved: ${path.relative(cwd, jsonPath)}`);

  // --md: Markdown 출력
  if (args.includes('--md')) {
    const mdPath = path.join(outDir, 'project-map.md');
    fs.writeFileSync(mdPath, formatMapAsMarkdown(map));
    console.log(`  ✓ Markdown: ${path.relative(cwd, mdPath)}`);
  }

  // 요약 출력
  const { summary } = map;
  console.log('');
  console.log(`  Project: ${summary.name}`);
  console.log(`  Files: ${summary.totalFiles}, Lines: ${summary.totalLines.toLocaleString()}`);
  if (summary.framework) console.log(`  Framework: ${summary.framework}`);
  if (summary.packageManager) console.log(`  Package manager: ${summary.packageManager}`);

  // 언어 분포
  const topLangs = Object.entries(summary.languages)
    .sort((a, b) => b[1] - a[1])
    .filter(([l]) => l !== 'other')
    .slice(0, 5);
  if (topLangs.length > 0) {
    console.log(`  Languages: ${topLangs.map(([l, n]) => `${l}(${n} lines)`).join(', ')}`);
  }

  console.log(`  Entry points: ${map.entryPoints.length > 0 ? map.entryPoints.join(', ') : '(none)'}`);
  console.log(`  Dependencies: ${map.dependencies.filter(d => d.type === 'production').length} prod, ${map.dependencies.filter(d => d.type === 'development').length} dev`);

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
    console.log(`  Already exists: ${path.relative(cwd, configPath)}`);
    return;
  }

  const config = generateDefaultConfig();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  ✓ Default constraints created: ${path.relative(cwd, configPath)}`);
  console.log(`  ${config.rules.length} rules included (edit to customize)`);
}

function runConstraints(cwd: string): void {
  const configPath = constraintConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    console.log('  No constraint config found. Create with `tenetx scan --init-constraints`.');
    return;
  }

  console.log('  Running constraint checks...');
  const result = runConstraintsOnProject(cwd);

  console.log(`  Checked: ${result.checkedFiles} files, Passed: ${result.passedFiles}`);

  if (result.violations.length > 0) {
    console.log('');
    console.log(formatViolations(result.violations));
  } else {
    console.log('  ✓ All constraints passed.');
  }
}
