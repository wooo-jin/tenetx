/**
 * Security module for filtering prompt injection attacks from solution content
 * before it gets injected into Claude's context.
 *
 * NOTE: This is a shared utility, NOT a standalone hook.
 * Used by: solution-injector.ts (via import)
 * Exported via: lib.ts (public API for programmatic use)
 * Not registered in hooks.json — intentional.
 */

// ── Type contracts ─────────────────────────────────────────────────────────

type Severity = 'block' | 'warn';
type Category = 'injection' | 'exfiltration' | 'obfuscation';

interface SecurityPattern {
  id: string;
  pattern: RegExp;
  severity: Severity;
  category: Category;
}

export interface ScanFinding {
  patternId: string;
  severity: Severity;
  category: Category;
  matchedText: string;
}

export interface ScanResult {
  verdict: 'safe' | 'warn' | 'block';
  findings: ScanFinding[];
  sanitized: string;
}

// ── Pattern registry ───────────────────────────────────────────────────────

/** Structured security patterns with severity and category metadata */
export const SECURITY_PATTERNS: SecurityPattern[] = [
  // --- injection / block: 명시적 지시 무효화 ---
  {
    id: 'ignore-previous-instructions',
    pattern: /ignore\s+(all\s+)?previous\s+instructions/i,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'ignore-above-prior',
    pattern: /ignore\s+(all\s+)?(above|prior)/i,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'disregard-previous',
    pattern: /disregard\s+(all\s+)?(previous|above|prior)/i,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'new-instructions',
    pattern: /new\s+instructions?\s*:/i,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'forget-context',
    pattern: /forget\s+(everything|all|previous|your)/i,
    severity: 'block',
    category: 'injection',
  },
  // --- injection / block: 특수 태그 ---
  {
    id: 'system-tag',
    pattern: /<\s*\/?system\s*>/i,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'assistant-tag',
    pattern: /<\s*\/?assistant\s*>/i,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'user-tag',
    pattern: /<\s*\/?user\s*>/i,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'human-tag',
    pattern: /<\s*\/?human\s*>/i,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'inst-tag',
    pattern: /\[INST\]/i,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'sys-tag',
    pattern: /<<SYS>>/i,
    severity: 'block',
    category: 'injection',
  },
  // --- injection / block: 한국어 명시적 인젝션 ---
  {
    id: 'ko-ignore-previous',
    pattern: /이전\s*(지시|명령|설정|규칙).*무시/,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'ko-ignore-all',
    pattern: /(모든|전부|앞의|위의)\s*(지시|명령|설정).*무시/,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'ko-forget',
    pattern: /(잊어|잊으|잊어버려|잊어라)/,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'ko-you-are-now',
    pattern: /넌\s+이제부터/,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'ko-new-role',
    pattern: /새로운\s*(역할|지시|명령|규칙)/,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'ko-change-role',
    pattern: /너(는|의)\s*(역할|정체).*바꿔/,
    severity: 'block',
    category: 'injection',
  },
  {
    id: 'ko-system-prompt',
    pattern: /(시스템|어시스턴트)\s*(프롬프트|메시지)/,
    severity: 'block',
    category: 'injection',
  },
  // --- injection / warn: 맥락에 따라 합법적일 수 있는 패턴 ---
  {
    id: 'you-are-now',
    pattern: /you\s+are\s+now/i,
    severity: 'warn',
    category: 'injection',
  },
  {
    id: 'act-as',
    pattern: /act\s+as\s+(a|an|if)\b/i,
    severity: 'warn',
    category: 'injection',
  },
  {
    id: 'pretend-to',
    pattern: /pretend\s+(you|to\s+be)/i,
    severity: 'warn',
    category: 'injection',
  },
  {
    id: 'ko-pretend',
    pattern: /인척\s*(해|하세요|해봐)/,
    severity: 'warn',
    category: 'injection',
  },
  // --- exfiltration / block: 비밀키·파일 유출 ---
  {
    id: 'exfil-secret-curl',
    pattern: /curl.*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|API)/i,
    severity: 'block',
    category: 'exfiltration',
  },
  {
    id: 'exfil-secret-file',
    pattern: /cat\s+[^\n]*(\.env|credentials|\.netrc)/i,
    severity: 'block',
    category: 'exfiltration',
  },
  {
    id: 'exfil-wget-post',
    pattern: /wget\s+--post-data[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD)/i,
    severity: 'block',
    category: 'exfiltration',
  },
  {
    id: 'exfil-nc-pipe',
    pattern: /\|\s*nc\s+\S+\s+\d+/,
    severity: 'block',
    category: 'exfiltration',
  },
  {
    id: 'exfil-ssh-key-read',
    pattern: /cat\s+[^\n]*\.ssh\/(id_rsa|id_ed25519|authorized_keys)/i,
    severity: 'block',
    category: 'exfiltration',
  },
  // --- destructive / block: 파괴적 명령 패턴 ---
  {
    id: 'destruct-rm-rf-root',
    pattern: /rm\s+-[^\n]*rf\s+\//,
    severity: 'block',
    category: 'exfiltration',
  },
  {
    id: 'destruct-chmod-777',
    pattern: /chmod\s+(-R\s+)?777\s+\//,
    severity: 'block',
    category: 'exfiltration',
  },
  {
    id: 'destruct-drop-database',
    pattern: /DROP\s+(DATABASE|TABLE)\s+/i,
    severity: 'block',
    category: 'exfiltration',
  },
  // --- obfuscation / warn: base64 디코드 파이프 ---
  {
    id: 'obfusc-base64-decode',
    pattern: /base64\s+(-d|--decode)\s*\|/,
    severity: 'warn',
    category: 'obfuscation',
  },
  // --- obfuscation / block: 난독화 실행 ---
  {
    id: 'obfusc-echo-exec',
    pattern: /echo\s+[^\n]*\|\s*(bash|sh|python|node)/i,
    severity: 'block',
    category: 'obfuscation',
  },
  {
    id: 'obfusc-eval-dynamic',
    pattern: /eval\s*\(\s*(atob|Buffer\.from|decodeURI)/i,
    severity: 'block',
    category: 'obfuscation',
  },
];

