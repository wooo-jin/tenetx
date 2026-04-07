import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getOrBuildIndex, isIndexStale, resetIndexCache } from '../src/engine/solution-index.js';
import { serializeSolutionV3, DEFAULT_EVIDENCE } from '../src/engine/solution-format.js';
import type { SolutionV3, SolutionStatus } from '../src/engine/solution-format.js';

function createSolutionFile(dir: string, name: string, tags: string[], status: SolutionStatus = 'candidate') {
  const solution: SolutionV3 = {
    frontmatter: {
      name, version: 1, status, confidence: 0.5, type: 'pattern',
      scope: 'me', tags, identifiers: [], evidence: { ...DEFAULT_EVIDENCE },
      created: '2026-03-24', updated: '2026-03-24', supersedes: null, extractedBy: 'manual',
    },
    context: 'test', content: 'test content',
  };
  fs.writeFileSync(path.join(dir, `${name}.md`), serializeSolutionV3(solution));
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-index-test-'));
  resetIndexCache();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getOrBuildIndex', () => {
  it('builds index with one entry per solution file', () => {
    createSolutionFile(tmpDir, 'alpha', ['tag-a']);
    createSolutionFile(tmpDir, 'beta', ['tag-b']);

    const index = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);

    expect(index.entries).toHaveLength(2);
    const names = index.entries.map(e => e.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
  });

  it('returns the same object reference on the second call (cached)', () => {
    createSolutionFile(tmpDir, 'gamma', ['tag-g']);

    const first = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);
    const second = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);

    expect(second).toBe(first);
  });

  it('rebuilds index when a new file is added to the directory', () => {
    createSolutionFile(tmpDir, 'delta', ['tag-d']);
    const first = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);
    expect(first.entries).toHaveLength(1);

    // Touch directory mtime by writing a new file
    createSolutionFile(tmpDir, 'epsilon', ['tag-e']);

    const second = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);
    expect(second).not.toBe(first);
    expect(second.entries).toHaveLength(2);
  });

  it('returns empty entries for an empty directory', () => {
    const index = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);

    expect(index.entries).toHaveLength(0);
  });

  it('returns empty entries for a non-existent directory', () => {
    const missing = path.join(os.tmpdir(), `no-such-dir-${Date.now()}`);

    const index = getOrBuildIndex([{ dir: missing, scope: 'me' }]);

    expect(index.entries).toHaveLength(0);
  });

  it('filters out retired solutions', () => {
    createSolutionFile(tmpDir, 'active', ['tag-a'], 'verified');
    createSolutionFile(tmpDir, 'retired-one', ['tag-r'], 'retired');

    const index = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);

    expect(index.entries).toHaveLength(1);
    expect(index.entries[0].name).toBe('active');
  });
});

describe('isIndexStale', () => {
  it('returns false when directory mtime has not changed', () => {
    createSolutionFile(tmpDir, 'zeta', ['tag-z']);
    const index = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);

    expect(isIndexStale(index)).toBe(false);
  });

  it('returns true when directory mtime has changed', () => {
    createSolutionFile(tmpDir, 'eta', ['tag-e']);
    const index = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);

    // Add a file to change the directory mtime
    createSolutionFile(tmpDir, 'theta', ['tag-t']);

    expect(isIndexStale(index)).toBe(true);
  });
});

describe('resetIndexCache', () => {
  it('forces a rebuild on the next getOrBuildIndex call', () => {
    createSolutionFile(tmpDir, 'iota', ['tag-i']);
    const first = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);

    resetIndexCache();

    const second = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);
    expect(second).not.toBe(first);
  });
});

describe('cache key isolation by dirs signature', () => {
  // Regression: 이전엔 단일 cachedIndex라 다른 dirs로 호출해도
  // 캐시된 dirs의 mtime이 안 변하면 stale 캐시를 반환하는 버그가 있었음.
  it('returns separate indexes for different dir sets', () => {
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-index-other-'));
    try {
      createSolutionFile(tmpDir, 'aaa', ['tag-a']);
      createSolutionFile(otherDir, 'bbb', ['tag-b']);

      const indexA = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);
      const indexB = getOrBuildIndex([{ dir: otherDir, scope: 'me' }]);

      expect(indexA.entries.map(e => e.name)).toEqual(['aaa']);
      expect(indexB.entries.map(e => e.name)).toEqual(['bbb']);
      expect(indexA).not.toBe(indexB);

      // Calling A again should return the cached A, not B
      const indexA2 = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);
      expect(indexA2).toBe(indexA);
    } finally {
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it('treats same dirs in different order as DIFFERENT cache keys (precedence preserved)', () => {
    // dirs 순서는 솔루션 precedence chain (me > team > project, by convention).
    // 캐시 키가 sort()로 만들어지면 precedence가 무너진다.
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-index-dirA-'));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-index-dirB-'));
    try {
      createSolutionFile(dirA, 'one', ['tag-1']);
      createSolutionFile(dirB, 'two', ['tag-2']);

      const order1 = getOrBuildIndex([
        { dir: dirA, scope: 'me' },
        { dir: dirB, scope: 'project' },
      ]);
      const order2 = getOrBuildIndex([
        { dir: dirB, scope: 'project' },
        { dir: dirA, scope: 'me' },
      ]);

      expect(order2).not.toBe(order1);
      // entries는 입력 dir 순서대로 누적되어야 한다 (precedence 보존)
      expect(order1.entries.map(e => e.scope)).toEqual(['me', 'project']);
      expect(order2.entries.map(e => e.scope)).toEqual(['project', 'me']);
    } finally {
      fs.rmSync(dirA, { recursive: true, force: true });
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  });

  it('signature is escape-safe against delimiter characters in dir paths', () => {
    // dir에 | 또는 : 가 들어와도 시그니처 충돌이 발생하지 않아야 함.
    // 이전 "scope:dir" + "|" join 방식은 충돌 가능했음.
    const weirdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'with|pipe-and:colon-'));
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'other-'));
    try {
      createSolutionFile(weirdDir, 'pipey', ['tag-p']);
      createSolutionFile(otherDir, 'normy', ['tag-n']);

      const a = getOrBuildIndex([{ dir: weirdDir, scope: 'me' }]);
      const b = getOrBuildIndex([{ dir: otherDir, scope: 'me' }]);

      expect(a).not.toBe(b);
      expect(a.entries[0]?.name).toBe('pipey');
      expect(b.entries[0]?.name).toBe('normy');
    } finally {
      fs.rmSync(weirdDir, { recursive: true, force: true });
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it('treats same dir with different scope as separate caches', () => {
    createSolutionFile(tmpDir, 'shared', ['tag-s']);

    const meIndex = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);
    const projectIndex = getOrBuildIndex([{ dir: tmpDir, scope: 'project' }]);

    expect(meIndex).not.toBe(projectIndex);
    expect(meIndex.entries[0]?.scope).toBe('me');
    expect(projectIndex.entries[0]?.scope).toBe('project');
  });
});
