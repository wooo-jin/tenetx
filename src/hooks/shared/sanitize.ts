/**
 * 훅 공유 유틸: 키워드/트리거 감지용 프롬프트 정제
 *
 * 코드 블록, URL, XML 태그, 파일 경로를 제거하여
 * 순수 텍스트에서만 키워드를 감지할 수 있게 합니다.
 */

export function sanitizeForDetection(prompt: string): string {
  let sanitized = prompt;
  // 코드 블록 제거 (```...```)
  sanitized = sanitized.replace(/```[\s\S]*?```/g, '');
  // 인라인 코드 제거 (`...`)
  sanitized = sanitized.replace(/`[^`]+`/g, '');
  // URL 제거
  sanitized = sanitized.replace(/https?:\/\/\S+/g, '');
  // XML 태그 블록 제거 (열고 닫는 태그 이름 일치)
  sanitized = sanitized.replace(/<(\w[\w-]*)[\s>][\s\S]*?<\/\1>/g, '');
  // 자체 폐쇄 태그 제거
  sanitized = sanitized.replace(/<\w[\w-]*(?:\s[^>]*)?\s*\/>/g, '');
  // 파일 경로 제거 (multi-segment 포함)
  sanitized = sanitized.replace(/(^|[\s"'`(])(?:\.?\/(?:[\w.-]+\/)*[\w.-]+|(?:[\w.-]+\/)+[\w.-]+\.\w+)/gm, '$1');
  return sanitized;
}
