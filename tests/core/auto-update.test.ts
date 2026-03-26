/**
 * auto-update.ts 테스트
 *
 * 커버리지 목표:
 * - shouldNotify: semver 비교 로직 전 경로
 * - formatUpdateMessage: major/minor/patch 레벨 분기
 * - checkForUpdate: 캐시 히트/미스, 네트워크 실패 graceful fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── fetch 모킹 ──────────────────────────────────────────────────────────────

// global fetch를 모킹하기 위해 vi.stubGlobal 사용
// (Node.js 18+ 내장 fetch를 테스트에서 교체)

const CACHE_FILE = path.join(os.homedir(), '.compound', 'update-check.json');
const CACHE_BACKUP = CACHE_FILE + '.bak';

function backupCache() {
  if (fs.existsSync(CACHE_FILE)) {
    fs.copyFileSync(CACHE_FILE, CACHE_BACKUP);
    fs.rmSync(CACHE_FILE);
  }
}

function restoreCache() {
  if (fs.existsSync(CACHE_FILE)) {
    fs.rmSync(CACHE_FILE);
  }
  if (fs.existsSync(CACHE_BACKUP)) {
    fs.copyFileSync(CACHE_BACKUP, CACHE_FILE);
    fs.rmSync(CACHE_BACKUP);
  }
}

// ─── shouldNotify ────────────────────────────────────────────────────────────

import { shouldNotify, formatUpdateMessage, checkForUpdate } from '../../src/core/auto-update.js';

describe('shouldNotify()', () => {
  it('동일 버전이면 false를 반환한다', () => {
    expect(shouldNotify('2.2.1', '2.2.1')).toBe(false);
  });

  it('patch 버전이 높으면 true를 반환한다', () => {
    expect(shouldNotify('2.2.1', '2.2.2')).toBe(true);
  });

  it('minor 버전이 높으면 true를 반환한다', () => {
    expect(shouldNotify('2.2.1', '2.3.0')).toBe(true);
  });

  it('major 버전이 높으면 true를 반환한다', () => {
    expect(shouldNotify('2.2.1', '3.0.0')).toBe(true);
  });

  it('현재 버전이 최신보다 높으면 false를 반환한다', () => {
    expect(shouldNotify('3.0.0', '2.9.9')).toBe(false);
  });

  it('minor가 높고 patch가 낮아도 true를 반환한다', () => {
    expect(shouldNotify('2.2.9', '2.3.0')).toBe(true);
  });

  it('잘못된 버전 형식이면 false를 반환한다', () => {
    expect(shouldNotify('not-semver', '2.0.0')).toBe(false);
    expect(shouldNotify('2.0.0', 'not-semver')).toBe(false);
  });

  it('v 접두사가 있어도 정상 비교한다', () => {
    expect(shouldNotify('v2.2.1', '2.2.2')).toBe(true);
    expect(shouldNotify('2.2.1', 'v2.2.2')).toBe(true);
  });
});

// ─── formatUpdateMessage ─────────────────────────────────────────────────────

describe('formatUpdateMessage()', () => {
  it('patch 업데이트 메시지에 "patch"가 포함된다', () => {
    const msg = formatUpdateMessage('2.2.1', '2.2.2');
    expect(msg).toContain('patch');
    expect(msg).toContain('2.2.1');
    expect(msg).toContain('2.2.2');
  });

  it('minor 업데이트 메시지에 "minor"가 포함된다', () => {
    const msg = formatUpdateMessage('2.2.1', '2.3.0');
    expect(msg).toContain('minor');
  });

  it('major 업데이트 메시지에 "major"가 포함된다', () => {
    const msg = formatUpdateMessage('2.2.1', '3.0.0');
    expect(msg).toContain('major');
  });

  it('npm update 명령어가 포함된다', () => {
    const msg = formatUpdateMessage('2.2.1', '2.2.2');
    expect(msg).toContain('npm update -g tenetx');
  });
});

// ─── checkForUpdate ──────────────────────────────────────────────────────────

describe('checkForUpdate() — 캐시 로직', () => {
  beforeEach(() => {
    backupCache();
  });

  afterEach(() => {
    restoreCache();
    vi.unstubAllGlobals();
  });

  it('신선한 캐시가 있으면 fetch를 호출하지 않는다', async () => {
    // 현재 버전보다 높은 버전으로 캐시 설정
    const cache = { lastCheck: Date.now(), latestVersion: '99.0.0' };
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await checkForUpdate('1.0.0');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });

  it('캐시가 만료되면 fetch를 호출한다', async () => {
    // 25시간 전 캐시 (만료)
    const expired = Date.now() - 25 * 60 * 60 * 1000;
    const cache = { lastCheck: expired, latestVersion: '0.0.1' };
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '99.0.0' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await checkForUpdate('1.0.0');

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
  });

  it('캐시가 없으면 fetch를 호출한다', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '99.0.0' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await checkForUpdate('1.0.0');

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
  });

  it('이미 최신 버전이면 null을 반환한다', async () => {
    const cache = { lastCheck: Date.now(), latestVersion: '2.2.1' };
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');

    const result = await checkForUpdate('2.2.1');
    expect(result).toBeNull();
  });
});

describe('checkForUpdate() — 네트워크 실패 graceful fallback', () => {
  beforeEach(() => {
    backupCache();
  });

  afterEach(() => {
    restoreCache();
    vi.unstubAllGlobals();
  });

  it('fetch가 네트워크 오류를 던지면 null을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const result = await checkForUpdate('1.0.0');
    expect(result).toBeNull();
  });

  it('fetch 응답이 ok가 아니면 null을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }));

    const result = await checkForUpdate('1.0.0');
    expect(result).toBeNull();
  });

  it('fetch 응답에 version 필드가 없으면 null을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'tenetx' }),  // version 없음
    }));

    const result = await checkForUpdate('1.0.0');
    expect(result).toBeNull();
  });

  it('fetch 타임아웃 시 AbortError가 발생해도 null을 반환한다', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const result = await checkForUpdate('1.0.0');
    expect(result).toBeNull();
  });
});
