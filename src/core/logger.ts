/**
 * Tenetx — Debug Logger
 *
 * COMPOUND_DEBUG=1 환경변수가 설정된 경우에만 stderr에 출력합니다.
 * 기본 동작에 영향을 주지 않습니다.
 */

const DEBUG = process.env.COMPOUND_DEBUG === '1';

export function debugLog(context: string, msg: string, error?: unknown): void {
  if (!DEBUG) return;
  const errMsg = error instanceof Error ? error.message : String(error ?? '');
  console.error(`[CH:${context}] ${msg}${errMsg ? `: ${errMsg}` : ''}`);
}
