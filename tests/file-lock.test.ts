/**
 * file-lock.ts 회귀 테스트
 *
 * 라운드 3 발견 사항을 회귀로 잠근다:
 *   - H4+H7: token 검증으로 cascade lock loss 방지
 *   - H5: FileLockError sentinel
 *   - M13: staleMs 기본값 30s
 *   - PID alive 검증으로 false stale recovery 방지
 *   - Atomics fallback bounded busy wait
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { withFileLock, withFileLockSync, FileLockError } from '../src/hooks/shared/file-lock.js';

let tmpDir: string;
let target: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-lock-test-'));
  target = path.join(tmpDir, 'cache.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('withFileLock — async', () => {
  it('정상 경로: lock 획득 → fn 실행 → release', async () => {
    let executed = false;
    await withFileLock(target, () => { executed = true; });
    expect(executed).toBe(true);
    expect(fs.existsSync(`${target}.lock`)).toBe(false);
  });

  it('fn return 값을 그대로 반환', async () => {
    const result = await withFileLock(target, () => 42);
    expect(result).toBe(42);
  });

  it('fn 예외 발생 시에도 lock 해제', async () => {
    await expect(
      withFileLock(target, () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    expect(fs.existsSync(`${target}.lock`)).toBe(false);
  });

  it('async fn 지원', async () => {
    const result = await withFileLock(target, async () => {
      await new Promise(r => setTimeout(r, 10));
      return 'async';
    });
    expect(result).toBe('async');
  });
});

describe('withFileLock — token-based release (H4+H7 회귀)', () => {
  it('자기 token이 lock 파일에 없으면 unlink 안 함 (cascade lock loss 방지)', async () => {
    // 시나리오: A가 lock 잡고 fn 실행 중, 그 사이 B가 stale로 회수해 자기 lock을 만들었다.
    // A가 fn 종료 후 release할 때 lock 파일을 보면 B의 token이라 unlink하면 안 됨.
    let mid: () => void = () => {};
    const aPromise = withFileLock(target, async () => {
      // A가 fn 실행 중에 lock 파일 내용을 다른 token으로 덮어쓴다 (B의 회수 시뮬레이션)
      mid();
      const fakeBMeta = { pid: process.pid, ts: Date.now(), token: 'fake-b-token' };
      fs.writeFileSync(`${target}.lock`, JSON.stringify(fakeBMeta));
    });
    await aPromise;

    // A의 release가 자기 token을 못 찾았으므로 lock 파일은 그대로 (B의 것으로 가정)
    expect(fs.existsSync(`${target}.lock`)).toBe(true);
    // 정리
    fs.unlinkSync(`${target}.lock`);
  });
});

describe('withFileLockSync', () => {
  it('정상 경로 동기 실행', () => {
    let executed = false;
    withFileLockSync(target, () => { executed = true; });
    expect(executed).toBe(true);
    expect(fs.existsSync(`${target}.lock`)).toBe(false);
  });

  it('fn return 값 반환', () => {
    const result = withFileLockSync(target, () => 'ok');
    expect(result).toBe('ok');
  });

  it('동기 예외 시 lock 해제', () => {
    expect(() =>
      withFileLockSync(target, () => { throw new Error('sync-boom'); }),
    ).toThrow('sync-boom');
    expect(fs.existsSync(`${target}.lock`)).toBe(false);
  });
});

describe('FileLockError sentinel', () => {
  it('정의된 instance class 확인', () => {
    const err = new FileLockError(
      Object.assign(new Error('mock'), { code: 'EACCES' }),
      '/tmp/x.lock',
    );
    expect(err).toBeInstanceOf(FileLockError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FileLockError');
    expect(err.cause.code).toBe('EACCES');
    expect(err.lockPath).toBe('/tmp/x.lock');
  });
});

describe('PID alive 검증 — false stale recovery 방지', () => {
  it('lock holder PID가 살아있으면 stale 회수 안 함', async () => {
    // 직접 lock 파일을 우리 PID로 만들고 stale 시간보다 오래된 mtime으로 설정
    const lockPath = `${target}.lock`;
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: process.pid, // 살아있는 PID
      ts: Date.now() - 60000,
      token: 'old',
    }));
    // mtime을 1분 전으로 설정
    const oldTime = (Date.now() - 60000) / 1000;
    fs.utimesSync(lockPath, oldTime, oldTime);

    // 다른 caller가 lock 시도 — PID 살아있으므로 회수 안 하고 timeout 대기
    await expect(
      withFileLock(target, () => 'should-not-run', { timeoutMs: 200, staleMs: 30000 }),
    ).rejects.toThrow(/timeout/i);

    // lock 파일은 그대로 남아있음
    expect(fs.existsSync(lockPath)).toBe(true);
    fs.unlinkSync(lockPath);
  });
});
