/**
 * Repo Index MCP Server — 프로젝트 인덱싱
 *
 * map-generator를 활용하여 프로젝트 구조를 Markdown으로 요약.
 */

import type { McpServerDefinition } from './types.js';
import { generateProjectMap, formatMapAsMarkdown } from '../engine/knowledge/map-generator.js';

export const REPO_INDEX_DEFINITION: McpServerDefinition = {
  name: 'repo-index',
  description: 'Project structure indexing using map-generator',
  command: 'node',
  args: ['repo-index-server.js'],
  builtin: true,
};

/** 프로젝트 구조를 Markdown 요약으로 생성 */
export function generateRepoIndex(cwd: string): string {
  const map = generateProjectMap({ cwd, maxFiles: 500 });
  return formatMapAsMarkdown(map);
}
