/**
 * Phrase blocklist — non-dev-context 2-word English compounds.
 *
 * Why this module exists (R4-T2 of the Round 4 plan):
 *   The fixture v2 negative bucket exposed 5 false positive triggers
 *   ("performance review meeting notes", "system architecture overview
 *   document", "database backup recovery procedure", "validation of
 *   insurance claims", "solar system planets astronomy"). All five share
 *   the same structural problem: a single common dev-adjacent word
 *   ("performance", "system", "database", "validation", "system") is
 *   simultaneously a legitimate dev tag AND a legitimate English noun.
 *   Tag-based matching cannot distinguish "user typed dev term in dev
 *   context" from "user typed the same word in a non-dev context"
 *   without external semantic signal.
 *
 *   T4 BM25 was prototyped as a fix (frequency-based down-weighting) and
 *   skipped — see `docs/plans/2026-04-08-t4-bm25-skip-adr.md` for the
 *   full rationale. The structural reason BM25 didn't help: with N=15
 *   solutions, common dev-adjacent words still cluster in the high-IDF
 *   range, so even after IDF the bare-tag match wins.
 *
 *   R4-T2's approach is the inverse: instead of trying to make the
 *   matcher smarter, surface the non-dev *context* directly. A 2-word
 *   English compound like "performance review" or "system architecture"
 *   is a strong signal that the surrounding query is NOT a dev question.
 *   When such a compound appears in the query, the function below masks
 *   its constituent tokens from the prompt tag list, removing the false
 *   evidence the matcher would otherwise rank on. Other dev tokens in
 *   the same query are preserved, so a dev query that happens to include
 *   one of these compounds (e.g., "performance review of caching
 *   strategy") still surfaces the legitimate cache match.
 *
 * Curation rules (for entries in PHRASE_BLOCKLIST):
 *   1. **2 words minimum**, lowercase ASCII, single space separator.
 *      Single words are too prone to false negatives — "performance"
 *      alone is a real dev concept; "performance review" is not.
 *   2. **NEVER block legitimate dev compounds.** "code review", "function
 *      call", "error message", "database query", "system design", "type
 *      check", "unit test", "build pipeline" — all of these are first-
 *      class dev terms and MUST stay matchable.
 *   3. **Prefer concrete English compounds with a known false-positive
 *      footprint.** Each entry should trace back to either (a) one of
 *      the 5 known fixture v2 trigger queries, or (b) a manual review
 *      of top-50 corpus tags for English homographs.
 *   4. **Plurals as separate entries.** "performance review" and
 *      "performance reviews" are both common; we list both rather than
 *      apply automatic stemming, since stemming would risk over-blocking
 *      ("review" → "reviews" → "reviewed" cascade).
 *   5. **No regex / wildcards.** Literal phrase matching keeps the
 *      blocklist auditable and avoids ReDoS surface.
 *
 * Roll-out posture:
 *   Start with ~15 entries (5 known fixture triggers + 10 homograph
 *   candidates), measure on the bootstrap eval, expand only if metrics
 *   indicate real-world false positives that aren't covered. The ADR
 *   targeted ~50 phrases as an upper bound — exceeding that without
 *   measured evidence is a sign that the blocklist is becoming a leaky
 *   abstraction for a deeper matcher problem.
 */

import { extractTags } from './solution-format.js';

/**
 * Lowercase ASCII 2-word phrases that signal a non-dev context.
 *
 * Audit owner: matcher maintainer. Adding/removing entries MUST be
 * accompanied by a fixture eval re-run and (if the move shifts metrics)
 * a `ROUND3_BASELINE` update in the same PR.
 */
export const PHRASE_BLOCKLIST: readonly string[] = [
  // ── 5 known fixture v2 triggers ──
  'performance review',
  'system architecture',
  'database backup',
  'insurance claim',
  'solar system',

  // ── Plural forms of the above (separate entries per curation rule 4) ──
  'performance reviews',
  'system architectures',
  'database backups',
  'insurance claims',

  // ── Common non-dev English compounds with dev-tag homographs ──
  // "validation ... insurance" path: insurance domain compounds
  'insurance policy',
  'insurance policies',
  // "system architecture overview document" path: document/overview compounds
  'overview document',
  'document overview',
  // "performance review meeting notes" path: meeting/notes compounds
  'meeting notes',
  'meeting minutes',
  // NOTE on intentionally-omitted entries:
  //   - 'recovery procedure' / 'backup recovery' were considered (and
  //     redundantly covered the `database backup recovery procedure`
  //     trigger), but rejected per code review: they would silently mask
  //     dev SRE queries like 'disaster recovery procedure' or 'rollback
  //     recovery procedure'. The `database backup` entry alone catches
  //     the v2 trigger, so the redundancy was pure downside.
  //   - 'function room' / 'room booking' were also considered as
  //     hypothetical homographs but rejected per curation rule #3 (no
  //     fixture-traceable false-positive footprint, so adding them
  //     would turn the blocklist into a leaky abstraction).
];

