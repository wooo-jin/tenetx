/**
 * LSP Tools MCP Server — TypeScript Compiler API 기반 LSP 도구
 *
 * typescript 패키지의 Language Service API를 직접 사용하여
 * 외부 language server 프로세스 없이 LSP 기능을 제공한다.
 *
 * 지원 도구:
 *   - lsp_hover: 커서 위치의 타입/문서 정보
 *   - lsp_goto_definition: 정의로 이동
 *   - lsp_find_references: 참조 찾기
 *   - lsp_diagnostics: 파일/디렉토리 진단
 *
 * ADR: typescript compiler API를 사용하는 이유
 *   - 외부 language server 프로세스 불필요 (새 의존성 없음)
 *   - typescript는 이미 devDependency로 존재
 *   - tsserver 통신보다 직관적이고 테스트 가능
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServerDefinition } from './types.js';

// TypeScript는 devDependency이므로 런타임에 로드되지 않을 수 있다.
// createRequire로 CJS 모듈을 ESM에서 로드, graceful fallback 처리.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TsModule = any;

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);

function loadTs(): TsModule | null {
  try {
    return _require('typescript');
  } catch {
    return null;
  }
}

export const LSP_TOOLS_DEFINITION: McpServerDefinition = {
  name: 'lsp-tools',
  description: 'TypeScript Compiler API based LSP tools — hover/definition/references/diagnostics without external language server',
  command: 'node',
  args: ['lsp-tools-server.js'],
  builtin: true,
};

// ── LanguageService 캐시 ──────────────────────────────────────────────────

interface ServiceEntry {
  service: TsModule;
  host: TsModule;
  ts: TsModule;
}

const serviceCache = new Map<string, ServiceEntry>();

/**
 * rootDir에 대한 TypeScript LanguageService를 생성하거나 캐시에서 반환
 *
 * @param rootDir 프로젝트 루트 디렉토리 (tsconfig.json 위치)
 */
function getLanguageService(rootDir: string): ServiceEntry | null {
  const cached = serviceCache.get(rootDir);
  if (cached) return cached;

  const ts = loadTs();
  if (!ts) return null;

  // tsconfig.json 탐색
  const tsconfigPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
  const configFile = tsconfigPath
    ? ts.readConfigFile(tsconfigPath, ts.sys.readFile)
    : { config: {} };

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    tsconfigPath ? path.dirname(tsconfigPath) : rootDir,
  );

  // 파일 버전 관리용 맵 (LanguageServiceHost 요구사항)
  const fileVersions = new Map<string, number>();

  const host: TsModule = {
    getScriptFileNames: () => parsedConfig.fileNames,
    getScriptVersion: (fileName: string) => String(fileVersions.get(fileName) ?? 0),
    getScriptSnapshot: (fileName: string) => {
      if (!fs.existsSync(fileName)) return undefined;
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf-8'));
    },
    getCurrentDirectory: () => rootDir,
    getCompilationSettings: () => parsedConfig.options,
    getDefaultLibFileName: (options: TsModule) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  const entry: ServiceEntry = { service, host, ts };
  serviceCache.set(rootDir, entry);
  return entry;
}

/** ServiceEntry 캐시를 비운다 (테스트 및 프로세스 재시작용) */
export function clearServiceCache(): void {
  serviceCache.clear();
}

// ── 오프셋 변환 헬퍼 ──────────────────────────────────────────────────────

/**
 * 파일 내용에서 line:character(0-based)를 절대 오프셋으로 변환
 *
 * @param content 파일 전체 텍스트
 * @param line 0-based 줄 번호
 * @param character 0-based 열 번호
 */
export function positionToOffset(content: string, line: number, character: number): number {
  const lines = content.split('\n');
  let offset = 0;
  for (let i = 0; i < line && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for \n
  }
  return offset + character;
}

/**
 * 절대 오프셋을 line:character(0-based)로 변환
 *
 * @param content 파일 전체 텍스트
 * @param offset 절대 오프셋
 */
export function offsetToPosition(content: string, offset: number): { line: number; character: number } {
  const lines = content.split('\n');
  let remaining = offset;
  for (let line = 0; line < lines.length; line++) {
    const lineLen = lines[line].length + 1; // +1 for \n
    if (remaining < lineLen) {
      return { line, character: remaining };
    }
    remaining -= lineLen;
  }
  // offset이 파일 끝을 넘는 경우
  return { line: lines.length - 1, character: lines[lines.length - 1]?.length ?? 0 };
}

// ── MCP Tool Handlers ──────────────────────────────────────────────────────

/**
 * 커서 위치의 hover 정보 반환 (타입 정보 + 문서)
 *
 * @param file 절대 파일 경로
 * @param line 0-based 줄 번호
 * @param character 0-based 열 번호
 * @param rootDir 프로젝트 루트 디렉토리
 */
