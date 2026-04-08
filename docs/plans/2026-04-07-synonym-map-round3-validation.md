# SYNONYM_MAP Round 3 Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate and harden solution matching by migrating `SYNONYM_MAP` to indexed `matchTerms`, adding query normalization and evaluation logs, and only introducing BM25 after baseline metrics prove the simpler design has plateaued. *(Round 3 outcome 2026-04-08: T1-T3 + T3.5 fixture v2 expansion shipped; T4 BM25 was empirically skipped after 4-variant prototype gate failure — see Task 4 § and `docs/plans/2026-04-08-t4-bm25-skip-adr.md`.)*

**Architecture:** Keep the current file-backed solution index, but move synonym handling from ad hoc map expansion to a compiled term-normalization layer. Normalize the query once per prompt, normalize solution tags once per index build, log ranking decisions for offline review, and treat BM25 as a scoring upgrade on top of the same normalized term pipeline rather than a separate search system.

**Tech Stack:** TypeScript, Vitest, Node.js file-backed cache/index, existing hook pipeline in `solution-injector`, existing MCP search path in `solution-reader`.

### Task 1: Bootstrap Evaluation Set From Current 60 Solutions

**Files:**
- Create: `tests/fixtures/solution-match-bootstrap.json`
- Create: `tests/solution-matcher-eval.test.ts`
- Modify: `src/engine/solution-matcher.ts`
- Modify: `docs/ISSUE-tag-map-enhancement.md`

**Step 1: Write the failing eval test**

Create `tests/solution-matcher-eval.test.ts` with fixture-driven assertions for:

```ts
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/solution-match-bootstrap.json';
import { evaluateSolutionMatcher } from '../src/engine/solution-matcher.js';

describe('solution matcher bootstrap eval', () => {
  it('meets minimum bootstrap quality bars', () => {
    const result = evaluateSolutionMatcher(fixture);
    expect(result.recallAt5).toBeGreaterThanOrEqual(0.8);
    expect(result.mrrAt5).toBeGreaterThanOrEqual(0.6);
    expect(result.noResultRate).toBeLessThanOrEqual(0.15);
    expect(result.falsePositiveAt1).toBeLessThanOrEqual(0.2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- solution-matcher-eval`
Expected: FAIL because `evaluateSolutionMatcher` and the fixture do not exist yet.

**Step 3: Create the bootstrap fixture**

Create `tests/fixtures/solution-match-bootstrap.json` with three buckets:

- `positive`: 40 queries mapped to expected solution names
- `paraphrase`: 10 bilingual or compound-word variants
- `negative`: 10 no-match queries that should not return noisy top-1 results

Example shape:

```json
{
  "positive": [
    { "query": "에러 핸들링 패턴", "expectAnyOf": ["starter-error-handling-patterns"] }
  ],
  "paraphrase": [
    { "query": "typescript strict typing", "expectAnyOf": ["starter-typescript-strict-types"] }
  ],
  "negative": [
    { "query": "random unrelated gardening query", "expectAnyOf": [] }
  ]
}
```

**Step 4: Add a lightweight evaluator**

Implement `evaluateSolutionMatcher` in `src/engine/solution-matcher.ts` so the test can compute:

- `recallAt5`
- `mrrAt5`
- `noResultRate`
- `falsePositiveAt1`

The evaluator should compare ranking changes on the same query set; do not over-interpret absolute quality from only 60 solutions.

**Step 5: Run test to verify it passes**

Run: `npm test -- solution-matcher-eval solution-matcher synonym-tfidf`
Expected: PASS with bootstrap thresholds met.

**Step 6: Commit**

```bash
git add tests/fixtures/solution-match-bootstrap.json tests/solution-matcher-eval.test.ts src/engine/solution-matcher.ts docs/ISSUE-tag-map-enhancement.md
git commit -m "test: add bootstrap eval for solution matcher"
```

### Task 2: Migrate `SYNONYM_MAP` To Indexed `matchTerms`

