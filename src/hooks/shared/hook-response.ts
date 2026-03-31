/**
 * Tenetx — Hook Response Utilities
 *
 * Claude Code Plugin SDK 공식 형식에 맞는 훅 응답 생성.
 * 모든 훅에서 이 유틸리티를 사용하여 일관된 출력을 보장합니다.
 *
 * 공식 형식:
 *   { continue: boolean, suppressOutput?: boolean, systemMessage?: string }
 *   PreToolUse: { hookSpecificOutput: { permissionDecision: "allow"|"deny"|"ask" }, systemMessage?: string }
 *
 * 하위 호환:
 *   기존 { result: "approve"|"reject", message?: string } 형식도
 *   Claude Code가 수용하므로 점진적 마이그레이션 가능.
 */

/** 표준 훅 응답 (모든 이벤트 공통) */
export function approve(systemMessage?: string): string {
  if (systemMessage) {
    return JSON.stringify({ continue: true, suppressOutput: false, systemMessage });
  }
  return JSON.stringify({ continue: true });
}

/** 차단 응답 (PreToolUse에서 도구 실행 차단) */
export function deny(systemMessage: string): string {
  return JSON.stringify({
    continue: false,
    hookSpecificOutput: { permissionDecision: 'deny' },
    systemMessage,
  });
}

/** 사용자 확인 요청 (PreToolUse) */
export function ask(systemMessage: string): string {
  return JSON.stringify({
    continue: true,
    hookSpecificOutput: { permissionDecision: 'ask' },
    systemMessage,
  });
}

/** fail-open: 에러 시 안전하게 통과 */
export function failOpen(): string {
  return JSON.stringify({ continue: true });
}
