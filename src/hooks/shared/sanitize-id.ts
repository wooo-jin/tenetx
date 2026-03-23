/**
 * 훅 공유 유틸: session_id / 파일명에 사용되는 ID 정제
 *
 * path traversal 방지를 위해 영숫자, 하이픈, 언더스코어만 허용합니다.
 */

/** ID를 파일명에 안전한 형태로 변환. 위험 문자는 '_'로 치환. */
export function sanitizeId(id: string, maxLength = 128): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLength) || 'default';
}
