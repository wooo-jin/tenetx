import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../src/hooks/intent-classifier.js';
import type { Intent } from '../src/hooks/intent-classifier.js';

describe('intent-classifier', () => {
  describe('classifyIntent — implement', () => {
    // NOTE: 한글 키워드("만들어", "추가해" 등)는 패턴에 \b가 붙어 있어
    // 한글 문자 경계에서 작동하지 않으므로 실제로는 매칭되지 않음.
    // 영어 키워드는 정상적으로 word-boundary 매칭됨.

    it('"create" 영어 키워드를 implement로 분류한다', () => {
      expect(classifyIntent('create a new function for sorting')).toBe('implement');
    });

    it('"add" 영어 키워드를 implement로 분류한다', () => {
      expect(classifyIntent('add validation to the form')).toBe('implement');
    });

    it('"implement" 영어 키워드를 implement로 분류한다', () => {
      expect(classifyIntent('implement the user authentication flow')).toBe('implement');
    });

    it('"build" 영어 키워드를 implement로 분류한다', () => {
      expect(classifyIntent('build a REST API endpoint')).toBe('implement');
    });

    it('"write" 영어 키워드를 implement로 분류한다', () => {
      expect(classifyIntent('write a unit test for this function')).toBe('implement');
    });

    it('"make" 영어 키워드를 implement로 분류한다', () => {
      expect(classifyIntent('make a helper function')).toBe('implement');
    });

    it('한글 "만들어"는 \\b 경계 제약으로 매칭되지 않는다 (알려진 한계)', () => {
      // 한글은 ASCII word boundary (\b) 밖에 있어서 매칭 실패
      expect(classifyIntent('로그인 기능 만들어줘')).not.toBe('implement');
    });
  });

  describe('classifyIntent — debug', () => {
    it('"에러 났어"를 debug로 분류한다', () => {
      expect(classifyIntent('에러 났어. 어떻게 고쳐?')).toBe('debug');
    });

    it('"버그"를 debug로 분류한다', () => {
      expect(classifyIntent('이 버그 왜 생기는지 봐줘')).toBe('debug');
    });

    it('"고쳐"를 debug로 분류한다', () => {
      expect(classifyIntent('이 부분 고쳐줘')).toBe('debug');
    });

    it('"fix" 영어 키워드를 debug로 분류한다', () => {
      expect(classifyIntent('fix the null pointer exception')).toBe('debug');
    });

    it('"error" 영어 키워드를 debug로 분류한다', () => {
      expect(classifyIntent('TypeError: cannot read property of undefined error')).toBe('debug');
    });

    it('"crash" 영어 키워드를 debug로 분류한다', () => {
      expect(classifyIntent('the app crash on startup')).toBe('debug');
    });

    it('"broken" 영어 키워드를 debug로 분류한다', () => {
      expect(classifyIntent('this function is broken')).toBe('debug');
    });

    it('"왜"를 debug로 분류한다', () => {
      expect(classifyIntent('왜 이렇게 느리지?')).toBe('debug');
    });
  });

  describe('classifyIntent — refactor', () => {
    it('"리팩토링 해"를 refactor로 분류한다', () => {
      expect(classifyIntent('이 코드 리팩토링 해줘')).toBe('refactor');
    });

    it('"리팩터"를 refactor로 분류한다', () => {
      expect(classifyIntent('리팩터 해줄래?')).toBe('refactor');
    });

    it('"refactor" 영어 키워드를 refactor로 분류한다', () => {
      expect(classifyIntent('refactor this component to use hooks')).toBe('refactor');
    });

    it('"clean up" 영어 키워드를 refactor로 분류한다', () => {
      expect(classifyIntent('clean up the messy code')).toBe('refactor');
    });

    it('"optimize" 영어 키워드를 refactor로 분류한다', () => {
      expect(classifyIntent('optimize this query')).toBe('refactor');
    });

    it('"개선"을 refactor로 분류한다', () => {
      expect(classifyIntent('코드 구조 개선해줘')).toBe('refactor');
    });
  });

  describe('classifyIntent — explain', () => {
    it('"설명해줘"를 explain으로 분류한다', () => {
      expect(classifyIntent('이 코드 설명해줘')).toBe('explain');
    });

    it('"뭐야"를 explain으로 분류한다', () => {
      expect(classifyIntent('클로저가 뭐야?')).toBe('explain');
    });

    it('"explain" 영어 키워드를 explain으로 분류한다', () => {
      expect(classifyIntent('explain how async/await works')).toBe('explain');
    });

    it('"what is" 영어 키워드를 explain으로 분류한다', () => {
      expect(classifyIntent('what is dependency injection?')).toBe('explain');
    });

    it('"how does" 영어 키워드를 explain으로 분류한다', () => {
      expect(classifyIntent('how does React reconciliation work?')).toBe('explain');
    });

    it('"알려"를 explain으로 분류한다', () => {
      expect(classifyIntent('TypeScript 제네릭 알려줘')).toBe('explain');
    });
  });

  describe('classifyIntent — review', () => {
    it('"리뷰해줘"를 review로 분류한다', () => {
      expect(classifyIntent('이 코드 리뷰해줘')).toBe('review');
    });

    it('"검토"를 review로 분류한다', () => {
      expect(classifyIntent('PR 검토해줄래?')).toBe('review');
    });

    it('"review" 영어 키워드를 review로 분류한다', () => {
      expect(classifyIntent('review this pull request')).toBe('review');
    });

    it('"audit" 영어 키워드를 review로 분류한다', () => {
      expect(classifyIntent('audit the security of this code')).toBe('review');
    });
  });

  describe('classifyIntent — explore', () => {
    it('"찾아줘"를 explore로 분류한다', () => {
      expect(classifyIntent('이 함수 어디서 호출하는지 찾아줘')).toBe('explore');
    });

    it('"어디에"를 explore로 분류한다', () => {
      expect(classifyIntent('setUser가 어디에 정의되어있어?')).toBe('explore');
    });

    it('"find" 영어 키워드를 explore로 분류한다', () => {
      expect(classifyIntent('find all usages of this function')).toBe('explore');
    });

    it('"search" 영어 키워드를 explore로 분류한다', () => {
      expect(classifyIntent('search for deprecated imports')).toBe('explore');
    });

    it('"grep" 영어 키워드를 explore로 분류한다', () => {
      expect(classifyIntent('grep for TODO comments in src')).toBe('explore');
    });
  });

  describe('classifyIntent — design', () => {
    it('"설계해줘"를 design으로 분류한다', () => {
      expect(classifyIntent('DB 스키마 설계해줘')).toBe('design');
    });

    it('"아키텍처"를 design으로 분류한다', () => {
      // "어떻게"는 explain 패턴보다 design 패턴이 뒤에 위치하므로
      // explain이 먼저 매칭됨 — 순수 아키텍처 문장으로 테스트
      expect(classifyIntent('마이크로서비스 아키텍처 구조를 설계해야 해')).toBe('design');
    });

    it('"design" 영어 키워드를 design으로 분류한다', () => {
      expect(classifyIntent('design a caching strategy for this API')).toBe('design');
    });

    it('"architect" 영어 키워드를 design으로 분류한다', () => {
      expect(classifyIntent('architect the data pipeline')).toBe('design');
    });

    it('"structure" 영어 키워드를 design으로 분류한다', () => {
      expect(classifyIntent('suggest a directory structure')).toBe('design');
    });
  });

  describe('classifyIntent — general (fallback)', () => {
    it('빈 문자열은 general을 반환한다', () => {
      expect(classifyIntent('')).toBe('general');
    });

    it('패턴이 일치하지 않는 프롬프트는 general을 반환한다', () => {
      expect(classifyIntent('안녕하세요')).toBe('general');
    });

    it('숫자만 있는 입력은 general을 반환한다', () => {
      expect(classifyIntent('12345')).toBe('general');
    });

    it('특수문자만 있는 입력은 general을 반환한다', () => {
      expect(classifyIntent('!@#$%^')).toBe('general');
    });
  });

  describe('classifyIntent — 첫 번째 매칭 우선순위', () => {
    it('implement(영어)와 debug 패턴 모두 있으면 implement를 먼저 반환한다 (list 순서 우선)', () => {
      // implement rule이 debug rule보다 먼저 등록됨
      // "add"는 implement, "error"는 debug → implement가 먼저 매칭
      const result = classifyIntent('add a fix for the error');
      expect(result).toBe('implement');
    });

    it('debug 키워드만 있는 경우 debug로 분류한다', () => {
      const result = classifyIntent('에러가 있어서 확인해줘');
      expect(result).toBe('debug');
    });

    it('debug와 refactor 패턴 모두 있으면 debug를 먼저 반환한다', () => {
      // debug rule이 refactor rule보다 먼저 등록됨
      const result = classifyIntent('버그 고쳐서 리팩토링해줘');
      expect(result).toBe('debug');
    });

    it('explain과 design 패턴 모두 있으면 explain을 먼저 반환한다', () => {
      // explain rule이 design rule보다 먼저 등록됨
      // "어떻게"는 explain, "아키텍처"는 design
      const result = classifyIntent('아키텍처를 어떻게 설계하면 좋을까?');
      expect(result).toBe('explain');
    });
  });

  describe('classifyIntent — 대소문자 무관', () => {
    it('"FIX" 대문자는 debug로 분류한다', () => {
      expect(classifyIntent('FIX this bug')).toBe('debug');
    });

    it('"EXPLAIN" 대문자는 explain으로 분류한다', () => {
      expect(classifyIntent('EXPLAIN this concept')).toBe('explain');
    });

    it('"REFACTOR" 대문자는 refactor로 분류한다', () => {
      expect(classifyIntent('REFACTOR the codebase')).toBe('refactor');
    });
  });

  describe('classifyIntent — 반환 타입 검증', () => {
    const validIntents: Intent[] = ['implement', 'debug', 'refactor', 'explain', 'review', 'explore', 'design', 'general'];

    it('반환값이 항상 유효한 Intent 타입이다', () => {
      const testCases = [
        '만들어줘',
        '버그 고쳐',
        '리팩토링해줘',
        '설명해줘',
        '리뷰해줘',
        '찾아줘',
        '설계해줘',
        '안녕',
      ];
      for (const prompt of testCases) {
        const result = classifyIntent(prompt);
        expect(validIntents).toContain(result);
      }
    });
  });
});
