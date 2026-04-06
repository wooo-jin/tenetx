#!/usr/bin/env node
/**
 * Tenetx — MCP Compound Knowledge Server
 *
 * Pull 모델: Claude가 필요할 때 compound-search/read를 직접 호출.
 * instructions 필드로 Claude에게 compound 도구 사용법을 안내.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

if (!process.env.COMPOUND_CWD) {
  process.env.COMPOUND_CWD = process.cwd();
}

const INSTRUCTIONS = [
  'Tenetx compound knowledge — accumulated patterns and solutions from past sessions.',
  '',
  'When to use:',
  '- Before starting a task: search for similar past patterns with compound-search',
  '- When encountering an error: search for troubleshooting solutions',
  '- When making architectural decisions: check if a similar decision was documented',
  '- After completing work: user may run /compound to extract new patterns',
  '',
  'Usage flow: compound-search (find relevant) → compound-read (get full content)',
  'compound-stats gives an overview of accumulated knowledge.',
  '',
  'Evidence collection:',
  '- When the user corrects your behavior, use correction-record to record it as evidence',
  '- This enables tenetx to learn from corrections and adapt personalization over time',
].join('\n');

const server = new McpServer(
  { name: 'tenetx-compound', version: '1.0.0' },
  { instructions: INSTRUCTIONS },
);

registerTools(server);

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (err) {
  process.stderr.write(`[tenetx-mcp] Failed to start: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
