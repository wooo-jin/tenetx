import { describe, it, expect } from 'vitest';
import {
  PHRASE_BLOCKLIST,
  findBlockedPhrases,
  maskBlockedTokens,
} from '../src/engine/phrase-blocklist.js';
import { extractTags } from '../src/engine/solution-format.js';

describe('PHRASE_BLOCKLIST shape', () => {
  it('has at least the 5 known fixture-v2 trigger phrases', () => {
    // These are the load-bearing entries — removing any of them silently
    // un-blocks the corresponding fixture v2 negative. The R4-T2 metric
    // gain depends on these being present.
    expect(PHRASE_BLOCKLIST).toContain('performance review');
    expect(PHRASE_BLOCKLIST).toContain('system architecture');
    expect(PHRASE_BLOCKLIST).toContain('database backup');
    expect(PHRASE_BLOCKLIST).toContain('insurance claim');
    expect(PHRASE_BLOCKLIST).toContain('solar system');
  });

  it('does NOT contain dev-context compounds (negative test)', () => {
    // These MUST never appear in the blocklist — they're legitimate dev
    // terms and blocking them would crater recall on real dev queries.
    // If a future PR accidentally adds one, this test catches it.
    const forbiddenDevPhrases = [
      'code review',
      'function call',
      'error message',
      'database query',
      'unit test',
      'type check',
      'build pipeline',
      'system design',
    ];
    for (const phrase of forbiddenDevPhrases) {
      expect(PHRASE_BLOCKLIST, `'${phrase}' is a dev term and must not be blocked`)
        .not.toContain(phrase);
    }
  });

  it('every entry is lowercase ASCII with single-space separators', () => {
    for (const phrase of PHRASE_BLOCKLIST) {
      expect(phrase, `phrase '${phrase}' must be lowercase`).toBe(phrase.toLowerCase());
      expect(phrase, `phrase '${phrase}' must be ASCII`).toMatch(/^[a-z0-9 ]+$/);
      expect(phrase, `phrase '${phrase}' must contain at least one space`).toContain(' ');
      expect(phrase, `phrase '${phrase}' must not have leading/trailing whitespace`)
        .toBe(phrase.trim());
    }
  });

  it('has no duplicate entries', () => {
    const seen = new Set<string>();
    for (const phrase of PHRASE_BLOCKLIST) {
      expect(seen.has(phrase), `duplicate phrase '${phrase}'`).toBe(false);
      seen.add(phrase);
    }
  });
});

describe('findBlockedPhrases', () => {
  it('returns empty array when no blocked phrase is present', () => {
    expect(findBlockedPhrases('writing async code without race conditions')).toEqual([]);
    expect(findBlockedPhrases('how to handle errors in api responses')).toEqual([]);
  });

  it('detects a single blocked phrase as a whole-word match', () => {
    expect(findBlockedPhrases('performance review meeting notes')).toContain('performance review');
    expect(findBlockedPhrases('system architecture overview')).toContain('system architecture');
  });

  it('detects multiple blocked phrases in the same query', () => {
    const found = findBlockedPhrases('performance review meeting notes');
    expect(found).toContain('performance review');
    expect(found).toContain('meeting notes');
  });

  it('does NOT match a blocked phrase that is a substring of a longer word', () => {
    // 'performance review' must NOT match 'performance reviewer' or
    // 'performance reviewers'. Word-boundary check (start/end of string,
    // or whitespace on both sides) is the safety net.
    expect(findBlockedPhrases('performance reviewer training')).not.toContain('performance review');
    expect(findBlockedPhrases('the performance reviewers met')).not.toContain('performance review');
  });

  it('matches a blocked phrase at the start of the query', () => {
    expect(findBlockedPhrases('solar system planets')).toContain('solar system');
  });

  it('matches a blocked phrase at the end of the query', () => {
    expect(findBlockedPhrases('astronomy and the solar system')).toContain('solar system');
  });

  it('is case-insensitive', () => {
    expect(findBlockedPhrases('PERFORMANCE REVIEW MEETING')).toContain('performance review');
    expect(findBlockedPhrases('System Architecture Overview')).toContain('system architecture');
  });

  it('does not return the same phrase twice if it appears multiple times', () => {
    const found = findBlockedPhrases('performance review and another performance review');
    const count = found.filter(p => p === 'performance review').length;
    expect(count).toBe(1);
  });

  it('does not match Korean queries (blocklist is ASCII-only)', () => {
    expect(findBlockedPhrases('성능 리뷰 회의록')).toEqual([]);
    expect(findBlockedPhrases('데이터베이스 백업 절차')).toEqual([]);
  });

  // ── R4-T2 review fix (MED #2): punctuation as boundary ──
  // Whitespace-only boundary checks miss real natural-language input. The
  // boundary fn now treats anything that is not [a-z0-9] as a boundary,
  // so the following all DO match:
  it('treats trailing punctuation as a word boundary', () => {
    expect(findBlockedPhrases('performance review.')).toContain('performance review');
    expect(findBlockedPhrases('performance review!')).toContain('performance review');
    expect(findBlockedPhrases('performance review,')).toContain('performance review');
  });

  it('treats parentheses as word boundaries', () => {
    expect(findBlockedPhrases('(performance review)')).toContain('performance review');
    expect(findBlockedPhrases('cancel the meeting (performance review pending)'))
      .toContain('performance review');
  });

  it('treats commas / colons / semicolons as word boundaries', () => {
    expect(findBlockedPhrases('we have meetings: performance review, then a 1:1'))
      .toContain('performance review');
  });

  // ── R4-T2 review fix (MED #5): all-occurrences scan, not just first ──
  it('detects a valid second occurrence even when the first overlaps a longer word', () => {
    // First "performance review" sits inside "performance reviewer" (no
    // word boundary). Second occurrence is a clean whole-word match.
    // Pre-fix the indexOf-only loop returned [] for this query.
    expect(findBlockedPhrases('performance reviewer and performance review meeting'))
      .toContain('performance review');
  });
});