/**
 * Legacy flat array for backwards-compatible exports.
 * Contains only the RegExp patterns from SECURITY_PATTERNS.
 */
export const PROMPT_INJECTION_PATTERNS: RegExp[] = SECURITY_PATTERNS.map((sp) => sp.pattern);

// ── Utilities ─────────────────────────────────────────────────────────────

/** Normalize text for injection detection: strip zero-width chars, NFKC normalize */
export function normalizeForInjectionCheck(text: string): string {
  return text
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '')
    .normalize('NFKC');
}

/**
 * Escape ALL XML-like tags in text to prevent tag injection.
 */
export function escapeAllXmlTags(text: string): string {
  return text.replace(/<\/?[a-zA-Z][\w-]*(?:\s[^>]*)?\/?>/g, (match) =>
    match.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  );
}

// ── Core scan ─────────────────────────────────────────────────────────────

/**
 * Scan text against all SECURITY_PATTERNS and return structured findings.
 */
function scanText(text: string): ScanFinding[] {
  const normalized = normalizeForInjectionCheck(text);
  const findings: ScanFinding[] = [];

  for (const sp of SECURITY_PATTERNS) {
    const match = sp.pattern.exec(normalized);
    if (match) {
      findings.push({
        patternId: sp.id,
        severity: sp.severity,
        category: sp.category,
        matchedText: match[0],
      });
    }
  }

  return findings;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Combined filter: checks for prompt injection and escapes XML tags.
 * - block 패턴 매칭 → verdict: 'block', sanitized: ''
 * - warn만 매칭   → verdict: 'warn',  sanitized: XML 이스케이프된 텍스트
 * - 매칭 없음     → verdict: 'safe',  sanitized: XML 이스케이프된 텍스트
 */
export function filterSolutionContent(text: string): ScanResult {
  const findings = scanText(text);

  const hasBlock = findings.some((f) => f.severity === 'block');

  if (hasBlock) {
    return { verdict: 'block', findings, sanitized: '' };
  }

  const hasWarn = findings.some((f) => f.severity === 'warn');
  const sanitized = escapeAllXmlTags(text);

  if (hasWarn) {
    return { verdict: 'warn', findings, sanitized };
  }

  return { verdict: 'safe', findings: [], sanitized };
}

/**
 * Check if text contains prompt injection patterns.
 * Normalizes Unicode before matching to prevent bypass via homoglyphs/zero-width chars.
 *
 * @returns true only when a 'block'-severity pattern matches (하위 호환 유지).
 */
export function containsPromptInjection(text: string): boolean {
  const findings = scanText(text);
  return findings.some((f) => f.severity === 'block');
}
