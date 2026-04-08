/**
 * PR3 회귀 테스트 — checkCompoundNegative가 term-matcher 사용
 *
 * 검증:
 *   - identifier 매칭 (strong) 시 negative 1 증가
 *   - tag 2개 매칭 (multi) 시 negative 1 증가
 *   - tag 1개만 매칭 (weak) 시 negative 증가 안 함
 *   - 짧은 약어(api/sql)의 prefix 매칭(rapid/mysqld) 거부 (H1/M14 회귀)
 *   - 한국어 복합어(파서에러)가 에러 tag에 매칭되면 안 됨
 *   - NEGATIVE_TERM_BLOCKLIST term(에러/error)은 단독으로 attribute 못 함
 *   - 변조 cache(비-string element)는 filterMatchableTerms로 방어
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => {
  const tmpRoot = process.env.TMPDIR || '/tmp';
  return { TEST_HOME: `${tmpRoot.replace(/\/$/, '')}/tenetx-pr3-negative-${process.pid}` };
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
    COMPOUND_HOME: p.join(TEST_HOME, '.compound'),
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
    ALL_MODES: ['ralph', 'autopilot'],
    projectDir: (cwd: string) => p.join(cwd, '.compound'),
  };
});

import { checkCompoundNegative } from '../src/hooks/post-tool-handlers.js';
import { serializeSolutionV3, DEFAULT_EVIDENCE, parseSolutionV3 } from '../src/engine/solution-format.js';

const STATE_DIR = path.join(TEST_HOME, '.tenetx', 'state');
const ME_SOLUTIONS = path.join(TEST_HOME, '.tenetx', 'me', 'solutions');

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'default';
}

function writeSolution(name: string, tags: string[], identifiers: string[] = []) {
  fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
  const filePath = path.join(ME_SOLUTIONS, `${name}.md`);
  fs.writeFileSync(filePath, serializeSolutionV3({
    frontmatter: {
      name,
      version: 1,
      status: 'experiment',
      confidence: 0.5,
      type: 'pattern',
      scope: 'me',
      tags,
      identifiers,
      evidence: { ...DEFAULT_EVIDENCE },
      created: '2026-04-08',
      updated: '2026-04-08',
      supersedes: null,
      extractedBy: 'auto',
    },
    context: '',
    content: 'test',
  }));
  return filePath;
}

function writeInjectionCache(sessionId: string, solutions: Array<{ name: string; tags?: string[]; identifiers?: string[]; status: string }>): string {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const cachePath = path.join(STATE_DIR, `injection-cache-${sanitizeId(sessionId)}.json`);
  const data = {
    solutions: solutions.map(s => ({
      name: s.name,
      identifiers: s.identifiers ?? [],
      tags: s.tags ?? [],
      status: s.status,
      injectedAt: new Date().toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(cachePath, JSON.stringify(data));
  return cachePath;
}

function readNegative(filePath: string): number {
  const sol = parseSolutionV3(fs.readFileSync(filePath, 'utf-8'));
  return sol?.frontmatter.evidence.negative ?? -1;
}

beforeEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  fs.mkdirSync(TEST_HOME, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
});

describe('checkCompoundNegative — strong (identifier 매칭)', () => {
  it('identifier 1개 word-boundary 매칭 시 negative 1 증가', () => {
    const fp = writeSolution('react-hook-sol', ['react'], ['useState']);
    writeInjectionCache('s1', [{
      name: 'react-hook-sol',
      identifiers: ['useState'],
      tags: ['react'],
      status: 'experiment',
    }]);

    // negativePatterns 중 'error\s*TS\d+' 매치가 필요 + useState 식별자 word-boundary 매칭
    checkCompoundNegative('Bash', 'error TS2345: useState is not defined', 's1');
    expect(readNegative(fp)).toBe(1);
  });
});

describe('checkCompoundNegative — multi (tag ≥2 매칭)', () => {
  it('tag 2개 이상 word-boundary 매칭 시 negative 1 증가', () => {
    const fp = writeSolution('react-hook', ['react', 'hook'], []);
    writeInjectionCache('s2', [{
      name: 'react-hook',
      identifiers: [],
      tags: ['react', 'hook'],
      status: 'experiment',
    }]);

    checkCompoundNegative('Bash', 'error TS2345: react hook useState bug', 's2');
    // 'react', 'hook' 모두 word-boundary 매칭. 'error', 'bug'는 blocklist.
    expect(readNegative(fp)).toBe(1);
  });
});

describe('checkCompoundNegative — weak rejection (over-attribution 방지)', () => {
  it('tag 1개만 매칭 시 negative 증가 안 함', () => {
    const fp = writeSolution('single-match', ['react', 'unrelated-thing'], []);
    writeInjectionCache('s3', [{
      name: 'single-match',
      identifiers: [],
      tags: ['react', 'unrelated-thing'],
      status: 'experiment',
    }]);

    // 'react'만 매칭, 'unrelated-thing'은 안 나옴 → weak → no attribute
    checkCompoundNegative('Bash', 'error TS2345: react rendering failed', 's3');
    expect(readNegative(fp)).toBe(0);
  });
});

describe('checkCompoundNegative — H1/M14 회귀 (prefix 매칭 거부)', () => {
  it('api tag가 rapid에 매칭되면 안 됨', () => {
    const fp = writeSolution('api-sol', ['api', 'endpoint'], []);
    writeInjectionCache('s4', [{
      name: 'api-sol',
      identifiers: [],
      tags: ['api', 'endpoint'],
      status: 'experiment',
    }]);

    // 'rapid build'에는 'api'가 word-boundary로 매칭 안 됨
    checkCompoundNegative('Bash', 'error TS2345: rapid build failed', 's4');
    expect(readNegative(fp)).toBe(0);
  });

  it('sql tag가 mysqld에 매칭되면 안 됨', () => {
    const fp = writeSolution('sql-sol', ['sql', 'database'], []);
    writeInjectionCache('s5', [{
      name: 'sql-sol',
      identifiers: [],
      tags: ['sql', 'database'],
      status: 'experiment',
    }]);

    checkCompoundNegative('Bash', 'error TS2345: mysqld crashed', 's5');
    expect(readNegative(fp)).toBe(0);
  });

  it('에러 tag가 파서에러에 매칭되면 안 됨', () => {
    const fp = writeSolution('korean-sol', ['리팩토링', '파서'], []);
    writeInjectionCache('s6', [{
      name: 'korean-sol',
      identifiers: [],
      tags: ['리팩토링', '파서'],
      status: 'experiment',
    }]);

    // '파서에러'는 한국어 복합어 — '파서' word-boundary 매칭 안 됨
    checkCompoundNegative('Bash', 'error TS2345: 파서에러 발생', 's6');
    expect(readNegative(fp)).toBe(0);
  });

  it('배포 tag가 재배포에 매칭되면 안 됨', () => {
    const fp = writeSolution('deploy-sol', ['배포', '롤백'], []);
    writeInjectionCache('s7', [{
      name: 'deploy-sol',
      identifiers: [],
      tags: ['배포', '롤백'],
      status: 'experiment',
    }]);

    checkCompoundNegative('Bash', 'error TS2345: 재배포 실패', 's7');
    expect(readNegative(fp)).toBe(0);
  });
});

describe('checkCompoundNegative — NEGATIVE_TERM_BLOCKLIST (메타 term 제외)', () => {
  it('에러/error 같은 blocklist term만으로는 attribute 안 됨', () => {
    const fp = writeSolution('meta-sol', ['에러', 'error'], []);
    writeInjectionCache('s8', [{
      name: 'meta-sol',
      identifiers: [],
      tags: ['에러', 'error'],
      status: 'experiment',
    }]);

    // 모든 tag가 blocklist → filterMatchableTerms 후 빈 배열 → none → 증가 안 함
    checkCompoundNegative('Bash', 'error TS2345: 에러 발생', 's8');
    expect(readNegative(fp)).toBe(0);
  });

  it('blocklist term + 실제 기술 term 혼합 시 기술 term만 count', () => {
    // 'error'는 blocklist, 'react'는 signal. 1개만 매칭 → weak → no attribute
    const fp = writeSolution('mixed', ['error', 'react'], []);
    writeInjectionCache('s9', [{
      name: 'mixed',
      identifiers: [],
      tags: ['error', 'react'],
      status: 'experiment',
    }]);

    checkCompoundNegative('Bash', 'error TS2345: react rendering', 's9');
    expect(readNegative(fp)).toBe(0); // react 하나만 → weak → no attribute
  });
});

describe('checkCompoundNegative — 변조 cache 방어', () => {
  it('tags가 비-string element 포함 시 filterMatchableTerms가 제거', () => {
    const fp = writeSolution('tampered', ['react', 'hook'], []);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const cachePath = path.join(STATE_DIR, `injection-cache-s10.json`);
    fs.writeFileSync(cachePath, JSON.stringify({
      solutions: [{
        name: 'tampered',
        identifiers: [123, null, { x: 1 }],
        tags: [42, 'react', true, 'hook'],
        status: 'experiment',
        injectedAt: new Date().toISOString(),
      }],
      updatedAt: new Date().toISOString(),
    }));

    // 'react', 'hook' 두 개 string tag만 남아 word-boundary 매칭 → multi
    checkCompoundNegative('Bash', 'error TS2345: react hook render bug', 's10');
    expect(readNegative(fp)).toBe(1);
  });

  it('모든 element가 비-string이면 attribute 안 됨 (H1 회귀)', () => {
    const fp = writeSolution('all-corrupted', ['legit'], ['legit']);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const cachePath = path.join(STATE_DIR, `injection-cache-s11.json`);
    fs.writeFileSync(cachePath, JSON.stringify({
      solutions: [{
        name: 'all-corrupted',
        identifiers: [123, null, { x: 1 }],
        tags: [42, true, []],
        status: 'experiment',
        injectedAt: new Date().toISOString(),
      }],
      updatedAt: new Date().toISOString(),
    }));

    // 모든 element 비-string → filterMatchableTerms 후 빈 배열 → none
    // 이전 `length === 0 || some(...)` fallback 버그가 있으면 모든 Bash 오류와 매칭
    checkCompoundNegative('Bash', 'error TS2345: completely unrelated', 's11');
    expect(readNegative(fp)).toBe(0);
  });
});

describe('checkCompoundNegative — PR3 라운드 3 회귀', () => {
  it('C2 회귀: 집중 tag가 집 1자 토큰과 false positive 매칭되면 안 됨', () => {
    const fp = writeSolution('focus-sol', ['집중', '작업'], []);
    writeInjectionCache('s20', [{
      name: 'focus-sol',
      identifiers: [],
      tags: ['집중', '작업'],
      status: 'experiment',
    }]);

    // '집 정리' text에는 '집중'의 1자 stem '집'이 있어도 매칭되면 안 됨
    checkCompoundNegative('Bash', 'error TS2345: 집 정리 중 오류', 's20');
    expect(readNegative(fp)).toBe(0);
  });

  it('C2 정상: 집중 tag는 집중 text 매칭 OK', () => {
    const fp = writeSolution('focus-sol', ['집중', '작업'], []);
    writeInjectionCache('s21', [{
      name: 'focus-sol',
      identifiers: [],
      tags: ['집중', '작업'],
      status: 'experiment',
    }]);

    // '집중 작업 중' — 두 tag 모두 매칭 → multi
    checkCompoundNegative('Bash', 'error TS2345: 집중 작업 실패', 's21');
    expect(readNegative(fp)).toBe(1);
  });

  it('H-K1 inflected 매칭 (통합)', () => {
    const fp = writeSolution('deploy-sol', ['배포', '롤백'], []);
    writeInjectionCache('s22', [{
      name: 'deploy-sol',
      identifiers: [],
      tags: ['배포', '롤백'],
      status: 'experiment',
    }]);

    // '배포가 실패했다 롤백 시작' — 배포+가 조사 stem 매칭 + 롤백 매칭 → multi
    checkCompoundNegative('Bash', 'error TS2345: 배포가 실패했다 롤백 시작', 's22');
    expect(readNegative(fp)).toBe(1);
  });

  it('H1 4자 identifier 단독 strong (Python/C 구제)', () => {
    const fp = writeSolution('init-sol', [], ['init']);
    writeInjectionCache('s23', [{
      name: 'init-sol',
      identifiers: ['init'],
      tags: [],
      status: 'experiment',
    }]);

    checkCompoundNegative('Bash', 'error TS2345: init failed', 's23');
    expect(readNegative(fp)).toBe(1);
  });

  it('H1 3자 identifier 단독은 weak', () => {
    const fp = writeSolution('api-only', [], ['api']);
    writeInjectionCache('s24', [{
      name: 'api-only',
      identifiers: ['api'],
      tags: [],
      status: 'experiment',
    }]);

    checkCompoundNegative('Bash', 'error TS2345: api failed', 's24');
    expect(readNegative(fp)).toBe(0);
  });
});

describe('checkCompoundNegative — 기본 가드', () => {
  it('Bash 외 도구는 무시', () => {
    const fp = writeSolution('any-sol', ['react', 'hook'], ['useState']);
    writeInjectionCache('s12', [{
      name: 'any-sol',
      identifiers: ['useState'],
      tags: ['react', 'hook'],
      status: 'experiment',
    }]);

    checkCompoundNegative('Edit', 'ReferenceError: useState is not defined', 's12');
    expect(readNegative(fp)).toBe(0);
  });

  it('experiment 외 status는 무시', () => {
    const fp = writeSolution('verified-sol', ['react', 'hook'], ['useState']);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const cachePath = path.join(STATE_DIR, `injection-cache-s13.json`);
    fs.writeFileSync(cachePath, JSON.stringify({
      solutions: [{
        name: 'verified-sol',
        identifiers: ['useState'],
        tags: ['react', 'hook'],
        status: 'verified',
        injectedAt: new Date().toISOString(),
      }],
      updatedAt: new Date().toISOString(),
    }));

    checkCompoundNegative('Bash', 'ReferenceError: useState is not defined', 's13');
    expect(readNegative(fp)).toBe(0);
  });

  it('negative pattern 없는 Bash 출력은 무시', () => {
    const fp = writeSolution('normal', ['react'], ['useState']);
    writeInjectionCache('s14', [{
      name: 'normal',
      identifiers: ['useState'],
      tags: ['react'],
      status: 'experiment',
    }]);

    checkCompoundNegative('Bash', 'useState hook rendered successfully', 's14');
    expect(readNegative(fp)).toBe(0);
  });
});
