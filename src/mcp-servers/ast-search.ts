/**
 * AST Search MCP Server — AST 기반 코드 검색
 *
 * 정규식 + AST 유사 휴리스틱으로 함수/클래스/인터페이스 선언을 검색.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServerDefinition, SearchResult } from './types.js';

export const AST_SEARCH_DEFINITION: McpServerDefinition = {
  name: 'ast-search',
  description: 'AST 기반 코드 검색 — 함수/클래스/인터페이스 선언 매칭',
  command: 'node',
  args: ['ast-search-server.js'],
  builtin: true,
};

const DECLARATION_REGEX =
  /^(export\s+)?(function|class|interface|type|const|enum)\s+(\w+)/;

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '__pycache__', '.venv', 'venv', '.compound', '.claude',
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.rb',
]);

const MAX_FILES = 10_000; // 대형 프로젝트 보호

/** 패턴에 매칭되는 선언 검색 */
export function astSearch(pattern: string, cwd: string): SearchResult[] {
  const results: SearchResult[] = [];
  const regex = new RegExp(pattern, 'i');
  let fileCount = 0;

  function walk(dir: string): void {
    if (fileCount >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (fileCount >= MAX_FILES) return;
        fileCount++;
        const ext = path.extname(entry.name).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) continue;

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          const relativePath = path.relative(cwd, fullPath);

          for (let i = 0; i < lines.length; i++) {
            const match = DECLARATION_REGEX.exec(lines[i]);
            if (!match) continue;

            const name = match[3];
            if (!regex.test(name)) continue;

            results.push({
              file: relativePath,
              line: i + 1,
              type: match[2] as SearchResult['type'],
              name,
              exported: !!match[1],
            });
          }
        } catch {
          // 읽기 실패 시 무시
        }
      }
    }
  }

  walk(cwd);
  return results;
}
