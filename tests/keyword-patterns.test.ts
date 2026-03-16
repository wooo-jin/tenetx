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
  it('ralph를 정확히 감지한다', () => {
    expect(detectKeyword('ralph 이것 구현해')?.keyword).toBe('ralph');
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

  it('"pipeline"만으로는 매칭하지 않는다', () => {
    expect(detectKeyword('CI/CD pipeline 설정')).toBeNull();
  });

  it('"pipeline mode"는 매칭한다', () => {
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
});
