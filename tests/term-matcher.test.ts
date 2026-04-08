/**
 * term-matcher.ts 회귀 테스트 (PR3)
 *
 * 검증:
 *   - Word boundary 매칭 (영어 \b, 한국어 한글 경계)
 *   - NEGATIVE_TERM_BLOCKLIST filter
 *   - extractTags 계약 (영어 3+, 한국어 2+)
 *   - Match strength classification (strong / multi / weak / none)
 *   - shouldAttribute는 strong + multi만 통과
 *
 * 라운드 1~3에서 발견된 over-attribution 시나리오를 회귀로 고정:
 *   - `api` tag가 `rapid build failed`에 매칭되면 안 됨
 *   - `sql` tag가 `mysqld crashed`에 매칭되면 안 됨
 *   - `에러` tag가 `파서에러` 같은 복합어에 매칭되면 안 됨
 *   - 짧은 약어도 word-boundary 매칭이면 통과 (`api 호출 실패`)
 */
import { describe, it, expect } from 'vitest';
import {
  matchesAtWordBoundary,
  filterMatchableTerms,
  classifyMatch,
  shouldAttribute,
  NEGATIVE_TERM_BLOCKLIST,
} from '../src/engine/term-matcher.js';

describe('matchesAtWordBoundary — English', () => {
  it('word boundary로 단어 매칭', () => {
    expect(matchesAtWordBoundary('api call failed', 'api')).toBe(true);
    expect(matchesAtWordBoundary('the api: 500', 'api')).toBe(true);
    expect(matchesAtWordBoundary('api', 'api')).toBe(true);
    expect(matchesAtWordBoundary('[api]', 'api')).toBe(true);
  });

  it('prefix substring 거부 — api가 rapid에 매칭되면 안 됨 (H1 회귀)', () => {
    expect(matchesAtWordBoundary('rapid build failed', 'api')).toBe(false);
    expect(matchesAtWordBoundary('apis', 'api')).toBe(false);
    expect(matchesAtWordBoundary('dapi foo', 'api')).toBe(false);
    expect(matchesAtWordBoundary('capital', 'api')).toBe(false);
  });

  it('mysqld에 sql이 매칭되면 안 됨 (M14 회귀)', () => {
    expect(matchesAtWordBoundary('mysqld crashed', 'sql')).toBe(false);
    expect(matchesAtWordBoundary('nosql database', 'sql')).toBe(false);
    expect(matchesAtWordBoundary('mssql error', 'sql')).toBe(false);
    // 반면 word-boundary가 맞는 경우는 통과
    expect(matchesAtWordBoundary('sql syntax error', 'sql')).toBe(true);
    expect(matchesAtWordBoundary('raw sql failed', 'sql')).toBe(true);
  });

  it('case insensitive', () => {
    expect(matchesAtWordBoundary('API call', 'api')).toBe(true);
    expect(matchesAtWordBoundary('sql', 'SQL')).toBe(true);
  });
});

describe('matchesAtWordBoundary — Korean', () => {
  it('pure Hangul boundary 매칭', () => {
    expect(matchesAtWordBoundary('에러 발생', '에러')).toBe(true);
    expect(matchesAtWordBoundary('배포 실패', '배포')).toBe(true);
    // 구두점/공백 경계
    expect(matchesAtWordBoundary('에러: 발생', '에러')).toBe(true);
    expect(matchesAtWordBoundary('[배포]', '배포')).toBe(true);
  });

  it('H-K1 회귀: 한국어 조사/어미가 붙은 inflected form도 매칭', () => {
    // 이전 round 1은 한글-한글 경계를 모두 거부해서 under-attribution 발생.
    // round 2는 stripKoSuffix로 stem 정규화 후 비교.
    expect(matchesAtWordBoundary('배포가 실패했다', '배포')).toBe(true);
    expect(matchesAtWordBoundary('배포를 시작', '배포')).toBe(true);
    expect(matchesAtWordBoundary('배포의 순서', '배포')).toBe(true);
    expect(matchesAtWordBoundary('배포는 완료', '배포')).toBe(true);
    expect(matchesAtWordBoundary('배포에서 오류', '배포')).toBe(true);
    expect(matchesAtWordBoundary('배포로 진행', '배포')).toBe(true);
    expect(matchesAtWordBoundary('리팩토링중 오류', '리팩토링')).toBe(true);
    expect(matchesAtWordBoundary('파서가 죽었다', '파서')).toBe(true);
  });

  it('한국어 복합어는 여전히 거부 — 배포 tag가 재배포/배포자에 매칭 안 됨', () => {
    // 합성어 (prefix: 재, suffix: 자) 는 stem이 달라서 거부되어야 함
    expect(matchesAtWordBoundary('파서에러 발생', '에러')).toBe(false); // 파서에러: 파서+에러 합성
    expect(matchesAtWordBoundary('재배포', '배포')).toBe(false); // 재 prefix
    expect(matchesAtWordBoundary('배포자', '배포')).toBe(false); // 자 suffix는 stripKoSuffix 대상 아님
  });

  it('한국어/영어 경계 — 영문자 인접은 stem 분리 가능', () => {
    expect(matchesAtWordBoundary('ERROR: 에러', '에러')).toBe(true);
    expect(matchesAtWordBoundary('foo배포bar', '배포')).toBe(true);
  });
});

