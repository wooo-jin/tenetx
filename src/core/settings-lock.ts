/**
 * settings-lock — settings.json 동시접근 보호 유틸리티
 *
 * acquireLock/releaseLock + atomicWriteFileSync 패턴을
 * settings.json을 조작하는 모든 모듈에서 재사용합니다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from './logger.js';

const log = createLogger('settings-lock');

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
export const SETTINGS_BACKUP_PATH = path.join(CLAUDE_DIR, 'settings.json.tenetx-backup');
const SETTINGS_LOCK_PATH = path.join(CLAUDE_DIR, 'settings.json.lock');

/** lockfile 내용에서 pid 추출 */
function readLockPid(): number | null {
  try {
    const content = fs.readFileSync(SETTINGS_LOCK_PATH, 'utf-8').trim();
    const pid = parseInt(content, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** 프로세스가 살아있는지 확인 (signal 0 전송) */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** lockfile 획득 (최대 3초 대기, 100ms 간격 재시도) */
export function acquireLock(): void {
  const maxWaitMs = 3000;
  const intervalMs = 100;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      fs.writeFileSync(SETTINGS_LOCK_PATH, String(process.pid), { flag: 'wx' });
      return; // 성공
    } catch {
      // lock 파일이 이미 존재 — 대기 후 재시도
      const elapsed = Date.now() - start;
      if (elapsed + intervalMs >= maxWaitMs) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, intervalMs);
    }
  }
  // 타임아웃: lock을 잡고 있는 프로세스가 살아있는지 확인
  const lockPid = readLockPid();
  if (lockPid !== null && isProcessAlive(lockPid)) {
    log.debug(`lockfile 타임아웃 — pid ${lockPid} 프로세스가 아직 활성 상태, 대기 중 강제 획득 보류`);
    // 프로세스가 살아있으면 그래도 강제 획득 (데드락 방지)
  } else {
    log.debug(`lockfile 타임아웃 — stale lock 감지 (pid: ${lockPid ?? 'unknown'}, 프로세스 종료됨)`);
  }
  fs.writeFileSync(SETTINGS_LOCK_PATH, String(process.pid));
}

/** lockfile 해제 */
export function releaseLock(): void {
  try {
    fs.rmSync(SETTINGS_LOCK_PATH, { force: true });
  } catch { /* 이미 없으면 무시 */ }
}

/** 임시파일에 쓴 후 rename으로 원자적 교체 */
export function atomicWriteFileSync(targetPath: string, data: string): void {
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, targetPath);
}

/**
 * settings.json 안전 읽기.
 * 파일이 없으면 빈 객체 반환. 파싱 실패 시 Error throw (빈 설정 덮어쓰기 방지).
 */
export function readSettings(): Record<string, unknown> {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
  return JSON.parse(raw); // 파싱 실패 시 throw → 호출자가 처리
}

/** settings.json 안전 쓰기. backup 생성 + lock + atomic write */
export function writeSettings(settings: Record<string, unknown>): void {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  acquireLock();
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      fs.copyFileSync(SETTINGS_PATH, SETTINGS_BACKUP_PATH);
    }
    atomicWriteFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } finally {
    releaseLock();
  }
}

/** settings.json.tenetx-backup 파일에서 원본 복원 */
export function rollbackSettings(): boolean {
  if (!fs.existsSync(SETTINGS_BACKUP_PATH)) return false;
  acquireLock();
  try {
    const backup = fs.readFileSync(SETTINGS_BACKUP_PATH, 'utf-8');
    atomicWriteFileSync(SETTINGS_PATH, backup);
    fs.rmSync(SETTINGS_BACKUP_PATH);
    return true;
  } catch {
    return false;
  } finally {
    releaseLock();
  }
}
