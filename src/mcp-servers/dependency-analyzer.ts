/**
 * Dependency Analyzer MCP Server — 의존성 분석
 *
 * 프로젝트의 패키지 매니저와 의존성 현황을 분석.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServerDefinition, DependencyReport } from './types.js';

export const DEPENDENCY_ANALYZER_DEFINITION: McpServerDefinition = {
  name: 'dependency-analyzer',
  description: 'Analyze project dependencies and detect package manager',
  command: 'node',
  args: ['dependency-analyzer-server.js'],
  builtin: true,
};

/** 프로젝트 의존성 분석 */
export function analyzeDependencies(cwd: string): DependencyReport {
  // npm / yarn / pnpm (package.json 기반)
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = Object.keys(pkg.dependencies ?? {}).length;
      const devDeps = Object.keys(pkg.devDependencies ?? {}).length;

      // 패키지 매니저 감지: lockfile 우선
      let packageManager: DependencyReport['packageManager'] = 'npm';
      const lockfilePresent =
        fs.existsSync(path.join(cwd, 'package-lock.json')) ||
        fs.existsSync(path.join(cwd, 'yarn.lock')) ||
        fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'));

      if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
        packageManager = 'pnpm';
      } else if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
        packageManager = 'yarn';
      }

      return {
        packageManager,
        totalDeps: deps + devDeps,
        devDeps,
        outdatedCheck: true,
        lockfilePresent,
      };
    } catch { /* 파싱 실패 시 계속 */ }
  }

  // pip (requirements.txt / pyproject.toml)
  const reqPath = path.join(cwd, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      const content = fs.readFileSync(reqPath, 'utf-8');
      const deps = content
        .split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#'))
        .length;
      return {
        packageManager: 'pip',
        totalDeps: deps,
        devDeps: 0,
        outdatedCheck: true,
        lockfilePresent: fs.existsSync(path.join(cwd, 'requirements-lock.txt')),
      };
    } catch { /* requirements.txt read failure — pip dep count skipped, falls through to other package manager detection */ }
  }

  // cargo (Cargo.toml)
  const cargoPath = path.join(cwd, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    try {
      const content = fs.readFileSync(cargoPath, 'utf-8');
      // [dependencies] 섹션 파싱 (간단 카운트)
      const depSection = content.match(/\[dependencies\]([\s\S]*?)(\[|$)/);
      const devDepSection = content.match(/\[dev-dependencies\]([\s\S]*?)(\[|$)/);
      const countLines = (s: string) =>
        s.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('=')).length;
      const deps = depSection ? countLines(depSection[1]) : 0;
      const devDeps = devDepSection ? countLines(devDepSection[1]) : 0;
      return {
        packageManager: 'cargo',
        totalDeps: deps + devDeps,
        devDeps,
        outdatedCheck: true,
        lockfilePresent: fs.existsSync(path.join(cwd, 'Cargo.lock')),
      };
    } catch { /* Cargo.toml read failure — cargo dep count skipped, falls through to other package manager detection */ }
  }

  // go (go.mod)
  const goModPath = path.join(cwd, 'go.mod');
  if (fs.existsSync(goModPath)) {
    try {
      const content = fs.readFileSync(goModPath, 'utf-8');
      // require (...) 블록 내 항목 카운트
      const deps = (content.match(/^\s+\S+\s+v\S+/gm) ?? []).length;
      return {
        packageManager: 'go',
        totalDeps: deps,
        devDeps: 0,
        outdatedCheck: true,
        lockfilePresent: fs.existsSync(path.join(cwd, 'go.sum')),
      };
    } catch { /* go.mod read failure — go dep count skipped, returns null package manager */ }
  }

  return {
    packageManager: null,
    totalDeps: 0,
    devDeps: 0,
    outdatedCheck: false,
    lockfilePresent: false,
  };
}
