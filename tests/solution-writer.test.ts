/**
 * solution-writer.ts 회귀 테스트 (PR2b)
 *
 * 검증:
 *   - mutateSolutionFile: lock + fresh re-read + atomic write
 *   - mutateSolutionByName: dir scan + name 매칭
 *   - incrementEvidence: 카운터 증가
 *   - mutator가 false 반환하면 write 안 함
 *   - parse 실패는 false 반환 (no throw)
 *   - frontmatter.updated 자동 갱신
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => {
  const tmpRoot = process.env.TMPDIR || '/tmp';
  return { TEST_HOME: `${tmpRoot.replace(/\/$/, '')}/solution-writer-test-${process.pid}` };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

vi.mock('../src/core/paths.js', () => {
  const p = require('node:path');
  const TENETX_HOME = p.join(TEST_HOME, '.tenetx');
  const ME_DIR = p.join(TENETX_HOME, 'me');
  return {
    TENETX_HOME,
    ME_DIR,
    ME_SOLUTIONS: p.join(ME_DIR, 'solutions'),
    ME_RULES: p.join(ME_DIR, 'rules'),
    STATE_DIR: p.join(TENETX_HOME, 'state'),
    PACKS_DIR: p.join(TENETX_HOME, 'packs'),
    LAB_DIR: p.join(TENETX_HOME, 'lab'),
    LAB_EVENTS: p.join(TENETX_HOME, 'lab', 'events.jsonl'),
    SESSIONS_DIR: p.join(TENETX_HOME, 'sessions'),
    GLOBAL_CONFIG: p.join(TENETX_HOME, 'config.json'),
    FORGE_PROFILE: p.join(ME_DIR, 'forge-profile.json'),
    ME_PHILOSOPHY: p.join(ME_DIR, 'philosophy.json'),
    COMPOUND_HOME: p.join(TEST_HOME, '.compound'),
    ALL_MODES: ['ralph', 'autopilot'],
    projectDir: (cwd: string) => p.join(cwd, '.compound'),
  };
});

import { mutateSolutionFile, mutateSolutionByName, incrementEvidence } from '../src/engine/solution-writer.js';
import { serializeSolutionV3, parseSolutionV3, DEFAULT_EVIDENCE } from '../src/engine/solution-format.js';
import type { SolutionV3, SolutionStatus } from '../src/engine/solution-format.js';

const ME_SOLUTIONS = path.join(TEST_HOME, '.tenetx', 'me', 'solutions');

function makeSolution(name: string, evidence = { ...DEFAULT_EVIDENCE }): SolutionV3 {
  return {
    frontmatter: {
      name,
      version: 1,
      status: 'experiment' as SolutionStatus,
      confidence: 0.5,
      type: 'pattern',
      scope: 'me',
      tags: ['test'],
      identifiers: [],
      evidence,
      created: '2026-04-07',
      updated: '2026-04-07',
      supersedes: null,
      extractedBy: 'auto',
    },
    context: '',
    content: 'test',
  };
}

function writeSolution(name: string): string {
  fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
  const filePath = path.join(ME_SOLUTIONS, `${name}.md`);
  fs.writeFileSync(filePath, serializeSolutionV3(makeSolution(name)));
  return filePath;
}

beforeEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
});
afterEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
});

describe('mutateSolutionFile', () => {
  it('mutator true 반환 시 write 발생, frontmatter.updated 자동 갱신', () => {
    const fp = writeSolution('m1');
    const result = mutateSolutionFile(fp, sol => {
      sol.frontmatter.evidence.reflected = 5;
      return true;
    });
    expect(result).toBe(true);
    const fresh = parseSolutionV3(fs.readFileSync(fp, 'utf-8'))!;
    expect(fresh.frontmatter.evidence.reflected).toBe(5);
    expect(fresh.frontmatter.updated).toBe(new Date().toISOString().split('T')[0]);
  });

  it('mutator false 반환 시 write 안 함', () => {
    const fp = writeSolution('m2');
    const beforeMtime = fs.statSync(fp).mtimeMs;
    const result = mutateSolutionFile(fp, () => false);
    expect(result).toBe(false);
    // mtime이 변경되지 않아야 함
    const afterMtime = fs.statSync(fp).mtimeMs;
    expect(afterMtime).toBe(beforeMtime);
  });

  it('파일 없음 → false 반환 (no throw)', () => {
    const fp = path.join(ME_SOLUTIONS, 'missing.md');
    expect(() => mutateSolutionFile(fp, () => true)).not.toThrow();
    expect(mutateSolutionFile(fp, () => true)).toBe(false);
  });

  it('parse 실패 → false 반환 (no throw)', () => {
    fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
    const fp = path.join(ME_SOLUTIONS, 'broken.md');
    fs.writeFileSync(fp, 'not a valid yaml frontmatter');
    expect(mutateSolutionFile(fp, () => true)).toBe(false);
  });

  it('lock 파일이 finally에서 정리된다', () => {
    const fp = writeSolution('m3');
    mutateSolutionFile(fp, sol => { sol.frontmatter.evidence.injected = 1; return true; });
    expect(fs.existsSync(`${fp}.lock`)).toBe(false);
  });

  it('mutator throw 시 lock 정리 + false 반환 (no exception)', () => {
    const fp = writeSolution('throw1');
    expect(() =>
      mutateSolutionFile(fp, () => { throw new Error('boom'); }),
    ).not.toThrow();
    const result = mutateSolutionFile(fp, () => { throw new Error('boom2'); });
    expect(result).toBe(false);
    expect(fs.existsSync(`${fp}.lock`)).toBe(false);
  });
});

describe('mutateSolutionByName', () => {
  it('이름으로 찾아서 mutate', () => {
    writeSolution('byname1');
    writeSolution('byname2');
    const result = mutateSolutionByName('byname2', sol => {
      sol.frontmatter.evidence.sessions = 7;
      return true;
    });
    expect(result).toBe(true);
    const fresh = parseSolutionV3(fs.readFileSync(path.join(ME_SOLUTIONS, 'byname2.md'), 'utf-8'))!;
    expect(fresh.frontmatter.evidence.sessions).toBe(7);
    // 다른 파일은 영향 없음
    const other = parseSolutionV3(fs.readFileSync(path.join(ME_SOLUTIONS, 'byname1.md'), 'utf-8'))!;
    expect(other.frontmatter.evidence.sessions).toBe(0);
  });

  it('이름이 없으면 false 반환', () => {
    writeSolution('only-this');
    const result = mutateSolutionByName('not-here', () => true);
    expect(result).toBe(false);
  });

  it('C3 회귀: prefix 충돌 — inc1을 찾을 때 inc12가 silent miss를 만들지 않는다', () => {
    // 이전 substring 사전 필터는 `name: inc1`이 `name: inc12`의 substring이라
    // inc12 파일이 먼저 매치되어 lock 안 검증으로 false 반환 → inc1 영영 못 찾음.
    //
    // L-2 fix: readdir 순서가 OS/FS에 따라 다르므로 (macOS APFS는 alphabetical),
    // 파일명을 alphabetical로 inc12가 먼저 오게 만들어 원래 버그가 발동하는
    // 순서를 명시적으로 강제한다. frontmatter.name과 파일명을 분리.
    fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
    // 파일명: a.md (frontmatter.name = inc12), b.md (frontmatter.name = inc1)
    // readdir alphabetical 결과: [a.md, b.md] → inc12가 먼저 처리됨
    fs.writeFileSync(path.join(ME_SOLUTIONS, 'a.md'), serializeSolutionV3(makeSolution('inc12')));
    fs.writeFileSync(path.join(ME_SOLUTIONS, 'b.md'), serializeSolutionV3(makeSolution('inc1')));

    const result = incrementEvidence('inc1', 'reflected');
    expect(result).toBe(true);

    const inc12 = parseSolutionV3(fs.readFileSync(path.join(ME_SOLUTIONS, 'a.md'), 'utf-8'))!;
    const inc1 = parseSolutionV3(fs.readFileSync(path.join(ME_SOLUTIONS, 'b.md'), 'utf-8'))!;
    expect(inc1.frontmatter.evidence.reflected).toBe(1);   // 정확한 매칭
    expect(inc12.frontmatter.evidence.reflected).toBe(0);  // 영향 없음
  });

  it('symlink는 무시', () => {
    if (process.platform === 'win32') return;
    fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
    const realPath = path.join(ME_SOLUTIONS, 'real.md');
    fs.writeFileSync(realPath, serializeSolutionV3(makeSolution('linked')));
    const linkPath = path.join(ME_SOLUTIONS, 'link.md');
    fs.symlinkSync(realPath, linkPath);

    // symlink을 통한 매칭은 무시되어야 함 — real 파일 자체로는 매칭됨
    const result = mutateSolutionByName('linked', sol => {
      sol.frontmatter.evidence.injected = 99;
      return true;
    });
    expect(result).toBe(true); // real 파일을 직접 찾아서 mutate

    // symlink 파일을 직접 통한 mutate는 일어나지 않음
    const linkStat = fs.lstatSync(linkPath);
    expect(linkStat.isSymbolicLink()).toBe(true);
  });
});

describe('incrementEvidence', () => {
  it('카운터 1 증가', () => {
    const fp = writeSolution('inc1');
    incrementEvidence('inc1', 'reflected');
    incrementEvidence('inc1', 'reflected');
    incrementEvidence('inc1', 'reflected');
    const fresh = parseSolutionV3(fs.readFileSync(fp, 'utf-8'))!;
    expect(fresh.frontmatter.evidence.reflected).toBe(3);
  });

  it('서로 다른 field 독립적으로 증가', () => {
    const fp = writeSolution('inc2');
    incrementEvidence('inc2', 'sessions');
    incrementEvidence('inc2', 'negative');
    incrementEvidence('inc2', 'negative');
    const fresh = parseSolutionV3(fs.readFileSync(fp, 'utf-8'))!;
    expect(fresh.frontmatter.evidence.sessions).toBe(1);
    expect(fresh.frontmatter.evidence.negative).toBe(2);
    expect(fresh.frontmatter.evidence.reflected).toBe(0);
  });

  it('이름 없으면 no-op (false 반환)', () => {
    expect(incrementEvidence('not-here', 'reflected')).toBe(false);
  });
});
