import { describe, it, expect } from 'vitest';
import {
  buildTermNormalizer,
  DEFAULT_MATCH_TERMS,
  defaultNormalizer,
  type MatchTermEntry,
} from '../src/engine/term-normalizer.js';

describe('buildTermNormalizer', () => {
  it('converts MatchTermEntry[] into hash-indexed maps', () => {
    const entries: MatchTermEntry[] = [
      { canonical: 'react', matchTerms: ['jsx', 'component'] },
      { canonical: 'database', matchTerms: ['db', 'sql'] },
    ];
    const normalizer = buildTermNormalizer(entries);

    // canonicalToTerms: key is canonical, value is the full Set including canonical itself
    expect(normalizer.canonicalToTerms.get('react')).toBeDefined();
    expect(normalizer.canonicalToTerms.get('react')!.has('react')).toBe(true);
    expect(normalizer.canonicalToTerms.get('react')!.has('jsx')).toBe(true);
    expect(normalizer.canonicalToTerms.get('react')!.has('component')).toBe(true);

    // termToCanonicals: key is any term (including canonical), value is canonicals array
    expect(normalizer.termToCanonicals.get('jsx')).toEqual(['react']);
    expect(normalizer.termToCanonicals.get('react')).toEqual(['react']);
    expect(normalizer.termToCanonicals.get('db')).toEqual(['database']);
  });

  it('reverse lookup is O(1) Map-based (not Object.entries sweep)', () => {
    // Build a normalizer with many entries — the old O(n) reverse sweep would
    // slow down linearly. With a Map, lookup is constant-time.
    const manyEntries: MatchTermEntry[] = [];
    for (let i = 0; i < 200; i++) {
      manyEntries.push({
        canonical: `canonical-${i}`,
        matchTerms: [`term-${i}-a`, `term-${i}-b`, `term-${i}-c`],
      });
    }
    const normalizer = buildTermNormalizer(manyEntries);

    // Direct Map lookup — no O(n) iteration
    expect(normalizer.termToCanonicals.get('term-42-b')).toEqual(['canonical-42']);
    expect(normalizer.termToCanonicals.has('term-199-c')).toBe(true);
    expect(normalizer.termToCanonicals.has('nonexistent')).toBe(false);

    // Verify Map size as structural evidence
    expect(normalizer.termToCanonicals.size).toBeGreaterThanOrEqual(200 * 4); // canonical + 3 matchTerms
  });

  it('ambiguous terms can map to multiple canonicals', () => {
    const entries: MatchTermEntry[] = [
      { canonical: 'test', matchTerms: ['testing', 'spec', 'mock'] },
      { canonical: 'di', matchTerms: ['dependency', 'injection', 'mock'] },
    ];
    const normalizer = buildTermNormalizer(entries);

    // "mock" belongs to both "test" and "di" — normalizer must preserve both
    const mockCanonicals = normalizer.termToCanonicals.get('mock');
    expect(mockCanonicals).toBeDefined();
    expect(mockCanonicals!.length).toBe(2);
    expect(mockCanonicals).toContain('test');
    expect(mockCanonicals).toContain('di');
  });

  it('deduplicates matchTerms within an entry', () => {
    const entries: MatchTermEntry[] = [
      { canonical: 'react', matchTerms: ['jsx', 'jsx', 'component', 'jsx'] },
    ];
    const normalizer = buildTermNormalizer(entries);
    // Set deduplication: only 2 unique matchTerms + 1 canonical
    expect(normalizer.canonicalToTerms.get('react')!.size).toBe(3);
  });
});

