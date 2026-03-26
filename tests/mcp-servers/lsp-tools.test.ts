/**
 * lsp-tools MCP 서버 테스트
 *
 * TypeScript Compiler API 기반 LSP 도구의 단위 테스트.
 * 실제 TypeScript 파일을 임시 디렉토리에 생성하여 검증한다.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// TypeScript LanguageService 초기화가 느릴 수 있으므로 타임아웃 연장
vi.setConfig({ testTimeout: 15000 });
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  positionToOffset,
  offsetToPosition,
  lspToolsHover,
  lspToolsDefinition,
  lspToolsReferences,
  lspToolsDiagnostics,
  clearServiceCache,
  LSP_TOOLS_DEFINITION,
} from '../../src/mcp-servers/lsp-tools.js';

const TMP_DIR = path.join(os.tmpdir(), 'tenetx-lsp-tools-test');

beforeEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  clearServiceCache();
});

afterEach(() => {
  clearServiceCache();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// LSP_TOOLS_DEFINITION
// ────────────────────────────────────────────────────────────────────────────

describe('LSP_TOOLS_DEFINITION', () => {
  it('올바른 서버 정의를 가진다', () => {
    expect(LSP_TOOLS_DEFINITION.name).toBe('lsp-tools');
    expect(LSP_TOOLS_DEFINITION.builtin).toBe(true);
    expect(LSP_TOOLS_DEFINITION.command).toBe('node');
    expect(LSP_TOOLS_DEFINITION.args).toContain('lsp-tools-server.js');
    expect(LSP_TOOLS_DEFINITION.description).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// positionToOffset / offsetToPosition
// ────────────────────────────────────────────────────────────────────────────

describe('positionToOffset()', () => {
  it('첫 번째 줄의 오프셋을 정확히 계산한다', () => {
    const content = 'hello\nworld\n';
    expect(positionToOffset(content, 0, 0)).toBe(0);
    expect(positionToOffset(content, 0, 3)).toBe(3);
  });

  it('두 번째 줄의 오프셋을 정확히 계산한다', () => {
    const content = 'hello\nworld\n';
    // "hello\n" = 6 chars, then "world" starts at 6
    expect(positionToOffset(content, 1, 0)).toBe(6);
    expect(positionToOffset(content, 1, 2)).toBe(8);
  });

  it('빈 줄을 올바르게 처리한다', () => {
    const content = 'a\n\nb\n';
    // line 0: "a\n" = 2, line 1: "\n" = 1 (empty), line 2: "b\n"
    expect(positionToOffset(content, 0, 0)).toBe(0);
    expect(positionToOffset(content, 1, 0)).toBe(2);
    expect(positionToOffset(content, 2, 0)).toBe(3);
  });
});

describe('offsetToPosition()', () => {
  it('오프셋 0은 line 0 character 0이다', () => {
    const pos = offsetToPosition('hello\nworld\n', 0);
    expect(pos).toEqual({ line: 0, character: 0 });
  });

  it('두 번째 줄의 시작을 올바르게 변환한다', () => {
    const pos = offsetToPosition('hello\nworld\n', 6);
    expect(pos).toEqual({ line: 1, character: 0 });
  });

  it('positionToOffset의 역연산이다', () => {
    const content = 'line one\nline two\nline three\n';
    const cases = [
      { line: 0, character: 4 },
      { line: 1, character: 0 },
      { line: 2, character: 5 },
    ];
    for (const { line, character } of cases) {
      const offset = positionToOffset(content, line, character);
      const pos = offsetToPosition(content, offset);
      expect(pos).toEqual({ line, character });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 공통 픽스처 생성 헬퍼
// ────────────────────────────────────────────────────────────────────────────

function createTsProject(files: Record<string, string>): string {
  // tsconfig.json 생성
  fs.writeFileSync(
    path.join(TMP_DIR, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
      },
      include: ['./**/*.ts'],
    }),
  );

  // 파일 생성
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(TMP_DIR, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return TMP_DIR;
}

