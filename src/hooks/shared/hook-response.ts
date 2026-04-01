/**
 * Tenetx — Hook Response Utilities
 *
 * Claude Code Plugin SDK 공식 형식에 맞는 훅 응답 생성.
 *
 * 공식 형식 (검증 완료 — claude-code 소스 기반):
 *   hookSpecificOutput은 discriminated union이며 hookEventName이 필수.
 *   - PreToolUse: { hookEventName, permissionDecision, permissionDecisionReason? }
 *   - UserPromptSubmit: { hookEventName, additionalContext? }
 *   - SessionStart: { hookEventName, additionalContext?, initialUserMessage? }
 *
 * 주의:
 *   systemMessage 필드는 UI 표시용으로만 사용되며 모델에 전달되지 않음.
 *   모델에 컨텍스트를 주입하려면 반드시 additionalContext를 사용해야 함.
 */

/** 통과 응답 (컨텍스트 없음, 모든 이벤트 공통) */
export function approve(): string {
  return JSON.stringify({ continue: true });
}

/**
 * 통과 + 모델에 컨텍스트 주입.
 * UserPromptSubmit, SessionStart 이벤트에서만 모델에 도달함.
 */
export function approveWithContext(context: string, eventName: string): string {
  return JSON.stringify({
    continue: true,
    hookSpecificOutput: { hookEventName: eventName, additionalContext: context },
  });
}

/**
 * 통과 + UI 경고 표시 (모델에는 전달되지 않음).
 * PostToolUse, PreToolUse 경고 등 모델 도달이 불필요한 경우 사용.
 */
export function approveWithWarning(warning: string): string {
  return JSON.stringify({ continue: true, suppressOutput: false, systemMessage: warning });
}

/** 차단 응답 (PreToolUse 전용) */
export function deny(reason: string): string {
  return JSON.stringify({
    continue: false,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

/** 사용자 확인 요청 (PreToolUse 전용) */
export function ask(reason: string): string {
  return JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  });
}

/** fail-open: 에러 시 안전하게 통과 */
export function failOpen(): string {
  return JSON.stringify({ continue: true });
}
