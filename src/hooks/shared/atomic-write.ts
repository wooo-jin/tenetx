/**
 * 훅 공유 유틸: 원자적 파일 쓰기
 *
 * write → rename 패턴으로 동시 세션에서의 상태 파일 손상을 방지합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** JSON 데이터를 원자적으로 파일에 기록 (tmp → rename) */
export function atomicWriteJSON(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data));
    fs.renameSync(tmpFile, filePath);
  } catch (e) {
    // rename 실패 시 tmp 파일 정리
    try { fs.unlinkSync(tmpFile); } catch { /* tmp file cleanup — leftover .tmp file is harmless if unlink fails */ }
    throw e;
  }
}
