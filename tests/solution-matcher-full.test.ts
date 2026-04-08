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
import { serializeSolutionV3, DEFAULT_EVIDENCE } from '../src/engine/solution-format.js';
import type { SolutionV3 } from '../src/engine/solution-format.js';
import { resetIndexCache } from '../src/engine/solution-index.js';
import type { ScopeInfo } from '../src/core/types.js';

const ME_SOLUTIONS = path.join(TEST_HOME, '.tenetx', 'me', 'solutions');

/** Helper to create a v3 solution file */
function writeSolution(dir: string, name: string, tags: string[], content = 'test content') {
  fs.mkdirSync(dir, { recursive: true });
  const solution: SolutionV3 = {
    frontmatter: {
      name, version: 1, status: 'candidate', confidence: 0.5, type: 'pattern',
      scope: 'me', tags, identifiers: [], evidence: { ...DEFAULT_EVIDENCE },
      created: '2026-03-24', updated: '2026-03-24', supersedes: null, extractedBy: 'manual',
    },
    context: 'test context', content,
  };
  fs.writeFileSync(path.join(dir, `${name}.md`), serializeSolutionV3(solution));
}

describe('matchSolutions', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    resetIndexCache();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    resetIndexCache();
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
    writeSolution(ME_SOLUTIONS, 'wasm-binary-patch', ['wasm', 'binary', '패치', '오프셋', '검증']);
    const matches = matchSolutions('wasm binary 패치 검증', defaultScope, '/tmp/nonexistent');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].scope).toBe('me');
  });

  it('프로젝트 솔루션을 매칭한다', () => {
    const projectDir = path.join(TEST_HOME, 'project');
    const projectSolutions = path.join(projectDir, '.compound', 'solutions');
    writeSolution(projectSolutions, 'api-auth-pattern', ['api', '인증', 'jwt', '패턴']);
    const matches = matchSolutions('api 인증 jwt 사용법', defaultScope, projectDir);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].scope).toBe('project');
  });

  it('관련 없는 프롬프트는 빈 배열', () => {
    writeSolution(ME_SOLUTIONS, 'docker-setup', ['docker', '컨테이너', '설정']);
    const matches = matchSolutions('UI 디자인 변경', defaultScope, '/tmp/nonexistent');
    expect(matches).toEqual([]);
  });

  it('팀 솔루션도 매칭한다', () => {
    const teamPackDir = path.join(TEST_HOME, '.tenetx', 'packs', 'my-team', 'solutions');
    writeSolution(teamPackDir, 'deploy-checklist', ['배포', '체크리스트', '확인', '사항']);

    const teamScope: ScopeInfo = {
      me: { philosophyPath: '', solutionCount: 0, ruleCount: 0 },
      project: { path: '/tmp/nonexistent', solutionCount: 0 },
      summary: 'team mode',
      team: { name: 'my-team', version: '1.0.0', packPath: '', solutionCount: 0, ruleCount: 0, syncStatus: 'unknown' },
    };

    const matches = matchSolutions('배포 체크리스트 확인', teamScope, '/tmp/nonexistent');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('최대 5개까지만 반환한다', () => {
    for (let i = 0; i < 10; i++) {
      writeSolution(ME_SOLUTIONS, `testing-pattern-${i}`, ['testing', 'pattern', 'strategy', `variant${i}`]);
    }

    const matches = matchSolutions('testing pattern strategy', defaultScope, '/tmp/nonexistent');
    expect(matches.length).toBeLessThanOrEqual(5);
  });

  // Scope collision regression: two scopes can legitimately have solutions
  // with the same name (user overrides a team/project pattern in their me/
  // directory). A Round 2 refactor briefly introduced a `Map<name, sol>`
  // last-wins lookup that swapped scope metadata when the same name appeared
  // in me/ and project/. The fix makes rankCandidates carry source refs.
  // This test locks in the fix: both entries must appear AND each must
  // report its own scope correctly.
  it('same name in me and project both appear with correct scope metadata', () => {
    const projectDir = path.join(TEST_HOME, 'project');
    const projectSolutions = path.join(projectDir, '.compound', 'solutions');

    writeSolution(ME_SOLUTIONS, 'shared-name-pattern', ['unique-me-tag', 'pattern']);
    writeSolution(projectSolutions, 'shared-name-pattern', ['unique-project-tag', 'pattern']);

    // Query with BOTH unique tags so both entries rank.
    const matches = matchSolutions(
      'unique-me-tag unique-project-tag pattern',
      defaultScope,
      projectDir,
    );

    const sameNameEntries = matches.filter(m => m.name === 'shared-name-pattern');
    expect(sameNameEntries.length).toBe(2);

    const scopes = sameNameEntries.map(m => m.scope).sort();
    expect(scopes).toEqual(['me', 'project']);

    // Each entry must hydrate with ITS OWN tags — not a swapped Map lookup.
    const meEntry = sameNameEntries.find(m => m.scope === 'me');
    const projectEntry = sameNameEntries.find(m => m.scope === 'project');
    expect(meEntry?.tags).toContain('unique-me-tag');
    expect(meEntry?.tags).not.toContain('unique-project-tag');
    expect(projectEntry?.tags).toContain('unique-project-tag');
    expect(projectEntry?.tags).not.toContain('unique-me-tag');

    // And each entry's path must point at its own scope directory.
    expect(meEntry?.path).toContain(ME_SOLUTIONS);
    expect(projectEntry?.path).toContain(projectSolutions);
  });
});
