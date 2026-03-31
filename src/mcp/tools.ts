/**
 * Tenetx — MCP Tool Definitions
 *
 * 4개 도구를 McpServer에 등록합니다:
 *   - compound-search: 태그 기반 솔루션 검색
 *   - compound-list: 필터/정렬된 솔루션 목록
 *   - compound-read: 솔루션 전문 읽기
 *   - compound-stats: 통계 요약
 *
 * 설계 결정:
 *   - 각 도구는 solution-reader.ts의 순수 함수를 호출
 *   - cwd는 환경변수 COMPOUND_CWD에서 읽음 (Claude Code가 전달)
 *   - MCP SDK registerTool API + zod 스키마로 입력 검증
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  searchSolutions,
  listSolutions,
  readSolution,
  getSolutionStats,
  defaultSolutionDirs,
} from './solution-reader.js';

function getCwd(): string | undefined {
  return process.env.COMPOUND_CWD || undefined;
}

export function registerTools(server: McpServer): void {
  // ── compound-search ──
  server.registerTool(
    'compound-search',
    {
      description: 'Search accumulated compound knowledge (solutions, patterns) by query. Returns relevant matches ranked by tag-based similarity.',
      inputSchema: {
        query: z.string().describe('Search query — keywords, tech names, or problem description'),
        type: z.enum(['pattern', 'decision', 'troubleshoot', 'anti-pattern']).optional()
          .describe('Filter by solution type'),
        status: z.enum(['experiment', 'candidate', 'verified', 'mature']).optional()
          .describe('Filter by lifecycle status'),
        limit: z.number().min(1).max(20).optional()
          .describe('Max results to return (default: 10)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, type, status, limit }) => {
      const results = searchSolutions(query, {
        dirs: defaultSolutionDirs(getCwd()),
        type,
        status,
        limit,
      });

      if (results.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No matching solutions found.',
          }],
        };
      }

      const text = results.map((r, i) =>
        `${i + 1}. **${r.name}** (${r.status}, confidence: ${r.confidence.toFixed(2)})\n` +
        `   Type: ${r.type} | Scope: ${r.scope} | Relevance: ${r.relevance.toFixed(3)}\n` +
        `   Tags: ${r.tags.join(', ')}\n` +
        `   Matched: ${r.matchedTags.join(', ')}`,
      ).join('\n\n');

      return {
        content: [{
          type: 'text' as const,
          text: `Found ${results.length} matching solution(s):\n\n${text}`,
        }],
      };
    },
  );

  // ── compound-list ──
  server.registerTool(
    'compound-list',
    {
      description: 'List all accumulated compound solutions with optional filtering and sorting.',
      inputSchema: {
        status: z.enum(['experiment', 'candidate', 'verified', 'mature']).optional()
          .describe('Filter by lifecycle status'),
        type: z.enum(['pattern', 'decision', 'troubleshoot', 'anti-pattern']).optional()
          .describe('Filter by solution type'),
        scope: z.enum(['me', 'team', 'project']).optional()
          .describe('Filter by scope'),
        sort: z.enum(['confidence', 'updated', 'name']).optional()
          .describe('Sort order (default: confidence)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, type, scope, sort }) => {
      const results = listSolutions({
        dirs: defaultSolutionDirs(getCwd()),
        status,
        type,
        scope,
        sort,
      });

      if (results.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No solutions found.',
          }],
        };
      }

      const text = results.map(r =>
        `- **${r.name}** [${r.status}] confidence: ${r.confidence.toFixed(2)} | ${r.type} | ${r.scope} | tags: ${r.tags.join(', ')}`,
      ).join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: `${results.length} solution(s):\n\n${text}`,
        }],
      };
    },
  );

  // ── compound-read ──
  server.registerTool(
    'compound-read',
    {
      description: 'Read the full content of a specific compound solution by name. Use compound-search or compound-list first to find the name.',
      inputSchema: {
        name: z.string().describe('Solution name (slug) to read'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      const result = readSolution(name, {
        dirs: defaultSolutionDirs(getCwd()),
      });

      if (!result) {
        return {
          content: [{
            type: 'text' as const,
            text: `Solution "${name}" not found or filtered by security policy.`,
          }],
        };
      }

      const header =
        `# ${result.name}\n` +
        `Status: ${result.status} | Confidence: ${result.confidence.toFixed(2)} | Type: ${result.type} | Scope: ${result.scope}\n` +
        `Tags: ${result.tags.join(', ')}\n` +
        (result.identifiers.length > 0 ? `Identifiers: ${result.identifiers.join(', ')}\n` : '');

      const body =
        (result.context ? `\n## Context\n${result.context}\n` : '') +
        `\n## Content\n${result.content}`;

      return {
        content: [{
          type: 'text' as const,
          text: header + body,
        }],
      };
    },
  );

  // ── compound-stats ──
  server.registerTool(
    'compound-stats',
    {
      description: 'Get overview statistics of accumulated compound knowledge (total count, breakdown by status/type/scope).',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const stats = getSolutionStats({
        dirs: defaultSolutionDirs(getCwd()),
      });

      const lines = [
        `Total solutions: ${stats.total}`,
        '',
        'By status:',
        ...Object.entries(stats.byStatus)
          .filter(([, count]) => count > 0)
          .map(([status, count]) => `  ${status}: ${count}`),
        '',
        'By type:',
        ...Object.entries(stats.byType)
          .filter(([, count]) => count > 0)
          .map(([type, count]) => `  ${type}: ${count}`),
        '',
        'By scope:',
        ...Object.entries(stats.byScope)
          .filter(([, count]) => count > 0)
          .map(([scope, count]) => `  ${scope}: ${count}`),
      ];

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n'),
        }],
      };
    },
  );
}
