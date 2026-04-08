import * as path from 'node:path';
import { ME_SOLUTIONS, PACKS_DIR } from '../core/paths.js';
import type { ScopeInfo } from '../core/types.js';
import { extractTags } from './solution-format.js';
import { getOrBuildIndex } from './solution-index.js';
import type { SolutionDirConfig } from './solution-index.js';
import type { SolutionStatus, SolutionType } from './solution-format.js';

// ── Synonym dictionary for tag expansion ──

export const SYNONYM_MAP: Record<string, string[]> = {
  react: ['jsx', 'component', 'hook', 'useState', 'useEffect'],
  database: ['db', 'sql', 'schema', 'migration', 'query'],
  test: ['testing', 'spec', 'vitest', 'jest', 'mocha'],
  typescript: ['ts', 'type', 'interface', 'generic'],
  api: ['rest', 'graphql', 'endpoint', 'route'],
  auth: ['authentication', 'authorization', 'login', 'session', 'jwt'],
  docker: ['container', 'dockerfile', 'compose'],
  ci: ['pipeline', 'workflow', 'actions', 'deploy'],
  error: ['bug', 'fix', 'debug', 'crash', 'exception'],
  performance: ['optimize', 'profiling', 'bottleneck', 'latency'],
  security: ['vulnerability', 'injection', 'xss', 'csrf'],
  refactor: ['cleanup', 'restructure', 'simplify', 'decompose'],
  handling: ['handler', 'catch', 'try', 'recovery', '핸들링', '처리'],
  validation: ['validate', 'check', 'sanitize', '검증', '유효성'],
  cache: ['caching', 'memoize', 'invalidate', '캐시', '캐싱'],
  logging: ['log', 'trace', 'monitor', '로깅', '로그'],
  deploy: ['deployment', 'release', 'publish', '배포'],
  migration: ['migrate', 'upgrade', '마이그레이션', '업그레이드'],
  // Korean → English cross-mapping
  에러: ['error', 'bug', 'fix', 'debug', 'crash', 'exception', '오류', '버그', '예외'],
  핸들링: ['handling', 'handler', 'catch', 'try', '처리', '대응'],
  오류: ['error', 'bug', 'exception', '에러', '버그'],
  디버깅: ['debug', 'debugger', 'breakpoint', '디버그'],
  데이터베이스: ['database', 'db', 'sql', '스키마', '마이그레이션'],
  테스트: ['test', 'testing', 'spec', '검증', '단위테스트'],
  성능: ['performance', 'optimize', '최적화', '프로파일링', '병목'],
  보안: ['security', 'vulnerability', '취약점', '인젝션', '인증'],
  리팩토링: ['refactor', 'cleanup', '정리', '개선', '분리'],
  배포: ['deploy', 'deployment', 'release', 'publish'],
  인증: ['auth', 'authentication', 'login', 'jwt', 'session'],
  컴포넌트: ['component', 'react', 'jsx', 'widget'],
  최적화: ['optimize', 'performance', 'profiling', '성능'],
  캐시: ['cache', 'caching', 'memoize', 'invalidate'],
};

/** Expand tags with synonyms — adds related terms to improve matching */
export function expandTagsWithSynonyms(tags: string[]): string[] {
  const expanded = new Set(tags);
  for (const tag of tags) {
    const synonyms = SYNONYM_MAP[tag];
    if (synonyms) {
      for (const syn of synonyms) expanded.add(syn);
    }
    // reverse lookup: if tag is a synonym value, add the key
    for (const [key, values] of Object.entries(SYNONYM_MAP)) {
      if (values.includes(tag)) expanded.add(key);
    }
  }
  return [...expanded];
}

// ── TF-IDF weighting for common tags ──

/** High-frequency tags that should be weighted lower */
const COMMON_TAGS = new Set([
  'typescript', 'ts', 'javascript', 'js', 'fix', 'update', 'add', 'change',
  'file', 'code', 'function', 'import', 'export', 'error', 'type', 'string',
  'number', 'object', 'array', 'return', 'const', 'class', 'module',
  '코드', '파일', '함수', '수정', '추가', '변경', '에러', '타입',
]);

/** Apply IDF-like weight: common tags get reduced weight */
export function tagWeight(tag: string): number {
  return COMMON_TAGS.has(tag) ? 0.5 : 1.0;
}

export interface SolutionMatch {
  name: string;
  path: string;
  scope: 'me' | 'team' | 'project';
  relevance: number;
  summary: string;
  // v3 fields
  status: SolutionStatus;
  confidence: number;
  type: SolutionType;
  tags: string[];
  identifiers: string[];
  matchedTags: string[];
}

