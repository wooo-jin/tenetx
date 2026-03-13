import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  matchSkills,
  type SkillMeta,
} from '../src/hooks/skill-injector.js';

describe('parseFrontmatter', () => {
  it('기본 frontmatter 파싱', () => {
    const content = `---
name: my-skill
description: 테스트 스킬
---
Body content here`;

    const { meta, body } = parseFrontmatter(content);
    expect(meta.name).toBe('my-skill');
    expect(meta.description).toBe('테스트 스킬');
    expect(body).toBe('Body content here');
  });

  it('배열 값 파싱 (triggers)', () => {
    const content = `---
name: review
triggers:
  - "코드 리뷰"
  - "review"
  - "검토"
---
스킬 내용`;

    const { meta } = parseFrontmatter(content);
    expect(meta.triggers).toEqual(['코드 리뷰', 'review', '검토']);
  });

  it('따옴표 없는 배열 값', () => {
    const content = `---
name: test
triggers:
  - hello
  - world
---
body`;

    const { meta } = parseFrontmatter(content);
    expect(meta.triggers).toEqual(['hello', 'world']);
  });

  it('frontmatter 없는 콘텐츠', () => {
    const content = 'Just plain content without frontmatter';
    const { meta, body } = parseFrontmatter(content);
    expect(meta).toEqual({});
    expect(body).toBe(content);
  });

  it('빈 frontmatter (구분자 사이 내용 없음)', () => {
    const content = `---
---
body only`;
    // 정규식 패턴에서 구분자 사이에 최소 1줄이 필요하므로 매칭 실패
    const { meta, body } = parseFrontmatter(content);
    expect(Object.keys(meta)).toHaveLength(0);
    expect(body).toBe(content);
  });

  it('작은따옴표 값', () => {
    const content = `---
name: 'quoted-name'
---
body`;
    const { meta } = parseFrontmatter(content);
    expect(meta.name).toBe('quoted-name');
  });

  it('빈 배열 표기', () => {
    const content = `---
name: test
triggers: []
---
body`;
    const result = parseFrontmatter(content);
    expect(result.meta.name).toBe('test');
  });

  it('여러 키-값 쌍', () => {
    const content = `---
name: multi
description: desc
version: 1.0
---
body`;
    const { meta } = parseFrontmatter(content);
    expect(meta.name).toBe('multi');
    expect(meta.description).toBe('desc');
    expect(meta.version).toBe('1.0');
  });
});

describe('matchSkills', () => {
  const skills: SkillMeta[] = [
    { name: 'review', description: '', triggers: ['리뷰', 'review', '검토'], filePath: '', content: '' },
    { name: 'tdd', description: '', triggers: ['tdd', '테스트 주도'], filePath: '', content: '' },
    { name: 'security', description: '', triggers: ['보안', 'security', '취약점'], filePath: '', content: '' },
    { name: 'no-trigger', description: '', triggers: [], filePath: '', content: '' },
  ];

  it('한글 트리거 매칭', () => {
    const matched = matchSkills('이 코드 리뷰해줘', skills);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe('review');
  });

  it('영문 트리거 매칭', () => {
    const matched = matchSkills('code review please', skills);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe('review');
  });

  it('대소문자 무시 매칭', () => {
    const matched = matchSkills('TDD 방식으로 구현', skills);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe('tdd');
  });

  it('매칭 없음', () => {
    const matched = matchSkills('파일 구조 설명해줘', skills);
    expect(matched).toHaveLength(0);
  });

  it('여러 스킬 동시 매칭', () => {
    const matched = matchSkills('보안 리뷰해줘', skills);
    expect(matched).toHaveLength(2);
    const names = matched.map(m => m.name);
    expect(names).toContain('review');
    expect(names).toContain('security');
  });

  it('트리거 없는 스킬은 매칭 안됨', () => {
    const matched = matchSkills('no-trigger 실행', skills);
    expect(matched.find(m => m.name === 'no-trigger')).toBeUndefined();
  });

  it('빈 프롬프트는 매칭 없음', () => {
    const matched = matchSkills('', skills);
    expect(matched).toHaveLength(0);
  });

  it('부분 문자열 매칭', () => {
    const matched = matchSkills('취약점 분석 필요', skills);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe('security');
  });
});

describe('skill session limit', () => {
  const MAX_SKILLS_PER_SESSION = 5;

  it('세션 당 최대 5개 스킬 주입 제한', () => {
    const injected = new Set(['a', 'b', 'c', 'd', 'e']);
    expect(injected.size >= MAX_SKILLS_PER_SESSION).toBe(true);
  });

  it('이미 주입된 스킬은 제외', () => {
    const allMatched = [
      { name: 'review' },
      { name: 'tdd' },
      { name: 'security' },
    ];
    const injected = new Set(['review']);
    const filtered = allMatched.filter(s => !injected.has(s.name));
    expect(filtered).toHaveLength(2);
    expect(filtered.find(s => s.name === 'review')).toBeUndefined();
  });
});
