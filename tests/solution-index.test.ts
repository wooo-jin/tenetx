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