/** Internal loaded solution with scope from directory config */
interface LoadedSolution {
  name: string;
  status: SolutionStatus;
  confidence: number;
  type: SolutionType;
  tags: string[];
  identifiers: string[];
  filePath: string;
  scope: 'me' | 'team' | 'project';
}

export function calculateRelevance(promptTags: string[], solutionTags: string[], confidence: number): { relevance: number; matchedTags: string[] };
/** @deprecated */
export function calculateRelevance(prompt: string, keywords: string[]): number;
export function calculateRelevance(
  promptOrTags: string | string[],
  keywordsOrTags: string[],
  confidence?: number,
): number | { relevance: number; matchedTags: string[] } {
  if (typeof promptOrTags === 'string') {
    // Legacy mode: substring matching for backwards compatibility
    const promptTags = extractTags(promptOrTags);
    const intersection = keywordsOrTags.filter(kw =>
      promptTags.some(pt => pt === kw || (pt.length > 3 && kw.length > 3 && (pt.startsWith(kw) || kw.startsWith(pt)))),
    );
    return Math.min(1, intersection.length / Math.max(promptTags.length * 0.5, 1));
  }
  // v3 mode: tag matching with synonym expansion + TF-IDF weighting
  const expandedPromptTags = expandTagsWithSynonyms(promptOrTags);

  const intersection = keywordsOrTags.filter(t => expandedPromptTags.includes(t));

  // partial/substring matches for longer tags (>3 chars)
  const partialMatches = keywordsOrTags.filter(t =>
    t.length > 3 && !intersection.includes(t)
    && expandedPromptTags.some(pt => pt.length > 3 && (pt.includes(t) || t.includes(pt))),
  );

  // Apply TF-IDF weighting: common tags count less
  const weightedMatched = intersection.reduce((sum, t) => sum + tagWeight(t), 0)
    + partialMatches.reduce((sum, t) => sum + tagWeight(t) * 0.5, 0);
  // 완화된 임계값: 가중 점수 0.5 이상이면 후보
  if (weightedMatched < 0.5) return { relevance: 0, matchedTags: [] };

  // Jaccard-like: weighted matched / union
  const union = new Set([...promptOrTags, ...keywordsOrTags]).size;
  const tagScore = weightedMatched / Math.max(union, 1);
  return {
    relevance: tagScore * (confidence ?? 1),
    matchedTags: [...intersection, ...partialMatches],
  };
}

/**
 * Match solutions relevant to the given prompt.
 * knowledge-comes-to-you principle: knowledge should come to you.
 */
// ── Shared ranking core (used by matchSolutions + evaluator) ──

/**
 * Narrow input shape for the shared ranking pipeline. `matchSolutions` and the
 * bootstrap evaluator both reduce to this contract — `LoadedSolution` is
 * structurally compatible (it has more fields), and `EvalSolution` mirrors it
 * exactly. Keeping the input narrow prevents the evaluator from leaking onto
 * prod types and vice versa.
 */
interface RankableSolution {
  name: string;
  tags: string[];
  identifiers?: string[];
  confidence: number;
}

/**
 * Intermediate ranked candidate. Generic over the source solution type so the
 * caller can get back the exact object they passed in — this matters for
 * `matchSolutions`, which needs to re-hydrate scope/filePath from the
 * original `LoadedSolution` without a name-based Map lookup.
 *
 * A name-based Map was tried in Round 2 and caused a scope precedence bug:
 * when two scopes had solutions with the same name (legitimate: user-level
 * `me/foo` and project-level `foo`), the Map was last-wins and produced
 * duplicate entries all pointing at the project copy. Carrying the source
 * reference straight through ranking fixes this by construction.
 */
interface RankedCandidate<T extends RankableSolution = RankableSolution> {
  solution: T;
  relevance: number;
  matchedTags: string[];
  matchedIdentifiers: string[];
}

/**
 * Shared ranking core: tag-based relevance + identifier boost + top-5 sort.
 *
 * Single source of truth for the matcher's ranking behaviour. Both
 * `matchSolutions` (production, reads from the index) and
 * `evaluateSolutionMatcher` (bootstrap eval, reads from an in-memory fixture)
 * call through here so the eval metrics track reality — any future
 * ranking-logic change only needs to happen in one place.
 *
 * Contract:
 *   - identifier boost requires `id.length >= 4` (STRONG_ID_MIN_LENGTH mirror)
 *     and substring presence in the prompt (case-insensitive).
 *   - candidates with zero matched tags AND zero matched identifiers are dropped.
 *   - top-5 by `relevance` descending.
 *   - duplicate names are NOT deduplicated — that matches the pre-refactor
 *     `matchSolutions` behaviour (both scopes could rank). Callers that want
 *     first-wins scope precedence must dedupe on their side.
 */