**Files:**
- Create: `src/engine/term-normalizer.ts`
- Modify: `src/engine/solution-index.ts`
- Modify: `src/engine/solution-matcher.ts`
- Modify: `src/mcp/solution-reader.ts`
- Modify: `tests/synonym-tfidf.test.ts`
- Create: `tests/term-normalizer.test.ts`

**Step 1: Write the failing tests**

Add tests for:

- old `SYNONYM_MAP` entries auto-convert into canonical records
- reverse lookup is hash-index based, not `Object.entries(...).includes(...)`
- ambiguous terms can map to multiple canonical terms
- solution tags are normalized once during index build

Example API:

```ts
export interface MatchTermEntry {
  canonical: string;
  matchTerms: string[];
}

export function buildTermNormalizer(entries: MatchTermEntry[]): {
  canonicalToTerms: Map<string, Set<string>>;
  termToCanonicals: Map<string, string[]>;
  normalizeTerms(input: string[]): string[];
}
```

**Step 2: Run test to verify it fails**

Run: `npm test -- term-normalizer synonym-tfidf solution-index`
Expected: FAIL because `term-normalizer.ts` does not exist and old reverse lookup is still O(n) sweep.

**Step 3: Implement the normalizer and migration**

Implementation rules:

- Auto-convert the 37 existing entries into `MatchTermEntry[]`
- Deduplicate exact duplicates in code
- Keep raw source terms for debug visibility
- Manually review all 37 entries, but expect only 8-12 ambiguous/high-frequency terms to need edits
- Store normalized tags on index entries so query-time work stays small

Update the index entry shape to include:

```ts
normalizedTags: string[];
```

**Step 4: Replace reverse lookup in matcher and MCP search**

Use:

- `normalizeTerms(extractTags(query))` once per query
- `entry.normalizedTags` from the index

Do not normalize per solution on every prompt.

**Step 5: Run test to verify it passes**

Run: `npm test -- term-normalizer solution-index solution-matcher synonym-tfidf mcp/solution-reader`
Expected: PASS and no remaining O(n) reverse sweep in matcher code.

**Step 6: Commit**

```bash
git add src/engine/term-normalizer.ts src/engine/solution-index.ts src/engine/solution-matcher.ts src/mcp/solution-reader.ts tests/term-normalizer.test.ts tests/synonym-tfidf.test.ts
git commit -m "refactor: migrate synonym map to indexed match terms"
```

### Task 3: Add Query Normalization And Ranking Decision Logs

**Files:**
- Create: `src/engine/match-eval-log.ts`
- Modify: `src/hooks/solution-injector.ts`
- Modify: `src/mcp/solution-reader.ts`
- Modify: `src/core/paths.ts`
- Create: `tests/match-eval-log.test.ts`
- Modify: `tests/solution-matcher-full.test.ts`

**Step 1: Write the failing tests**

Add tests that verify:

- a prompt is normalized once per request
- top-N ranking decisions are logged with raw query and normalized query
- logs can be disabled or sampled to avoid noisy disk writes

Example log record:

```ts
{
  rawQuery: "에러 핸들링",
  normalizedQuery: ["에러", "error", "handling"],
  candidates: [
    { name: "starter-error-handling-patterns", relevance: 0.82, matchedTerms: ["error", "handling"] }
  ],
  selectedTop5: ["starter-error-handling-patterns"],
  ts: "2026-04-07T12:00:00.000Z"
}
```

**Step 2: Run test to verify it fails**

Run: `npm test -- match-eval-log solution-matcher-full`
Expected: FAIL because no ranking log writer exists yet.

**Step 3: Implement sampled evaluation logging**

Implementation rules:

- write to a small JSONL file under `STATE_DIR`
- log only top-5 candidates
- log both `rawQuery` and `normalizedQuery`
- include `matchedTags` or `matchedTerms` for explainability
- keep this off the critical path: best-effort write, fail-open

Add the logging call in `solution-injector` after ranking, not before.

**Step 4: Keep normalization per prompt, not cached by default**

Target behavior:

- query normalization runs once per prompt
- compiled `matchTerms` index is cached in memory
- do not add prompt-result caching in this round unless logs show normalization itself exceeds 5-10ms

