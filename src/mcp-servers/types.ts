/**
 * MCP Server Definition Types
 *
 * Tenetx이 자체 제공하는 빌트인 MCP 서버의 정의 타입.
 */

export interface McpServerDefinition {
  name: string;
  description: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** Built-in server that ships with tenetx */
  builtin: boolean;
}

export interface SearchResult {
  file: string;
  line: number;
  type: 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum';
  name: string;
  exported: boolean;
}

export interface SecretFinding {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
  severity: 'high' | 'medium' | 'low';
}

export interface DependencyReport {
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'cargo' | 'go' | null;
  totalDeps: number;
  devDeps: number;
  /** outdated 체크 가능 여부 */
  outdatedCheck: boolean;
  lockfilePresent: boolean;
}
