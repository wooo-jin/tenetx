/**
 * 파일 단위 advisory lock — read-modify-write race 방지
 *
 * 문제:
 *   - injection cache를 여러 hook(solution-injector / pre-tool-use / backfill)이
 *     read → modify → write 패턴으로 갱신하지만 락이 없어서 last-writer-wins.
 *   - rename atomicity는 찢어진 JSON만 막을 뿐, 동시 mutator의 변경을 보존하지 못한다.
 *
 * 해결:
 *   - O_EXCL로 `${target}.lock` 파일 생성 → exclusive lock.
 *   - withFileLock() 안에서 호출되는 fn은 fresh re-read 후 mutate해야 함.
 *   - lock holder가 죽어 stale lock이 남으면 mtime + PID 검증으로 안전 회수.
 *   - lock 파일에 randomBytes token 기록, release 시 token 일치할 때만 unlink
 *     → cascade lock loss 방지 (H4+H7 fix).
 *
 * 외부 의존성 없음. 다중 OS 호환 (POSIX + Windows).
 *
 * Windows 한계:
 *   - file-lock 자체는 동작하지만, 같은 process의 다른 fd가 lock 파일을 read하지
 *     못하게 막지는 않는다 (advisory lock).
 *   - lock 파일 mode 0o600은 POSIX에서만 의미. Windows는 ACL 기반.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

// L1 hardening: O_NOFOLLOW로 symlink 공격 차단 (POSIX only).
// Windows에는 정의되지 않으므로 0으로 fallback (no-op flag).
const O_NOFOLLOW = (fs.constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;

const DEFAULT_TIMEOUT_MS = 2000;
/**
 * staleMs는 fn 실행 시간 상한 + 안전 여유. 5초는 너무 짧아서 정상 holder가
 * 5.x초 fn 실행 중일 때 다른 holder가 stale로 가로챌 수 있었다 (M13).
 * 30초로 늘려 일반 cache 갱신은 안전 마진 확보.
 *
 * backfill 같은 짧은 fn은 호출자가 staleMs를 단축할 수 있다.
 */
const DEFAULT_STALE_MS = 30000;
const RETRY_MIN_MS = 5;
const RETRY_MAX_MS = 25;

export interface FileLockOptions {
  /** 락 획득 최대 대기 시간 (ms). 초과 시 throw. */
  timeoutMs?: number;
  /** 이만큼 오래된 lock 파일은 stale로 간주하고 강제 회수 (ms). */
  staleMs?: number;
}

/**
 * file-lock 자체 결함 (Sentinel).
 * caller try/catch가 lock 결함과 fn 실패를 구분할 수 있도록 별도 클래스.
 */
export class FileLockError extends Error {
  constructor(public readonly cause: NodeJS.ErrnoException, public readonly lockPath: string) {
    // PR2c-4 (security M-3): basename만 노출. 전체 path는 sessionId를 포함하므로
    // 로그에 남으면 정보 노출 위험. 디버그 시 caller가 e.lockPath로 명시 접근 가능.
    super(`File lock failure on ${path.basename(lockPath)}: ${cause.code ?? cause.message}`);
    this.name = 'FileLockError';
  }
}

interface LockMeta {
  pid: number;
  ts: number;
  token: string;
}

/**
 * lock 파일 내용을 파싱한다. 손상된 lock은 null 반환.
 */
function readLockMeta(lockPath: string): LockMeta | null {
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    const meta = JSON.parse(raw);
    if (typeof meta.pid !== 'number' || typeof meta.ts !== 'number' || typeof meta.token !== 'string') {
      return null;
    }
    return meta;
  } catch {
    return null;
  }
}

/**
 * PID가 살아있는지 확인한다 (POSIX).
 * Windows에서는 process.kill(pid, 0)이 동작하지 않으므로 항상 true 반환.
 */
function isPidAlive(pid: number): boolean {
  if (process.platform === 'win32') return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code !== 'ESRCH';
  }
}

/**
 * stale lock이면 안전하게 회수 시도. 회수 성공하면 true.
 * - mtime 기반 + PID alive 검증으로 false positive 줄임.
 * - 다른 holder가 그 사이에 lock을 잡은 경우는 회수하지 않음.
 *
 * Race window 분석 (R-M1 주석 보강):
 *   statSync(102)와 readLockMeta(108) 사이에 holder 교체가 일어날 수 있다.
 *   즉, mtime이 stale 기준을 통과한 시점에 첫 holder가 release하고 두 번째
 *   holder가 lock을 잡으면, 우리가 읽는 meta는 새 holder의 것이다.
 *   그러나 새 holder의 PID는 보통 alive이므로 isPidAlive 가드에서 false 반환
 *   → 회수 안 함. fail-safe 방향으로 동작한다.
 *   PID가 dead인 케이스에만 unlink하므로 잘못된 회수 위험은 매우 낮다.
 */
function tryRecoverStaleLock(lockPath: string, staleMs: number): boolean {
  let lockStat: fs.Stats;
  try {
    lockStat = fs.statSync(lockPath);
  } catch {
    return true; // lock 사라짐 — 즉시 재시도
  }
  if (Date.now() - lockStat.mtimeMs <= staleMs) return false;

  const meta = readLockMeta(lockPath);
  // PID 살아있으면 회수 안 함 (정상 long-running holder).
  // stat-meta race에서 새 holder를 본 경우에도 여기서 fail-safe로 차단.
  if (meta && isPidAlive(meta.pid)) return false;

  // 회수 시도. 그 사이 다른 holder가 잡았을 수 있으므로 unlink는 best-effort.
  try { fs.unlinkSync(lockPath); } catch { /* 이미 회수됐을 수 있음 */ }
  return true;
}

