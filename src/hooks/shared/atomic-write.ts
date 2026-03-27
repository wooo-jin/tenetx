/**
 * 훅 공유 유틸: 원자적 파일 쓰기
 *
 * write → rename 패턴으로 동시 세션에서의 상태 파일 손상을 방지합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** JSON 데이터를 원자적으로 파일에 기록 (tmp → rename) */
export function atomicWriteJSON(filePath: string, data: unknown, options?: { pretty?: boolean }): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  try {
    const json = options?.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    fs.writeFileSync(tmpFile, json);
    fs.renameSync(tmpFile, filePath);
  } catch (e) {
    // rename 실패 시 tmp 파일 정리
    try { fs.unlinkSync(tmpFile); } catch { /* tmp file cleanup — leftover .tmp file is harmless if unlink fails */ }
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
