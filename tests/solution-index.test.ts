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

  // C2 regression (2026-04-09): the earlier index-builder dropped
  // malformed files with zero user-visible feedback. A test file with
  // the wrong `evidence` schema disappeared from MCP search and was
  // completely undebuggable without reading source code. C2 added
  // logger hooks; these tests lock in the behavior contract:
  //   - a malformed frontmatter file is dropped (filter semantics unchanged)
  //   - the valid siblings stay indexed
  //   - the drop is diagnostically visible when the user asks for logs
  //
  // We test the *outcome* rather than the specific log call (which would
  // tightly couple the test to the logger mock shape and break on
  // cosmetic changes). The outcome is: file count on disk > index size,
  // valid files still present, invalid files excluded.
  it('C2: silently drops malformed frontmatter files but keeps valid siblings', () => {
    createSolutionFile(tmpDir, 'valid', ['tag-v'], 'verified');
    // Malformed file: frontmatter section is corrupt JSON-ish, parser
    // returns null, solution-index skips it.
    fs.writeFileSync(
      path.join(tmpDir, 'broken.md'),
      '---\nname: broken\nthis is not valid yaml: : :\n---\n\n## Content\nnothing\n',
    );
    // File that looks valid by having `---` delimiters but missing
    // required fields (version, status, confidence, type, scope, tags,
    // evidence) → validateFrontmatter returns false → parseFrontmatterOnly
    // returns null → dropped.
    fs.writeFileSync(
      path.join(tmpDir, 'missing-fields.md'),
      '---\nname: missing-fields\n---\n\n## Content\nnothing\n',
    );

    const index = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);

    // Only the valid file makes it into the index
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0].name).toBe('valid');
    // Count on disk: 3 files (valid, broken, missing-fields)
    expect(fs.readdirSync(tmpDir).filter(f => f.endsWith('.md'))).toHaveLength(3);
  });

  it('C2: filter semantics preserved — retired + malformed + valid all coexist', () => {
    createSolutionFile(tmpDir, 'alpha', ['tag-a'], 'verified');
    createSolutionFile(tmpDir, 'beta-retired', ['tag-b'], 'retired');
    fs.writeFileSync(path.join(tmpDir, 'gamma-broken.md'), '---\ninvalid: [unclosed\n---\n');

    const index = getOrBuildIndex([{ dir: tmpDir, scope: 'me' }]);

    // Only alpha survives — retired is filtered, gamma is malformed
    expect(index.entries.map(e => e.name)).toEqual(['alpha']);
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

describe('PR2c-2: LRU eviction + HARD_CAP', () => {
  it('LRU evicts oldest entries beyond MAX_CACHE_ENTRIES (32)', () => {
    resetIndexCache();
    const tmpDirs: string[] = [];
    try {
      for (let i = 0; i < 33; i++) {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), `solution-index-lru-${i}-`));
        tmpDirs.push(d);
        createSolutionFile(d, `n${i}`, [`t${i}`]);
        getOrBuildIndex([{ dir: d, scope: 'me' }]);
      }
      // 첫 번째 dir의 cache는 LRU evict 됐을 것 (32 초과)
      const firstAgain = getOrBuildIndex([{ dir: tmpDirs[0], scope: 'me' }]);
      const firstYetAgain = getOrBuildIndex([{ dir: tmpDirs[0], scope: 'me' }]);
      expect(firstYetAgain).toBe(firstAgain);
    } finally {
      for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('rebuild path가 LRU touch한다 (M5 회귀)', () => {
    // M5 fix: stale rebuild가 delete + set으로 hot을 newest로 reorder.
    resetIndexCache();
    const hotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-index-hot-'));
    const coldDirs: string[] = [];
    try {
      createSolutionFile(hotDir, 'hot1', ['hottag']);
      getOrBuildIndex([{ dir: hotDir, scope: 'me' }]);

      // 31 cold (cache 32, hot oldest)
      for (let i = 0; i < 31; i++) {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), `solution-index-cold-${i}-`));
        coldDirs.push(d);
        createSolutionFile(d, `c${i}`, [`ct${i}`]);
        getOrBuildIndex([{ dir: d, scope: 'me' }]);
      }

      // hot stale → rebuild가 newest로 reorder
      createSolutionFile(hotDir, 'hot2', ['hottag2']);
      const hotRebuilt = getOrBuildIndex([{ dir: hotDir, scope: 'me' }]);
      expect(hotRebuilt.entries).toHaveLength(2);

      // 1 cold 더 → cache 33 → oldest evict
      const lastCold = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-index-cold-last-'));
      coldDirs.push(lastCold);
      createSolutionFile(lastCold, 'clast', ['lasttag']);
      getOrBuildIndex([{ dir: lastCold, scope: 'me' }]);

      // hot은 살아남아야 함
      const hotAfter = getOrBuildIndex([{ dir: hotDir, scope: 'me' }]);
      expect(hotAfter).toBe(hotRebuilt);
    } finally {
      fs.rmSync(hotDir, { recursive: true, force: true });
      for (const d of coldDirs) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('HARD_CAP 경로: 5000개 초과 디렉터리에서 statSync 사전 정렬', () => {
    // 6000개 빈 .md 파일 — YAML parse 실패하지만 statSync 경로가 동작하는지
    resetIndexCache();
    const bigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'solution-index-bigdir-'));
    try {
      const now = Date.now() / 1000;
      for (let i = 0; i < 6000; i++) {
        const fp = path.join(bigDir, `f${i}.md`);
        fs.writeFileSync(fp, '');
        fs.utimesSync(fp, now, now + i);
      }

      const start = Date.now();
      const index = getOrBuildIndex([{ dir: bigDir, scope: 'me' }]);
      const elapsed = Date.now() - start;

      expect(index.entries).toHaveLength(0);
      expect(elapsed).toBeLessThan(3000); // hook timeout 3s 안에
    } finally {
      fs.rmSync(bigDir, { recursive: true, force: true });
    }
  });
});
