/**
 * auto-compound-runner gate3 (dedup) 단위 테스트
 *
 * auto-compound-runner.ts의 parseTags/isDuplicate가 내부 함수이므로
 * 동일 로직을 독립적으로 테스트합니다.
 */
import { describe, it, expect } from 'vitest';

// ── parseTags 인라인 재구현 (auto-compound-runner.ts:30-34 동일 로직) ──
function parseTags(content: string): string[] {
  const match = content.match(/tags:\s*\[([^\]]*)\]/);
  if (!match) return [];
  return match[1].split(',').map(t => t.trim().replace(/"/g, '').replace(/'/g, '')).filter(Boolean);
}

function isDuplicate(newContent: string, existingFiles: Map<string, string>): boolean {
  const newTags = parseTags(newContent);
  if (newTags.length === 0) return false;
  for (const [, existingContent] of existingFiles) {
    const existingTags = parseTags(existingContent);
    if (existingTags.length === 0) continue;
    const overlap = newTags.filter(t => existingTags.includes(t));
    const overlapRatio = overlap.length / Math.max(newTags.length, existingTags.length, 1);
    if (overlapRatio >= 0.7) return true;
  }
  return false;
}

describe('parseTags', () => {
  it('정상적인 tags 배열을 파싱한다', () => {
    const content = 'tags: ["react", "hooks", "state"]';
    expect(parseTags(content)).toEqual(['react', 'hooks', 'state']);
  });

  it('작은따옴표도 제거한다', () => {
    const content = "tags: ['react', 'hooks']";
    expect(parseTags(content)).toEqual(['react', 'hooks']);
  });

  it('tags가 없으면 빈 배열을 반환한다', () => {
    expect(parseTags('no tags here')).toEqual([]);
  });

  it('빈 tags 배열을 처리한다', () => {
    expect(parseTags('tags: []')).toEqual([]);
  });

  it('따옴표 안의 공백은 유지된다 (trim은 콤마 구분자 외부만)', () => {
    const content = 'tags: [" react ", " hooks "]';
    // parseTags는 따옴표만 제거하고 내부 공백은 보존 (실제 동작과 일치)
    expect(parseTags(content)).toEqual([' react ', ' hooks ']);
  });

  it('frontmatter 내부의 tags를 파싱한다', () => {
    const content = `---
name: test
tags: ["vitest", "mock", "esm"]
status: experiment
---
content here`;
    expect(parseTags(content)).toEqual(['vitest', 'mock', 'esm']);
  });
});

describe('isDuplicate', () => {
  const makeSolution = (tags: string[]) =>
    `---\ntags: [${tags.map(t => `"${t}"`).join(', ')}]\n---\ncontent`;

  it('태그 70% 이상 겹치면 중복으로 판정한다', () => {
    const existing = new Map([['a.md', makeSolution(['react', 'hooks', 'state'])]]);
    const newContent = makeSolution(['react', 'hooks', 'state']);
    expect(isDuplicate(newContent, existing)).toBe(true);
  });

  it('태그가 70% 미만 겹치면 중복이 아니다', () => {
    const existing = new Map([['a.md', makeSolution(['react', 'hooks', 'state', 'redux', 'context'])]]);
    const newContent = makeSolution(['react', 'vitest', 'testing']);
    expect(isDuplicate(newContent, existing)).toBe(false);
  });

  it('기존 솔루션이 없으면 중복이 아니다', () => {
    const existing = new Map<string, string>();
    const newContent = makeSolution(['react', 'hooks']);
    expect(isDuplicate(newContent, existing)).toBe(false);
  });

  it('새 솔루션에 태그가 없으면 중복이 아니다', () => {
    const existing = new Map([['a.md', makeSolution(['react'])]]);
    expect(isDuplicate('no tags here', existing)).toBe(false);
  });

  it('기존 솔루션에 태그가 없으면 건너뛴다', () => {
    const existing = new Map([['a.md', 'no tags']]);
    const newContent = makeSolution(['react', 'hooks']);
    expect(isDuplicate(newContent, existing)).toBe(false);
  });

  it('여러 기존 솔루션 중 하나라도 겹치면 중복이다', () => {
    const existing = new Map([
      ['a.md', makeSolution(['python', 'django'])],
      ['b.md', makeSolution(['react', 'hooks', 'state'])],
    ]);
    const newContent = makeSolution(['react', 'hooks', 'state']);
    expect(isDuplicate(newContent, existing)).toBe(true);
  });

  it('정확히 70% 경계에서 중복으로 판정한다', () => {
    // 10개 태그 중 7개 겹침 = 70%
    const tags10 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const existing = new Map([['a.md', makeSolution(tags10)]]);
    const newTags = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'x', 'y', 'z']; // 7/10 overlap
    expect(isDuplicate(makeSolution(newTags), existing)).toBe(true);
  });

  it('69% 겹침은 중복이 아니다', () => {
    const tags10 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const existing = new Map([['a.md', makeSolution(tags10)]]);
    const newTags = ['a', 'b', 'c', 'd', 'e', 'f', 'x', 'y', 'z', 'w']; // 6/10 = 60%
    expect(isDuplicate(makeSolution(newTags), existing)).toBe(false);
  });
});