function rankCandidates<T extends RankableSolution>(
  promptTags: string[],
  promptLower: string,
  solutions: readonly T[],
): RankedCandidate<T>[] {
  return solutions
    .map(sol => {
      const result = calculateRelevance(promptTags, sol.tags, sol.confidence) as { relevance: number; matchedTags: string[] };

      let identifierBoost = 0;
      const matchedIdentifiers: string[] = [];
      for (const id of sol.identifiers ?? []) {
        if (id.length >= 4 && promptLower.includes(id.toLowerCase())) {
          identifierBoost += 0.15;
          matchedIdentifiers.push(id);
        }
      }

      return {
        solution: sol,
        relevance: result.relevance + identifierBoost,
        matchedTags: result.matchedTags,
        matchedIdentifiers,
      };
    })
    .filter(c => c.matchedTags.length + c.matchedIdentifiers.length >= 1)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);
}

// ── Bootstrap evaluator (T1 / PR4) ──

/**
 * In-memory solution shape for the bootstrap evaluator. Mirrors the index
 * entry fields that `matchSolutions` consumes (tags, identifiers, confidence)
 * but without any filesystem dependency — the evaluator is pure so CI can run
 * it without mounting a starter pack.
 */
export interface EvalSolution {
  name: string;
  tags: string[];
  identifiers?: string[];
  confidence: number;
}

export interface EvalQuery {
  query: string;
  /** Names that should appear in the top-5. Empty array = expect no match (negative case). */
  expectAnyOf: string[];
}

export interface EvalFixture {
  solutions: EvalSolution[];
  positive: EvalQuery[];
  /** Bilingual or compound-word variants that exercise synonym expansion. */
  paraphrase: EvalQuery[];
  /** Unrelated queries that should not return a top-1 hit. */
  negative: EvalQuery[];
}

/** Per-bucket metrics. Paraphrase and positive are reported separately so a
 *  bilingual regression (T2 synonym change) can't hide inside the aggregate. */
export interface BucketMetrics {
  /** |{q : ∃i≤5, ranked[i] ∈ q.expectAnyOf}| / |q| */
  recallAt5: number;
  /** Σ (1 / firstMatchRank) / |q|; rank > 5 contributes 0. */
  mrrAt5: number;
  /** |{q : ranked is empty}| / |q| */
  noResultRate: number;
  /** Number of queries in this bucket. */
  total: number;
}

export interface EvalResult {
  /** Combined (positive ∪ paraphrase) metrics — backwards-compatible headline numbers. */
  recallAt5: number;
  mrrAt5: number;
  noResultRate: number;
  /**
   * Fraction of negative queries where the matcher returned ≥ 1 candidate
   * (regardless of rank). Name is honest: this is the "any result" rate on
   * the negative bucket, not a rank-1 precision metric. It's the correct
   * baseline for "did synonym/stemming leak into unrelated queries?".
   */
  negativeAnyResultRate: number;
  /** Per-bucket breakdown — use these to catch paraphrase-only regressions. */
  byBucket: {
    positive: BucketMetrics;
    paraphrase: BucketMetrics;
  };
  total: {
    positive: number;
    paraphrase: number;
    negative: number;
  };
}

/**
 * Round 3 baseline metrics, recorded on 2026-04-08 against the current
 * `SYNONYM_MAP` + `calculateRelevance` + fixture
 * `solution-match-bootstrap.json`. Used as a relative regression guard in
 * `tests/solution-matcher-eval.test.ts` — downstream PRs (T2/T3/T4) must not
 * regress any field by more than `BASELINE_TOLERANCE`.
 *
 * If a PR legitimately improves a metric, update this constant in the same
 * commit so future PRs guard against the new floor.
 */
export const ROUND3_BASELINE: EvalResult = {
  recallAt5: 1.0,
  mrrAt5: 1.0,
  noResultRate: 0.0,
  negativeAnyResultRate: 0.1,
  byBucket: {
    positive: { recallAt5: 1.0, mrrAt5: 1.0, noResultRate: 0.0, total: 41 },
    paraphrase: { recallAt5: 1.0, mrrAt5: 1.0, noResultRate: 0.0, total: 10 },
  },
  total: { positive: 41, paraphrase: 10, negative: 10 },
};

/** Maximum allowed absolute regression per metric. 5% is tight enough to catch
 *  ~2-3 query regressions in a 51-query bucket but lenient enough that a
 *  single fixture edit won't spuriously fail the guard. */
export const BASELINE_TOLERANCE = 0.05;

