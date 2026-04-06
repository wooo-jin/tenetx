import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-lifecycle',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

// paths.ts는 모듈 초기화 시 os.homedir()를 평가하므로
// vi.mock('node:os')만으로는 ME_SOLUTIONS 상수가 이미 실제 홈 경로로
// 고정된다. paths 모듈 전체를 mock해 TEST_HOME 기반 경로로 덮어쓴다.
vi.mock('../src/core/paths.js', () => {
  const p = require('node:path');
  const BASE = '/tmp/tenetx-test-lifecycle';
  const TENETX_HOME = p.join(BASE, '.tenetx');
  const COMPOUND_HOME = p.join(BASE, '.compound');
  const ME_DIR = p.join(TENETX_HOME, 'me');
  return {
    COMPOUND_HOME,
    TENETX_HOME,
    ME_DIR,
    ME_SOLUTIONS: p.join(ME_DIR, 'solutions'),
    ME_RULES: p.join(ME_DIR, 'rules'),
    ME_PHILOSOPHY: p.join(ME_DIR, 'philosophy.json'),
    PACKS_DIR: p.join(TENETX_HOME, 'packs'),
    STATE_DIR: p.join(TENETX_HOME, 'state'),
    SESSIONS_DIR: p.join(TENETX_HOME, 'sessions'),
    GLOBAL_CONFIG: p.join(TENETX_HOME, 'config.json'),
    LAB_DIR: p.join(TENETX_HOME, 'lab'),
    LAB_EVENTS: p.join(TENETX_HOME, 'lab', 'events.jsonl'),
    FORGE_PROFILE: p.join(ME_DIR, 'forge-profile.json'),
    ALL_MODES: ['ralph', 'autopilot', 'ultrawork', 'team', 'pipeline', 'ccg', 'ralplan', 'deep-interview', 'ecomode'],
    projectDir: (cwd: string) => p.join(cwd, '.compound'),
    packLinkPath: (cwd: string) => p.join(cwd, '.compound', 'pack.link'),
    projectPhilosophyPath: (cwd: string) => p.join(cwd, '.compound', 'philosophy.json'),
    projectForgeProfilePath: (cwd: string) => p.join(cwd, '.compound', 'forge-profile.json'),
  };
});

import {
  runLifecycleCheck,
  verifySolution,
  checkIdentifierStaleness,
} from '../src/engine/compound-lifecycle.js';
import { serializeSolutionV3, DEFAULT_EVIDENCE } from '../src/engine/solution-format.js';
import type { SolutionV3, SolutionStatus, SolutionFrontmatter } from '../src/engine/solution-format.js';

function createSolution(dir: string, name: string, status: SolutionStatus, evidence: Partial<typeof DEFAULT_EVIDENCE> = {}, confidence?: number, created?: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const sol: SolutionV3 = {
    frontmatter: {
      name, version: 1, status,
      confidence: confidence ?? (status === 'experiment' ? 0.3 : status === 'candidate' ? 0.6 : 0.8),
      type: 'pattern', scope: 'me',
      tags: ['test', name], identifiers: ['TestIdent'],
      evidence: { ...DEFAULT_EVIDENCE, ...evidence },
      created: created ?? '2026-01-01', updated: created ?? '2026-01-01',
      supersedes: null, extractedBy: 'manual',
    },
    context: 'test', content: 'test',
  };
  const filePath = path.join(dir, `${name}.md`);
  fs.writeFileSync(filePath, serializeSolutionV3(sol));
  return filePath;
}

function makeFrontmatter(overrides: Partial<SolutionFrontmatter> = {}): SolutionFrontmatter {
  return {
    name: 'test-solution',
    version: 1,
    status: 'experiment',
    confidence: 0.3,
    type: 'pattern',
    scope: 'me',
    tags: ['test'],
    identifiers: [],
    evidence: { ...DEFAULT_EVIDENCE },
    created: '2026-01-01',
    updated: '2026-03-24',
    supersedes: null,
    extractedBy: 'manual',
    ...overrides,
  };
}

const SOLUTIONS_DIR = path.join(TEST_HOME, '.tenetx', 'me', 'solutions');