describe('maskBlockedTokens', () => {
  it('returns the original tags unchanged when no phrase is blocked', () => {
    const tags = ['async', 'pattern', 'promise'];
    expect(maskBlockedTokens('writing async code with promises', tags)).toEqual(tags);
  });

  it('removes tokens belonging to a single blocked phrase', () => {
    // "performance review meeting notes" → blocks "performance review" + "meeting notes"
    // → mask {performance, review, meeting, notes}
    const tags = ['performance', 'review', 'meeting', 'notes'];
    const masked = maskBlockedTokens('performance review meeting notes', tags);
    expect(masked).toEqual([]);
  });

  it('preserves dev tokens that are NOT part of a blocked phrase (mixed query)', () => {
    // "performance review of caching strategy" → blocks "performance review"
    // → mask {performance, review} → 'caching' and 'strategy' survive
    const tags = ['performance', 'review', 'caching', 'strategy'];
    const masked = maskBlockedTokens('performance review of caching strategy', tags);
    expect(masked).not.toContain('performance');
    expect(masked).not.toContain('review');
    expect(masked).toContain('caching');
    expect(masked).toContain('strategy');
  });

  it('does not mask anything when the only "match" is inside a longer word', () => {
    // "performance reviewer" → does NOT trigger "performance review" (word boundary)
    const tags = ['performance', 'reviewer', 'training'];
    expect(maskBlockedTokens('performance reviewer training', tags)).toEqual(tags);
  });

  it('returns a new array (not the same reference) when masking applies', () => {
    const tags = ['performance', 'review', 'caching'];
    const masked = maskBlockedTokens('performance review of caching', tags);
    expect(masked).not.toBe(tags);
  });

  it('handles all 5 fixture-v2 trigger queries (regression sentinel)', () => {
    // Each of these MUST mask down to a state where the matcher cannot
    // find the false-positive evidence. We don't assert specific output
    // shapes here (that's the integration test's job) — only that the
    // tokens that drove the v2 false positives are gone.
    //
    // Use `extractTags` (the same tokenizer the production matcher uses)
    // so the test exercises the actual hot-path input shape rather than
    // a naive whitespace split — the latter would bypass stopword/length
    // filters and could mask the wrong things for the wrong reasons.
    const cases = [
      { q: 'performance review meeting notes', mustNotContain: ['performance', 'review'] },
      { q: 'system architecture overview document', mustNotContain: ['system', 'architecture'] },
      { q: 'database backup recovery procedure', mustNotContain: ['database', 'backup'] },
      { q: 'solar system planets astronomy', mustNotContain: ['solar', 'system'] },
    ];
    for (const { q, mustNotContain } of cases) {
      const tags = extractTags(q);
      const masked = maskBlockedTokens(q, tags);
      for (const token of mustNotContain) {
        expect(masked, `query "${q}" should mask token '${token}'`).not.toContain(token);
      }
    }
  });

  it('does not affect Korean queries', () => {
    const tags = ['성능', '리뷰', '회의'];
    expect(maskBlockedTokens('성능 리뷰 회의록', tags)).toEqual(tags);
  });

  it('handles uppercase / mixed case input correctly', () => {
    const tags = ['performance', 'review', 'caching'];
    const masked = maskBlockedTokens('Performance Review of Caching', tags);
    expect(masked).not.toContain('performance');
    expect(masked).not.toContain('review');
    expect(masked).toContain('caching');
  });
});
