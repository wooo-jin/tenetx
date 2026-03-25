/**
 * AST-grep Adapter — ast-grep (sg) CLI 바이너리 래퍼
 *
 * ast-grep이 설치되어 있으면 실제 AST 파싱을 사용하고,
 * 설치되지 않았으면 기존 regex 방식으로 폴백.
 * 외부 npm 의존성 없이 child_process로 sg 바이너리를 호출.
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ── Types ───────────────────────────────────────────

export interface AstMatch {
  file: string;
  line: number;
  column: number;
  text: string;
  matchedNode: string;
  rule?: string;
}

export interface AstSearchOptions {
  /** ast-grep 패턴 (예: "function $NAME($$$ARGS) { $$$ }") */
  pattern: string;
  /** 언어: ts, js, py, go, rust 등 */
  language?: string;
  /** 작업 디렉토리 */
  cwd?: string;
  /** 최대 결과 수 */
  maxResults?: number;
}

// ── Common AST Patterns ─────────────────────────────

export const AST_PATTERNS = {
  typescript: {
    function: 'function $NAME($$$ARGS) { $$$ }',
    arrowFunction: 'const $NAME = ($$$ARGS) => $$$BODY',
    class: 'class $NAME { $$$ }',
    interface: 'interface $NAME { $$$ }',
    import: 'import { $$$ } from "$MODULE"',
    exportDefault: 'export default $$$',
    asyncFunction: 'async function $NAME($$$ARGS) { $$$ }',
    tryCatch: 'try { $$$ } catch ($ERR) { $$$ }',
    ifStatement: 'if ($COND) { $$$ }',
  },
  python: {
    function: 'def $NAME($$$ARGS): $$$BODY',
    class: 'class $NAME: $$$BODY',
    asyncFunction: 'async def $NAME($$$ARGS): $$$BODY',
    import: 'import $MODULE',
    fromImport: 'from $MODULE import $$$NAMES',
    tryCatch: 'try: $$$BODY\nexcept $ERR: $$$HANDLER',
    ifStatement: 'if $COND: $$$BODY',
  },
  go: {
    function: 'func $NAME($$$ARGS) $$$RET { $$$ }',
    method: 'func ($RECV $TYPE) $NAME($$$ARGS) $$$RET { $$$ }',
    struct: 'type $NAME struct { $$$ }',
    interface: 'type $NAME interface { $$$ }',
    import: 'import "$MODULE"',
    ifStatement: 'if $COND { $$$ }',
  },
  rust: {
    function: 'fn $NAME($$$ARGS) $$$RET { $$$ }',
    struct: 'struct $NAME { $$$ }',
    impl: 'impl $NAME { $$$ }',
    enum: 'enum $NAME { $$$ }',
    trait: 'trait $NAME { $$$ }',
    use: 'use $$$PATH;',
  },
} as const;

// ── Availability Cache ──────────────────────────────

let _sgAvailable: boolean | null = null;

/** ast-grep (sg) 바이너리가 설치되어 있는지 확인 */
export function isAstGrepAvailable(): boolean {
  if (_sgAvailable !== null) return _sgAvailable;

  try {
    execFileSync('sg', ['--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    _sgAvailable = true;
  } catch {
    _sgAvailable = false;
  }

  return _sgAvailable;
}

/** 캐시 초기화 (테스트용) */
export function resetAvailabilityCache(): void {
  _sgAvailable = null;
}

// ── Core Search ─────────────────────────────────────

/** sg 출력 JSON 파싱 */
interface SgJsonEntry {
  text: string;
  range: {
    byteOffset: { start: number; end: number };
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  file: string;
  replacement?: string;
  language: string;
  metaVariables?: Record<string, { text: string }>;
  ruleId?: string;
}

function parseSgOutput(stdout: string, maxResults?: number): AstMatch[] {
  if (!stdout.trim()) return [];

  let entries: SgJsonEntry[];
  try {
    entries = JSON.parse(stdout);
  } catch {
    return [];
  }

  if (!Array.isArray(entries)) return [];

  const limit = maxResults ?? entries.length;
  const results: AstMatch[] = [];

  for (let i = 0; i < Math.min(entries.length, limit); i++) {
    const entry = entries[i];
    results.push({
      file: entry.file,
      line: entry.range.start.line + 1, // sg는 0-based
      column: entry.range.start.column + 1,
      text: entry.text,
      matchedNode: entry.metaVariables?.NAME?.text ?? entry.text,
      rule: entry.ruleId,
    });
  }

  return results;
}

const DEFAULT_TIMEOUT = 10_000;

/** ast-grep 패턴 검색 */
export async function astGrepSearch(options: AstSearchOptions): Promise<AstMatch[]> {
  if (!isAstGrepAvailable()) return [];

  const args = ['run', '--pattern', options.pattern, '--json'];
  if (options.language) {
    args.push('--lang', options.language);
  }

  try {
    const { stdout } = await execFileAsync('sg', args, {
      cwd: options.cwd ?? process.cwd(),
      timeout: DEFAULT_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseSgOutput(stdout, options.maxResults);
  } catch {
    return [];
  }
}

/** ast-grep 룰 파일로 검색 */
export async function astGrepRule(ruleYaml: string, cwd?: string): Promise<AstMatch[]> {
  if (!isAstGrepAvailable()) return [];

  try {
    const { stdout } = await execFileAsync('sg', ['scan', '--inline-rules', ruleYaml, '--json'], {
      cwd: cwd ?? process.cwd(),
      timeout: DEFAULT_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseSgOutput(stdout);
  } catch {
    return [];
  }
}

// ── Convenience Functions ───────────────────────────

/** 함수 선언 검색 */
export async function findFunctions(cwd?: string): Promise<AstMatch[]> {
  const dir = cwd ?? process.cwd();
  const regular = await astGrepSearch({ pattern: AST_PATTERNS.typescript.function, language: 'ts', cwd: dir });
  const async_ = await astGrepSearch({ pattern: AST_PATTERNS.typescript.asyncFunction, language: 'ts', cwd: dir });
  return [...regular, ...async_];
}

/** 클래스 선언 검색 */
export async function findClasses(cwd?: string): Promise<AstMatch[]> {
  return astGrepSearch({ pattern: AST_PATTERNS.typescript.class, language: 'ts', cwd: cwd ?? process.cwd() });
}

/** import 문 검색 */
export async function findImports(cwd?: string): Promise<AstMatch[]> {
  return astGrepSearch({ pattern: AST_PATTERNS.typescript.import, language: 'ts', cwd: cwd ?? process.cwd() });
}

/** export default 검색 */
export async function findExports(cwd?: string): Promise<AstMatch[]> {
  return astGrepSearch({ pattern: AST_PATTERNS.typescript.exportDefault, language: 'ts', cwd: cwd ?? process.cwd() });
}

/** 특정 함수 호출 검색 */
export async function findCallsTo(functionName: string, cwd?: string): Promise<AstMatch[]> {
  return astGrepSearch({
    pattern: `${functionName}($$$ARGS)`,
    language: 'ts',
    cwd: cwd ?? process.cwd(),
  });
}
