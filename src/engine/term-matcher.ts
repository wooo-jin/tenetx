/**
 * Term matching utilities for compound negative/reflection attribution.
 *
 * Why this module exists (PR3 motivation):
 *   라운드 1~3 리뷰에서 반복적으로 발견된 문제의 근본 원인은
 *   `response.toLowerCase().includes(term.toLowerCase())` substring 매칭이었다.
 *
 * Matching model by script (라운드 3 정리):
 *
 *   | term script | 매칭 방식                                   | boundary 의미                |
 *   |-------------|--------------------------------------------|------------------------------|
 *   | 영어/숫자   | lookaround regex `(?<![a-zA-Z0-9])...(?![a-zA-Z0-9])` | `_`도 boundary (snake_case 분해) |
 *   | 한글        | text를 비-한글로 tokenize → stem 정규화 → Set lookup | 조사/어미 제거 후 정확 비교   |
 *   | 혼합 스크립트 | false 반환 + debug log                     | 이전 substring fallback 제거  |
 *
 *   한글 stem 정규화는 두 단계:
 *     1. `stripKoSuffix` (solution-format) — 일반 조사/어미 (`가`, `를`, `는`, …).
 *        **추출 시점에도 적용되므로 1글자 suffix는 한자어 명사를 깨뜨리지 않도록
 *        매우 보수적**. extractTags와 정합성을 유지하기 위해 매칭도 같은 함수 사용.
 *     2. `KO_VERBAL_SUFFIXES` (본 모듈) — 동사/명사 활용형 (`중`, `시`).
 *        매칭 전용이라 extractTags에 영향이 없고, stem 결과가 2글자 미만이면
 *        드롭해 `집중`→`집` 같은 false positive를 차단.
 *
 * 이 모듈의 원칙:
 *   1. **Unicode NFC normalize**: 입력 text와 term 모두 NFC로 정규화해 macOS
 *      NFD 경로명과의 매칭 실패를 방지. response는 classifyMatch 진입 시 한 번만.
 *   2. **extractTags 계약 정렬**: 영어 3글자 이상, 한국어 2글자 이상.
 *   3. **변조 cache 방어**: MAX_TERM_LENGTH(128) 가드로 거대 term에 의한 RegExp
 *      컴파일 실패 (~32K 이상에서 V8이 throw) 방지.
 *   4. **Negative term blocklist**: 흔한 메타 term은 term-filter 단계에서 제거.
 *   5. **매칭 강도 임계값**: identifier 길이 4 이상 단독도 strong 인정 (Python/C의
 *      `init`, `exit`, `main` 같은 공통 4글자 idents가 systematic miss되지 않도록).
 */

import { createLogger } from '../core/logger.js';
import { stripKoSuffix } from './solution-format.js';

const log = createLogger('term-matcher');

/**
 * Negative attribution에서 제외할 흔한 메타 term.
 * 거의 모든 Bash 오류/경고에 등장해 signal-to-noise ratio가 0에 가깝다.
 */
export const NEGATIVE_TERM_BLOCKLIST = new Set<string>([
  // English meta terms
  'error', 'errors', 'fail', 'failed', 'failure',
  'bug', 'bugs', 'issue', 'issues', 'warn', 'warning',
  'code', 'file', 'line', 'test', 'tests',
  // Korean meta terms
  '에러', '오류', '실패', '버그', '경고',
  '코드', '파일', '문제', '테스트',
]);

/**
 * 매칭 전용 한국어 동사/명사 활용형 suffix.
 *
 * extractTags에 영향을 주지 않으려고 solution-format의 KO_SUFFIXES와 분리.
 * `리팩토링중`, `배포시` 같은 활용형을 매칭 시점에 stem으로 풀어내되,
 * stem 결과가 2자 미만이면 드롭해 `집중`→`집`, `시도`→`시` 같은 1자 stem
 * 오염을 방지한다.
 */
const KO_VERBAL_SUFFIXES = ['중', '시'];

/**
 * cache 변조 방어용 term 최대 길이. V8의 RegExp는 ~32K 이상에서 컴파일 실패로
 * throw하는데, 악의적 cache가 거대 Latin term을 주입하면 matchesAtWordBoundary가
 * 전체 루프를 abort시킬 수 있다. 128자면 실제 identifier/tag는 모두 커버.
 */
const MAX_TERM_LENGTH = 128;

/**
 * STRONG_ID_MIN_LENGTH: single identifier가 'strong'으로 승급되는 최소 길이.
 *
 * Python/C 빈출 identifier (`init`, `exit`, `main`, `recv`, `send`, `read`,
 * `open`, `kill`, `fork`, `pipe`)는 4자가 대다수이므로 4로 설정. 3자 identifier
 * (`api`, `sql`)는 단독으로는 weak, tag 1개라도 추가되면 strong으로 승급.
 */
const STRONG_ID_MIN_LENGTH = 4;

/**
 * NFC normalize. macOS 파일명은 NFD를 쓰므로 stack trace에 포함될 때 매칭이
 * 실패할 수 있다. 양쪽을 NFC로 맞춘다.
 */