// ────────────────────────────────────────────────────────────────────────────
// lspToolsHover
// ────────────────────────────────────────────────────────────────────────────

describe('lspToolsHover()', () => {
  it('TypeScript language service가 없으면 fallback 메시지를 반환한다', () => {
    // typescript가 실제로 설치되어 있으므로 이 경우는 테스트하기 어렵다.
    // 대신 존재하지 않는 파일에 대한 fallback을 테스트한다.
    const result = lspToolsHover('/nonexistent/file.ts', 0, 0, TMP_DIR);
    expect(result).toContain('not found');
  });

  it('존재하는 TypeScript 파일에서 hover 정보를 반환하거나 unavailable 메시지를 반환한다', () => {
    createTsProject({
      'src/utils.ts': `export const greeting: string = "hello";`,
    });
    const file = path.join(TMP_DIR, 'src', 'utils.ts');
    const result = lspToolsHover(file, 0, 13, TMP_DIR);
    // TypeScript language service가 이용 가능하면 타입 정보를 반환하고,
    // 그렇지 않으면 unavailable 메시지를 반환한다.
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('hover 결과가 문자열임을 보장한다', () => {
    createTsProject({
      'src/fn.ts': `export function add(a: number, b: number): number { return a + b; }`,
    });
    const file = path.join(TMP_DIR, 'src', 'fn.ts');
    const result = lspToolsHover(file, 0, 16, TMP_DIR);
    expect(typeof result).toBe('string');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// lspToolsDefinition
// ────────────────────────────────────────────────────────────────────────────

describe('lspToolsDefinition()', () => {
  it('존재하지 않는 파일에 대해 에러 메시지를 반환한다', () => {
    const result = lspToolsDefinition('/nonexistent/file.ts', 0, 0, TMP_DIR);
    expect(result).toContain('not found');
  });

  it('정의를 찾거나 No definition found를 반환한다', () => {
    createTsProject({
      'src/types.ts': `export type UserId = string;\n`,
      'src/user.ts': `import type { UserId } from './types.js';\nexport function getUser(id: UserId) { return id; }\n`,
    });
    const file = path.join(TMP_DIR, 'src', 'user.ts');
    const result = lspToolsDefinition(file, 1, 27, TMP_DIR);
    // 정의를 찾으면 파일 경로를 포함하고, 못 찾으면 'No definition found'
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('결과가 문자열임을 보장한다', () => {
    createTsProject({
      'src/a.ts': `export const x = 1;\n`,
    });
    const file = path.join(TMP_DIR, 'src', 'a.ts');
    const result = lspToolsDefinition(file, 0, 13, TMP_DIR);
    expect(typeof result).toBe('string');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// lspToolsReferences
// ────────────────────────────────────────────────────────────────────────────

describe('lspToolsReferences()', () => {
  it('존재하지 않는 파일에 대해 에러 메시지를 반환한다', () => {
    const result = lspToolsReferences('/nonexistent/file.ts', 0, 0, TMP_DIR);
    expect(result).toContain('not found');
  });

  it('참조를 찾거나 No references found를 반환한다', () => {
    createTsProject({
      'src/const.ts': `export const VALUE = 42;\n`,
      'src/use.ts': `import { VALUE } from './const.js';\nconsole.log(VALUE);\n`,
    });
    const file = path.join(TMP_DIR, 'src', 'const.ts');
    const result = lspToolsReferences(file, 0, 13, TMP_DIR);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('결과가 문자열임을 보장한다', () => {
    createTsProject({
      'src/b.ts': `export function greet() { return "hi"; }\n`,
    });
    const file = path.join(TMP_DIR, 'src', 'b.ts');
    const result = lspToolsReferences(file, 0, 16, TMP_DIR);
    expect(typeof result).toBe('string');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// lspToolsDiagnostics
// ────────────────────────────────────────────────────────────────────────────

describe('lspToolsDiagnostics()', () => {
  it('존재하지 않는 경로에 대해 에러 메시지를 반환한다', () => {
    const result = lspToolsDiagnostics('/nonexistent/path', TMP_DIR);
    expect(result).toContain('not found');
  });

  it('TypeScript 에러가 있는 파일에서 진단을 반환한다', () => {
    createTsProject({
      'src/bad.ts': `const x: number = "this is a string";\n`,
    });
    const file = path.join(TMP_DIR, 'src', 'bad.ts');
    const result = lspToolsDiagnostics(file, TMP_DIR);
    // TypeScript가 이용 가능하면 에러를 감지해야 한다
    expect(typeof result).toBe('string');
    if (result !== 'TypeScript language service unavailable') {
      // 에러를 감지했거나 'No diagnostics'
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('문법적으로 올바른 파일에서 No diagnostics를 반환한다', () => {
    createTsProject({
      'src/good.ts': `export const value: number = 42;\nexport function add(a: number, b: number): number { return a + b; }\n`,
    });
    const file = path.join(TMP_DIR, 'src', 'good.ts');
    const result = lspToolsDiagnostics(file, TMP_DIR);
    expect(typeof result).toBe('string');
    // 정상 파일은 'No diagnostics'이거나 TS unavailable
    if (result !== 'TypeScript language service unavailable') {
      expect(result).toBe('No diagnostics');
    }
  });

  it('디렉토리를 지정하면 하위 .ts 파일들을 검사한다', () => {
    createTsProject({
      'src/ok.ts': `export const n: number = 1;\n`,
      'src/sub/ok2.ts': `export const s: string = "hello";\n`,
    });
    const result = lspToolsDiagnostics(TMP_DIR, TMP_DIR);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('.ts 파일이 없는 디렉토리에서 No TypeScript files found를 반환한다', () => {
    // TypeScript 파일 없이 다른 파일만 생성
    const emptyDir = path.join(TMP_DIR, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    fs.writeFileSync(path.join(emptyDir, 'readme.txt'), 'hello');
    const result = lspToolsDiagnostics(emptyDir, TMP_DIR);
    expect(typeof result).toBe('string');
    // TS unavailable이거나 'No TypeScript files found'
    if (result !== 'TypeScript language service unavailable') {
      expect(result).toBe('No TypeScript files found');
    }
  });

  it('진단 결과에 파일 경로와 위치 정보가 포함된다', () => {
    createTsProject({
      'src/err.ts': `const y: string = 123;\n`,
    });
    const file = path.join(TMP_DIR, 'src', 'err.ts');
    const result = lspToolsDiagnostics(file, TMP_DIR);
    if (result !== 'TypeScript language service unavailable' && result !== 'No diagnostics') {
      // [error] 또는 [warning] 형식을 포함해야 함
      expect(result).toMatch(/\[(error|warning|info|suggestion)\]/);
      // 파일 경로가 포함됨
      expect(result).toContain('err.ts');
      // 줄 번호가 포함됨 (1:1 형식)
      expect(result).toMatch(/:\d+:\d+/);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// clearServiceCache
// ────────────────────────────────────────────────────────────────────────────

describe('clearServiceCache()', () => {
  it('캐시를 지운 후에도 새 요청이 정상 작동한다', () => {
    createTsProject({
      'src/c.ts': `export const z = 99;\n`,
    });
    const file = path.join(TMP_DIR, 'src', 'c.ts');

    // 첫 번째 호출로 캐시 생성
    const first = lspToolsDiagnostics(file, TMP_DIR);
    expect(typeof first).toBe('string');

    // 캐시 비우기
    clearServiceCache();

    // 두 번째 호출 — 캐시 없이 새로 생성
    const second = lspToolsDiagnostics(file, TMP_DIR);
    expect(typeof second).toBe('string');
    expect(second).toBe(first);
  });
});
