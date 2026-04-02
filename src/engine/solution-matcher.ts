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
  // Korean synonyms
  데이터베이스: ['db', 'sql', '스키마', '마이그레이션'],
  테스트: ['testing', 'spec', '검증', '단위테스트'],
  성능: ['최적화', 'optimize', '프로파일링', '병목'],
  보안: ['취약점', 'vulnerability', '인젝션', '인증'],
  리팩토링: ['정리', 'cleanup', '개선', '분리'],
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

  // 프롬프트에서 identifier 후보도 추출 (camelCase, snake_case 등 6자 이상)
  const promptLower = prompt.toLowerCase();

  const matches: SolutionMatch[] = allSolutions
    .map(sol => {
      const result = calculateRelevance(promptTags, sol.tags, sol.confidence) as { relevance: number; matchedTags: string[] };

      // identifier boost: 프롬프트에 솔루션의 identifier가 포함되면 추가 점수
      let identifierBoost = 0;
      const matchedIdentifiers: string[] = [];
      for (const id of sol.identifiers) {
        if (id.length >= 4 && promptLower.includes(id.toLowerCase())) {
          identifierBoost += 0.15;
          matchedIdentifiers.push(id);
        }
      }

      const totalRelevance = result.relevance + identifierBoost;
      const allMatched = [...result.matchedTags, ...matchedIdentifiers];

      return {
        name: sol.name,
        path: sol.filePath,
        scope: sol.scope,
        relevance: totalRelevance,
        summary: sol.name,
        status: sol.status,
        confidence: sol.confidence,
        type: sol.type,
        tags: sol.tags,
        identifiers: sol.identifiers,
        matchedTags: allMatched,
      };
    })
    // 태그 1개 이상 매칭 OR identifier 1개 이상 매칭
    .filter(m => m.matchedTags.length >= 1)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);

  return matches;
}