describe('compound-lifecycle', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });
  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('promotes experiment to candidate when reflected >= 3 and sessions >= 3', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'promote-test', 'experiment', { reflected: 3, sessions: 3, negative: 0 }, undefined, eightDaysAgo);
    const result = runLifecycleCheck();
    expect(result.promoted.length).toBe(1);
    expect(result.promoted[0]).toContain('candidate');
  });

  it('promotes experiment to candidate via reExtracted >= 2 and reflected >= 1', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'reextract-test', 'experiment', { reExtracted: 2, reflected: 1, negative: 0 }, undefined, eightDaysAgo);
    const result = runLifecycleCheck();
    expect(result.promoted.length).toBe(1);
  });

  it('does not promote when negative > 0', () => {
    createSolution(SOLUTIONS_DIR, 'neg-test', 'experiment', { reflected: 5, sessions: 3, negative: 1 });
    const result = runLifecycleCheck();
    expect(result.promoted.length).toBe(0);
  });

  it('retires experiment with negative >= 2 (circuit breaker)', () => {
    const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'circuit-test', 'experiment', { negative: 2 }, undefined, recentDate);
    const result = runLifecycleCheck();
    expect(result.retired.length).toBeGreaterThan(0);
    expect(result.retired.some(r => r.includes('circuit-breaker'))).toBe(true);
  });

  it('demotes when confidence < status threshold', () => {
    createSolution(SOLUTIONS_DIR, 'demote-test', 'verified', {}, 0.3); // verified needs >= 0.5
    const result = runLifecycleCheck();
    expect(result.demoted.length).toBe(1);
  });

  it('verifySolution promotes to verified', () => {
    createSolution(SOLUTIONS_DIR, 'verify-me', 'experiment');
    const success = verifySolution('verify-me');
    expect(success).toBe(true);
    const content = fs.readFileSync(path.join(SOLUTIONS_DIR, 'verify-me.md'), 'utf-8');
    expect(content).toContain('status: verified');
  });

  it('skips retired solutions', () => {
    createSolution(SOLUTIONS_DIR, 'retired-one', 'retired');
    const result = runLifecycleCheck();
    expect(result.promoted.length).toBe(0);
    expect(result.demoted.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// checkIdentifierStaleness — shell injection 방지 검증
// ────────────────────────────────────────────────────────────────────────────
describe('checkIdentifierStaleness()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync('/tmp/tenetx-stale-');
    // TypeScript 파일 하나 생성 — loadForgeProfile 식별자 포함
    fs.writeFileSync(
      path.join(tmpDir, 'index.ts'),
      'export function loadForgeProfile() { return null; }\nexport class SwarmManager {}'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('정상 식별자(loadForgeProfile)가 코드베이스에 존재하면 false를 반환한다', () => {
    const fm = makeFrontmatter({ identifiers: ['loadForgeProfile'] });
    // false = 식별자가 존재함(stale하지 않음)
    expect(checkIdentifierStaleness(fm, tmpDir)).toBe(false);
  });

  it('정상 식별자(SwarmManager)가 코드베이스에 존재하면 false를 반환한다', () => {
    const fm = makeFrontmatter({ identifiers: ['SwarmManager'] });
    expect(checkIdentifierStaleness(fm, tmpDir)).toBe(false);
  });

  it('코드베이스에 없는 식별자는 true(stale)를 반환한다', () => {
    const fm = makeFrontmatter({ identifiers: ['NonExistentFunction99999'] });
    expect(checkIdentifierStaleness(fm, tmpDir)).toBe(true);
  });

  it('악성 식별자 "; rm -rf /; echo " 가 shell injection을 유발하지 않는다', () => {
    const malicious = "'; rm -rf /; echo '";
    const fm = makeFrontmatter({ identifiers: [malicious] });
    // execFileSync 방식이면 shell로 해석하지 않고 grep 인자로 전달 — 오류 없이 false/true 반환
    expect(() => checkIdentifierStaleness(fm, tmpDir)).not.toThrow();
  });

  it('악성 식별자 "$(cat /etc/passwd)" 가 shell injection을 유발하지 않는다', () => {
    const fm = makeFrontmatter({ identifiers: ['$(cat /etc/passwd)'] });
    expect(() => checkIdentifierStaleness(fm, tmpDir)).not.toThrow();
  });

  it('악성 식별자 "`whoami`" 가 shell injection을 유발하지 않는다', () => {
    const fm = makeFrontmatter({ identifiers: ['`whoami`'] });
    expect(() => checkIdentifierStaleness(fm, tmpDir)).not.toThrow();
  });

  it('길이 4 미만인 식별자는 검사를 건너뛴다 — 빈 코드베이스에서도 true(stale)를 반환한다', () => {
    const emptyDir = fs.mkdtempSync('/tmp/tenetx-empty-');
    try {
      const fm = makeFrontmatter({ identifiers: ['ab'] }); // 2자 — 건너뜀
      // 모든 식별자가 건너뛰어지면 found=0 → stale=true
      expect(checkIdentifierStaleness(fm, emptyDir)).toBe(true);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('identifiers 배열이 비어있으면 false를 반환한다', () => {
    const fm = makeFrontmatter({ identifiers: [] });
    expect(checkIdentifierStaleness(fm, tmpDir)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CIRCUIT_BREAKER_THRESHOLDS — 상태별 임계값 검증
// ────────────────────────────────────────────────────────────────────────────
describe('circuit breaker thresholds (runLifecycleCheck)', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });
  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('candidate는 negative >= 3 에서 circuit breaker가 발동한다', () => {
    const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'cb-candidate', 'candidate', { negative: 3 }, 0.6, recentDate);
    const result = runLifecycleCheck();
    expect(result.retired.some(r => r.includes('circuit-breaker'))).toBe(true);
    expect(result.retired.some(r => r.includes('cb-candidate'))).toBe(true);
  });

  it('candidate는 negative === 2 에서 circuit breaker가 발동하지 않는다', () => {
    const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'cb-candidate-safe', 'candidate', { negative: 2 }, 0.6, recentDate);
    const result = runLifecycleCheck();
    expect(result.retired.some(r => r.includes('cb-candidate-safe'))).toBe(false);
  });

  it('verified는 negative >= 4 에서 circuit breaker가 발동한다', () => {
    createSolution(SOLUTIONS_DIR, 'cb-verified', 'verified', { negative: 4 }, 0.8);
    const result = runLifecycleCheck();
    expect(result.retired.some(r => r.includes('circuit-breaker'))).toBe(true);
    expect(result.retired.some(r => r.includes('cb-verified'))).toBe(true);
  });

  it('verified는 negative === 3 에서 circuit breaker가 발동하지 않는다', () => {
    createSolution(SOLUTIONS_DIR, 'cb-verified-safe', 'verified', { negative: 3 }, 0.8);
    const result = runLifecycleCheck();
    expect(result.retired.some(r => r.includes('cb-verified-safe'))).toBe(false);
  });

  it('experiment는 negative >= 2 에서 circuit breaker가 발동한다', () => {
    const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'cb-experiment', 'experiment', { negative: 2 }, undefined, recentDate);
    const result = runLifecycleCheck();
    expect(result.retired.some(r => r.includes('circuit-breaker'))).toBe(true);
    expect(result.retired.some(r => r.includes('cb-experiment'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MIN_AGE_FOR_PROMOTION — 최소 나이 게이트 검증
// ────────────────────────────────────────────────────────────────────────────
describe('MIN_AGE_FOR_PROMOTION (age gate)', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });
  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('experiment는 생성일이 7일 미만이면 promotion이 차단된다', () => {
    // 오늘 날짜로 생성 — 0일 경과
    const today = new Date().toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'age-block-exp', 'experiment', { reflected: 3, sessions: 3, negative: 0 }, undefined, today);
    const result = runLifecycleCheck();
    expect(result.promoted.some(p => p.includes('age-block-exp'))).toBe(false);
  });

  it('experiment는 생성일이 7일 이상이면 promotion이 허용된다', () => {
    // 8일 전 날짜
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'age-pass-exp', 'experiment', { reflected: 3, sessions: 3, negative: 0 }, undefined, eightDaysAgo);
    const result = runLifecycleCheck();
    expect(result.promoted.some(p => p.includes('age-pass-exp'))).toBe(true);
  });

  it('candidate는 생성일이 14일 미만이면 promotion이 차단된다', () => {
    const today = new Date().toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'age-block-cand', 'candidate', { reflected: 4, sessions: 3, negative: 0 }, 0.6, today);
    const result = runLifecycleCheck();
    expect(result.promoted.some(p => p.includes('age-block-cand'))).toBe(false);
  });

  it('candidate는 생성일이 14일 이상이면 promotion이 허용된다', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    createSolution(SOLUTIONS_DIR, 'age-pass-cand', 'candidate', { reflected: 4, sessions: 3, negative: 0 }, 0.6, fifteenDaysAgo);
    const result = runLifecycleCheck();
    expect(result.promoted.some(p => p.includes('age-pass-cand'))).toBe(true);
  });
});
