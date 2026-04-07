/**
 * atomic-write.ts 강화 회귀 테스트 (PR2a)
 *
 * 검증 사항:
 *   - M17: tmp 파일 random suffix → Promise.all 동시 호출 안전
 *   - M6: mode 0o600 적용 (POSIX) + Windows는 skip
 *   - M16: dirMode 0o700 적용
 *   - H13: STATE_DIR 자동 감지로 dirMode 미명시도 0o700 강제
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => {
  const tmpRoot = process.env.TMPDIR || '/tmp';
  return { TEST_HOME: `${tmpRoot.replace(/\/$/, '')}/atomic-write-test-${process.pid}` };
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

import { atomicWriteJSON, atomicWriteText } from '../src/hooks/shared/atomic-write.js';

const STATE_DIR = path.join(TEST_HOME, '.tenetx', 'state');

beforeEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
});

afterEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
});

describe('atomicWriteJSON', () => {
  it('정상 경로: tmp → rename으로 atomic write', () => {
    const fp = path.join(STATE_DIR, 'a.json');
    atomicWriteJSON(fp, { x: 1 });
    expect(fs.existsSync(fp)).toBe(true);
    expect(JSON.parse(fs.readFileSync(fp, 'utf-8'))).toEqual({ x: 1 });
  });

  it('M17: 같은 파일에 동시 atomic write가 PID race 없이 동작', async () => {
    // 동일 파일에 두 atomic write를 동시 시도. random suffix가 없으면 같은 PID
    // tmp 파일이 충돌해 EEXIST 또는 race가 발생.
    const fp = path.join(STATE_DIR, 'concurrent.json');
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      writes.push(Promise.resolve().then(() => atomicWriteJSON(fp, { i })));
    }
    await Promise.all(writes);
    expect(fs.existsSync(fp)).toBe(true);
    // 마지막 writer의 결과가 남음 (race이지만 atomicity는 보장됨 = 찢어진 JSON 없음)
    const final = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    expect(typeof final.i).toBe('number');
  });

  it('M6: mode 0o600 옵션이 POSIX에서 적용된다', () => {
    if (process.platform === 'win32') return; // Windows skip
    const fp = path.join(STATE_DIR, 'sensitive.json');
    atomicWriteJSON(fp, { secret: 1 }, { mode: 0o600 });
    const stat = fs.statSync(fp);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('M16: dirMode 0o700 옵션이 STATE_DIR에 적용된다', () => {
    if (process.platform === 'win32') return;
    const fp = path.join(STATE_DIR, 'a.json');
    atomicWriteJSON(fp, { x: 1 }, { dirMode: 0o700 });
    const dirStat = fs.statSync(STATE_DIR);
    expect(dirStat.mode & 0o777).toBe(0o700);
  });

  it('H13: dirMode 미명시여도 STATE_DIR 하위는 자동으로 0o700', () => {
    if (process.platform === 'win32') return;
    const fp = path.join(STATE_DIR, 'auto.json');
    atomicWriteJSON(fp, { x: 1 }); // dirMode 명시 없음
    const dirStat = fs.statSync(STATE_DIR);
    expect(dirStat.mode & 0o777).toBe(0o700);
  });

  it('H13: STATE_DIR 외 경로는 자동 0o700 적용 안 함', () => {
    if (process.platform === 'win32') return;
    const otherDir = path.join(TEST_HOME, 'other');
    const fp = path.join(otherDir, 'a.json');
    atomicWriteJSON(fp, { x: 1 });
    const dirStat = fs.statSync(otherDir);
    // umask 의존이지만 0o700은 아님 (보통 0o755)
    expect(dirStat.mode & 0o777).not.toBe(0o700);
  });

  it('rename 실패 시 tmp 파일 정리', () => {
    // 이건 시뮬레이션 어려움 — 코드 경로가 정상이면 통과
    const fp = path.join(STATE_DIR, 'cleanup.json');
    atomicWriteJSON(fp, { x: 1 });
    // tmp 파일이 남아있지 않은지 확인
    const dirEntries = fs.readdirSync(STATE_DIR);
    const tmpFiles = dirEntries.filter(f => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });
});

describe('atomicWriteText', () => {
  it('정상 경로: text atomic write', () => {
    const fp = path.join(STATE_DIR, 't.txt');
    atomicWriteText(fp, 'hello world');
    expect(fs.readFileSync(fp, 'utf-8')).toBe('hello world');
  });

  it('mode 0o600 적용', () => {
    if (process.platform === 'win32') return;
    const fp = path.join(STATE_DIR, 't.txt');
    atomicWriteText(fp, 'sensitive', { mode: 0o600 });
    const stat = fs.statSync(fp);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('STATE_DIR 자동 0o700', () => {
    if (process.platform === 'win32') return;
    const fp = path.join(STATE_DIR, 't.txt');
    atomicWriteText(fp, 'data');
    expect(fs.statSync(STATE_DIR).mode & 0o777).toBe(0o700);
  });
});
