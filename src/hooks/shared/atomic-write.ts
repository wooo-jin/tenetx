/**
 * 훅 공유 유틸: 원자적 파일 쓰기
 *
 * write → rename 패턴으로 동시 세션에서의 상태 파일 손상을 방지합니다.
 *
 * 보안 모델:
 *   - mode 옵션이 0o600인 파일은 같은 호스트의 다른 user로부터 보호.
 *   - tmp 파일은 PID + randomBytes(6) suffix → 같은 process가 동시 atomic write를
 *     하더라도 tmp 충돌 없음. symlink TOCTOU도 방지.
 *
 * Windows 한계:
 *   - fchmodSync/chmodSync는 Windows에서 read-only 비트만 영향. 0o600 같은
 *     POSIX 권한은 의미가 없으며, 보안은 OS-level ACL과 사용자 home 격리에 의존.
 *   - 민감 데이터는 Windows에서 추가 보호가 필요할 수 있다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { STATE_DIR } from '../../core/paths.js';

// L1 hardening: O_NOFOLLOW로 symlink 공격 차단 (POSIX only).
// Windows에는 정의되지 않으므로 0으로 fallback (no-op flag).
const O_NOFOLLOW = (fs.constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;

/**
 * 부모 디렉터리 생성. 민감한 cache 디렉터리는 0o700으로 강제.
 *
 * H13 fix (security review): caller가 dirMode를 명시 안 해도, STATE_DIR
 * 하위 경로는 자동으로 0o700으로 강제한다. 50+ caller가 dirMode를 매번
 * 명시할 필요 없이 STATE_DIR 권한 보장.
 *
 * 호출자가 명시한 mode가 있으면 그 값을 우선한다.
 */
function ensureDir(dir: string, mode?: number): void {
  // STATE_DIR 자동 감지: caller가 mode 미지정 시에만 0o700 default.
  // STATE_DIR이 undefined인 환경(테스트 mock 등)에선 자동 감지를 skip한다.
  const isStateDir = typeof STATE_DIR === 'string'
    && (dir === STATE_DIR || dir.startsWith(STATE_DIR + path.sep));
  const effectiveMode = mode ?? (isStateDir ? 0o700 : undefined);
  fs.mkdirSync(dir, { recursive: true, ...(effectiveMode !== undefined ? { mode: effectiveMode } : {}) });
  if (effectiveMode !== undefined && process.platform !== 'win32') {
    // mkdirSync mode는 umask 영향을 받으므로 chmod로 강제 (POSIX only)
    try { fs.chmodSync(dir, effectiveMode); } catch { /* non-fatal — ACL 환경 등 */ }
  }
}

/**
 * tmp 파일 경로 생성. PID + random suffix로 충돌 방지 (M17 fix).
 * 같은 process가 같은 디렉터리에 동시 atomic write 해도 안전.
 */
function makeTmpPath(filePath: string): string {
  const suffix = randomBytes(6).toString('hex');
  return `${filePath}.tmp.${process.pid}.${suffix}`;
}

/**
 * JSON 데이터를 원자적으로 파일에 기록 (tmp → rename)
 *
 * @param options.pretty 들여쓴 포맷으로 직렬화
 * @param options.mode   생성될 파일의 권한 (예: 0o600). 기본값은 umask 의존(보통 0o644).
 *                       민감한 캐시(컨텍스트 식별자/태그 포함)에 대해서는 0o600 권장.
 * @param options.dirMode 부모 디렉터리 mode. cache는 0o700 권장.
 *
 * 권한 보장 (M6+M16+M17 fix):
 *   1. tmp 파일이 random suffix → 다른 fd 충돌 없음 (Promise.all 안전).
 *   2. fd 단위 fchmodSync로 새 inode 권한 강제.
 *   3. post-rename chmodSync 실패는 throw — 느슨한 권한 침묵 방지.
 *   4. Windows에서는 위 mode가 무효일 수 있으나, OS-level ACL이 일반적으로 user 격리.
 */
export function atomicWriteJSON(
  filePath: string,
  data: unknown,
  options?: { pretty?: boolean; mode?: number; dirMode?: number },
): void {
  const dir = path.dirname(filePath);
  ensureDir(dir, options?.dirMode);
  const tmpFile = makeTmpPath(filePath);
  try {
    const json = options?.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    // O_EXCL: 새 inode 생성 보장 / O_NOFOLLOW: symlink 공격 차단 (POSIX only)
    const fd = fs.openSync(tmpFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW, options?.mode ?? 0o644);
    try {
      fs.writeFileSync(fd, json);
      if (options?.mode !== undefined) {
        // fd 단위 fchmod로 새 inode 권한 강제 (POSIX only — Windows no-op)
        try { fs.fchmodSync(fd, options.mode); } catch { /* Windows fallback */ }
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpFile, filePath);
    if (options?.mode !== undefined && process.platform !== 'win32') {
      // POSIX: rename 후에도 명시적 chmod로 보장. 실패 시 throw (M6).
      // Windows: chmodSync가 read-only 비트만 영향. 의미 없으므로 skip.
      fs.chmodSync(filePath, options.mode);
    }
  } catch (e) {
    // rename 실패 시 tmp 파일 정리
    try { fs.unlinkSync(tmpFile); } catch { /* tmp file cleanup — leftover .tmp file is harmless if unlink fails */ }
    throw e;
  }
}

/** 텍스트를 원자적으로 파일에 기록 (tmp → rename) */
export function atomicWriteText(
  filePath: string,
  content: string,
  options?: { mode?: number; dirMode?: number },
): void {
  const dir = path.dirname(filePath);
  ensureDir(dir, options?.dirMode);
  const tmpFile = makeTmpPath(filePath);
  try {
    // O_EXCL: 새 inode 생성 보장 / O_NOFOLLOW: symlink 공격 차단 (POSIX only)
    const fd = fs.openSync(tmpFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW, options?.mode ?? 0o644);
    try {
      fs.writeFileSync(fd, content, 'utf-8');
      if (options?.mode !== undefined) {
        try { fs.fchmodSync(fd, options.mode); } catch { /* Windows fallback */ }
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpFile, filePath);
    if (options?.mode !== undefined && process.platform !== 'win32') {
      fs.chmodSync(filePath, options.mode);
    }
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch { /* cleanup */ }
    throw e;
  }
}

/** JSON 파일을 안전하게 읽기 (파싱 실패 시 fallback 반환) */
export function safeReadJSON<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch { /* JSON parse failure — return fallback */ }
  return fallback;
}
