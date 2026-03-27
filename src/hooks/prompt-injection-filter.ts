/**
 * Security module for filtering prompt injection attacks from solution content
 * before it gets injected into Claude's context.
 *
 * NOTE: This is a shared utility, NOT a standalone hook.
 * Used by: solution-injector.ts (via import)
 * Exported via: lib.ts (public API for programmatic use)
 * Not registered in hooks.json — intentional.
 */

/** Patterns that indicate prompt injection attempts */
export const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  // English patterns
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?(above|prior)/i,
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /you\s+are\s+now/i,
  /new\s+instructions?\s*:/i,
  /forget\s+(everything|all|previous|your)/i,
  /act\s+as\s+(a|an|if)\b/i,
  /pretend\s+(you|to\s+be)/i,
  /<\s*\/?system\s*>/i,
  /<\s*\/?assistant\s*>/i,
  /<\s*\/?user\s*>/i,
  /<\s*\/?human\s*>/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  // Korean patterns (한국어 프롬프트 인젝션)
  /이전\s*(지시|명령|설정|규칙).*무시/,
  /(모든|전부|앞의|위의)\s*(지시|명령|설정).*무시/,
  /(잊어|잊으|잊어버려|잊어라)/,
  /넌\s+이제부터/,
  /새로운\s*(역할|지시|명령|규칙)/,
  /너(는|의)\s*(역할|정체).*바꿔/,
  /(시스템|어시스턴트)\s*(프롬프트|메시지)/,
  /인척\s*(해|하세요|해봐)/,
];

/** Normalize text for injection detection: strip zero-width chars, NFKC normalize */
export function normalizeForInjectionCheck(text: string): string {
  return text
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '')
    .normalize('NFKC');
}

/**
 * Check if text contains prompt injection patterns.
 * Normalizes Unicode before matching to prevent bypass via homoglyphs/zero-width chars.
 * Returns true if ANY pattern matches.
 */
export function containsPromptInjection(text: string): boolean {
  const normalized = normalizeForInjectionCheck(text);
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Escape ALL XML-like tags in text to prevent tag injection.
 */
export function escapeAllXmlTags(text: string): string {
  return text.replace(/<\/?[a-zA-Z][\w-]*(?:\s[^>]*)?\/?>/g, (match) =>
    match.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  );
}

/**
 * Combined filter: checks for prompt injection and escapes XML tags.
 * Returns sanitized content and whether it is safe to use.
 */
export function filterSolutionContent(text: string): {
  safe: boolean;
  sanitized: string;
  reasons: string[];
} {
  const reasons: string[] = [];
  const normalized = normalizeForInjectionCheck(text);

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      reasons.push(`Matched injection pattern: ${pattern.toString()}`);
    }
  }

  if (reasons.length > 0) {
    return { safe: false, sanitized: '', reasons };
  }

  return { safe: true, sanitized: escapeAllXmlTags(text), reasons: [] };
}
