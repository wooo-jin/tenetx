import { describe, it, expect } from 'vitest';
import {
  KEYWORD_PATTERNS,
  detectKeyword,
} from '../src/hooks/keyword-detector.js';

describe('keyword patterns', () => {
  it('KEYWORD_PATTERNS가 배열로 존재한다', () => {
    expect(Array.isArray(KEYWORD_PATTERNS)).toBe(true);
    expect(KEYWORD_PATTERNS.length).toBeGreaterThanOrEqual(14);
  });

  // 정상 매칭
  it('ralph 단독 입력을 감지한다', () => {
    expect(detectKeyword('ralph')?.keyword).toBe('ralph');
  });

  it('ralph + 모드 키워드를 감지한다', () => {
    expect(detectKeyword('ralph 해줘 이것 구현')?.keyword).toBe('ralph');
    expect(detectKeyword('ralph 시작')?.keyword).toBe('ralph');
  });

  it('ralph가 문장 중간에 있으면 매칭하지 않는다 (false positive 방지)', () => {
    expect(detectKeyword('Ralph Waldo Emerson was a philosopher')).toBeNull();
    expect(detectKeyword('ask ralph about this')).toBeNull();
  });

  it('autopilot을 감지한다', () => {
    expect(detectKeyword('autopilot 시작')?.keyword).toBe('autopilot');
  });

  it('canceltenetx를 감지한다', () => {
    expect(detectKeyword('canceltenetx')?.keyword).toBe('cancel');
  });

  it('ulw를 ultrawork로 감지한다', () => {
    expect(detectKeyword('ulw 작업')?.keyword).toBe('ultrawork');
  });

  // false positive 방지
  it('"team"만 단독으로는 매칭하지 않는다', () => {
    expect(detectKeyword('team meeting 준비')).toBeNull();
  });

  it('"team mode"는 매칭한다', () => {
    expect(detectKeyword('team mode 활성화')?.keyword).toBe('team');
  });

  it('"--team"은 매칭한다', () => {
    expect(detectKeyword('--team 플래그')?.keyword).toBe('team');
  });

  it('"pipeline" 단독으로 매칭한다', () => {
    expect(detectKeyword('CI/CD pipeline 설정')?.keyword).toBe('pipeline');
  });

  it('"pipeline mode"도 매칭한다', () => {
    expect(detectKeyword('pipeline mode 실행')?.keyword).toBe('pipeline');
  });

  // cancel 우선순위
  it('cancel이 다른 키워드보다 우선한다', () => {
    expect(detectKeyword('canceltenetx ralph')?.keyword).toBe('cancel');
  });

  // 대소문자 무관
  it('대소문자를 무시한다', () => {
    expect(detectKeyword('RALPH 모드')?.keyword).toBe('ralph');
    expect(detectKeyword('DeepSearch')?.keyword).toBe('deepsearch');
  });

  // 일상어 안전
  it('"analyze"는 매칭하지 않는다 (제거됨)', () => {
    expect(detectKeyword('analyze this code')).toBeNull();
  });

  it('"review"만으로는 매칭하지 않는다', () => {
    // "code review"만 매칭, "review"만은 아님
    expect(detectKeyword('please review this')).toBeNull();
  });

  it('"code review"는 매칭한다', () => {
    expect(detectKeyword('code review 해줘')?.keyword).toBe('code-review');
  });

  // ── 오탐 방지 테스트 ──

  it('"npm 패키지를 업그레이드해줘" → migrate 트리거 안 됨', () => {
    // "업그레이드"는 migrate 키워드가 아님
    expect(detectKeyword('npm 패키지를 업그레이드해줘')).toBeNull();
  });

  it('"시간을 절약하자" → ecomode 트리거 안 됨', () => {
    // "절약"은 "토큰 절약"과 다름
    expect(detectKeyword('시간을 절약하자')).toBeNull();
  });

  it('"코드 좀 정리해줘" → refactor 트리거 안 됨', () => {
    // "정리"는 refactor/리팩토링 키워드가 아님
    expect(detectKeyword('코드 좀 정리해줘')).toBeNull();
  });

  it('"ecomode 켜줘" → ecomode 트리거 됨', () => {
    expect(detectKeyword('ecomode 켜줘')?.keyword).toBe('ecomode');
  });

  it('"리팩토링 시작" → \b가 한글에 작동하지 않아 매칭 안 됨 (알려진 한계)', () => {
    // "리팩토링"은 한글이므로 \b 경계에서 매칭 실패
    expect(detectKeyword('리팩토링 시작')).toBeNull();
  });

  it('"에코 모드" → \b가 한글에 작동하지 않아 매칭 안 됨 (알려진 한계)', () => {
    // \b word boundary는 한글에서 작동하지 않으므로 한글 전용 키워드는 매칭 실패
    // "에코 모드", "토큰 절약", "마이그레이션", "리팩터" 등은 \b 한계로 단독 사용 불가
    expect(detectKeyword('에코 모드 활성화')).toBeNull();
  });

  it('"토큰 절약" → \b가 한글에 작동하지 않아 매칭 안 됨 (알려진 한계)', () => {
    expect(detectKeyword('토큰 절약 모드 시작')).toBeNull();
  });

  it('"마이그레이션" → \b가 한글에 작동하지 않아 매칭 안 됨 (알려진 한계)', () => {
    expect(detectKeyword('마이그레이션 시작')).toBeNull();
  });

  it('"리팩터" → \b가 한글에 작동하지 않아 매칭 안 됨 (알려진 한계)', () => {
    expect(detectKeyword('리팩터 해줘')).toBeNull();
  });

  it('영문 키워드 migrate + 명시적 동작은 매칭된다', () => {
    expect(detectKeyword('migrate 해줘')?.keyword).toBe('migrate');
  });

  it('영문 키워드 migrate 단독은 매칭하지 않는다 (false positive 방지)', () => {
    expect(detectKeyword('migrate the database')).toBeNull();
  });

  it('영문 키워드 refactor + 명시적 동작은 매칭된다', () => {
    expect(detectKeyword('refactor 시작')?.keyword).toBe('refactor');
  });

  it('영문 키워드 refactoring 단독은 매칭하지 않는다 (false positive 방지)', () => {
    expect(detectKeyword('refactoring is needed')).toBeNull();
  });
});