export function lspToolsHover(
  file: string,
  line: number,
  character: number,
  rootDir: string,
): string {
  const entry = getLanguageService(rootDir);
  if (!entry) return 'TypeScript language service unavailable';

  const { service, ts } = entry;
  const absFile = path.resolve(file);

  if (!fs.existsSync(absFile)) return `File not found: ${absFile}`;

  const content = fs.readFileSync(absFile, 'utf-8');
  const offset = positionToOffset(content, line, character);

  try {
    const info = service.getQuickInfoAtPosition(absFile, offset);
    if (!info) return 'No hover information available';

    const parts: string[] = [];

    if (info.displayParts) {
      parts.push(ts.displayPartsToString(info.displayParts));
    }

    if (info.documentation?.length) {
      parts.push('');
      parts.push(ts.displayPartsToString(info.documentation));
    }

    return parts.join('\n') || 'No hover information available';
  } catch (err) {
    return `Hover failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * 정의로 이동
 *
 * @param file 절대 파일 경로
 * @param line 0-based 줄 번호
 * @param character 0-based 열 번호
 * @param rootDir 프로젝트 루트 디렉토리
 */
export function lspToolsDefinition(
  file: string,
  line: number,
  character: number,
  rootDir: string,
): string {
  const entry = getLanguageService(rootDir);
  if (!entry) return 'TypeScript language service unavailable';

  const { service } = entry;
  const absFile = path.resolve(file);

  if (!fs.existsSync(absFile)) return `File not found: ${absFile}`;

  const content = fs.readFileSync(absFile, 'utf-8');
  const offset = positionToOffset(content, line, character);

  try {
    const defs = service.getDefinitionAtPosition(absFile, offset);
    if (!defs || defs.length === 0) return 'No definition found';

    return defs
      .map((def: TsModule) => {
        const defContent = fs.existsSync(def.fileName)
          ? fs.readFileSync(def.fileName, 'utf-8')
          : '';
        const pos = defContent
          ? offsetToPosition(defContent, def.textSpan.start)
          : { line: 0, character: 0 };
        return `${def.fileName}:${pos.line + 1}:${pos.character + 1}`;
      })
      .join('\n');
  } catch (err) {
    return `Definition lookup failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * 참조 찾기
 *
 * @param file 절대 파일 경로
 * @param line 0-based 줄 번호
 * @param character 0-based 열 번호
 * @param rootDir 프로젝트 루트 디렉토리
 */
export function lspToolsReferences(
  file: string,
  line: number,
  character: number,
  rootDir: string,
): string {
  const entry = getLanguageService(rootDir);
  if (!entry) return 'TypeScript language service unavailable';

  const { service } = entry;
  const absFile = path.resolve(file);

  if (!fs.existsSync(absFile)) return `File not found: ${absFile}`;

  const content = fs.readFileSync(absFile, 'utf-8');
  const offset = positionToOffset(content, line, character);

  try {
    const refs = service.getReferencesAtPosition(absFile, offset);
    if (!refs || refs.length === 0) return 'No references found';

    return refs
      .map((ref: TsModule) => {
        const refContent = fs.existsSync(ref.fileName)
          ? fs.readFileSync(ref.fileName, 'utf-8')
          : '';
        const pos = refContent
          ? offsetToPosition(refContent, ref.textSpan.start)
          : { line: 0, character: 0 };
        return `${ref.fileName}:${pos.line + 1}:${pos.character + 1}`;
      })
      .join('\n');
  } catch (err) {
    return `References lookup failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * 파일 또는 디렉토리의 진단 정보 반환
 *
 * 디렉토리를 지정하면 해당 디렉토리의 모든 .ts/.tsx 파일을 검사한다.
 *
 * @param fileOrDir 절대 파일 경로 또는 디렉토리 경로
 * @param rootDir 프로젝트 루트 디렉토리
 */
export function lspToolsDiagnostics(fileOrDir: string, rootDir: string): string {
  const entry = getLanguageService(rootDir);
  if (!entry) return 'TypeScript language service unavailable';

  const { service, ts } = entry;
  const absTarget = path.resolve(fileOrDir);

  if (!fs.existsSync(absTarget)) return `Path not found: ${absTarget}`;

  // 검사할 파일 목록 결정
  let files: string[];
  const stat = fs.statSync(absTarget);
  if (stat.isDirectory()) {
    files = collectTsFiles(absTarget);
  } else {
    files = [absTarget];
  }

  if (files.length === 0) return 'No TypeScript files found';

  const lines: string[] = [];

  for (const file of files) {
    try {
      const diags = [
        ...service.getSyntacticDiagnostics(file),
        ...service.getSemanticDiagnostics(file),
      ];

      if (diags.length === 0) continue;

      const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';

      for (const d of diags) {
        const severity = diagnosticCategoryToString(ts, d.category);
        const pos =
          d.start !== undefined && content
            ? offsetToPosition(content, d.start)
            : { line: 0, character: 0 };
        const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
        lines.push(`[${severity}] ${file}:${pos.line + 1}:${pos.character + 1} — ${msg}`);
      }
    } catch {
      // 개별 파일 실패는 건너뜀
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No diagnostics';
}

// ── Internal Helpers ──────────────────────────────────────────────────────

const TS_EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

/** 디렉토리를 재귀 탐색하여 .ts/.tsx 파일 목록을 반환 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          results.push(...collectTsFiles(path.join(dir, entry.name)));
        }
      } else if (entry.isFile() && TS_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(path.join(dir, entry.name));
      }
    }
  } catch {
    // 읽기 실패한 디렉토리 무시
  }
  return results;
}

/** TypeScript DiagnosticCategory를 문자열로 변환 */
function diagnosticCategoryToString(ts: TsModule, category: number): string {
  switch (category) {
    case ts.DiagnosticCategory.Error: return 'error';
    case ts.DiagnosticCategory.Warning: return 'warning';
    case ts.DiagnosticCategory.Message: return 'info';
    case ts.DiagnosticCategory.Suggestion: return 'suggestion';
    default: return 'info';
  }
}
