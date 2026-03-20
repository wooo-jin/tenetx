import { describe, it, expect } from 'vitest';
import {
  loadPackRegistry,
  searchPacks,
  formatPackList,
  type PackRegistry,
} from '../src/core/marketplace.js';

// ---------------------------------------------------------------------------
// loadPackRegistry
// ---------------------------------------------------------------------------

describe('loadPackRegistry', () => {
  it('packs/registry.json을 로드하여 PackRegistry를 반환한다', () => {
    const reg = loadPackRegistry();
    expect(reg.version).toBe(1);
    expect(reg.updated).toBeDefined();
    expect(Array.isArray(reg.packs)).toBe(true);
    expect(reg.packs.length).toBeGreaterThan(0);
  });

  it('모든 팩 엔트리에 필수 필드가 존재한다', () => {
    const reg = loadPackRegistry();
    for (const pack of reg.packs) {
      expect(pack.name).toBeTruthy();
      expect(pack.version).toBeTruthy();
      expect(pack.description).toBeTruthy();
      expect(pack.author).toBeTruthy();
      expect(Array.isArray(pack.tags)).toBe(true);
      expect(pack.tags.length).toBeGreaterThan(0);
      expect(pack.source).toBeTruthy();
      expect(typeof pack.provides.rules).toBe('number');
      expect(typeof pack.provides.solutions).toBe('number');
    }
  });

  it('내장 팩 5개(backend, frontend, security, data, devops)가 포함되어 있다', () => {
    const reg = loadPackRegistry();
    const names = reg.packs.map((p) => p.name);
    expect(names).toContain('backend');
    expect(names).toContain('frontend');
    expect(names).toContain('security');
    expect(names).toContain('data');
    expect(names).toContain('devops');
  });
});

// ---------------------------------------------------------------------------
// searchPacks
// ---------------------------------------------------------------------------

describe('searchPacks', () => {
  const testRegistry: PackRegistry = {
    version: 1,
    updated: '2026-03-20',
    packs: [
      {
        name: 'backend',
        version: '1.0.0',
        description: 'Backend engineering best practices',
        author: 'tenetx',
        tags: ['backend', 'api', 'security'],
        source: 'builtin',
        provides: { rules: 5, solutions: 3 },
      },
      {
        name: 'frontend',
        version: '1.0.0',
        description: 'Frontend development standards',
        author: 'tenetx',
        tags: ['frontend', 'react', 'accessibility'],
        source: 'builtin',
        provides: { rules: 4, solutions: 2 },
      },
    ],
  };

  it('이름으로 검색할 수 있다', () => {
    const results = searchPacks('backend', testRegistry);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('backend');
  });

  it('설명(description)으로 검색할 수 있다', () => {
    const results = searchPacks('engineering', testRegistry);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('backend');
  });

  it('태그로 검색할 수 있다', () => {
    const results = searchPacks('react', testRegistry);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('frontend');
  });

  it('대소문자를 무시한다', () => {
    const results = searchPacks('BACKEND', testRegistry);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('backend');
  });

  it('빈 쿼리는 전체 팩을 반환한다', () => {
    const results = searchPacks('', testRegistry);
    expect(results).toHaveLength(2);
  });

  it('매칭되지 않는 쿼리는 빈 배열을 반환한다', () => {
    const results = searchPacks('nonexistent-xyz', testRegistry);
    expect(results).toHaveLength(0);
  });

  it('여러 키워드는 AND 조건으로 매칭한다', () => {
    const results = searchPacks('backend api', testRegistry);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('backend');
  });

  it('registry 없이 호출하면 내장 레지스트리에서 검색한다', () => {
    const results = searchPacks('security');
    expect(results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// formatPackList
// ---------------------------------------------------------------------------

describe('formatPackList', () => {
  it('빈 팩 목록은 "No packs found." 메시지를 반환한다', () => {
    const output = formatPackList([]);
    expect(output).toContain('No packs found');
  });

  it('팩 정보를 포맷된 문자열로 반환한다', () => {
    const packs = [
      {
        name: 'test-pack',
        version: '1.0.0',
        description: 'Test description',
        author: 'tester',
        tags: ['tag1', 'tag2'],
        source: 'builtin',
        provides: { rules: 3, solutions: 1 },
      },
    ];
    const output = formatPackList(packs);
    expect(output).toContain('test-pack');
    expect(output).toContain('v1.0.0');
    expect(output).toContain('Test description');
    expect(output).toContain('tester');
    expect(output).toContain('tag1, tag2');
    expect(output).toContain('rules: 3');
    expect(output).toContain('solutions: 1');
  });
});
