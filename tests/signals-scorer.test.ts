import { describe, it, expect } from 'vitest';
import { extractLexicalSignals, extractStructuralSignals, extractSignals } from '../src/engine/signals.js';
import { scoreSignals } from '../src/engine/scorer.js';
import { ModelRouter } from '../src/engine/router.js';
import type { Philosophy } from '../src/core/types.js';

describe('Signal Extractor', () => {
  describe('extractLexicalSignals', () => {
    it('단어 수를 정확히 센다', () => {
      const s = extractLexicalSignals('hello world foo');
      expect(s.wordCount).toBe(3);
    });

    it('파일 경로를 감지한다', () => {
      const s = extractLexicalSignals('src/core/harness.ts 파일을 수정해주세요');
      expect(s.filePathCount).toBeGreaterThan(0);
    });

    it('코드 블록을 감지한다', () => {
      expect(extractLexicalSignals('```ts\nconst x = 1;\n```').hasCodeBlock).toBe(true);
      expect(extractLexicalSignals('그냥 텍스트').hasCodeBlock).toBe(false);
    });

    it('아키텍처 키워드를 감지한다', () => {
      const s = extractLexicalSignals('시스템 아키텍처를 설계해줘');
      expect(s.architectureKeywords).toBeGreaterThan(0);
    });

    it('디버깅 키워드를 감지한다', () => {
      const s = extractLexicalSignals('이 에러 왜 발생하는지 디버그해줘');
      expect(s.debugKeywords).toBeGreaterThan(0);
    });

    it('deep/shallow 질문을 구분한다', () => {
      expect(extractLexicalSignals('왜 이렇게 설계했어?').questionDepth).toBe('deep');
      expect(extractLexicalSignals('이 파일 뭐야?').questionDepth).toBe('shallow');
      expect(extractLexicalSignals('구현해줘').questionDepth).toBe('none');
    });

    it('다중 요구사항을 감지한다', () => {
      expect(extractLexicalSignals('이것도 고치고 추가로 테스트 작성해줘').multiRequirement).toBe(true);
    });
  });

  describe('extractStructuralSignals', () => {
    it('서브태스크 마커를 감지한다', () => {
      const s = extractStructuralSignals('1. 먼저 설계하고 2. 그 다음 구현');
      expect(s.estimatedSubtasks).toBeGreaterThan(0);
    });

    it('교차파일 의존성을 감지한다', () => {
      const s = extractStructuralSignals('여러 파일에 걸쳐 리팩토링해야 해');
      expect(s.crossFileDependency).toBe(true);
    });

    it('테스트 필요성을 감지한다', () => {
      expect(extractStructuralSignals('테스트도 작성해줘').needsTests).toBe(true);
      expect(extractStructuralSignals('구현해줘').needsTests).toBe(false);
    });

    it('보안 도메인을 감지한다', () => {
      expect(extractStructuralSignals('인증 로직에 보안 취약점이 있어').securityDomain).toBe(true);
    });

    it('되돌리기 난이도를 판단한다', () => {
      expect(extractStructuralSignals('rm -rf로 전부 지우고').irreversibility).toBe('high');
      expect(extractStructuralSignals('마이그레이션 파일 작성').irreversibility).toBe('medium');
      expect(extractStructuralSignals('변수 이름 변경').irreversibility).toBe('low');
    });
  });
});

describe('Signal Scorer', () => {
  it('단순 질문은 낮은 스코어를 받는다', () => {
    const signals = extractSignals('이게 뭐야?');
    const result = scoreSignals(signals);
    expect(result.total).toBeLessThan(4);
    expect(result.recommendedTier).toBe('haiku');
  });

  it('복잡한 아키텍처 요청은 높은 스코어를 받는다', () => {
    const signals = extractSignals(
      '시스템 아키텍처를 전체적으로 재설계해야 합니다. 여러 파일에 걸친 리팩토링이 필요하고, ' +
      '보안 관점에서 인증 시스템도 점검해주세요. 추가로 마이그레이션도 작성해야 합니다.'
    );
    const result = scoreSignals(signals);
    expect(result.total).toBeGreaterThanOrEqual(8);
    expect(result.recommendedTier).toBe('opus');
  });

  it('이전 실패가 있으면 스코어가 올라간다', () => {
    const base = extractSignals('이 함수 수정해줘');
    const withFailures = extractSignals('이 함수 수정해줘', { previousFailures: 3 });
    expect(scoreSignals(withFailures).total).toBeGreaterThan(scoreSignals(base).total);
  });

  it('스코어 breakdown에 기여 항목이 포함된다', () => {
    const signals = extractSignals('왜 이 에러가 발생하는지 디버그해줘');
    const result = scoreSignals(signals);
    expect(Object.keys(result.contributions).length).toBeGreaterThan(0);
  });
});

describe('ModelRouter.route (하이브리드)', () => {
  const EMPTY_PHILOSOPHY: Philosophy = {
    name: 'empty', version: '1.0.0', author: 'test', principles: {},
  };

  const PHILOSOPHY_WITH_ROUTING: Philosophy = {
    name: 'custom', version: '1.0.0', author: 'test',
    principles: {
      'routing': {
        belief: 'test',
        generates: [{ routing: 'explore → Sonnet, implement → Opus' }],
      },
    },
  };

  it('Philosophy 라우팅이 있으면 카테고리 결과를 신뢰한다', () => {
    const router = new ModelRouter(PHILOSOPHY_WITH_ROUTING);
    const result = router.route('파일 찾아줘');
    expect(result.source).toBe('philosophy');
    expect(result.tier).toBe('sonnet'); // explore → Sonnet (Philosophy)
  });

  it('Philosophy 없으면 신호 스코어링을 사용한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY);
    const result = router.route('이게 뭐야?');
    expect(['signal', 'category']).toContain(result.source);
  });

  it('복잡한 요청에서 에스컬레이션이 발생한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY);
    // 아키텍처 + 보안 + 다중 요구 + 교차파일 → 높은 스코어 → opus로 에스컬레이션
    const result = router.route(
      '시스템 아키텍처를 설계하고, 보안 취약점을 점검하고, 여러 파일에 걸쳐 리팩토링해야 합니다. ' +
      '추가로 테스트도 작성하고 마이그레이션도 필요합니다.'
    );
    expect(result.tier).toBe('opus');
  });

  it('단순 요청은 에스컬레이션 없이 haiku를 유지한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY);
    const result = router.route('이 파일 뭐야?');
    expect(result.tier).toBe('haiku');
  });
});
