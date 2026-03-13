import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_SOLUTIONS, PACKS_DIR } from '../core/paths.js';
import type { ScopeInfo } from '../core/types.js';

export interface SolutionMatch {
  name: string;
  path: string;
  scope: 'me' | 'team' | 'project';
  relevance: number;  // 0-1
  summary: string;
}

/** 솔루션 파일에서 메타 추출 */
function parseSolution(filePath: string): { name: string; summary: string; keywords: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const name = path.basename(filePath, '.md');

  // 첫 줄 = 요약
  const lines = content.split('\n').filter(l => l.trim());
  const summary = lines[0]?.replace(/^#+\s*/, '').trim() ?? name;

  // 키워드 추출: 파일명 + 내용의 주요 단어
  const keywords = [
    ...name.split(/[-_]/).map(s => s.toLowerCase()),
    ...content.toLowerCase()
      .replace(/[^가-힣a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2),
  ];

  return { name, summary, keywords: [...new Set(keywords)] };
}

/** 디렉토리의 모든 솔루션 로드 */
function loadSolutions(dir: string, scope: SolutionMatch['scope']): Array<ReturnType<typeof parseSolution> & { path: string; scope: SolutionMatch['scope'] }> {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({
        ...parseSolution(path.join(dir, f)),
        path: path.join(dir, f),
        scope,
      }));
  } catch {
    return [];
  }
}

/** 텍스트에서 키워드 추출 (순수 함수) */
export function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^가-힣a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/** 프롬프트와 솔루션 키워드 간 관련성 계산 */
export function calculateRelevance(prompt: string, keywords: string[]): number {
  const promptWords = prompt.toLowerCase()
    .replace(/[^가-힣a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (promptWords.length === 0 || keywords.length === 0) return 0;

  let matches = 0;
  for (const word of promptWords) {
    if (keywords.some(kw => kw.includes(word) || word.includes(kw))) {
      matches++;
    }
  }

  return Math.min(1, matches / Math.max(promptWords.length * 0.3, 1));
}

/**
 * 작업 프롬프트에 관련된 솔루션 매칭
 * knowledge-comes-to-you 원칙: 필요한 지식은 찾아와야 한다
 */
export function matchSolutions(prompt: string, scope: ScopeInfo, cwd: string): SolutionMatch[] {
  const allSolutions: Array<ReturnType<typeof parseSolution> & { path: string; scope: SolutionMatch['scope'] }> = [];

  // Me 솔루션
  allSolutions.push(...loadSolutions(ME_SOLUTIONS, 'me'));

  // Team 솔루션
  if (scope.team) {
    allSolutions.push(...loadSolutions(path.join(PACKS_DIR, scope.team.name, 'solutions'), 'team'));
  }

  // Project 솔루션
  allSolutions.push(...loadSolutions(path.join(cwd, '.compound', 'solutions'), 'project'));

  // 관련성 계산 및 정렬
  const matches: SolutionMatch[] = allSolutions
    .map(sol => ({
      name: sol.name,
      path: sol.path,
      scope: sol.scope,
      relevance: calculateRelevance(prompt, sol.keywords),
      summary: sol.summary,
    }))
    .filter(m => m.relevance > 0.1)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);  // 최대 5개

  return matches;
}
