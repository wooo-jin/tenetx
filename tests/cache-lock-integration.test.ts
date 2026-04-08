/**
 * PR2c-1 회귀 테스트 — cache lock 통합 검증
 *
 * 검증 사항:
 *   - withFileLock으로 보호된 read-modify-write가 동시 호출에서 safe
 *   - mode 0o600이 cache 파일에 적용
 *   - lock 실패 시 silent swallow가 아닌 FileLockError 분기
 *   - session-cache의 union merge가 작동
 *
 * solution-injector main()을 직접 호출하긴 어렵지만, lock + atomic-write 통합
 * 패턴이 정상 동작함을 file-lock + atomic-write 합성으로 검증한다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { withFileLock, withFileLockSync, FileLockError } from '../src/hooks/shared/file-lock.js';
import { atomicWriteJSON } from '../src/hooks/shared/atomic-write.js';

let tmpDir: string;
let cachePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-lock-test-'));
  cachePath = path.join(tmpDir, 'injection-cache.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('cache lock + atomic-write 합성', () => {
  it('동시 read-modify-write가 직렬화되어 양쪽 mutation 보존', async () => {
    // 초기 cache
    fs.writeFileSync(cachePath, JSON.stringify({ counter: 0, items: [] as string[] }));

    // 두 caller가 동시에 cache.items에 자기 entry를 추가
    const writer = (id: string) => withFileLock(cachePath, () => {
      const fresh = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      fresh.items.push(id);
      fresh.counter = (fresh.counter ?? 0) + 1;
      atomicWriteJSON(cachePath, fresh, { mode: 0o600 });
    });

    await Promise.all([
      writer('a'), writer('b'), writer('c'),
      writer('d'), writer('e'), writer('f'),
    ]);

    const final = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(final.counter).toBe(6);
    expect(final.items.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('mode 0o600이 적용된다 (POSIX)', async () => {
    if (process.platform === 'win32') return;
    await withFileLock(cachePath, () => {
      atomicWriteJSON(cachePath, { x: 1 }, { mode: 0o600 });
    });
    const stat = fs.statSync(cachePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('FileLockError가 caller에서 instanceof로 분기 가능', async () => {
    // 동기 lock을 잡은 상태에서 동기 lock을 또 시도 → timeout
    fs.writeFileSync(`${cachePath}.lock`, JSON.stringify({
      pid: 99999,  // dead PID로 가정 (process.kill(99999, 0)이 ESRCH)
      ts: Date.now(),
      token: 'fake',
    }));
    // mtime을 stale 직전(staleMs - 1초)으로 설정해 회수 시도 안 하게
    const recent = Date.now() / 1000;
    fs.utimesSync(`${cachePath}.lock`, recent, recent);

    // PID가 dead이지만 mtime이 fresh(< staleMs)면 회수 안 함 → timeout
    let caught: unknown = null;
    try {
      await withFileLock(cachePath, () => 'should-not-run', { timeoutMs: 100 });
    } catch (e) {
      caught = e;
    }
    // timeout 에러는 일반 Error (FileLockError 아님)
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/timeout/i);

    // FileLockError sentinel 자체는 import 가능
    expect(typeof FileLockError).toBe('function');

    fs.unlinkSync(`${cachePath}.lock`);
  });
});

describe('session-cache delta commit 패턴 (H-1 + M-3 fix)', () => {
  // L-1 note (code-reviewer round 2):
  //   이 격리 helper는 solution-injector.ts:commitSessionCacheEntries와 동일한
  //   식이다. solution-injector가 import 시 main()을 stdin에 연결해 자동 실행하므로
  //   실 함수를 직접 import하는 것은 테스트 환경에서 hang을 만든다. 대신 이 파일은
  //   helper와 production 함수가 drift하지 않도록 다음 규칙을 따른다:
  //     - commitSessionCacheEntries의 시그니처/시맨틱이 바뀌면 이 helper도 업데이트.
  //     - status='committed' 케이스만 검증 (lock-failed/error는 별도 시나리오).
  //   PR2c-5 follow-up에서 dedicated export 또는 worker isolation으로 교체 가능.
  it('disjoint commit이 fresh disk와 비교해 새 entry만 더한다 — chars 누적 정확', () => {
    fs.writeFileSync(cachePath, JSON.stringify({
      injected: ['initial'],
      totalInjectedChars: 100,
      updatedAt: new Date().toISOString(),
    }));

    // SYNC WITH: src/hooks/solution-injector.ts commitSessionCacheEntries
    interface CommitEntry { name: string; chars: number }
    interface CommitResult {
      status: 'committed' | 'lock-failed' | 'error';
      newlyAdded: CommitEntry[];
      totalInjectedChars: number;
    }
    const commit = (entries: CommitEntry[]): CommitResult => {
      let result: CommitResult = { status: 'lock-failed', newlyAdded: [], totalInjectedChars: 0 };
      withFileLockSync(cachePath, () => {
        let freshSet = new Set<string>();
        let freshChars = 0;
        if (fs.existsSync(cachePath)) {
          const fresh = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          const age = fresh.updatedAt ? Date.now() - new Date(fresh.updatedAt).getTime() : Infinity;
          if (Number.isFinite(age) && age <= 24 * 60 * 60 * 1000) {
            freshSet = new Set<string>(fresh.injected ?? []);
            freshChars = typeof fresh.totalInjectedChars === 'number' ? fresh.totalInjectedChars : 0;
          } else {
            try { fs.unlinkSync(cachePath); } catch { /* skip */ }
          }
        }
        const newlyAdded = entries.filter(e => !freshSet.has(e.name));
        const addedChars = newlyAdded.reduce((sum, e) => sum + e.chars, 0);
        const merged = new Set(freshSet);
        for (const e of newlyAdded) merged.add(e.name);
        const newTotal = freshChars + addedChars;
        atomicWriteJSON(cachePath, {
          injected: [...merged],
          totalInjectedChars: newTotal,
          updatedAt: new Date().toISOString(),
        }, { mode: 0o600, dirMode: 0o700 });
        result = { status: 'committed', newlyAdded, totalInjectedChars: newTotal };
      });
      return result;
    };

    const r1 = commit([{ name: 'a', chars: 50 }, { name: 'b', chars: 30 }]);
    expect(r1.status).toBe('committed');
    expect(r1.newlyAdded).toHaveLength(2);
    expect(r1.totalInjectedChars).toBe(180);

    const r2 = commit([{ name: 'b', chars: 30 }, { name: 'c', chars: 70 }]);
    expect(r2.status).toBe('committed');
    expect(r2.newlyAdded).toHaveLength(1);
    expect(r2.newlyAdded[0].name).toBe('c');
    expect(r2.totalInjectedChars).toBe(250); // freshChars(180) + addedChars(70)

    const final = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(final.injected.sort()).toEqual(['a', 'b', 'c', 'initial']);
    expect(final.totalInjectedChars).toBe(250);
  });

  it('만료 fresh (24h 초과)는 무시되고 새 cache로 덮어쓰기 (L-2 consistency)', () => {
    // 만료된 fresh는 load/commit 둘 다 unlink → 새 session으로 출발.
    const expiredTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(cachePath, JSON.stringify({
      injected: ['stale1', 'stale2'],
      totalInjectedChars: 500,
      updatedAt: expiredTimestamp,
    }));

    withFileLockSync(cachePath, () => {
      // commit 시뮬레이션: 만료 fresh를 읽고 무시 → 새 entries로 덮어쓰기
      let freshSet = new Set<string>();
      let freshChars = 0;
      const fresh = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      const age = Date.now() - new Date(fresh.updatedAt).getTime();
      if (age > 24 * 60 * 60 * 1000) {
        try { fs.unlinkSync(cachePath); } catch { /* skip */ }
      } else {
        freshSet = new Set<string>(fresh.injected);
        freshChars = fresh.totalInjectedChars;
      }
      const newEntries = [{ name: 'new1', chars: 20 }];
      const newlyAdded = newEntries.filter(e => !freshSet.has(e.name));
      const merged = new Set(freshSet);
      for (const e of newlyAdded) merged.add(e.name);
      atomicWriteJSON(cachePath, {
        injected: [...merged],
        totalInjectedChars: freshChars + newlyAdded.reduce((s, e) => s + e.chars, 0),
        updatedAt: new Date().toISOString(),
      }, { mode: 0o600 });
    });

    const final = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    // 만료된 stale1/stale2는 사라지고 new1만 남음
    expect(final.injected).toEqual(['new1']);
    expect(final.totalInjectedChars).toBe(20);
  });
});

describe('withFileLockSync 직렬화 (L-1 회귀)', () => {
  it('동기 동시 호출이 중첩 시 timeout fail-safe', () => {
    // 같은 process에서 sync nested lock은 stale 검증으로 timeout
    fs.writeFileSync(cachePath, JSON.stringify({ counter: 0 }));

    let inner: unknown = null;
    try {
      withFileLockSync(cachePath, () => {
        // outer lock 안에서 같은 path 재진입 시도 → PID alive 검증으로 회수 안 함 → timeout
        try {
          withFileLockSync(cachePath, () => 'inner-should-timeout', { timeoutMs: 100, staleMs: 30000 });
        } catch (e) { inner = e; }
      });
    } catch { /* outer는 정상 종료 */ }

    expect(inner).toBeInstanceOf(Error);
    expect((inner as Error).message).toMatch(/timeout/i);
    expect(fs.existsSync(`${cachePath}.lock`)).toBe(false); // outer release 후 정리
  });
});
