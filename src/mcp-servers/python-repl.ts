/**
 * Python REPL MCP Server — Python 환경 감지 및 실행
 *
 * 프로젝트의 Python 환경(venv, 패키지)을 감지하고 REPL 접근을 제공.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { McpServerDefinition } from './types.js';

export const PYTHON_REPL_DEFINITION: McpServerDefinition = {
  name: 'python-repl',
  description: 'Python 환경 감지 및 REPL 실행',
  command: 'node',
  args: ['python-repl-server.js'],
  builtin: true,
};

export interface PythonEnvironment {
  python: string;
  hasVenv: boolean;
  packages: string[];
}

/** Python 프로젝트 환경 감지 */
export function detectPythonEnvironment(cwd: string): PythonEnvironment | null {
  const hasPyProject = fs.existsSync(path.join(cwd, 'pyproject.toml'));
  const hasRequirements = fs.existsSync(path.join(cwd, 'requirements.txt'));
  const hasPipfile = fs.existsSync(path.join(cwd, 'Pipfile'));
  const hasVenv =
    fs.existsSync(path.join(cwd, 'venv')) || fs.existsSync(path.join(cwd, '.venv'));

  if (!hasPyProject && !hasRequirements && !hasPipfile && !hasVenv) {
    return null;
  }

  // python 바이너리 탐지
  let pythonBin: string | null = null;
  for (const bin of ['python3', 'python']) {
    try {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(checker, [bin], { stdio: 'ignore' });
      pythonBin = bin;
      break;
    } catch { /* 없으면 다음 시도 */ }
  }

  if (!pythonBin) {
    return null;
  }

  // requirements.txt에서 상위 10개 패키지 이름 추출
  const packages: string[] = [];
  if (hasRequirements) {
    try {
      const content = fs.readFileSync(path.join(cwd, 'requirements.txt'), 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        // 패키지 이름만 추출 (버전 지정자 제거)
        const name = trimmed.split(/[>=<!;\s]/)[0].trim();
        if (name) {
          packages.push(name);
          if (packages.length >= 10) break;
        }
      }
    } catch { /* ignore */ }
  }

  return { python: pythonBin, hasVenv, packages };
}

/** Python 프로젝트 여부 판단 */
export function isPythonProject(cwd: string): boolean {
  return detectPythonEnvironment(cwd) !== null;
}
