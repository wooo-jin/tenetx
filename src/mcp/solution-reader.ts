/**
 * Tenetx — MCP Solution Reader
 *
 * MCP 도구 핸들러를 위한 비즈니스 로직 파사드.
 * 기존 solution-index, solution-matcher, solution-format 모듈을 조합하여
 * 검색/목록/읽기/통계 기능을 제공합니다.
 *
 * 설계 결정:
 *   - MCP 도구 핸들러가 직접 fs/path를 다루지 않도록 격리
 *   - Hook injection(push)과 독립: 세션 캐시/버짓 적용 안 함
 *   - compound-read는 전문 반환 (축약 없음), compound-search는 요약만
 *   - prompt injection 필터는 동일하게 적용 (보안 일관성)
 *   - 인덱스 캐시는 isIndexStale()에 의존 (resetIndexCache 미사용)
 *     → 디렉토리 mtime이 변하지 않으면 캐시 재사용 (성능)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_SOLUTIONS, PACKS_DIR } from '../core/paths.js';
import { getOrBuildIndex } from '../engine/solution-index.js';
import type { SolutionDirConfig } from '../engine/solution-index.js';
import { extractTags } from '../engine/solution-format.js';
import { parseSolutionV3, serializeSolutionV3 } from '../engine/solution-format.js';
import type { SolutionStatus, SolutionType } from '../engine/solution-format.js';
import { calculateRelevance } from '../engine/solution-matcher.js';
import { filterSolutionContent } from '../hooks/prompt-injection-filter.js';

// ── 타입 ──

export interface SearchOptions {
  dirs?: SolutionDirConfig[];
  type?: SolutionType;
  status?: SolutionStatus;
  limit?: number;
}

export interface ListOptions {
  dirs?: SolutionDirConfig[];
  status?: SolutionStatus;
  type?: SolutionType;
  scope?: 'me' | 'team' | 'project';
  sort?: 'confidence' | 'updated' | 'name';
}

export interface SolutionSummary {
  name: string;
  status: SolutionStatus;
  confidence: number;
  type: SolutionType;
  scope: 'me' | 'team' | 'project';
  tags: string[];
}

export interface SearchResult extends SolutionSummary {
  relevance: number;
  matchedTags: string[];
}

export interface SolutionDetail {
  name: string;
  status: SolutionStatus;
  confidence: number;
  type: SolutionType;
  scope: 'me' | 'team' | 'project';
  tags: string[];
  identifiers: string[];
  context: string;
  content: string;
}

export interface SolutionStats {
  total: number;
  byStatus: Record<SolutionStatus, number>;
  byType: Record<SolutionType, number>;
  byScope: Record<'me' | 'team' | 'project', number>;
}

// ── 디렉토리 해석 ──

/**
 * 기본 솔루션 디렉토리 목록 생성.
 * MCP 서버에서 cwd를 전달받으면 project 스코프도 포함.
 */
export function defaultSolutionDirs(cwd?: string): SolutionDirConfig[] {
  const dirs: SolutionDirConfig[] = [
    { dir: ME_SOLUTIONS, scope: 'me' },
  ];

  // 팩 디렉토리 스캔 — 하위에 solutions/ 디렉토리가 있는 팩만 포함
  try {
    if (fs.existsSync(PACKS_DIR)) {
      for (const entry of fs.readdirSync(PACKS_DIR)) {
        const solDir = path.join(PACKS_DIR, entry, 'solutions');
        if (fs.existsSync(solDir)) {
          dirs.push({ dir: solDir, scope: 'team' });
        }
      }
    }
  } catch {
    // 팩 디렉토리 접근 실패는 무시
  }

  if (cwd) {
    dirs.push({ dir: path.join(cwd, '.compound', 'solutions'), scope: 'project' });
  }

  return dirs;
}

// ── 검색 ──

/**
 * 쿼리 텍스트로 솔루션을 검색합니다.
 * 태그 기반 Jaccard 매칭 + confidence 가중치.
 * Hook injection과 달리 세션 캐시/버짓 없이 순수 검색.
 *
 * 인덱스 캐시: getOrBuildIndex() 내부의 isIndexStale()이
 * 디렉토리 mtime을 비교하여 변경 시에만 재구축합니다.
 */
