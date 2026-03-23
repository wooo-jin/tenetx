/**
 * AST Search MCP Server — AST 기반 코드 검색
 *
 * ast-grep(sg)이 설치되어 있으면 실제 AST 파싱을 사용하고,
 * 없으면 기존 정규식 휴리스틱으로 폴백.
 * MCP 서버 인터페이스는 동일하게 유지.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServerDefinition, SearchResult } from './types.js';
import {
  isAstGrepAvailable,
  astGrepSearch,
  AST_PATTERNS,
  type AstMatch,
} from '../engine/ast-adapter.js';

export const AST_SEARCH_DEFINITION: McpServerDefinition = {
  name: 'ast-search',
  description: 'AST-based code search — matches function/class/interface declarations',
  command: 'node',
  args: ['ast-search-server.js'],
  builtin: true,
};

// ── Regex Fallback ──────────────────────────────────

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

/** 정규식 기반 폴백 검색 (기존 방식) */
function regexSearch(pattern: string, cwd: string): SearchResult[] {
  const results: SearchResult[] = [];
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch {
    return [];
  }
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

// ── AST-grep Search ─────────────────────────────────

/** AstMatch를 SearchResult로 변환 */
function astMatchToSearchResult(match: AstMatch, cwd: string): SearchResult {
  const text = match.text.trim();
  let type: SearchResult['type'] = 'function';
  if (text.startsWith('class ') || /^export\s+(default\s+)?class\b/.test(text)) type = 'class';
  else if (text.startsWith('interface ') || /^export\s+interface\b/.test(text)) type = 'interface';
  else if (text.startsWith('type ') || /^export\s+type\b/.test(text)) type = 'type';
  else if (text.startsWith('enum ') || /^export\s+enum\b/.test(text)) type = 'enum';
  else if (text.startsWith('const ') || /^export\s+const\b/.test(text)) type = 'const';

  const exported = /^export\b/.test(text);
  const relativePath = path.relative(cwd, match.file);

  return {
    file: relativePath.startsWith('.') ? relativePath : relativePath,
    line: match.line,
    type,
    name: match.matchedNode,
    exported,
  };
}

/** ast-grep을 사용한 선언 검색 */
async function astGrepDeclarationSearch(pattern: string, cwd: string): Promise<SearchResult[]> {
  let nameFilter: RegExp;
  try {
    nameFilter = new RegExp(pattern, 'i');
  } catch {
    return [];
  }

  // 여러 선언 유형에 대해 ast-grep 검색 실행
  const patterns = [
    AST_PATTERNS.typescript.function,
    AST_PATTERNS.typescript.asyncFunction,
    AST_PATTERNS.typescript.arrowFunction,
    AST_PATTERNS.typescript.class,
    AST_PATTERNS.typescript.interface,
  ];

  const allMatches: AstMatch[] = [];
  for (const p of patterns) {
    const matches = await astGrepSearch({ pattern: p, cwd });
    allMatches.push(...matches);
  }

  // 이름 필터 적용
  const results: SearchResult[] = [];
  for (const match of allMatches) {
    const sr = astMatchToSearchResult(match, cwd);
    if (nameFilter.test(sr.name)) {
      results.push(sr);
    }
  }

  // 중복 제거 (같은 파일/라인)
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.file}:${r.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Public API ──────────────────────────────────────

/**
 * 패턴에 매칭되는 선언 검색.
 * ast-grep이 사용 가능하면 AST 파싱 사용, 아니면 regex 폴백.
 */
export function astSearch(pattern: string, cwd: string): SearchResult[] {
  // 동기 함수 시그니처 유지 (MCP 서버 호환성)
  // ast-grep은 비동기이므로 regex 폴백을 기본으로 사용
  return regexSearch(pattern, cwd);
}

/**
 * 비동기 AST 검색 — ast-grep이 가능하면 사용, 아니면 regex 폴백.
 * 새 코드에서는 이 함수를 사용.
 */
export async function astSearchAsync(pattern: string, cwd: string): Promise<SearchResult[]> {
  if (isAstGrepAvailable()) {
    const results = await astGrepDeclarationSearch(pattern, cwd);
    if (results.length > 0) return results;
    // ast-grep 결과가 없으면 regex 폴백 (패턴 불일치 등)
  }
  return regexSearch(pattern, cwd);
}

/** ast-grep 사용 가능 여부 (외부 참조용) */
export { isAstGrepAvailable } from '../engine/ast-adapter.js';
