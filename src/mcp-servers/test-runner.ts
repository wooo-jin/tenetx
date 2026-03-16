/**
 * Test Runner MCP Server — 프로젝트 테스트 실행
 *
 * 프로젝트의 테스트 프레임워크를 감지하고 실행 명령을 제공.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServerDefinition } from './types.js';

export const TEST_RUNNER_DEFINITION: McpServerDefinition = {
  name: 'test-runner',
  description: '프로젝트 테스트 프레임워크 감지 및 실행',
  command: 'node',
  args: ['test-runner-server.js'],
  builtin: true,
};

export interface TestFrameworkInfo {
  framework: string;
  command: string;
}

/** 프로젝트의 테스트 프레임워크 감지 */
export function detectTestFramework(cwd: string): TestFrameworkInfo | null {
  // vitest
  if (
    fs.existsSync(path.join(cwd, 'vitest.config.ts')) ||
    fs.existsSync(path.join(cwd, 'vitest.config.js')) ||
    fs.existsSync(path.join(cwd, 'vitest.config.mts'))
  ) {
    return { framework: 'vitest', command: 'npx vitest run' };
  }

  // jest
  if (
    fs.existsSync(path.join(cwd, 'jest.config.ts')) ||
    fs.existsSync(path.join(cwd, 'jest.config.js')) ||
    fs.existsSync(path.join(cwd, 'jest.config.mjs'))
  ) {
    return { framework: 'jest', command: 'npx jest' };
  }

  // mocha
  if (fs.existsSync(path.join(cwd, '.mocharc.yml')) || fs.existsSync(path.join(cwd, '.mocharc.json'))) {
    return { framework: 'mocha', command: 'npx mocha' };
  }

  // pytest
  if (
    fs.existsSync(path.join(cwd, 'pytest.ini')) ||
    fs.existsSync(path.join(cwd, 'pyproject.toml'))
  ) {
    // pyproject.toml이 있어도 Python 프로젝트가 아닐 수 있음
    if (fs.existsSync(path.join(cwd, 'pytest.ini'))) {
      return { framework: 'pytest', command: 'pytest' };
    }
    try {
      const content = fs.readFileSync(path.join(cwd, 'pyproject.toml'), 'utf-8');
      if (content.includes('[tool.pytest') || content.includes('pytest')) {
        return { framework: 'pytest', command: 'pytest' };
      }
    } catch { /* ignore */ }
  }

  // go test
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    return { framework: 'go test', command: 'go test ./...' };
  }

  // cargo test
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    return { framework: 'cargo test', command: 'cargo test' };
  }

  // package.json 기반 추론
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps.vitest) return { framework: 'vitest', command: 'npx vitest run' };
      if (allDeps.jest) return { framework: 'jest', command: 'npx jest' };
      if (allDeps.mocha) return { framework: 'mocha', command: 'npx mocha' };

      // scripts.test 필드
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        return { framework: 'npm-script', command: 'npm test' };
      }
    } catch { /* ignore */ }
  }

  return null;
}
