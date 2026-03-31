/**
 * Tenetx — Compound Reflection Logic
 *
 * Code Reflection의 false positive를 줄이기 위한 3중 필터:
 *   1. 시간 윈도우: 솔루션 주입 후 15분 이내만 반영으로 인정
 *   2. 매칭 비율: 유효 식별자의 50% 이상 매칭 필요
 *   3. 공통 식별자 차단: 프레임워크 기본 용어는 매칭에서 제외
 *
 * ADR: 기존 pre-tool-use.ts의 checkCompoundReflection 인라인 로직을
 * 별도 모듈로 분리. 이유: (1) 테스트 가능성 (순수 함수), (2) false
 * positive 문제(action-plan §2.1)의 근본 수정에 명확한 책임 경계 필요.
 */

/** 주입 후 이 시간 내에 코드에 식별자가 출현해야 reflection으로 인정 */
export const REFLECTION_WINDOW_MS = 15 * 60 * 1000; // 15분

/**
 * 프레임워크/라이브러리 기본 식별자 블록리스트.
 * 이 식별자들은 솔루션 주입과 무관하게 코드에 자연 출현하므로
 * reflection 매칭에서 제외한다.
 *
 * 기준: "이 단어가 코드에 있다고 해서 사용자가 tenetx의 솔루션을
 * 참고했다고 볼 수 없는 단어"
 */
export const COMMON_IDENTIFIERS = new Set([
  // React
  'useState', 'useEffect', 'useCallback', 'useReducer', 'useContext', 'useLayoutEffect',
  'useImperativeHandle', 'useDebugValue', 'useDeferredValue', 'useTransition', 'useSyncExternalStore',
  'useInsertionEffect', 'createElement', 'createContext', 'createRef', 'forwardRef',
  'ErrorBoundary', 'Suspense', 'StrictMode', 'Fragment', 'Component',
  // Next.js
  'getServerSideProps', 'getStaticProps', 'getStaticPaths', 'NextRequest', 'NextResponse',
  'useRouter', 'usePathname', 'useSearchParams',
  // Node.js / common
  'require', 'exports', 'module', 'process', 'console', 'setTimeout', 'setInterval',
  'Promise', 'Buffer', 'EventEmitter',
  // Testing
  'describe', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll',
  // TypeScript
  'interface', 'implements', 'extends', 'abstract', 'readonly',
  // Common methods/patterns
  'toString', 'valueOf', 'constructor', 'prototype', 'hasOwnProperty',
  'addEventListener', 'removeEventListener', 'querySelector', 'getElementById',
  // Libraries
  'express', 'mongoose', 'sequelize', 'prisma',
]);

export interface ReflectionInput {
  identifiers: string[];
  code: string;
  injectedAt: string;
  now?: Date;
}

export interface ReflectionResult {
  reflected: boolean;
  matchedCount: number;
  eligibleCount: number;
  reason?: 'outside-window' | 'low-match-ratio' | 'no-eligible-identifiers' | 'code-too-short' | 'invalid-injection-time';
}

/**
 * 솔루션의 식별자가 코드에 반영되었는지 판정한다 (순수 함수).
 *
 * 3중 필터:
 *   1. 코드 최소 길이 (10자)
 *   2. 시간 윈도우 (주입 후 15분)
 *   3. 유효 식별자 필터링 (6자 이상 + 블록리스트 제외)
 *   4. 매칭 비율 (유효 식별자의 50% 이상, 최소 1개)
 */
export function isReflectionCandidate(input: ReflectionInput): ReflectionResult {
  const { identifiers, code, injectedAt } = input;
  const now = input.now ?? new Date();

  // Gate 1: 코드 최소 길이
  if (!code || code.length < 10) {
    return { reflected: false, matchedCount: 0, eligibleCount: 0, reason: 'code-too-short' };
  }

  // Gate 2: 주입 시각 유효성 + 시간 윈도우
  const injectedTime = new Date(injectedAt).getTime();
  if (Number.isNaN(injectedTime)) {
    return { reflected: false, matchedCount: 0, eligibleCount: 0, reason: 'invalid-injection-time' };
  }
  const elapsed = now.getTime() - injectedTime;
  if (elapsed > REFLECTION_WINDOW_MS || elapsed < 0) {
    return { reflected: false, matchedCount: 0, eligibleCount: 0, reason: 'outside-window' };
  }

  // Gate 3: 유효 식별자 필터링
  const eligible = identifiers.filter(
    id => id.length >= 6 && !COMMON_IDENTIFIERS.has(id),
  );
  if (eligible.length === 0) {
    return { reflected: false, matchedCount: 0, eligibleCount: 0, reason: 'no-eligible-identifiers' };
  }

  // Gate 4: 매칭 비율 검사
  const matchedCount = eligible.filter(id => code.includes(id)).length;
  const minRequired = Math.max(1, Math.ceil(eligible.length * 0.5));

  if (matchedCount < minRequired) {
    return { reflected: false, matchedCount, eligibleCount: eligible.length, reason: 'low-match-ratio' };
  }

  return { reflected: true, matchedCount, eligibleCount: eligible.length };
}
