/**
 * LSP Bridge MCP Server — LSP 래핑
 *
 * 프로젝트 언어에 맞는 Language Server를 탐지하고
 * hover/definition/references/diagnostics를 MCP로 노출하는 브릿지 서버 정의.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServerDefinition } from './types.js';
import { getLspManager, shutdownGlobalLspManager } from '../engine/lsp-manager.js';
import { uriToPath } from '../engine/lsp-client.js';
import { detectAvailableServers } from '../engine/lsp-detector.js';

export const LSP_BRIDGE_DEFINITION: McpServerDefinition = {
  name: 'lsp-bridge',
  description: 'Language Server Protocol wrapper — provides hover/definition/references/diagnostics',
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

// ── MCP Tool Handlers ──

/** hover 정보 조회 */
export async function lspHover(
  file: string,
  line: number,
  character: number,
  rootUri: string,
): Promise<string> {
  const manager = getLspManager();
  const result = await manager.hoverAt(file, line, character, rootUri);
  if (!result) return 'No hover information available';
  return result.contents;
}

/** 정의로 이동 */
export async function lspDefinition(
  file: string,
  line: number,
  character: number,
  rootUri: string,
): Promise<string> {
  const manager = getLspManager();
  const locations = await manager.definitionOf(file, line, character, rootUri);
  if (locations.length === 0) return 'No definition found';
  return locations
    .map((loc) => {
      const p = uriToPath(loc.uri);
      return `${p}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
    })
    .join('\n');
}

/** 참조 검색 */
export async function lspReferences(
  file: string,
  line: number,
  character: number,
  rootUri: string,
): Promise<string> {
  const manager = getLspManager();
  const locations = await manager.referencesOf(file, line, character, rootUri);
  if (locations.length === 0) return 'No references found';
  return locations
    .map((loc) => {
      const p = uriToPath(loc.uri);
      return `${p}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
    })
    .join('\n');
}

/** 진단 정보 조회 */
export async function lspDiagnostics(file: string, rootUri: string): Promise<string> {
  const manager = getLspManager();
  const diags = await manager.getDiagnostics(file, rootUri);
  if (diags.length === 0) return 'No diagnostics';
  return diags
    .map(
      (d) =>
        `[${d.severity}] ${d.range.start.line + 1}:${d.range.start.character + 1} — ${d.message}${d.source ? ` (${d.source})` : ''}`,
    )
    .join('\n');
}

/** 사용 가능한 서버 상태 조회 */
export async function lspStatus(): Promise<string> {
  const servers = await detectAvailableServers();
  const manager = getLspManager();
  const lines: string[] = ['Language Server Status:', ''];

  for (const s of servers) {
    const status = s.available ? 'installed' : 'not found';
    lines.push(`  ${s.language.padEnd(12)} ${s.command.padEnd(30)} ${status}`);
  }

  lines.push('');
  lines.push(`Active clients: ${manager.activeCount}`);
  if (manager.activeCount > 0) {
    lines.push(`Active languages: ${manager.activeLanguages.join(', ')}`);
  }

  return lines.join('\n');
}

/** LSP 매니저 종료 */
export async function lspShutdown(): Promise<void> {
  await shutdownGlobalLspManager();
}
