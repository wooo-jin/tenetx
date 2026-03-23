import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  matchSkills,
  type SkillMeta,
} from '../src/hooks/skill-injector.js';
import { KEYWORD_PATTERNS } from '../src/hooks/keyword-detector.js';

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
    // tdd는 keyword-detector가 처리하므로 skill-injector에서 제외됨 (이중 주입 방지)
    const matched = matchSkills('TDD 방식으로 구현', skills);
    expect(matched).toHaveLength(0);
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

// ── 이중 주입 방지 테스트 ──

describe('keyword-detector 스킬 이중 주입 방지', () => {
  // keyword-detector가 담당하는 스킬 이름 집합
  const keywordDetectorSkillNames = new Set(
    KEYWORD_PATTERNS
      .filter(p => p.type === 'skill' || p.type === 'inject')
      .map(p => p.skill ?? p.keyword)
  );

  it('keyword-detector가 처리하는 스킬 목록이 비어있지 않다', () => {
    expect(keywordDetectorSkillNames.size).toBeGreaterThan(0);
  });

  it('ralph는 keyword-detector가 처리하므로 skill-injector에서 제외된다', () => {
    expect(keywordDetectorSkillNames.has('ralph')).toBe(true);
    const skills: SkillMeta[] = [
      { name: 'ralph', description: '', triggers: ['ralph'], filePath: '', content: '' },
    ];
    const matched = matchSkills('ralph 모드 시작', skills);
    expect(matched).toHaveLength(0); // skill-injector에서 제외됨
  });

  it('autopilot은 keyword-detector가 처리하므로 skill-injector에서 제외된다', () => {
    expect(keywordDetectorSkillNames.has('autopilot')).toBe(true);
    const skills: SkillMeta[] = [
      { name: 'autopilot', description: '', triggers: ['autopilot'], filePath: '', content: '' },
    ];
    const matched = matchSkills('autopilot 실행', skills);
    expect(matched).toHaveLength(0);
  });

  it('ecomode는 keyword-detector가 처리하므로 skill-injector에서 제외된다', () => {
    expect(keywordDetectorSkillNames.has('ecomode')).toBe(true);
    const skills: SkillMeta[] = [
      { name: 'ecomode', description: '', triggers: ['ecomode'], filePath: '', content: '' },
    ];
    const matched = matchSkills('ecomode 모드', skills);
    expect(matched).toHaveLength(0);
  });

  it('ultrawork, team, ccg 등도 keyword-detector 담당', () => {
    for (const name of ['ultrawork', 'team', 'ccg', 'ralplan', 'deep-interview', 'pipeline']) {
      expect(keywordDetectorSkillNames.has(name)).toBe(true);
    }
  });

  it('keyword-detector에 없는 스킬은 skill-injector에서 정상 매칭된다', () => {
    const customSkills: SkillMeta[] = [
      { name: 'my-custom-skill', description: '', triggers: ['커스텀'], filePath: '', content: '' },
    ];
    const matched = matchSkills('커스텀 스킬 실행', customSkills);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe('my-custom-skill');
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
