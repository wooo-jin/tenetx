import { describe, it, expect } from 'vitest';
import { ModelRouter } from '../src/engine/router.js';
import type { Philosophy } from '../src/core/types.js';

const DEFAULT_PHILOSOPHY: Philosophy = {
  name: 'test',
  version: '1.0.0',
  author: 'test',
  principles: {
    'focus-resources-on-judgment': {
      belief: 'test',
      generates: [
        { routing: 'explore → Sonnet, implement → Opus' },
      ],
    },
  },
};

const EMPTY_PHILOSOPHY: Philosophy = {
  name: 'empty',
  version: '1.0.0',
  author: 'test',
  principles: {},
};

describe('ModelRouter', () => {
  it('Philosophy에서 커스텀 라우팅을 추출한다', () => {
    const router = new ModelRouter(DEFAULT_PHILOSOPHY);
    expect(router.recommend('explore')).toBe('sonnet');
    expect(router.recommend('implement')).toBe('opus');
  });

  it('Philosophy에 routing이 없으면 기본 테이블을 사용한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY);
    expect(router.recommend('explore')).toBe('haiku');
    expect(router.recommend('implement')).toBe('opus');
    expect(router.recommend('code-review')).toBe('sonnet');
  });

  it('알 수 없는 카테고리는 sonnet을 반환한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY);
    expect(router.recommend('unknown' as any)).toBe('sonnet');
  });

  it('inferCategory가 탐색 키워드를 올바르게 분류한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY);
    expect(router.inferCategory('파일 찾아줘')).toBe('explore');
    expect(router.inferCategory('이게 뭐야')).toBe('simple-qa');
  });

  it('inferCategory가 구현 키워드를 올바르게 분류한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY);
    expect(router.inferCategory('이 기능 구현해줘')).toBe('implement');
    // "fix this bug"는 "bug" 키워드로 debug-complex(tier 3)가 implement(tier 2)보다 우선
    expect(router.inferCategory('fix this bug')).toBe('debug-complex');
    expect(router.inferCategory('새 API 만들어줘')).toBe('implement');
  });

  it('inferCategory가 리뷰 키워드를 올바르게 분류한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY);
    expect(router.inferCategory('코드 리뷰해줘')).toBe('code-review');
    expect(router.inferCategory('아키텍처 설계')).toBe('architect');
  });

  it('getTable이 라우팅 테이블을 반환한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY);
    const table = router.getTable();
    expect(table).toHaveProperty('haiku');
    expect(table).toHaveProperty('sonnet');
    expect(table).toHaveProperty('opus');
  });

  it('cost-saving 프리셋: implement가 sonnet으로 배정된다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY, 'cost-saving');
    expect(router.recommend('implement')).toBe('sonnet');
    expect(router.recommend('debug-complex')).toBe('sonnet');
    expect(router.recommend('architect')).toBe('opus');
    expect(router.recommend('explore')).toBe('haiku');
  });

  it('max-quality 프리셋: 대부분 opus로 배정된다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY, 'max-quality');
    expect(router.recommend('implement')).toBe('opus');
    expect(router.recommend('code-review')).toBe('opus');
    expect(router.recommend('architect')).toBe('opus');
    expect(router.recommend('explore')).toBe('sonnet');
    expect(router.recommend('file-search')).toBe('haiku');
  });

  it('Philosophy 커스텀 라우팅이 프리셋보다 우선한다', () => {
    const router = new ModelRouter(DEFAULT_PHILOSOPHY, 'cost-saving');
    // Philosophy에 "explore → Sonnet" 명시 → cost-saving의 explore=haiku를 무시
    expect(router.recommend('explore')).toBe('sonnet');
  });

  it('유효하지 않은 프리셋은 기본 라우팅을 사용한다', () => {
    const router = new ModelRouter(EMPTY_PHILOSOPHY, 'invalid' as any);
    expect(router.recommend('implement')).toBe('opus');
    expect(router.recommend('explore')).toBe('haiku');
  });
});