describe('matchesAtWordBoundary — snake_case (H-SC 회귀)', () => {
  it('api가 my_api, fetch_api_data 내부 토큰으로 매칭', () => {
    expect(matchesAtWordBoundary('my_api call failed', 'api')).toBe(true);
    expect(matchesAtWordBoundary('fetch_api_data crashed', 'api')).toBe(true);
    expect(matchesAtWordBoundary('_api', 'api')).toBe(true);
    expect(matchesAtWordBoundary('api_', 'api')).toBe(true);
  });

  it('user가 fetch_user_data에 매칭', () => {
    expect(matchesAtWordBoundary('fetch_user_data crashed', 'user')).toBe(true);
  });

  it('init이 __init__에 매칭', () => {
    expect(matchesAtWordBoundary('__init__ failed', 'init')).toBe(true);
  });

  it('여전히 substring prefix는 거부', () => {
    expect(matchesAtWordBoundary('apicalls', 'api')).toBe(false); // 알파뉴메릭 연속
    expect(matchesAtWordBoundary('rapidly', 'api')).toBe(false);
    expect(matchesAtWordBoundary('mysqld', 'sql')).toBe(false);
  });
});

describe('matchesAtWordBoundary — Unicode NFC (L-N 회귀)', () => {
  it('NFD 입력도 NFC로 정규화 후 매칭', () => {
    // '배포'의 NFD 표현 (자모 분리)
    const nfdText = '\u1107\u1162\u1111\u1169 실패';
    expect(matchesAtWordBoundary(nfdText, '배포')).toBe(true);
  });

  it('NFC term + NFD text, NFD term + NFC text 양방향', () => {
    const nfcText = '배포 실패';
    const nfdTerm = '\u1107\u1162\u1111\u1169';
    expect(matchesAtWordBoundary(nfcText, nfdTerm)).toBe(true);
  });
});

describe('matchesAtWordBoundary — 혼합 스크립트 거부 (L-M)', () => {
  it('혼합 스크립트 term은 false — over-attribution 회피', () => {
    expect(matchesAtWordBoundary('api호출 실패', 'api호출')).toBe(false);
    expect(matchesAtWordBoundary('sql쿼리 오류', 'sql쿼리')).toBe(false);
  });
});

describe('matchesAtWordBoundary — C2 회귀: 1자 stem 오염 방지', () => {
  // 이전 라운드 2는 KO_SUFFIXES에 '중'/'시' 추가 → '집중' term이 stem '집'으로
  // 축소되어 '집 정리' text와 매칭되는 over-attribution 발생.
  // 라운드 3은 '중'/'시'를 term-matcher 전용 KO_VERBAL_SUFFIXES로 분리 + stem ≥2자 가드.
  it('집중 term이 집 1자 토큰과 매칭되면 안 됨', () => {
    expect(matchesAtWordBoundary('집 정리 작업', '집중')).toBe(false);
    expect(matchesAtWordBoundary('집이 작다', '집중')).toBe(false);
  });

  it('시도 term이 시 1자 토큰과 매칭되면 안 됨', () => {
    expect(matchesAtWordBoundary('시 한 편', '시도')).toBe(false);
  });

  it('감시 term이 감 1자와 매칭되면 안 됨', () => {
    expect(matchesAtWordBoundary('감 한 개', '감시')).toBe(false);
  });

  it('한자어 명사는 그대로 유지 — 집중 term은 집중 text 매칭 OK', () => {
    expect(matchesAtWordBoundary('집중 작업 중', '집중')).toBe(true);
    expect(matchesAtWordBoundary('시도가 실패', '시도')).toBe(true);
  });

  it('활용형 매칭은 여전히 작동 — 리팩토링중 → 리팩토링', () => {
    expect(matchesAtWordBoundary('리팩토링중 오류', '리팩토링')).toBe(true);
    expect(matchesAtWordBoundary('배포시 검증', '배포')).toBe(true);
  });
});