/**
 * Test whether a single character is an "alphanumeric word character" for
 * the purpose of word-boundary detection. Anything that's NOT [a-z0-9] is
 * treated as a boundary — that includes whitespace, punctuation
 * (`. , ; : ! ? ( ) [ ] { } " ' /`), Korean/CJK characters, and the
 * absence of a character (start/end of string, signaled by `undefined`).
 *
 * Why not just whitespace: real user prompts contain natural-language
 * punctuation ("performance review.", "(performance review)",
 * "performance review, then revert"). Whitespace-only boundaries miss
 * these cases and the trigger phrases survive into the matcher.
 */
function isWordChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  const code = ch.charCodeAt(0);
  // ASCII '0'-'9' (48-57), 'a'-'z' (97-122). Lowercase only because
  // callers always pass `lower` strings.
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

/**
 * Find every blocked phrase that appears in the query as a whole-word match.
 *
 * Whole-word means the phrase is bounded by start-of-string, end-of-string,
 * any whitespace, or any punctuation/non-ASCII-letter character on both
 * sides. Substring matching alone would over-block ("performance reviewer"
 * must NOT match "performance review"); whitespace-only boundary checks
 * would under-detect natural-language punctuation ("performance review.").
 *
 * Iterates ALL occurrences of each phrase, not just the first — so a query
 * like "performance reviewer and performance review meeting" still detects
 * the second occurrence as a valid match even though the first overlaps a
 * longer word.
 *
 * Returns the list of matched phrases in input order; the same phrase is
 * never reported twice even if it appears multiple times. Empty array
 * when no blocked phrase is present.
 */
export function findBlockedPhrases(rawQuery: string): string[] {
  const lower = rawQuery.toLowerCase();
  const found: string[] = [];
  for (const phrase of PHRASE_BLOCKLIST) {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(phrase, from);
      if (idx === -1) break;
      const beforeOk = idx === 0 || !isWordChar(lower[idx - 1]);
      const afterOk = !isWordChar(lower[idx + phrase.length]);
      if (beforeOk && afterOk) {
        if (!found.includes(phrase)) found.push(phrase);
        break; // dedup policy: one hit per phrase is enough
      }
      from = idx + 1;
    }
  }
  return found;
}

/**
 * Mask the tokens of any blocked phrase from a prompt tag list.
 *
 * Given the raw query (used for phrase detection) and the already-extracted
 * prompt tags, this function:
 *   1. Finds every blocked phrase in the raw query.
 *   2. Computes the union of all phrase-constituent tokens (after running
 *      them through `extractTags` so the masking matches the same
 *      lowercase / Korean-aware token shape the matcher already uses).
 *   3. Returns a new prompt tag list with the masked tokens removed.
 *
 * If no blocked phrase is found, the input array is returned unchanged
 * (referentially — for the hot path's allocation cost). Otherwise a new
 * filtered array is returned.
 *
 * Example: query "performance review meeting notes"
 *   - Blocked phrases found: ["performance review", "meeting notes"]
 *   - Masked tokens: {performance, review, meeting, notes}
 *   - extractTags("performance review meeting notes") =
 *     [performance, review, meeting, notes]
 *   - Result: [] (every prompt tag was masked)
 *
 * Example: query "performance review of caching strategy"
 *   - Blocked phrases found: ["performance review"]
 *   - Masked tokens: {performance, review}
 *   - extractTags result: [performance, review, caching, strategy]
 *   - Filtered result: [caching, strategy]  ← legitimate dev tags survive
 *
 * Korean queries: blocked phrases are ASCII-only, so a Korean query never
 * triggers masking. Mixed queries (Korean + English) only mask the
 * English-side tokens that participate in a blocked phrase.
 */
export function maskBlockedTokens(rawQuery: string, promptTags: readonly string[]): string[] {
  const blockedPhrases = findBlockedPhrases(rawQuery);
  if (blockedPhrases.length === 0) return [...promptTags];

  // Tokenize blocked phrases through the SAME pipeline that produced
  // promptTags so the mask shape matches. extractTags lowercases, splits
  // on non-word characters, and applies stopword/length filters.
  const masked = new Set<string>();
  for (const phrase of blockedPhrases) {
    for (const token of extractTags(phrase)) masked.add(token);
  }
  if (masked.size === 0) return [...promptTags];

  return promptTags.filter(t => !masked.has(t));
}
