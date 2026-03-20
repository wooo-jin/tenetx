import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-solution-matcher-full',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  matchSolutions,
} from '../src/engine/solution-matcher.js';
import type { ScopeInfo } from '../src/core/types.js';

const ME_SOLUTIONS = path.join(TEST_HOME, '.compound', 'me', 'solutions');

describe('matchSolutions', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  const defaultScope: ScopeInfo = {
    me: { philosophyPath: '', solutionCount: 0, ruleCount: 0 },
    project: { path: '/tmp/nonexistent', solutionCount: 0 },
    summary: 'personal',
  };

  it('솔루션이 없으면 빈 배열', () => {
    const matches = matchSolutions('test prompt', defaultScope, '/tmp/nonexistent');
    expect(matches).toEqual([]);
  });

  it('Me 솔루션을 매칭한다', () => {
    fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
    fs.writeFileSync(
      path.join(ME_SOLUTIONS, 'wasm-binary-patch.md'),
      '# WASM 바이너리 패치 전 오프셋 검증\n\nWASM 바이너리 패치 시 오프셋 구조를 먼저 확인하는 방법.',
    );

    const matches = matchSolutions('wasm binary 패치', defaultScope, '/tmp/nonexistent');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].scope).toBe('me');
  });

  it('프로젝트 솔루션을 매칭한다', () => {
    const projectDir = path.join(TEST_HOME, 'project');
    const projectSolutions = path.join(projectDir, '.compound', 'solutions');
    fs.mkdirSync(projectSolutions, { recursive: true });
    fs.writeFileSync(
      path.join(projectSolutions, 'api-auth-pattern.md'),
      '# API 인증 패턴\n\nAPI 인증에 JWT를 사용하는 방법.',
    );

    const matches = matchSolutions('API 인증', defaultScope, projectDir);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].scope).toBe('project');
  });

  it('관련 없는 프롬프트는 빈 배열', () => {
    fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
    fs.writeFileSync(
      path.join(ME_SOLUTIONS, 'docker-setup.md'),
      '# Docker 설정 가이드\n\nDocker 컨테이너 설정 방법.',
    );

    const matches = matchSolutions('UI 디자인 변경', defaultScope, '/tmp/nonexistent');
    expect(matches).toEqual([]);
  });

  it('팀 솔루션도 매칭한다', () => {
    const teamPackDir = path.join(TEST_HOME, '.compound', 'packs', 'my-team', 'solutions');
    fs.mkdirSync(teamPackDir, { recursive: true });
    fs.writeFileSync(
      path.join(teamPackDir, 'deploy-checklist.md'),
      '# 배포 체크리스트\n\n배포 전 확인 사항.',
    );

    const teamScope: ScopeInfo = {
      me: { philosophyPath: '', solutionCount: 0, ruleCount: 0 },
      project: { path: '/tmp/nonexistent', solutionCount: 0 },
      summary: 'team mode',
      team: { name: 'my-team', version: '1.0.0', packPath: '', solutionCount: 0, ruleCount: 0, syncStatus: 'unknown' },
    };

    const matches = matchSolutions('배포 체크리스트', teamScope, '/tmp/nonexistent');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('최대 5개까지만 반환한다', () => {
    fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(
        path.join(ME_SOLUTIONS, `testing-pattern-${i}.md`),
        `# Testing Pattern ${i}\n\nTesting related content about testing strategies.`,
      );
    }

    const matches = matchSolutions('testing pattern strategy', defaultScope, '/tmp/nonexistent');
    expect(matches.length).toBeLessThanOrEqual(5);
  });
});