function normalize(s: string): string {
  return s.normalize('NFC');
}

/**
 * Filter terms usable for word-boundary matching.
 *
 * - Drops non-strings (cache file can be hand-edited to contain garbage).
 * - Drops terms that are too long (MAX_TERM_LENGTH guard — RegExp DoS 방어).
 * - Drops terms that are too short to be meaningful (English < 3, Korean < 2).
 * - Drops meta terms that match almost any Bash error (NEGATIVE_TERM_BLOCKLIST).
 * - NFC normalize on ingest.
 *
 * Drop 사유는 debug 레벨로 로그해 cache 변조 또는 extractor 버그를 운영 중에
 * 추적할 수 있게 한다 (silent drop은 디버깅이 불가능).
 */
export function filterMatchableTerms(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string' || t.length === 0) {
      log.debug(`non-string term dropped: ${JSON.stringify(t)}`);
      continue;
    }
    if (t.length > MAX_TERM_LENGTH) {
      log.debug(`oversized term dropped (len=${t.length}): ${JSON.stringify(t.slice(0, 32))}...`);
      continue;
    }
    const nt = normalize(t);
    if (NEGATIVE_TERM_BLOCKLIST.has(nt.toLowerCase())) continue;
    const isKorean = /[가-힣]/.test(nt);
    if (isKorean) {
      if (nt.length < 2) continue;
    } else {
      if (nt.length < 3) continue;
    }
    out.push(nt);
  }
  return out;
}

/**
 * 단일 한글 token의 stem 변형을 모두 반환한다.
 *
 * Returns (in order):
 *   1. token 자체 (length ≥ 2일 때만)
 *   2. stripKoSuffix 결과 (원본과 다르고 ≥ 2일 때만)
 *   3. KO_VERBAL_SUFFIXES 각각을 strip한 결과 (≥ 2일 때만)
 *
 * stem 결과가 2자 미만이면 제외 — `집중`→`집` 같은 1자 stem이 Set에 들어가면
 * 무관한 `'집 정리'` text의 1자 token과 매칭되는 over-attribution 발생.
 *
 * 이 헬퍼는 두 곳에서 공유된다:
 *   - `koreanStemTokens`: response text의 모든 token을 stem Set으로 변환
 *   - `matchesInPrecomputed` (Hangul branch): term 자체의 변형을 stem Set에 질의
 * 둘이 동일한 변환 규칙을 쓰는 게 핵심이라 DRY로 뽑았다.
 */
function koreanStemVariants(token: string): string[] {
  const variants: string[] = [];
  if (token.length >= 2) variants.push(token);
  const s1 = stripKoSuffix(token);
  if (s1 !== token && s1.length >= 2) variants.push(s1);
  for (const suffix of KO_VERBAL_SUFFIXES) {
    if (token.endsWith(suffix) && token.length > suffix.length) {
      const s2 = token.slice(0, -suffix.length);
      if (s2.length >= 2) variants.push(s2);
    }
  }
  return variants;
}

/**
 * 한국어 text를 비-한글로 분해 → 각 token의 stem 변형들을 Set에 담는다.
 *
 * @param nText 호출자가 이미 NFC normalize한 text (중복 normalize 방지)
 */
function koreanStemTokens(nText: string): Set<string> {
  const tokens = nText.split(/[^가-힣]+/).filter(t => t.length > 0);
  const stems = new Set<string>();
  for (const tok of tokens) {
    for (const v of koreanStemVariants(tok)) {
      stems.add(v);
    }
  }
  return stems;
}

/**
 * 영어 매칭 전용 regex 생성. term은 `^[a-zA-Z0-9_]+$` 가드 후라 metachar 없음.
 * lookaround로 `_`를 boundary로 인정 → `api`가 `my_api_call` 안에서 매칭됨.
 */
function englishBoundaryRegex(lowerTerm: string): RegExp {
  return new RegExp(`(?<![a-zA-Z0-9])${lowerTerm}(?![a-zA-Z0-9])`);
}

/**
 * Check whether `term` matches inside `text` at a word boundary.
 *
 * 주의: 호출자는 일반적으로 `matchesInPrecomputed`를 써서 NFC normalize와
 * stem Set 계산을 재사용하는 게 효율적. 이 함수는 단발성 호출 또는 테스트용.
 */
export function matchesAtWordBoundary(text: string, term: string): boolean {
  if (!term || !text) return false;
  if (term.length > MAX_TERM_LENGTH) return false;
  const nText = normalize(text);
  const nTerm = normalize(term);
  return matchesInPrecomputed(nText, nTerm, null);
}

/**
 * 사전 계산된 NFC text와 옵셔널 Korean stem Set을 재사용해 term 매칭.
 * classifyMatch가 내부에서 사용해 response를 여러 번 normalize하지 않도록 한다.
 */