/**
 * 락을 획득한 후 fn을 실행하고, 끝나면 락을 해제한다.
 *
 * fn은 동기 또는 async 모두 지원. 예외가 발생해도 락은 항상 해제된다.
 *
 * release 시 lock token을 검증해 자기가 만든 lock만 unlink한다 (H4+H7 fix).
 *
 * 사용 예:
 * ```ts
 * await withFileLock(cachePath, () => {
 *   const fresh = readCacheFromDisk(cachePath); // lock 안에서 fresh re-read
 *   const merged = mergeWithUpdates(fresh);
 *   atomicWriteJSON(cachePath, merged, { mode: 0o600 });
 * });
 * ```
 */
export async function withFileLock<T>(
  targetPath: string,
  fn: () => T | Promise<T>,
  options?: FileLockOptions,
): Promise<T> {
  const lockPath = `${targetPath}.lock`;
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stale = options?.staleMs ?? DEFAULT_STALE_MS;
  const start = Date.now();
  const myToken = randomBytes(16).toString('hex');

  let acquired = false;
  while (!acquired) {
    try {
      // O_EXCL: 파일이 이미 존재하면 EEXIST 반환
      // O_NOFOLLOW: symlink 공격 차단 (POSIX only, Windows는 0으로 fallback)
      const fd = fs.openSync(
        lockPath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW,
        0o600,
      );
      try {
        const meta: LockMeta = { pid: process.pid, ts: Date.now(), token: myToken };
        fs.writeSync(fd, JSON.stringify(meta));
      } finally {
        fs.closeSync(fd);
      }
      acquired = true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        // EACCES, EXDEV, ENOSPC 등 — sentinel error로 wrap (H5 fix)
        throw new FileLockError(e as NodeJS.ErrnoException, lockPath);
      }

      // 이미 lock이 있음 — stale 검증 후 회수 시도
      if (tryRecoverStaleLock(lockPath, stale)) {
        continue;
      }

      if (Date.now() - start > timeout) {
        throw new Error(`File lock timeout after ${timeout}ms`);
      }

      // 짧은 backoff (jitter 포함)
      const wait = RETRY_MIN_MS + Math.floor(Math.random() * (RETRY_MAX_MS - RETRY_MIN_MS));
      await new Promise(r => setTimeout(r, wait));
    }
  }

  try {
    return await fn();
  } finally {
    // H4+H7 fix: token 검증 후에만 unlink. stale recovery로 다른 holder가
    // 잡은 lock을 우리가 지우지 않도록 보장.
    try {
      const meta = readLockMeta(lockPath);
      if (meta && meta.token === myToken) {
        fs.unlinkSync(lockPath);
      }
      // token 다르면 stale로 회수당한 후 다른 holder가 잡은 것 — 건드리지 않음
    } catch { /* lock 이미 사라짐 */ }
  }
}

/** 동기 버전 — async fn을 받지 않음. setTimeout 대신 짧은 spin으로 대기. */
export function withFileLockSync<T>(
  targetPath: string,
  fn: () => T,
  options?: FileLockOptions,
): T {
  const lockPath = `${targetPath}.lock`;
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stale = options?.staleMs ?? DEFAULT_STALE_MS;
  const start = Date.now();
  const myToken = randomBytes(16).toString('hex');

  let acquired = false;
  while (!acquired) {
    try {
      // M-1 fix: sync 경로도 async와 동일하게 O_NOFOLLOW로 symlink 차단
      const fd = fs.openSync(
        lockPath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW,
        0o600,
      );
      try {
        const meta: LockMeta = { pid: process.pid, ts: Date.now(), token: myToken };
        fs.writeSync(fd, JSON.stringify(meta));
      } finally {
        fs.closeSync(fd);
      }
      acquired = true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw new FileLockError(e as NodeJS.ErrnoException, lockPath);
      }

      if (tryRecoverStaleLock(lockPath, stale)) {
        continue;
      }

      if (Date.now() - start > timeout) {
        throw new Error(`File lock timeout after ${timeout}ms`);
      }

      // 동기 spin: Atomics.wait로 짧게 대기 (이벤트 루프 블로킹은 의도된 것)
      const wait = RETRY_MIN_MS + Math.floor(Math.random() * (RETRY_MAX_MS - RETRY_MIN_MS));
      try {
        const sab = new SharedArrayBuffer(4);
        const view = new Int32Array(sab);
        Atomics.wait(view, 0, 0, wait);
      } catch {
        // SharedArrayBuffer/Atomics 미지원 환경 — bounded busy wait로 폴백
        // (Cloudflare Workers 등에서 throw 후 즉시 다음 iteration 진입 방지)
        const end = Date.now() + wait;
        while (Date.now() < end) { /* bounded busy wait */ }
      }
    }
  }

  try {
    return fn();
  } finally {
    try {
      const meta = readLockMeta(lockPath);
      if (meta && meta.token === myToken) {
        fs.unlinkSync(lockPath);
      }
    } catch { /* skip */ }
  }
}
