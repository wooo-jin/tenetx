#!/usr/bin/env node
/**
 * Tenetx — MCP Compound Knowledge Server
 *
 * Claude Code가 compound knowledge를 온디맨드로 조회할 수 있는
 * stdio 기반 MCP 서버입니다.
 *
 * 등록: ~/.claude/settings.json의 mcpServers에 자동 등록 (postinstall)
 * 생명주기: Claude Code가 세션 시작 시 자동 spawn, 세션 종료 시 종료
 *
 * Push(hook injection) + Pull(MCP) 하이브리드 모델:
 *   - Hook: 프롬프트마다 자동 매칭 → 관련 솔루션 push (세션 8000자 캡)
 *   - MCP: Claude가 필요할 때 직접 검색/읽기 (상시 컨텍스트 비용 0)
 *
 * cwd 전달:
 *   Claude Code는 MCP 서버의 cwd를 프로젝트 디렉토리로 설정합니다.
 *   process.cwd()를 COMPOUND_CWD로 노출하여 project 스코프 솔루션을 검색합니다.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

// Claude Code가 MCP 서버를 spawn할 때 cwd를 프로젝트 디렉토리로 설정함.
// tools.ts의 getCwd()가 이 값을 읽어 project 스코프 솔루션을 포함합니다.
if (!process.env.COMPOUND_CWD) {
  process.env.COMPOUND_CWD = process.cwd();
}

const server = new McpServer({
  name: 'tenetx-compound',
  version: '1.0.0',
});

registerTools(server);

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (err) {
  process.stderr.write(`[tenetx-mcp] Failed to start: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