describe('normalizeTerms', () => {
  it('expands a canonical to all its match terms', () => {
    const entries: MatchTermEntry[] = [
      { canonical: 'react', matchTerms: ['jsx', 'component', 'hook'] },
    ];
    const normalizer = buildTermNormalizer(entries);
    const result = normalizer.normalizeTerms(['react']);
    expect(result).toContain('react');
    expect(result).toContain('jsx');
    expect(result).toContain('component');
    expect(result).toContain('hook');
  });

  it('expands a match term (reverse) to canonical AND sibling match terms', () => {
    const entries: MatchTermEntry[] = [
      { canonical: 'react', matchTerms: ['jsx', 'component', 'hook'] },
    ];
    const normalizer = buildTermNormalizer(entries);
    const result = normalizer.normalizeTerms(['jsx']);
    // jsx → react (reverse) → all of react's match terms (siblings)
    expect(result).toContain('jsx');
    expect(result).toContain('react');
    expect(result).toContain('component');
    expect(result).toContain('hook');
  });

  it('handles ambiguous terms — includes all canonicals and their families', () => {
    const entries: MatchTermEntry[] = [
      { canonical: 'test', matchTerms: ['spec', 'mock'] },
      { canonical: 'di', matchTerms: ['injection', 'mock'] },
    ];
    const normalizer = buildTermNormalizer(entries);
    const result = normalizer.normalizeTerms(['mock']);
    // mock → [test, di] → expand both families
    expect(result).toContain('mock');
    expect(result).toContain('test');
    expect(result).toContain('spec');
    expect(result).toContain('di');
    expect(result).toContain('injection');
  });

  it('unknown terms stay as themselves', () => {
    const entries: MatchTermEntry[] = [
      { canonical: 'react', matchTerms: ['jsx'] },
    ];
    const normalizer = buildTermNormalizer(entries);
    const result = normalizer.normalizeTerms(['unknown-term']);
    expect(result).toEqual(['unknown-term']);
  });

  it('empty input returns empty output', () => {
    const normalizer = buildTermNormalizer([]);
    expect(normalizer.normalizeTerms([])).toEqual([]);
  });

  it('dedupes results', () => {
    const entries: MatchTermEntry[] = [
      { canonical: 'react', matchTerms: ['jsx'] },
    ];
    const normalizer = buildTermNormalizer(entries);
    const result = normalizer.normalizeTerms(['react', 'jsx', 'react']);
    // All three inputs expand to the same {react, jsx} set
    expect(result.length).toBe(2);
    expect(new Set(result).size).toBe(2);
  });
});

describe('DEFAULT_MATCH_TERMS registry', () => {
  it('contains at least 15 canonical groups (ported from SYNONYM_MAP with merges)', () => {
    // Old SYNONYM_MAP had 32 keys; migration merged Korean↔English duplicates
    // (에러/error/오류/디버깅 → one `error` family; 성능/최적화/performance → one
    // `performance` family; 리팩토링/refactor → one `refactor` family; etc.)
    // resulting in fewer canonicals covering more terms each. The floor of
    // 15 is a regression guard — below this suggests accidental deletion.
    expect(DEFAULT_MATCH_TERMS.length).toBeGreaterThanOrEqual(15);
  });

  it('every entry has non-empty matchTerms', () => {
    for (const entry of DEFAULT_MATCH_TERMS) {
      expect(entry.canonical.length, `canonical of ${JSON.stringify(entry)}`).toBeGreaterThan(0);
      expect(entry.matchTerms.length, `matchTerms of ${entry.canonical}`).toBeGreaterThan(0);
    }
  });

  it('covers Korean ↔ English cross-mapping', () => {
    // Spot-check: the bilingual cross-mappings from SYNONYM_MAP must survive migration.
    const normalized = defaultNormalizer.normalizeTerms(['에러']);
    expect(normalized).toContain('error');

    const normalized2 = defaultNormalizer.normalizeTerms(['error']);
    expect(normalized2).toContain('에러');
  });

  it('covers the known regression cases that motivated this PR', () => {
    // Korean handling: "핸들링" should pull in "handling" and vice versa
    expect(defaultNormalizer.normalizeTerms(['핸들링'])).toContain('handling');
    expect(defaultNormalizer.normalizeTerms(['handling'])).toContain('핸들링');

    // Deploy bilingual
    expect(defaultNormalizer.normalizeTerms(['배포'])).toContain('deploy');
    expect(defaultNormalizer.normalizeTerms(['deploy'])).toContain('배포');
  });

  it('no canonical is a duplicate', () => {
    const canonicals = DEFAULT_MATCH_TERMS.map(e => e.canonical);
    expect(new Set(canonicals).size).toBe(canonicals.length);
  });
});

describe('defaultNormalizer', () => {
  it('is built from DEFAULT_MATCH_TERMS', () => {
    expect(defaultNormalizer.canonicalToTerms.size).toBe(DEFAULT_MATCH_TERMS.length);
  });

  it('normalizeTerms is a function', () => {
    expect(typeof defaultNormalizer.normalizeTerms).toBe('function');
  });
});