/** Run a single bucket through the ranking pipeline and aggregate IR metrics. */
function computeBucketMetrics(queries: EvalQuery[], solutions: EvalSolution[]): BucketMetrics {
  let recallHits = 0;
  let reciprocalSum = 0;
  let noResultCount = 0;

  for (const q of queries) {
    const promptTags = extractTags(q.query);
    const ranked = rankCandidates(promptTags, q.query.toLowerCase(), solutions);
    if (ranked.length === 0) {
      noResultCount++;
      continue;
    }
    for (let i = 0; i < ranked.length; i++) {
      if (q.expectAnyOf.includes(ranked[i].solution.name)) {
        recallHits++;
        reciprocalSum += 1 / (i + 1);
        break;
      }
    }
  }

  const total = queries.length;
  return {
    recallAt5: total > 0 ? recallHits / total : 0,
    mrrAt5: total > 0 ? reciprocalSum / total : 0,
    noResultRate: total > 0 ? noResultCount / total : 0,
    total,
  };
}

/**
 * Evaluate the current matcher against a labeled fixture and return IR
 * metrics. This is the Round 3 baseline — each downstream PR (T2/T3/T4) must
 * not regress any of the thresholds asserted in `solution-matcher-eval.test.ts`.
 *
 * Uses `rankCandidates` (shared with `matchSolutions`) so the evaluator can't
 * silently drift from production ranking behaviour.
 *
 * Metrics are reported both aggregated (positive ∪ paraphrase) and per-bucket,
 * so paraphrase-only regressions surface in `byBucket.paraphrase` even if the
 * aggregate looks fine.
 */
export function evaluateSolutionMatcher(fixture: EvalFixture): EvalResult {
  const positiveM = computeBucketMetrics(fixture.positive, fixture.solutions);
  const paraphraseM = computeBucketMetrics(fixture.paraphrase, fixture.solutions);

  const combinedTotal = positiveM.total + paraphraseM.total;
  // Weighted aggregation: counts, not means — so a large positive bucket
  // doesn't drown a small paraphrase bucket but also a single-query bucket
  // doesn't dominate.
  const recallAt5 = combinedTotal > 0
    ? (positiveM.recallAt5 * positiveM.total + paraphraseM.recallAt5 * paraphraseM.total) / combinedTotal
    : 0;
  const mrrAt5 = combinedTotal > 0
    ? (positiveM.mrrAt5 * positiveM.total + paraphraseM.mrrAt5 * paraphraseM.total) / combinedTotal
    : 0;
  const noResultRate = combinedTotal > 0
    ? (positiveM.noResultRate * positiveM.total + paraphraseM.noResultRate * paraphraseM.total) / combinedTotal
    : 0;

  let negAnyResult = 0;
  for (const q of fixture.negative) {
    const promptTags = extractTags(q.query);
    const ranked = rankCandidates(promptTags, q.query.toLowerCase(), fixture.solutions);
    if (ranked.length >= 1) negAnyResult++;
  }
  const negTotal = fixture.negative.length;

  return {
    recallAt5,
    mrrAt5,
    noResultRate,
    negativeAnyResultRate: negTotal > 0 ? negAnyResult / negTotal : 0,
    byBucket: {
      positive: positiveM,
      paraphrase: paraphraseM,
    },
    total: {
      positive: fixture.positive.length,
      paraphrase: fixture.paraphrase.length,
      negative: fixture.negative.length,
    },
  };
}

export function matchSolutions(prompt: string, scope: ScopeInfo, cwd: string): SolutionMatch[] {
  // Build solution dirs for index cache
  const dirs: SolutionDirConfig[] = [
    { dir: ME_SOLUTIONS, scope: 'me' },
  ];
  if (scope.team) {
    dirs.push({ dir: path.join(PACKS_DIR, scope.team.name, 'solutions'), scope: 'team' });
  }
  dirs.push({ dir: path.join(cwd, '.compound', 'solutions'), scope: 'project' });

  // Use cached index (rebuilt only when dirs change)
  const index = getOrBuildIndex(dirs);
  const allSolutions: LoadedSolution[] = index.entries.map(e => ({ ...e }));

  const promptTags = extractTags(prompt);
  const promptLower = prompt.toLowerCase();

  // Delegate to shared ranking core. `rankCandidates` is generic so each
  // ranked candidate carries the original `LoadedSolution` reference — no
  // name-based re-lookup, so two scopes sharing a name (e.g. me/foo and
  // project/foo) can both appear in the result without a Map last-wins
  // scope-precedence bug.
  const ranked = rankCandidates(promptTags, promptLower, allSolutions);

  return ranked.map(c => ({
    name: c.solution.name,
    path: c.solution.filePath,
    scope: c.solution.scope,
    relevance: c.relevance,
    summary: c.solution.name,
    status: c.solution.status,
    confidence: c.solution.confidence,
    type: c.solution.type,
    tags: c.solution.tags,
    identifiers: c.solution.identifiers,
    matchedTags: [...c.matchedTags, ...c.matchedIdentifiers],
  }));
}