**Step 5: Run test to verify it passes**

Run: `npm test -- match-eval-log solution-matcher-full hooks`
Expected: PASS with fail-open logging behavior preserved.

**Step 6: Commit**

```bash
git add src/engine/match-eval-log.ts src/hooks/solution-injector.ts src/mcp/solution-reader.ts src/core/paths.ts tests/match-eval-log.test.ts tests/solution-matcher-full.test.ts
git commit -m "feat: add query normalization logs for matcher eval"
```

### Task 4: Add BM25 Only If Step 1-3 Metrics Plateau

> **STATUS (2026-04-08): SKIPPED.** Empirical gate failure — BM25 prototypes
> (naive, hybrid Jaccard×IDF, precision filter, soft penalty) all underperform
> or match the current Jaccard scorer on the v2 fixture (53+16+14 queries).
> Step 4's gate ("BM25 must improve at least one metric without regressing
> others") is not met. See `docs/plans/2026-04-08-t4-bm25-skip-adr.md` for
> the full decision record + per-variant metrics + root-cause analysis.
> Round 4 candidates (compound-tag tokenizer fix, phrase/n-gram matcher
> overlay, query-side specificity classifier) are documented in the ADR
> but defer to Round 4. Corpus growth (N≥100) is tracked separately as
> Reversal Trigger #1 in the ADR — it is a passive re-evaluation signal,
> not a Round 4 candidate.


**Files:**
- Modify: `src/engine/solution-matcher.ts`
- Modify: `src/engine/solution-index.ts`
- Modify: `src/mcp/solution-reader.ts`
- Create: `tests/solution-matcher-bm25.test.ts`
- Modify: `tests/solution-matcher-eval.test.ts`

**Step 1: Write the failing tests**

Add tests showing cases where normalized term overlap is still insufficient:

- long queries with many low-signal tokens
- multiple candidate solutions sharing the same canonical tag
- exact identifier or rare-term hits should outrank generic hits

**Step 2: Run test to verify it fails**

Run: `npm test -- solution-matcher-bm25 solution-matcher-eval`
Expected: FAIL because the existing Jaccard-like scorer cannot separate these cases well enough.

**Step 3: Implement BM25 on top of normalized terms**

Implementation rules:

- reuse `normalizedTags` and normalized query tokens
- compute corpus stats from the in-memory solution index
- keep identifier boost as a separate additive signal
- do not introduce SQLite or external search infra for only ~60-200 solutions

Expected scoring pipeline:

```ts
finalScore = bm25(normalizedQuery, entry.normalizedTags)
  + identifierBoost
  + confidenceAdjustment;
```

**Step 4: Re-run the bootstrap eval and compare deltas**

Require BM25 to improve at least one of:

- `mrrAt5`
- top-1 precision on ambiguous queries
- no-result rate without increasing false positives

If BM25 does not beat Step 3 materially, keep the simpler scorer.

**Step 5: Run test to verify it passes**

Run: `npm test -- solution-matcher-bm25 solution-matcher-eval solution-matcher-full mcp/solution-reader`
Expected: PASS with measured improvement over the Step 3 baseline.

**Step 6: Commit**

```bash
git add src/engine/solution-matcher.ts src/engine/solution-index.ts src/mcp/solution-reader.ts tests/solution-matcher-bm25.test.ts tests/solution-matcher-eval.test.ts
git commit -m "feat: add bm25 ranking for normalized solution terms"
```

### Rollout Notes

- Start with the current 60-solution universe; this is enough for directional comparison if the query set is paired and stable.
- Minimum meaningful bootstrap set: 30 queries for smoke detection, 50-60 queries for rollout decisions, 100-200 queries for durable quality tracking.
- Migration should be automation-first but review-complete: auto-scaffold 100%, manually inspect all 37 entries, manually edit only the ambiguous ones.
- Hook safety target is stricter than the current 5-second `solution-injector` timeout: keep match-time normalization comfortably under 50ms so other `UserPromptSubmit` hooks retain headroom.