describe('matchesAtWordBoundary — M1 회귀: 거대 term DoS 방어', () => {
  it('MAX_TERM_LENGTH(128) 초과 term은 false (RegExp 컴파일 실패 방지)', () => {
    const hugeTerm = 'a'.repeat(50000);
    expect(matchesAtWordBoundary('some text', hugeTerm)).toBe(false);
  });

  it('filterMatchableTerms가 거대 term을 사전 드롭', () => {
    const hugeTerm = 'b'.repeat(50000);
    const filtered = filterMatchableTerms(['api', hugeTerm, 'sql']);
    expect(filtered).toEqual(['api', 'sql']);
  });
});

describe('filterMatchableTerms', () => {
  it('영어 3글자 미만 거부', () => {
    expect(filterMatchableTerms(['a', 'ab', 'abc', 'abcd'])).toEqual(['abc', 'abcd']);
  });

  it('한국어 2글자 미만 거부', () => {
    expect(filterMatchableTerms(['가', '가나', '가나다'])).toEqual(['가나', '가나다']);
  });

  it('NEGATIVE_TERM_BLOCKLIST 제거', () => {
    const filtered = filterMatchableTerms(['error', 'fail', 'bug', 'react', '에러', '오류', '리팩토링']);
    expect(filtered).toEqual(['react', '리팩토링']);
  });

  it('비-string element 거부 (변조 cache 방어)', () => {
    expect(filterMatchableTerms([123, null, 'abc', { x: 1 }, undefined, 'def'])).toEqual(['abc', 'def']);
  });

  it('빈 문자열 거부', () => {
    expect(filterMatchableTerms(['', 'abc', ''])).toEqual(['abc']);
  });
});

describe('classifyMatch — strength', () => {
  it('strong: identifier 1개 매칭', () => {
    const result = classifyMatch(
      'ReferenceError: useState is not defined',
      ['useState'],
      ['react', 'hook'],
    );
    expect(result.strength).toBe('strong');
    expect(result.matchedIdentifiers).toEqual(['useState']);
  });

  it('multi: tag 2개 매칭 (identifier 없음)', () => {
    const result = classifyMatch(
      'react hook error in useState',
      [],
      ['react', 'hook'],
    );
    // 'react', 'hook' 모두 매칭, 'error'는 blocklist
    expect(result.strength).toBe('multi');
    expect(result.matchedTags).toHaveLength(2);
  });

  it('weak: tag 1개만 매칭', () => {
    const result = classifyMatch(
      'react rendering issue',
      [],
      ['react', 'unrelated'],
    );
    expect(result.strength).toBe('weak');
    expect(result.matchedTags).toEqual(['react']);
  });

  it('none: 매칭 없음', () => {
    const result = classifyMatch(
      'completely unrelated error',
      ['nothing'],
      ['foobar', 'bazqux'],
    );
    expect(result.strength).toBe('none');
  });

  it('H1/M14 회귀: api tag가 rapid에 약하게 매칭 안 됨', () => {
    const result = classifyMatch(
      'error TS2345: rapid build failed',
      [],
      ['api'],
    );
    expect(result.strength).toBe('none'); // rapid에 api가 매칭 안 됨
  });

  it('M14 회귀: 에러 tag가 파서에러에 매칭 안 됨', () => {
    const result = classifyMatch(
      'error TS2345: 파서에러 발생',
      [],
      ['에러'],
    );
    expect(result.strength).toBe('none');
  });

  it('blocklist term은 match 집계에서 제외', () => {
    // tags=['에러', '리팩토링'] → '에러'는 blocklist → 실제로는 '리팩토링' 1개만 있음
    const result = classifyMatch(
      '리팩토링 에러',
      [],
      ['에러', '리팩토링'],
    );
    expect(result.strength).toBe('weak'); // 리팩토링 1개만
    expect(result.matchedTags).toEqual(['리팩토링']);
  });

  it('짧은 약어 word-boundary OK (H1 regression)', () => {
    // 'api'는 3글자라 통과, word-boundary로 매칭됨
    const result = classifyMatch(
      'api 호출 실패 endpoint crashed',
      [],
      ['api', 'endpoint'],
    );
    expect(result.strength).toBe('multi'); // api + endpoint
  });

  it('identifier 매칭이 tag 매칭보다 우위', () => {
    // identifier 1개만 매칭, tag는 매칭 없음 → strong
    const result = classifyMatch(
      'useState hook broken',
      ['useState'],
      ['unrelated'],
    );
    expect(result.strength).toBe('strong');
    expect(result.matchedIdentifiers).toEqual(['useState']);
    expect(result.matchedTags).toEqual([]);
  });
});