export function searchSolutions(query: string, options?: SearchOptions): SearchResult[] {
  const dirs = options?.dirs ?? defaultSolutionDirs();
  const limit = options?.limit ?? 10;

  const index = getOrBuildIndex(dirs);

  const queryTags = extractTags(query);
  if (queryTags.length === 0) return [];

  const results: SearchResult[] = [];

  for (const entry of index.entries) {
    if (options?.type && entry.type !== options.type) continue;
    if (options?.status && entry.status !== options.status) continue;

    const result = calculateRelevance(queryTags, entry.tags, entry.confidence) as {
      relevance: number;
      matchedTags: string[];
    };

    // 태그 매칭 + 이름 매칭: 솔루션 이름에 쿼리 단어가 포함되면 boost
    const nameWords = entry.name.toLowerCase().split(/[-_]/);
    const nameMatchCount = queryTags.filter(t => nameWords.includes(t)).length;
    if (result.matchedTags.length === 0 && nameMatchCount === 0) continue;
    const nameBoost = nameMatchCount * 0.1;

    results.push({
      name: entry.name,
      status: entry.status,
      confidence: entry.confidence,
      type: entry.type,
      scope: entry.scope,
      tags: entry.tags,
      relevance: result.relevance + nameBoost,
      matchedTags: [...result.matchedTags, ...queryTags.filter(t => nameWords.includes(t) && !result.matchedTags.includes(t))],
    });
  }

  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, limit);
}

// ── 목록 ──

/** 솔루션 요약 목록을 반환합니다 (필터/정렬 지원). */
export function listSolutions(options?: ListOptions): SolutionSummary[] {
  const dirs = options?.dirs ?? defaultSolutionDirs();

  const index = getOrBuildIndex(dirs);

  let entries = index.entries.map(e => ({
    name: e.name,
    status: e.status,
    confidence: e.confidence,
    type: e.type,
    scope: e.scope,
    tags: e.tags,
  }));

  if (options?.status) entries = entries.filter(e => e.status === options.status);
  if (options?.type) entries = entries.filter(e => e.type === options.type);
  if (options?.scope) entries = entries.filter(e => e.scope === options.scope);

  const sort = options?.sort ?? 'confidence';
  if (sort === 'confidence') {
    entries.sort((a, b) => b.confidence - a.confidence);
  } else if (sort === 'name') {
    entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  return entries;
}

// ── 읽기 ──

/**
 * 이름으로 솔루션 전문을 읽습니다.
 *
 * MCP는 온디맨드이므로 truncation 없이 전문을 반환합니다.
 * 이것이 hook injection(1500자 캡)과의 핵심 차이입니다.
 * Prompt injection 필터만 적용합니다.
 */
export function readSolution(name: string, options?: { dirs?: SolutionDirConfig[] }): SolutionDetail | null {
  const dirs = options?.dirs ?? defaultSolutionDirs();

  const index = getOrBuildIndex(dirs);

  const entry = index.entries.find(e => e.name === name);
  if (!entry) return null;

  let fileContent: string;
  try {
    // Security: symlink을 통한 임의 파일 읽기 방지
    const fstat = fs.lstatSync(entry.filePath);
    if (fstat.isSymbolicLink()) return null;
    // Safety: 비정상적으로 큰 파일 거부 (100KB)
    if (fstat.size > 100 * 1024) return null;
    fileContent = fs.readFileSync(entry.filePath, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseSolutionV3(fileContent);
  if (!parsed) return null;

  // 보안: prompt injection 필터
  const contentFilter = filterSolutionContent(parsed.content);
  if (!contentFilter.safe) return null;

  const contextFilter = filterSolutionContent(parsed.context);
  if (!contextFilter.safe) return null;

  // Pull(MCP) 경로도 evidence에 기여 — sessions 카운트 증가
  try {
    parsed.frontmatter.evidence.sessions += 1;
    parsed.frontmatter.updated = new Date().toISOString().split('T')[0];
    const tmpPath = entry.filePath + '.tmp';
    fs.writeFileSync(tmpPath, serializeSolutionV3(parsed));
    fs.renameSync(tmpPath, entry.filePath);
  } catch {
    // evidence 업데이트 실패는 무시 — 읽기 결과는 정상 반환
  }

  return {
    name: entry.name,
    status: entry.status,
    confidence: entry.confidence,
    type: entry.type,
    scope: entry.scope,
    tags: entry.tags,
    identifiers: entry.identifiers,
    context: contextFilter.sanitized,
    content: contentFilter.sanitized,
  };
}

// ── 통계 ──

/** 솔루션 통계 (status별, type별, scope별 카운트). */
export function getSolutionStats(options?: { dirs?: SolutionDirConfig[] }): SolutionStats {
  const dirs = options?.dirs ?? defaultSolutionDirs();

  const index = getOrBuildIndex(dirs);

  const stats: SolutionStats = {
    total: index.entries.length,
    // retired는 인덱스에서 제외되므로 항상 0 (solution-index.ts:73)
    byStatus: { experiment: 0, candidate: 0, verified: 0, mature: 0, retired: 0 },
    byType: { pattern: 0, decision: 0, troubleshoot: 0, 'anti-pattern': 0 },
    byScope: { me: 0, team: 0, project: 0 },
  };

  for (const entry of index.entries) {
    if (entry.status in stats.byStatus) stats.byStatus[entry.status]++;
    if (entry.type in stats.byType) stats.byType[entry.type]++;
    if (entry.scope in stats.byScope) stats.byScope[entry.scope]++;
  }

  return stats;
}
