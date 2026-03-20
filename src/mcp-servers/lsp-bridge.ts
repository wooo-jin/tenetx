/**
 * LSP Bridge MCP Server — LSP 래핑
 *
 * 프로젝트 언어에 맞는 Language Server를 탐지하고
 * hover/definition/references를 MCP로 노출하는 브릿지 서버 정의.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServerDefinition } from './types.js';

export const LSP_BRIDGE_DEFINITION: McpServerDefinition = {
  name: 'lsp-bridge',
  description: 'Language Server Protocol wrapper — provides hover/definition/references',
  command: 'node',
  args: ['lsp-bridge-server.js'],
  builtin: true,
};

/** 프로젝트 파일 기반으로 적합한 Language Server를 감지 */
export function detectLanguageServer(cwd: string): string | null {
  // TypeScript / JavaScript
  if (
    fs.existsSync(path.join(cwd, 'tsconfig.json')) ||
    fs.existsSync(path.join(cwd, 'jsconfig.json'))
  ) {
    return 'typescript-language-server';
  }

  // Python
  if (
    fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
    fs.existsSync(path.join(cwd, 'setup.py')) ||
    fs.existsSync(path.join(cwd, 'requirements.txt'))
  ) {
    return 'pylsp';
  }

  // Go
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    return 'gopls';
  }

  // Rust
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    return 'rust-analyzer';
  }

  // Java / Kotlin
  if (
    fs.existsSync(path.join(cwd, 'pom.xml')) ||
    fs.existsSync(path.join(cwd, 'build.gradle')) ||
    fs.existsSync(path.join(cwd, 'build.gradle.kts'))
  ) {
    return 'jdtls';
  }

  // package.json만 있으면 tsserver 추정
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    return 'typescript-language-server';
  }

  return null;
}