describe('classifyMatch — strong threshold (M-I + H1 round 2)', () => {
  it('긴 identifier (≥STRONG_ID_MIN_LENGTH=4) 1개만으로 strong', () => {
    const r = classifyMatch('Error: useState is null', ['useState'], []);
    expect(r.strength).toBe('strong');
  });

  it('4자 identifier 1개도 strong (Python/C init/exit/main 구제)', () => {
    // 이전 라운드 2는 ≥6자라 init, exit, main이 systematic miss됐음.
    // 라운드 3에서 4로 낮춰 Python/C 컨텍스트 정상 attribute.
    const r = classifyMatch('Error: init failed', ['init'], []);
    expect(r.strength).toBe('strong');
  });

  it('3자 identifier 1개는 weak (api, sql 같은 공통 term false positive 방어)', () => {
    // 3자는 여전히 보수적 — tag 1개라도 추가되어야 strong으로 승급
    const r = classifyMatch('error TS2345: api failed', ['api'], []);
    expect(r.strength).toBe('weak');
  });

  it('3자 identifier + tag 1개 → strong (cross-signal)', () => {
    const r = classifyMatch('error TS2345: api failed in python module', ['api'], ['python']);
    expect(r.strength).toBe('strong');
  });

  it('3자 identifier 2개 → strong (signature)', () => {
    const r = classifyMatch('error TS2345: api and sql both crashed', ['api', 'sql'], []);
    expect(r.strength).toBe('strong');
  });

  it('긴 identifier 1개 + tag 0개 → strong (기존 동작 유지)', () => {
    const r = classifyMatch('Error: useReducer is undefined', ['useReducer'], ['unrelated']);
    expect(r.strength).toBe('strong');
  });
});

describe('shouldAttribute', () => {
  it('strong → true', () => {
    expect(shouldAttribute({ strength: 'strong', matchedIdentifiers: ['x'], matchedTags: [] })).toBe(true);
  });
  it('multi → true', () => {
    expect(shouldAttribute({ strength: 'multi', matchedIdentifiers: [], matchedTags: ['a', 'b'] })).toBe(true);
  });
  it('weak → false (over-attribution 방지)', () => {
    expect(shouldAttribute({ strength: 'weak', matchedIdentifiers: [], matchedTags: ['a'] })).toBe(false);
  });
  it('none → false', () => {
    expect(shouldAttribute({ strength: 'none', matchedIdentifiers: [], matchedTags: [] })).toBe(false);
  });
});

describe('NEGATIVE_TERM_BLOCKLIST', () => {
  it('흔한 영어 메타 term 포함', () => {
    expect(NEGATIVE_TERM_BLOCKLIST.has('error')).toBe(true);
    expect(NEGATIVE_TERM_BLOCKLIST.has('fail')).toBe(true);
    expect(NEGATIVE_TERM_BLOCKLIST.has('bug')).toBe(true);
  });

  it('흔한 한국어 메타 term 포함', () => {
    expect(NEGATIVE_TERM_BLOCKLIST.has('에러')).toBe(true);
    expect(NEGATIVE_TERM_BLOCKLIST.has('오류')).toBe(true);
    expect(NEGATIVE_TERM_BLOCKLIST.has('실패')).toBe(true);
  });

  it('기술 특화 term은 blocklist에 없음 (signal 가치 있음)', () => {
    expect(NEGATIVE_TERM_BLOCKLIST.has('react')).toBe(false);
    expect(NEGATIVE_TERM_BLOCKLIST.has('api')).toBe(false);
    expect(NEGATIVE_TERM_BLOCKLIST.has('sql')).toBe(false);
    expect(NEGATIVE_TERM_BLOCKLIST.has('리팩토링')).toBe(false);
  });
});
