/**
 * Tenetx — Injection Caps
 *
 * 컨텍스트 주입 하드캡 상수. 다른 플러그인과 공존 시 컨텍스트 윈도우를
 * 과도하게 점유하지 않도록 각 훅의 최대 주입량을 제한합니다.
 *
 * 이 값들은 어댑티브 버짓 시스템의 "절대 상한"이며,
 * 실제 주입량은 context-budget.ts에서 동적으로 조절됩니다.
 */

export const INJECTION_CAPS = {
  /** notepad-injector: 노트패드 최대 주입 글자 수 (현재: 무제한 → 2000) */
  notepadMax: 2000,

  /** skill-injector: 스킬 파일 하나당 최대 글자 수 (현재: 무제한 → 3000) */
  skillContentMax: 3000,

  /** solution-injector: 솔루션 하나당 최대 글자 수 (기존 값 유지) */
  solutionMax: 1500,

  /** solution-injector: 세션 전체 주입 상한 (기존 값 유지) */
  solutionSessionMax: 8000,
} as const;

/**
 * .claude/rules/ 자동생성 파일의 사이즈 하드캡.
 * rules 파일은 Claude Code가 세션 시작 시 전부 로드하므로
 * 무제한 성장을 방지해야 합니다.
 *
 * 근거: Claude Code 공식 권장 — "CLAUDE.md 파일당 200줄 이하",
 * "길수록 지시 준수율 저하". 3000자 ≈ 60~80줄.
 */
export const RULE_FILE_CAPS = {
  /** .claude/rules/ 파일 1개당 최대 글자 수 */
  perRuleFile: 3000,

  /** .claude/rules/에 tenetx가 쓸 수 있는 총량 (글자) */
  totalRuleFiles: 15000,

  /** compound.md에 포함할 rule summary 최대 수 */
  maxRuleSummaries: 10,
} as const;

/** truncation 시 끝에 추가되는 표시 */
export const TRUNCATION_SUFFIX = '\n... (truncated)';

/** 주어진 content를 maxChars로 잘라서 반환. 초과 시 truncation suffix 추가. */
export function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const cutAt = Math.max(0, maxChars - TRUNCATION_SUFFIX.length);
  let sliced = content.slice(0, cutAt);

  // UTF-16 서로게이트 쌍 분리 방지: 마지막 문자가 high surrogate이면 제거
  if (sliced.length > 0) {
    const lastCode = sliced.charCodeAt(sliced.length - 1);
    if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
      sliced = sliced.slice(0, -1);
    }
  }

  return sliced + TRUNCATION_SUFFIX;
}
