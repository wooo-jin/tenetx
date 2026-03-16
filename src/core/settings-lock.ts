/**
 * settings-lock — settings.json 동시접근 보호 유틸리티
 *
 * acquireLock/releaseLock + atomicWriteFileSync 패턴을
 * settings.json을 조작하는 모든 모듈에서 재사용합니다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from './logger.js';

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
export const SETTINGS_BACKUP_PATH = path.join(CLAUDE_DIR, 'settings.json.tenet-backup');
const SETTINGS_LOCK_PATH = path.join(CLAUDE_DIR, 'settings.json.lock');

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
  // 타임아웃: stale lock일 수 있으므로 강제 획득
  debugLog('settings-lock', 'lockfile 타임아웃 — stale lock 강제 해제');
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

/** settings.json.tenet-backup 파일에서 원본 복원 */
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
