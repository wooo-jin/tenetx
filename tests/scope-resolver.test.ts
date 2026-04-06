import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// 임시 디렉토리 경로들 (mock에서 사용)
let TMP: string;
let ME_DIR: string;
let ME_SOLUTIONS: string;
let ME_RULES: string;
let PACKS_DIR: string;
let CWD: string;

vi.mock('../src/core/paths.js', async () => {
  // 매 테스트마다 갱신된 TMP 값을 참조하기 위해 getter 사용
  return {
    get ME_DIR() { return ME_DIR; },
    get ME_SOLUTIONS() { return ME_SOLUTIONS; },
    get ME_RULES() { return ME_RULES; },
    get PACKS_DIR() { return PACKS_DIR; },
    packLinkPath: (cwd: string) => path.join(cwd, '.compound', 'pack.link'),
    projectDir: (cwd: string) => path.join(cwd, '.compound'),
  };
});

beforeEach(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-scope-test-'));
  ME_DIR = path.join(TMP, 'me');
  ME_SOLUTIONS = path.join(ME_DIR, 'solutions');
  ME_RULES = path.join(ME_DIR, 'rules');
  PACKS_DIR = path.join(TMP, 'packs');
  CWD = path.join(TMP, 'project');

  fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
  fs.mkdirSync(ME_RULES, { recursive: true });
  fs.mkdirSync(PACKS_DIR, { recursive: true });
  fs.mkdirSync(path.join(CWD, '.compound'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('resolveScope', () => {
  it('빈 디렉토리에서 me.solutionCount가 0이다', async () => {
    const { resolveScope } = await import('../src/core/scope-resolver.js');
    const result = resolveScope(CWD);
    expect(result.me.solutionCount).toBe(0);
  });

  it('me/solutions에 .md 파일 추가 시 solutionCount가 증가한다', async () => {
    fs.writeFileSync(path.join(ME_SOLUTIONS, 'sol1.md'), '# sol1');
    fs.writeFileSync(path.join(ME_SOLUTIONS, 'sol2.md'), '# sol2');

    const { resolveScope } = await import('../src/core/scope-resolver.js');
    const result = resolveScope(CWD);
    expect(result.me.solutionCount).toBe(2);
  });

  it('pack.link 없으면 team이 undefined이다', async () => {
    const { resolveScope } = await import('../src/core/scope-resolver.js');
    const result = resolveScope(CWD);
    expect(result.team).toBeUndefined();
  });

  it('summary 문자열이 "Me(0)" 형식이다', async () => {
    const { resolveScope } = await import('../src/core/scope-resolver.js');
    const result = resolveScope(CWD);
    expect(result.summary).toMatch(/^Me\(\d+\)/);
  });

  it('project solutions 카운트가 올바르게 반영된다', async () => {
    const projSolutionsDir = path.join(CWD, '.compound', 'solutions');
    fs.mkdirSync(projSolutionsDir, { recursive: true });
    fs.writeFileSync(path.join(projSolutionsDir, 'p1.md'), '# p1');
    fs.writeFileSync(path.join(projSolutionsDir, 'p2.md'), '# p2');
    fs.writeFileSync(path.join(projSolutionsDir, 'p3.md'), '# p3');

    const { resolveScope } = await import('../src/core/scope-resolver.js');
    const result = resolveScope(CWD);
    expect(result.project.solutionCount).toBe(3);
  });

  it('v1: team scope가 제거되어 항상 undefined이다', async () => {
    const { resolveScope } = await import('../src/core/scope-resolver.js');
    const result = resolveScope(CWD);
    expect(result.team).toBeUndefined();
  });

  it('project solutions가 0이면 summary에 Project가 포함되지 않는다', async () => {
    const { resolveScope } = await import('../src/core/scope-resolver.js');
    const result = resolveScope(CWD);
    expect(result.summary).not.toContain('Project');
  });
});
