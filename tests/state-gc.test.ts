import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenet-test-state-gc',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  isGcTarget,
  cleanStaleStateFiles,
  DEFAULT_MAX_AGE_MS,
  GC_FILE_PATTERNS,
} from '../src/core/state-gc.js';

const STATE_DIR = path.join(TEST_HOME, '.compound', 'state');

// ────────────────────────────────────────────────────────────────────────────
// isGcTarget()
// ────────────────────────────────────────────────────────────────────────────
describe('isGcTarget()', () => {
  it('permissions- 접두어 파일을 인식한다', () => {
    expect(isGcTarget('permissions-abc123.jsonl')).toBe(true);
  });

  it('modified-files- 접두어 파일을 인식한다', () => {
    expect(isGcTarget('modified-files-abc123.json')).toBe(true);
  });

  it('skill-cache- 접두어 파일을 인식한다', () => {
    expect(isGcTarget('skill-cache-abc123.json')).toBe(true);
  });

  it('token-usage- 접두어 파일을 인식한다', () => {
    expect(isGcTarget('token-usage-abc123.json')).toBe(true);
  });

  it('-state.json 접미어 파일을 인식한다', () => {
    expect(isGcTarget('ralph-state.json')).toBe(true);
    expect(isGcTarget('autopilot-state.json')).toBe(true);
  });

  it('관련 없는 파일은 무시한다', () => {
    expect(isGcTarget('config.json')).toBe(false);
    expect(isGcTarget('README.md')).toBe(false);
    expect(isGcTarget('some-random-file.txt')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// cleanStaleStateFiles()
// ────────────────────────────────────────────────────────────────────────────
describe('cleanStaleStateFiles()', () => {
  beforeEach(() => {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('state 디렉토리가 없으면 에러 없이 빈 결과를 반환한다', () => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    const result = cleanStaleStateFiles();
    expect(result.deletedCount).toBe(0);
    expect(result.deletedFiles).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('오래된 GC 대상 파일을 삭제한다', () => {
    const now = Date.now();
    const oldFiles = [
      'permissions-session1.jsonl',
      'modified-files-session1.json',
      'skill-cache-session1.json',
      'token-usage-session1.json',
      'ralph-state.json',
    ];

    for (const f of oldFiles) {
      const p = path.join(STATE_DIR, f);
      fs.writeFileSync(p, '{}');
      // mtime를 49시간 전으로 설정
      const oldTime = new Date(now - 49 * 60 * 60 * 1000);
      fs.utimesSync(p, oldTime, oldTime);
    }

    const result = cleanStaleStateFiles({ nowMs: now });
    expect(result.deletedCount).toBe(5);
    expect(result.deletedFiles).toHaveLength(5);
    for (const f of oldFiles) {
      expect(fs.existsSync(path.join(STATE_DIR, f))).toBe(false);
    }
  });

  it('최근 파일은 유지한다', () => {
    const now = Date.now();
    const recentFile = 'permissions-recent.jsonl';
    fs.writeFileSync(path.join(STATE_DIR, recentFile), '{}');
    // mtime를 1시간 전으로 설정
    const recentTime = new Date(now - 1 * 60 * 60 * 1000);
    fs.utimesSync(path.join(STATE_DIR, recentFile), recentTime, recentTime);

    const result = cleanStaleStateFiles({ nowMs: now });
    expect(result.deletedCount).toBe(0);
    expect(fs.existsSync(path.join(STATE_DIR, recentFile))).toBe(true);
  });

  it('GC 대상이 아닌 파일은 건드리지 않는다', () => {
    const now = Date.now();
    const safeFile = 'config.json';
    const p = path.join(STATE_DIR, safeFile);
    fs.writeFileSync(p, '{}');
    const oldTime = new Date(now - 100 * 60 * 60 * 1000);
    fs.utimesSync(p, oldTime, oldTime);

    const result = cleanStaleStateFiles({ nowMs: now });
    expect(result.deletedCount).toBe(0);
    expect(fs.existsSync(p)).toBe(true);
  });

  it('커스텀 maxAgeMs를 적용한다', () => {
    const now = Date.now();
    const file = 'permissions-test.jsonl';
    const p = path.join(STATE_DIR, file);
    fs.writeFileSync(p, '{}');
    // 2시간 전
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
    fs.utimesSync(p, twoHoursAgo, twoHoursAgo);

    // maxAge 1시간: 삭제됨
    const result1 = cleanStaleStateFiles({ maxAgeMs: 1 * 60 * 60 * 1000, nowMs: now });
    expect(result1.deletedCount).toBe(1);
  });

  it('오래된 파일과 최근 파일이 혼재할 때 오래된 것만 삭제한다', () => {
    const now = Date.now();
    const oldFile = 'modified-files-old.json';
    const newFile = 'modified-files-new.json';

    fs.writeFileSync(path.join(STATE_DIR, oldFile), '{}');
    const oldTime = new Date(now - 72 * 60 * 60 * 1000);
    fs.utimesSync(path.join(STATE_DIR, oldFile), oldTime, oldTime);

    fs.writeFileSync(path.join(STATE_DIR, newFile), '{}');

    const result = cleanStaleStateFiles({ nowMs: now });
    expect(result.deletedCount).toBe(1);
    expect(result.deletedFiles).toContain(oldFile);
    expect(fs.existsSync(path.join(STATE_DIR, newFile))).toBe(true);
  });

  it('DEFAULT_MAX_AGE_MS는 48시간이다', () => {
    expect(DEFAULT_MAX_AGE_MS).toBe(48 * 60 * 60 * 1000);
  });

  it('GC_FILE_PATTERNS에 4개 패턴이 포함되어 있다', () => {
    expect(GC_FILE_PATTERNS).toHaveLength(4);
    expect(GC_FILE_PATTERNS).toContain('permissions-');
    expect(GC_FILE_PATTERNS).toContain('modified-files-');
    expect(GC_FILE_PATTERNS).toContain('skill-cache-');
    expect(GC_FILE_PATTERNS).toContain('token-usage-');
  });

  it('active: true인 상태 파일은 GC에서 보호된다 (10I)', () => {
    const now = Date.now();
    const activeFile = 'ralph-state.json';
    const inactiveFile = 'autopilot-state.json';
    const activePath = path.join(STATE_DIR, activeFile);
    const inactivePath = path.join(STATE_DIR, inactiveFile);

    // active: true
    fs.writeFileSync(activePath, JSON.stringify({ active: true, startedAt: '2026-01-01' }));
    const oldTime = new Date(now - 72 * 60 * 60 * 1000);
    fs.utimesSync(activePath, oldTime, oldTime);

    // active: false (또는 미포함)
    fs.writeFileSync(inactivePath, JSON.stringify({ active: false }));
    fs.utimesSync(inactivePath, oldTime, oldTime);

    const result = cleanStaleStateFiles({ nowMs: now });
    // active 파일은 보존, inactive 파일은 삭제
    expect(fs.existsSync(activePath)).toBe(true);
    expect(fs.existsSync(inactivePath)).toBe(false);
    expect(result.deletedFiles).toContain(inactiveFile);
    expect(result.deletedFiles).not.toContain(activeFile);
  });

  it('파싱 실패한 오래된 상태 파일은 GC 진행된다 (10I)', () => {
    const now = Date.now();
    const corruptFile = 'corrupt-state.json';
    const corruptPath = path.join(STATE_DIR, corruptFile);
    fs.writeFileSync(corruptPath, 'not valid json {{{');
    const oldTime = new Date(now - 72 * 60 * 60 * 1000);
    fs.utimesSync(corruptPath, oldTime, oldTime);

    const result = cleanStaleStateFiles({ nowMs: now });
    expect(fs.existsSync(corruptPath)).toBe(false);
    expect(result.deletedFiles).toContain(corruptFile);
  });
});
