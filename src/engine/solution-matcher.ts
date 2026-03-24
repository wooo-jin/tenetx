import * as path from 'node:path';
import { ME_SOLUTIONS, PACKS_DIR } from '../core/paths.js';
import type { ScopeInfo } from '../core/types.js';
import { extractTags } from './solution-format.js';
import { getOrBuildIndex } from './solution-index.js';
import type { SolutionDirConfig } from './solution-index.js';
import type { SolutionStatus, SolutionType } from './solution-format.js';

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

/** @deprecated Use extractTags instead */
export function extractKeywords(text: string): string[] {
  return extractTags(text);
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
  // v3 mode
  const intersection = keywordsOrTags.filter(t => promptOrTags.includes(t));
  if (intersection.length < 2) return { relevance: 0, matchedTags: [] };
  const tagScore = intersection.length / Math.max(keywordsOrTags.length, 1);
  return { relevance: tagScore * (confidence ?? 1), matchedTags: intersection };
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

  const matches: SolutionMatch[] = allSolutions
    .map(sol => {
      const result = calculateRelevance(promptTags, sol.tags, sol.confidence) as { relevance: number; matchedTags: string[] };
      return {
        name: sol.name,
        path: sol.filePath,
        scope: sol.scope,
        relevance: result.relevance,
        summary: sol.name,
        status: sol.status,
        confidence: sol.confidence,
        type: sol.type,
        tags: sol.tags,
        identifiers: sol.identifiers,
        matchedTags: result.matchedTags,
      };
    })
    .filter(m => m.matchedTags.length >= 2)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);

  return matches;
}
