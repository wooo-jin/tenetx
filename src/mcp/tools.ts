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
import { processCorrection } from '../forge/evidence-processor.js';
import type { CorrectionKind } from '../store/types.js';

function getCwd(): string | undefined {
  return process.env.TENETX_CWD ?? process.env.COMPOUND_CWD ?? undefined;
}

export function registerTools(server: McpServer): void {
  // ── compound-search ──
  server.registerTool(
    'compound-search',
    {
      description: 'Search accumulated compound knowledge (solutions, patterns) by query. Returns relevant matches ranked by tag-based similarity. When multiple results are returned, provide a brief summary of findings.',
      inputSchema: {
        query: z.string().describe('Search query — keywords, tech names, or problem description'),
        type: z.enum(['pattern', 'solution', 'decision', 'troubleshoot', 'anti-pattern', 'convention']).optional()
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

      const text = results.map((r, i) => {
        let snippet = '';
        if (i < 5) {
          try {
            const full = readSolution(r.name, { dirs: defaultSolutionDirs(getCwd()), skipEvidence: true });
            if (full?.content) {
              const firstLines = full.content
                .split('\n')
                .filter(l => l.trim().length > 0)
                .slice(0, 2)
                .join(' ')
                .slice(0, 150);
              snippet = `\n   Preview: ${firstLines}`;
            }
          } catch { /* skip snippet on error */ }
        }
        return (
          `${i + 1}. **${r.name}** (${r.status}, confidence: ${r.confidence.toFixed(2)})\n` +
          `   Type: ${r.type} | Scope: ${r.scope} | Relevance: ${r.relevance.toFixed(3)}\n` +
          `   Tags: ${r.tags.join(', ')}\n` +
          `   Matched: ${r.matchedTags.join(', ')}` +
          snippet
        );
      }).join('\n\n');

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
        type: z.enum(['pattern', 'solution', 'decision', 'troubleshoot', 'anti-pattern', 'convention']).optional()
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
      annotations: { readOnlyHint: false },
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

  // ── session-search ──
  server.registerTool(
    'session-search',
    {
      description: 'Search past session conversations by keyword. Returns matching messages from previous Claude Code sessions. When presenting results, summarize key findings for the user.',
      inputSchema: {
        query: z.string().describe('Search query — keywords to find in past conversations'),
        limit: z.number().min(1).max(20).optional()
          .describe('Max results to return (default: 10)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      try {
        const { searchSessions, extractContextWindow } = await import('../core/session-store.js');
        const results = searchSessions(query, limit ?? 10);

        if (results.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No matching messages found in past sessions.',
            }],
          };
        }

        // 세션별 그루핑 (세션당 최대 3메시지)
        const grouped = new Map<string, typeof results>();
        for (const r of results) {
          const group = grouped.get(r.sessionId) ?? [];
          if (group.length < 3) {
            group.push(r);
            grouped.set(r.sessionId, group);
          }
        }

        const sessionBlocks: string[] = [];
        let msgIndex = 1;
        for (const [sessionId, msgs] of grouped) {
          const first = msgs[0];
          const date = first.timestamp ? first.timestamp.slice(0, 10) : 'unknown date';
          const project = first.cwd ? first.cwd.split('/').pop() ?? first.cwd : 'unknown project';

          const msgLines = msgs.map(r => {
            const snippet = extractContextWindow(r.content, r.tokens);
            return `  ${msgIndex++}. [${r.role}] ${snippet}`;
          });

          sessionBlocks.push(
            `Session: ${sessionId.slice(0, 8)} | Date: ${date} | Project: ${project}\n` +
            msgLines.join('\n'),
          );
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Found ${results.length} matching message(s) across ${grouped.size} session(s):\n\n${sessionBlocks.join('\n\n')}`,
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Session search unavailable (requires Node.js 22+ with SQLite support).',
          }],
        };
      }
    },
  );

  // ── correction-record ──
  server.registerTool(
    'correction-record',
    {
      description: [
        'Record a user correction as structured evidence.',
        'Call this when the user explicitly corrects your behavior (e.g., "don\'t do X", "always do Y", "fix this now").',
        'This creates an Evidence record and optionally a temporary session Rule.',
        '',
        'kind values:',
        '  fix-now — immediate fix needed, creates a session-scoped temporary rule',
        '  prefer-from-now — long-term preference, records evidence for future promotion',
        '  avoid-this — strong avoidance, creates a strong temporary rule',
      ].join('\n'),
      inputSchema: {
        session_id: z.string().describe('Current session ID'),
        kind: z.enum(['fix-now', 'prefer-from-now', 'avoid-this'])
          .describe('Correction type: fix-now (immediate), prefer-from-now (long-term), avoid-this (strong avoidance)'),
        message: z.string().describe('What the user wants changed — the correction in natural language'),
        target: z.string().describe('What is being corrected — the specific behavior, pattern, or output'),
        axis_hint: z.enum(['quality_safety', 'autonomy', 'judgment_philosophy', 'communication_style']).nullable()
          .describe('Which personalization axis this correction relates to (null if unclear)'),
      },
    },
    async ({ session_id, kind, message, target, axis_hint }) => {
      try {
        // v1 session_id를 환경변수에서 가져옴 (하네스가 설정)
        const effectiveSessionId = session_id || process.env.TENETX_SESSION_ID || 'unknown';
        const result = processCorrection({
          session_id: effectiveSessionId,
          kind: kind as CorrectionKind,
          message,
          target,
          axis_hint: axis_hint as 'quality_safety' | 'autonomy' | 'judgment_philosophy' | 'communication_style' | null,
        });

        const lines = [
          `Evidence recorded: ${result.evidence_event_id}`,
        ];

        if (result.temporary_rule) {
          lines.push(`Temporary rule created: "${result.temporary_rule.policy}" (${result.temporary_rule.strength}, scope: ${result.temporary_rule.scope})`);
        }

        if (result.recompose_required) {
          lines.push('Session recomposition recommended — the temporary rule should be applied to current session behavior.');
        }

        if (result.promotion_candidate) {
          lines.push('This correction is a candidate for long-term rule promotion at session end.');
        }

        return {
          content: [{
            type: 'text' as const,
            text: lines.join('\n'),
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: 'text' as const,
            text: `Failed to record correction: ${e instanceof Error ? e.message : String(e)}`,
          }],
        };
      }
    },
  );
}
