/**
 * Tenet — Signal Extractor
 *
 * 프롬프트에서 3-layer 신호를 추출하여 모델 라우팅 스코어링에 사용.
 * Layer 1: 어휘 신호 (Lexical) — 키워드, 패턴 기반
 * Layer 2: 구조 신호 (Structural) — 복잡도, 의존성 추정
 * Layer 3: 컨텍스트 신호 (Context) — 세션 히스토리 기반
 */

export interface LexicalSignals {
  /** 단어 수 */
  wordCount: number;
  /** 파일 경로 언급 수 */
  filePathCount: number;
  /** 코드 블록 포함 여부 */
  hasCodeBlock: boolean;
  /** 아키텍처 키워드 (설계, 구조, 패턴, scalab*, architect*) */
  architectureKeywords: number;
  /** 디버깅/에러 키워드 */
  debugKeywords: number;
  /** 리스크/보안 키워드 */
  riskKeywords: number;
  /** 질문 깊이 (why/how vs what/where) */
  questionDepth: 'deep' | 'shallow' | 'none';
  /** 다중 요구사항 (그리고, 또한, 추가로 등) */
  multiRequirement: boolean;
}

export interface StructuralSignals {
  /** 추정 서브태스크 수 */
  estimatedSubtasks: number;
  /** 교차파일 의존성 암시 */
  crossFileDependency: boolean;
  /** 테스트 작성 필요 암시 */
  needsTests: boolean;
  /** 보안/인프라 도메인 여부 */
  securityDomain: boolean;
  /** 복원 난이도 (되돌리기 어려운 변경) */
  irreversibility: 'high' | 'medium' | 'low';
}

export interface ContextSignals {
  /** 이전 실패 횟수 (세션 내) */
  previousFailures: number;
  /** 현재 대화 턴 수 */
  conversationTurns: number;
  /** 에이전트 체인 깊이 (중첩 에이전트 호출) */
  agentChainDepth: number;
}

export interface SignalBundle {
  lexical: LexicalSignals;
  structural: StructuralSignals;
  context: ContextSignals;
}

// ── 어휘 신호 추출 ────────────────────────────────

// 주의: match()와 함께 사용 시 /g 플래그의 lastIndex 문제를 피하기 위해 매번 새 RegExp 사용
const ARCH_RE = () => /아키텍처|설계|구조|패턴|스케일|scalab|architect|design.*pattern|system.*design|infra/gi;
const DEBUG_RE = () => /디버그|에러|오류|버그|왜.*안|stack.*trace|segfault|crash|debug|error|bug|fix|broken|fail/gi;
const RISK_RE = () => /보안|취약|인증|권한|injection|xss|csrf|sql.*inject|security|vulnerab|auth|permission|encrypt/gi;
const DEEP_Q_PATTERNS = /왜|어떻게|원인|근본|why|how.*should|root.*cause|trade.*off|장단점/i;
const SHALLOW_Q_PATTERNS = /뭐|어디|무슨|what|where|which|show me/i;
const MULTI_REQ_PATTERNS = /그리고|또한|추가로|더불어|아울러|and also|additionally|furthermore|plus|as well/i;
// 파일 경로: 슬래시 포함 경로 또는 확장자가 있는 파일명 (최소 2문자 basename으로 오탐 방지)
const FILE_PATH_RE = () => /(?:\/[\w.-]+){2,}|[\w.-]{2,}\/[\w.-]+\.\w{1,6}|(?<!\w)[\w][\w.-]+\.\w{2,6}(?!\w)/g;

export function extractLexicalSignals(prompt: string): LexicalSignals {
  const words = prompt.split(/\s+/).filter(w => w.length > 0);
  const archMatches = prompt.match(ARCH_RE());
  const debugMatches = prompt.match(DEBUG_RE());
  const riskMatches = prompt.match(RISK_RE());
  const fileMatches = prompt.match(FILE_PATH_RE());

  let questionDepth: LexicalSignals['questionDepth'] = 'none';
  if (DEEP_Q_PATTERNS.test(prompt)) questionDepth = 'deep';
  else if (SHALLOW_Q_PATTERNS.test(prompt)) questionDepth = 'shallow';

  return {
    wordCount: words.length,
    filePathCount: fileMatches?.length ?? 0,
    hasCodeBlock: /```/.test(prompt),
    architectureKeywords: archMatches?.length ?? 0,
    debugKeywords: debugMatches?.length ?? 0,
    riskKeywords: riskMatches?.length ?? 0,
    questionDepth,
    multiRequirement: MULTI_REQ_PATTERNS.test(prompt),
  };
}

// ── 구조 신호 추출 ────────────────────────────────

const SUBTASK_RE = () => /\d+\.\s|단계|step|phase|먼저.*그.*다음|first.*then/gi;
const CROSS_FILE_MARKERS = /여러\s*파일|cross.*file|multiple.*file|다른.*파일.*도|refactor.*across/i;
const TEST_MARKERS = /테스트|test|spec|tdd|coverage|검증/i;
const SECURITY_MARKERS = /보안|security|auth|encrypt|ssl|tls|token|credential|secret/i;
const IRREVERSIBLE_MARKERS = /마이그레이션|migration|drop|delete|remove.*all|배포|deploy|push.*prod|release/i;
const DANGEROUS_MARKERS = /rm\s+-rf|format\s+(?:disk|partition|drive|volume)|truncate|reset\s+--hard|force.*push/i;

export function extractStructuralSignals(prompt: string): StructuralSignals {
  const subtaskMatches = prompt.match(SUBTASK_RE());
  let estimatedSubtasks = subtaskMatches?.length ?? 0;
  // 긴 프롬프트는 서브태스크가 많을 가능성
  if (prompt.length > 500) estimatedSubtasks = Math.max(estimatedSubtasks, 2);
  if (prompt.length > 1500) estimatedSubtasks = Math.max(estimatedSubtasks, 4);

  let irreversibility: StructuralSignals['irreversibility'] = 'low';
  if (DANGEROUS_MARKERS.test(prompt)) irreversibility = 'high';
  else if (IRREVERSIBLE_MARKERS.test(prompt)) irreversibility = 'medium';

  return {
    estimatedSubtasks,
    crossFileDependency: CROSS_FILE_MARKERS.test(prompt),
    needsTests: TEST_MARKERS.test(prompt),
    securityDomain: SECURITY_MARKERS.test(prompt),
    irreversibility,
  };
}

// ── 컨텍스트 신호 (외부에서 주입) ──────────────────

export function createDefaultContextSignals(): ContextSignals {
  return {
    previousFailures: 0,
    conversationTurns: 0,
    agentChainDepth: 0,
  };
}

// ── 통합 추출 ─────────────────────────────────────

export function extractSignals(prompt: string, context?: Partial<ContextSignals>): SignalBundle {
  return {
    lexical: extractLexicalSignals(prompt),
    structural: extractStructuralSignals(prompt),
    context: { ...createDefaultContextSignals(), ...context },
  };
}