function matchesInPrecomputed(nText: string, nTerm: string, stems: Set<string> | null): boolean {
  // Defensive guard: 정상 경로(filterMatchableTerms → classifyMatch)에서는 이미
  // MAX_TERM_LENGTH 초과 term이 제거되므로 여기 오는 경우는 거의 없다. 다만
  // matchesAtWordBoundary가 필터 없이 직접 호출될 수 있고, 테스트/내부 호출자가
  // raw term을 넘길 수 있어 defense-in-depth로 유지. drop은 silent 대신 debug
  // 레벨로 로그해 cache 변조/호출 패턴 문제를 추적 가능하게 둔다.
  if (nTerm.length > MAX_TERM_LENGTH) {
    log.debug(`oversized term dropped in matcher (len=${nTerm.length})`);
    return false;
  }

  const isPureLatin = /^[a-zA-Z0-9_]+$/.test(nTerm);
  if (isPureLatin) {
    const lowerText = nText.toLowerCase();
    const lowerTerm = nTerm.toLowerCase();
    return englishBoundaryRegex(lowerTerm).test(lowerText);
  }

  const isPureHangul = /^[가-힣]+$/.test(nTerm);
  if (isPureHangul) {
    const stemSet = stems ?? koreanStemTokens(nText);
    // koreanStemVariants는 koreanStemTokens와 동일한 규칙으로 term의 변형들을
    // 열거 — stem ≥ 2 제약도 동일해 `집중`→`집` 같은 1자 stem 오염 원천 차단.
    for (const variant of koreanStemVariants(nTerm)) {
      if (stemSet.has(variant)) return true;
    }
    return false;
  }

  // Mixed script (rare). Reject rather than fall back to substring — the
  // previous substring fallback was the exact pattern that caused rounds
  // 1-3 over-attribution. JSON.stringify로 escape해 제어 문자/따옴표가 로그에
  // 그대로 찍혀 log injection 유발하지 않게 한다.
  log.debug(`mixed-script term dropped: ${JSON.stringify(nTerm)}`);
  return false;
}

/**
 * Classify a solution's match strength against `response`.
 *
 * Returns one of:
 *   - 'strong'  : identifier 매칭으로 고신뢰 (길이 ≥4 단독, 또는 id≥2, 또는 id+tag)
 *   - 'multi'   : tag 2개 이상 매칭 (identifier 없음)
 *   - 'weak'    : tag 1개 OR 짧은 identifier(<4) 단독
 *   - 'none'    : 매칭 없음
 *
 * Callers (negative attribution, reflection) should only attribute on 'strong'
 * or 'multi'. 'weak' is over-attribution-prone and must be ignored.
 */
export type MatchStrength = 'none' | 'weak' | 'multi' | 'strong';

export interface MatchClassification {
  strength: MatchStrength;
  matchedIdentifiers: string[];
  matchedTags: string[];
}

export function classifyMatch(
  response: string,
  identifiers: unknown[],
  tags: unknown[],
): MatchClassification {
  // Empty/nullish response는 normalize/stem 계산을 skip해 hot path 비용을 줄임.
  // 이전에는 filterMatchableTerms가 빈 배열을 리턴해도 normalize/split이 수행돼
  // 핸들러 루프에서 불필요한 작업이 누적됐다.
  if (!response) {
    return { strength: 'none', matchedIdentifiers: [], matchedTags: [] };
  }

  const safeIds = filterMatchableTerms(identifiers);
  const safeTags = filterMatchableTerms(tags);

  // response는 한 번만 normalize하고, Korean stem Set도 한 번만 계산.
  const nResponse = normalize(response);
  const stems = koreanStemTokens(nResponse);

  const matchedIdentifiers = safeIds.filter(id => matchesInPrecomputed(nResponse, id, stems));
  const matchedTags = safeTags.filter(tag => matchesInPrecomputed(nResponse, tag, stems));

  // Strong attribution rules:
  //   - 2+ distinct identifiers matched (signature evidence)
  //   - OR 1 identifier ≥STRONG_ID_MIN_LENGTH chars matched
  //   - OR 1 identifier + 1 tag matched (cross-signal corroboration)
  const hasLongIdentifier = matchedIdentifiers.some(id => id.length >= STRONG_ID_MIN_LENGTH);
  const strongIdentifier =
    matchedIdentifiers.length >= 2
    || (matchedIdentifiers.length >= 1 && hasLongIdentifier)
    || (matchedIdentifiers.length >= 1 && matchedTags.length >= 1);

  let strength: MatchStrength;
  if (strongIdentifier) {
    strength = 'strong';
  } else if (matchedTags.length >= 2) {
    strength = 'multi';
  } else if (matchedTags.length === 1 || matchedIdentifiers.length === 1) {
    strength = 'weak';
  } else {
    strength = 'none';
  }

  return { strength, matchedIdentifiers, matchedTags };
}

/**
 * Convenience wrapper for callers that only care about "should attribute?".
 */
export function shouldAttribute(classification: MatchClassification): boolean {
  return classification.strength === 'strong' || classification.strength === 'multi';
}
