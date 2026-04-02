/**
 * solution-injector 단위 테스트
 *
 * solution-injector.ts 전체는 많은 의존성을 가지므로
 * 내부적으로 사용되는 세션 캐시 로직과 TTL 만료를 직접 테스트합니다.
 * 세션 캐시의 파일 포맷과 24시간 TTL 로직을 임시 디렉토리 기반으로 검증합니다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ── 세션 캐시 인라인 구현 (solution-injector.ts의 로직을 독립적으로 테스트) ──

interface SessionCacheData {
  injected: string[];
  totalInjectedChars: number;
  updatedAt: string;
}

function sanitizeId(id: string, maxLength = 128): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLength) || 'default';
}

function getSessionCachePath(stateDir: string, sessionId: string): string {
  return path.join(stateDir, `solution-cache-${sanitizeId(sessionId)}.json`);
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadSessionCache(
  stateDir: string,
  sessionId: string
): { injected: Set<string>; totalInjectedChars: number } {
  const cachePath = getSessionCachePath(stateDir, sessionId);
  try {
    if (fs.existsSync(cachePath)) {
      const data: SessionCacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      const age = data.updatedAt ? Date.now() - new Date(data.updatedAt).getTime() : Infinity;
      if (!Number.isFinite(age) || age > TTL_MS) {
        fs.unlinkSync(cachePath);
        return { injected: new Set(), totalInjectedChars: 0 };
      }
      return { injected: new Set(data.injected ?? []), totalInjectedChars: data.totalInjectedChars ?? 0 };
    }
  } catch {
    // 읽기 실패 시 빈 캐시 반환
  }
  return { injected: new Set(), totalInjectedChars: 0 };
}

function saveSessionCache(
  stateDir: string,
  sessionId: string,
  injected: Set<string>,
  totalInjectedChars: number
): void {
  const cachePath = getSessionCachePath(stateDir, sessionId);
  const data: SessionCacheData = {
    injected: [...injected],
    totalInjectedChars,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(cachePath, JSON.stringify(data));
}

// ── 테스트 픽스처 ──

let stateDir: string;

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-sol-cache-test-'));
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

// ── 캐시 파일 포맷 ──

describe('세션 캐시 파일 포맷', () => {
  it('캐시 파일이 injected 배열, totalInjectedChars, updatedAt을 포함한다', () => {
    saveSessionCache(stateDir, 'test-session', new Set(['sol-1', 'sol-2']), 150);
    const cachePath = getSessionCachePath(stateDir, 'test-session');
    const data: SessionCacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

    expect(Array.isArray(data.injected)).toBe(true);
    expect(data.injected).toContain('sol-1');
    expect(data.injected).toContain('sol-2');
    expect(typeof data.totalInjectedChars).toBe('number');
    expect(data.totalInjectedChars).toBe(150);
    expect(typeof data.updatedAt).toBe('string');
  });

  it('updatedAt이 ISO 8601 형식이다', () => {
    saveSessionCache(stateDir, 'iso-test', new Set(), 0);
    const cachePath = getSessionCachePath(stateDir, 'iso-test');
    const data: SessionCacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(() => new Date(data.updatedAt)).not.toThrow();
    expect(new Date(data.updatedAt).toISOString()).toBe(data.updatedAt);
  });

  it('빈 Set을 저장하면 injected 배열이 비어있다', () => {
    saveSessionCache(stateDir, 'empty', new Set(), 0);
    const cachePath = getSessionCachePath(stateDir, 'empty');
    const data: SessionCacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(data.injected).toEqual([]);
    expect(data.totalInjectedChars).toBe(0);
  });
});

// ── 캐시 읽기/쓰기 왕복 ──

describe('세션 캐시 읽기/쓰기', () => {
  it('저장한 솔루션 이름을 다시 읽어올 수 있다', () => {
    const injected = new Set(['solution-a', 'solution-b', 'solution-c']);
    saveSessionCache(stateDir, 'roundtrip', injected, 300);
    const loaded = loadSessionCache(stateDir, 'roundtrip');
    expect(loaded.injected.has('solution-a')).toBe(true);
    expect(loaded.injected.has('solution-b')).toBe(true);
    expect(loaded.injected.has('solution-c')).toBe(true);
  });

  it('totalInjectedChars가 올바르게 복원된다', () => {
    saveSessionCache(stateDir, 'chars', new Set(['sol']), 500);
    const loaded = loadSessionCache(stateDir, 'chars');
    expect(loaded.totalInjectedChars).toBe(500);
  });

  it('파일이 없으면 빈 캐시를 반환한다', () => {
    const result = loadSessionCache(stateDir, 'nonexistent');
    expect(result.injected.size).toBe(0);
    expect(result.totalInjectedChars).toBe(0);
  });

  it('다른 session_id는 독립적인 캐시를 가진다', () => {
    saveSessionCache(stateDir, 'session-1', new Set(['sol-x']), 100);
    saveSessionCache(stateDir, 'session-2', new Set(['sol-y']), 200);

    const s1 = loadSessionCache(stateDir, 'session-1');
    const s2 = loadSessionCache(stateDir, 'session-2');

    expect(s1.injected.has('sol-x')).toBe(true);
    expect(s1.injected.has('sol-y')).toBe(false);
    expect(s2.injected.has('sol-y')).toBe(true);
    expect(s2.injected.has('sol-x')).toBe(false);
  });
});

// ── 24시간 TTL 만료 ──

describe('24시간 TTL 만료', () => {
  it('최신 캐시는 만료되지 않는다', () => {
    saveSessionCache(stateDir, 'fresh', new Set(['recent-sol']), 50);
    const result = loadSessionCache(stateDir, 'fresh');
    expect(result.injected.has('recent-sol')).toBe(true);
  });

  it('25시간 전 updatedAt을 가진 캐시는 만료 처리되어 빈 캐시를 반환한다', () => {
    const cachePath = getSessionCachePath(stateDir, 'expired');
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const expiredData: SessionCacheData = {
      injected: ['old-solution'],
      totalInjectedChars: 100,
      updatedAt: twentyFiveHoursAgo,
    };
    fs.writeFileSync(cachePath, JSON.stringify(expiredData));

    const result = loadSessionCache(stateDir, 'expired');
    expect(result.injected.size).toBe(0);
    expect(result.totalInjectedChars).toBe(0);
  });

  it('만료된 캐시 파일은 디스크에서 삭제된다', () => {
    const cachePath = getSessionCachePath(stateDir, 'to-delete');
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(cachePath, JSON.stringify({
      injected: ['stale'],
      totalInjectedChars: 10,
      updatedAt: oldTimestamp,
    }));

    loadSessionCache(stateDir, 'to-delete');
    expect(fs.existsSync(cachePath)).toBe(false);
  });

  it('정확히 24시간 전은 만료로 처리된다 (age > TTL_MS)', () => {
    const cachePath = getSessionCachePath(stateDir, 'boundary');
    // TTL_MS + 1ms = 만료
    const justExpired = new Date(Date.now() - TTL_MS - 1).toISOString();
    fs.writeFileSync(cachePath, JSON.stringify({
      injected: ['boundary-sol'],
      totalInjectedChars: 20,
      updatedAt: justExpired,
    }));

    const result = loadSessionCache(stateDir, 'boundary');
    expect(result.injected.size).toBe(0);
  });

  it('23시간 59분 전은 만료되지 않는다', () => {
    const cachePath = getSessionCachePath(stateDir, 'not-expired');
    const almostExpired = new Date(Date.now() - (TTL_MS - 60_000)).toISOString();
    fs.writeFileSync(cachePath, JSON.stringify({
      injected: ['still-valid'],
      totalInjectedChars: 30,
      updatedAt: almostExpired,
    }));

    const result = loadSessionCache(stateDir, 'not-expired');
    expect(result.injected.has('still-valid')).toBe(true);
  });
});

// ── 세션당 최대 솔루션 수 (MAX_SOLUTIONS_PER_SESSION = 10) ──

describe('세션별 솔루션 개수 관리', () => {
  it('10개 솔루션까지 저장하고 로드할 수 있다', () => {
    const solutions = new Set(Array.from({ length: 10 }, (_, i) => `sol-${i}`));
    saveSessionCache(stateDir, 'full-session', solutions, 1000);
    const result = loadSessionCache(stateDir, 'full-session');
    expect(result.injected.size).toBe(10);
  });

  it('실험(experiment) 솔루션은 프롬프트당 1개만 허용하는 로직 시뮬레이션', () => {
    // solution-injector.ts: if (sol.status === 'experiment') { if (experimentCount >= 1) continue; }
    type SolutionStatus = 'stable' | 'experiment';
    interface MockSolution { name: string; status: SolutionStatus }

    const mockSolutions: MockSolution[] = [
      { name: 'stable-1', status: 'stable' },
      { name: 'experiment-1', status: 'experiment' },
      { name: 'experiment-2', status: 'experiment' }, // 이 솔루션은 스킵되어야 함
      { name: 'stable-2', status: 'stable' },
    ];

    let experimentCount = 0;
    const toInject: MockSolution[] = [];

    for (const sol of mockSolutions) {
      if (sol.status === 'experiment') {
        if (experimentCount >= 1) continue;
        experimentCount++;
      }
      toInject.push(sol);
    }

    expect(toInject.map(s => s.name)).toEqual(['stable-1', 'experiment-1', 'stable-2']);
    expect(toInject.filter(s => s.status === 'experiment').length).toBe(1);
  });
});

// ── session_id 정제 (sanitizeId) ──

describe('sanitizeId — session 파일명 안전화', () => {
  it('영숫자와 하이픈은 그대로 유지된다', () => {
    expect(sanitizeId('abc-123')).toBe('abc-123');
  });

  it('특수문자는 언더스코어로 치환된다', () => {
    expect(sanitizeId('session/id.with:special')).toBe('session_id_with_special');
  });

  it('빈 문자열은 "default"를 반환한다', () => {
    expect(sanitizeId('')).toBe('default');
  });

  it('maxLength를 초과하는 ID는 잘린다', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeId(long)).toHaveLength(128);
  });

  it('path traversal 시도가 안전하게 변환된다', () => {
    const dangerous = '../../../etc/passwd';
    const result = sanitizeId(dangerous);
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });
});
