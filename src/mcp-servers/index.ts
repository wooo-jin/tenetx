/**
 * MCP Servers Index — 빌트인 MCP 서버 집합
 */

import type { McpServerDefinition } from './types.js';
import { LSP_BRIDGE_DEFINITION } from './lsp-bridge.js';
import { AST_SEARCH_DEFINITION } from './ast-search.js';
import { TEST_RUNNER_DEFINITION } from './test-runner.js';
import { REPO_INDEX_DEFINITION } from './repo-index.js';
import { SECRETS_SCAN_DEFINITION } from './secrets-scan.js';
import { PYTHON_REPL_DEFINITION } from './python-repl.js';
import { FILE_WATCHER_DEFINITION } from './file-watcher.js';
import { DEPENDENCY_ANALYZER_DEFINITION } from './dependency-analyzer.js';

/** 모든 빌트인 MCP 서버 정의 */
export const BUILTIN_MCP_SERVERS: McpServerDefinition[] = [
  LSP_BRIDGE_DEFINITION,
  AST_SEARCH_DEFINITION,
  TEST_RUNNER_DEFINITION,
  REPO_INDEX_DEFINITION,
  SECRETS_SCAN_DEFINITION,
  PYTHON_REPL_DEFINITION,
  FILE_WATCHER_DEFINITION,
  DEPENDENCY_ANALYZER_DEFINITION,
];

/** 이름으로 빌트인 서버 조회 */
export function getBuiltinServer(name: string): McpServerDefinition | undefined {
  return BUILTIN_MCP_SERVERS.find(s => s.name === name);
}

// Re-export types and helpers
export type { McpServerDefinition, SearchResult, SecretFinding, DependencyReport } from './types.js';
export { detectLanguageServer, lspHover, lspDefinition, lspReferences, lspDiagnostics, lspStatus, lspShutdown } from './lsp-bridge.js';
export { astSearch } from './ast-search.js';
export { detectTestFramework } from './test-runner.js';
export { generateRepoIndex } from './repo-index.js';
export { scanForSecrets } from './secrets-scan.js';
export { detectPythonEnvironment, isPythonProject } from './python-repl.js';
export { getRecentlyModified, getModificationSummary } from './file-watcher.js';
export { analyzeDependencies } from './dependency-analyzer.js';
