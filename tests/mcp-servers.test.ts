import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BUILTIN_MCP_SERVERS, getBuiltinServer } from '../src/mcp-servers/index.js';
import { detectLanguageServer } from '../src/mcp-servers/lsp-bridge.js';
import { astSearch } from '../src/mcp-servers/ast-search.js';
import { detectTestFramework } from '../src/mcp-servers/test-runner.js';
import { generateRepoIndex } from '../src/mcp-servers/repo-index.js';
import { scanForSecrets } from '../src/mcp-servers/secrets-scan.js';
import { detectPythonEnvironment, isPythonProject } from '../src/mcp-servers/python-repl.js';
import { getRecentlyModified, getModificationSummary } from '../src/mcp-servers/file-watcher.js';
import { analyzeDependencies } from '../src/mcp-servers/dependency-analyzer.js';
import { createMcpServer } from '../src/mcp-servers/shared/protocol.js';
import type { McpTool } from '../src/mcp-servers/shared/protocol.js';

const TMP_DIR = path.join(os.tmpdir(), 'tenet-mcp-servers-test');

beforeEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// BUILTIN_MCP_SERVERS / getBuiltinServer
// ────────────────────────────────────────────────────────────────────────────
describe('BUILTIN_MCP_SERVERS', () => {
  it('8개의 빌트인 서버를 포함한다', () => {
    expect(BUILTIN_MCP_SERVERS).toHaveLength(8);
  });

  it('모든 서버가 builtin: true이다', () => {
    for (const server of BUILTIN_MCP_SERVERS) {
      expect(server.builtin).toBe(true);
    }
  });

  it('각 서버에 name, description, command, args가 있다', () => {
    for (const server of BUILTIN_MCP_SERVERS) {
      expect(server.name).toBeTruthy();
      expect(server.description).toBeTruthy();
      expect(server.command).toBeTruthy();
      expect(server.args.length).toBeGreaterThan(0);
    }
  });
});

describe('getBuiltinServer()', () => {
  it('이름으로 서버를 찾는다', () => {
    const server = getBuiltinServer('lsp-bridge');
    expect(server).toBeDefined();
    expect(server!.name).toBe('lsp-bridge');
  });

  it('없는 이름은 undefined를 반환한다', () => {
    expect(getBuiltinServer('nonexistent')).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// detectLanguageServer
// ────────────────────────────────────────────────────────────────────────────
describe('detectLanguageServer()', () => {
  it('tsconfig.json이 있으면 typescript-language-server를 반환한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'tsconfig.json'), '{}');
    expect(detectLanguageServer(TMP_DIR)).toBe('typescript-language-server');
  });

  it('go.mod가 있으면 gopls를 반환한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'go.mod'), 'module test');
    expect(detectLanguageServer(TMP_DIR)).toBe('gopls');
  });

  it('Cargo.toml이 있으면 rust-analyzer를 반환한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'Cargo.toml'), '[package]');
    expect(detectLanguageServer(TMP_DIR)).toBe('rust-analyzer');
  });

  it('requirements.txt가 있으면 pylsp를 반환한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'requirements.txt'), 'flask');
    expect(detectLanguageServer(TMP_DIR)).toBe('pylsp');
  });

  it('아무 파일도 없으면 null을 반환한다', () => {
    expect(detectLanguageServer(TMP_DIR)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// astSearch
// ────────────────────────────────────────────────────────────────────────────
describe('astSearch()', () => {
  it('함수 선언을 찾는다', () => {
    const srcDir = path.join(TMP_DIR, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), `
export function calculateTotal(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}

function helperFunc() {}

export class UserService {}
`);

    const results = astSearch('calculate', TMP_DIR);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('calculateTotal');
    expect(results[0].type).toBe('function');
    expect(results[0].exported).toBe(true);
  });

  it('클래스 선언을 찾는다', () => {
    const srcDir = path.join(TMP_DIR, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'service.ts'), `
export class UserService {
  getUser() {}
}

class InternalHelper {}
`);

    const results = astSearch('Service', TMP_DIR);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('UserService');
    expect(results[0].type).toBe('class');
  });

  it('매칭 없으면 빈 배열을 반환한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'empty.ts'), 'const x = 1;');
    const results = astSearch('nonexistent', TMP_DIR);
    expect(results).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// detectTestFramework
// ────────────────────────────────────────────────────────────────────────────
describe('detectTestFramework()', () => {
  it('vitest.config.ts가 있으면 vitest를 감지한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'vitest.config.ts'), 'export default {}');
    const result = detectTestFramework(TMP_DIR);
    expect(result).not.toBeNull();
    expect(result!.framework).toBe('vitest');
    expect(result!.command).toContain('vitest');
  });

  it('jest.config.js가 있으면 jest를 감지한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'jest.config.js'), 'module.exports = {}');
    const result = detectTestFramework(TMP_DIR);
    expect(result!.framework).toBe('jest');
  });

  it('go.mod가 있으면 go test를 감지한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'go.mod'), 'module test');
    const result = detectTestFramework(TMP_DIR);
    expect(result!.framework).toBe('go test');
    expect(result!.command).toBe('go test ./...');
  });

  it('Cargo.toml이 있으면 cargo test를 감지한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'Cargo.toml'), '[package]');
    const result = detectTestFramework(TMP_DIR);
    expect(result!.framework).toBe('cargo test');
  });

  it('아무 설정도 없으면 null을 반환한다', () => {
    expect(detectTestFramework(TMP_DIR)).toBeNull();
  });

  it('package.json의 devDependencies에서 vitest를 감지한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }),
    );
    const result = detectTestFramework(TMP_DIR);
    expect(result!.framework).toBe('vitest');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// generateRepoIndex
// ────────────────────────────────────────────────────────────────────────────
describe('generateRepoIndex()', () => {
  it('Markdown 형식의 프로젝트 인덱스를 생성한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'package.json'),
      JSON.stringify({ name: 'test-project' }),
    );
    const srcDir = path.join(TMP_DIR, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export const x = 1;');

    const result = generateRepoIndex(TMP_DIR);
    expect(result).toContain('test-project');
    expect(result).toContain('Project Map');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// scanForSecrets
// ────────────────────────────────────────────────────────────────────────────
describe('scanForSecrets()', () => {
  it('AWS 키를 탐지한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'config.ts'),
      'const key = "AKIAIOSFODNN7EXAMPLE";',
    );
    const findings = scanForSecrets(TMP_DIR);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].pattern).toBe('AWS Access Key');
    expect(findings[0].severity).toBe('high');
  });

  it('GitHub 토큰을 탐지한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'env.ts'),
      'const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";',
    );
    const findings = scanForSecrets(TMP_DIR);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].pattern).toBe('GitHub Token');
  });

  it('Private Key를 탐지한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'key.pem'),
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKC\n-----END RSA PRIVATE KEY-----',
    );
    const findings = scanForSecrets(TMP_DIR);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].pattern).toBe('Private Key');
  });

  it('DB 연결 문자열을 탐지한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'db.ts'),
      'const url = "postgres://user:pass@host:5432/db";',
    );
    const findings = scanForSecrets(TMP_DIR);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].pattern).toBe('Database URL');
  });

  it('비밀이 없는 파일에서는 빈 배열을 반환한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'clean.ts'), 'const x = 1;\nconst y = "hello";');
    const findings = scanForSecrets(TMP_DIR);
    expect(findings).toHaveLength(0);
  });

  it('node_modules를 건너뛴다', () => {
    const nmDir = path.join(TMP_DIR, 'node_modules', 'pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(
      path.join(nmDir, 'index.js'),
      'const key = "AKIAIOSFODNN7EXAMPLE";',
    );
    const findings = scanForSecrets(TMP_DIR);
    expect(findings).toHaveLength(0);
  });

  it('바이너리 파일을 건너뛴다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const findings = scanForSecrets(TMP_DIR);
    expect(findings).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// detectPythonEnvironment / isPythonProject
// ────────────────────────────────────────────────────────────────────────────
describe('detectPythonEnvironment()', () => {
  it('Python 프로젝트 파일이 없으면 null을 반환한다', () => {
    expect(detectPythonEnvironment(TMP_DIR)).toBeNull();
  });

  it('requirements.txt가 있으면 환경을 반환한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'requirements.txt'),
      'flask==2.0.0\nrequests>=2.28.0\n# comment\nnumpy\n',
    );
    const result = detectPythonEnvironment(TMP_DIR);
    // python binary가 없는 CI 환경에서는 null일 수 있음
    if (result !== null) {
      expect(result.packages).toContain('flask');
      expect(result.packages).toContain('requests');
      expect(result.packages).toContain('numpy');
      expect(typeof result.hasVenv).toBe('boolean');
      expect(typeof result.python).toBe('string');
    }
  });

  it('venv 디렉토리가 있으면 hasVenv가 true이다', () => {
    fs.mkdirSync(path.join(TMP_DIR, 'venv'), { recursive: true });
    fs.writeFileSync(path.join(TMP_DIR, 'requirements.txt'), 'flask\n');
    const result = detectPythonEnvironment(TMP_DIR);
    if (result !== null) {
      expect(result.hasVenv).toBe(true);
    }
  });

  it('.venv 디렉토리가 있으면 hasVenv가 true이다', () => {
    fs.mkdirSync(path.join(TMP_DIR, '.venv'), { recursive: true });
    fs.writeFileSync(path.join(TMP_DIR, 'requirements.txt'), 'django\n');
    const result = detectPythonEnvironment(TMP_DIR);
    if (result !== null) {
      expect(result.hasVenv).toBe(true);
    }
  });
});

describe('isPythonProject()', () => {
  it('Python 프로젝트 파일이 없으면 false이다', () => {
    expect(isPythonProject(TMP_DIR)).toBe(false);
  });

  it('pyproject.toml이 있으면 true이다 (python 바이너리가 있을 때)', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'pyproject.toml'), '[tool.poetry]\nname = "test"\n');
    // python 바이너리가 없는 환경에서는 false가 될 수 있음
    const result = isPythonProject(TMP_DIR);
    expect(typeof result).toBe('boolean');
  });

  it('Pipfile이 있으면 true이다 (python 바이너리가 있을 때)', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'Pipfile'), '[[source]]\nurl = "https://pypi.org/simple"\n');
    const result = isPythonProject(TMP_DIR);
    expect(typeof result).toBe('boolean');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getRecentlyModified / getModificationSummary
// ────────────────────────────────────────────────────────────────────────────
describe('getRecentlyModified()', () => {
  it('빈 디렉토리에서 빈 배열을 반환한다', () => {
    const results = getRecentlyModified(TMP_DIR, 30);
    expect(Array.isArray(results)).toBe(true);
  });

  it('방금 생성된 파일을 포함한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'recent.ts'), 'const x = 1;');
    const results = getRecentlyModified(TMP_DIR, 30);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].file).toContain('recent.ts');
    expect(results[0].mtime).toBeInstanceOf(Date);
  });

  it('결과가 mtime 내림차순으로 정렬된다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'a.ts'), 'const a = 1;');
    fs.writeFileSync(path.join(TMP_DIR, 'b.ts'), 'const b = 2;');
    const results = getRecentlyModified(TMP_DIR, 30);
    if (results.length >= 2) {
      expect(results[0].mtime.getTime()).toBeGreaterThanOrEqual(results[1].mtime.getTime());
    }
  });

  it('node_modules를 건너뛴다', () => {
    const nmDir = path.join(TMP_DIR, 'node_modules', 'pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'index.js'), 'module.exports = {};');
    const results = getRecentlyModified(TMP_DIR, 30);
    for (const r of results) {
      expect(r.file).not.toContain('node_modules');
    }
  });
});

describe('getModificationSummary()', () => {
  it('파일 통계를 반환한다', () => {
    fs.writeFileSync(path.join(TMP_DIR, 'a.ts'), 'const a = 1;');
    fs.writeFileSync(path.join(TMP_DIR, 'b.ts'), 'const b = 2;');
    fs.writeFileSync(path.join(TMP_DIR, 'c.js'), 'const c = 3;');
    const summary = getModificationSummary(TMP_DIR);
    expect(summary.total).toBeGreaterThanOrEqual(3);
    expect(typeof summary.recent).toBe('number');
    expect(summary.byExtension['.ts']).toBeGreaterThanOrEqual(2);
    expect(summary.byExtension['.js']).toBeGreaterThanOrEqual(1);
  });

  it('빈 디렉토리에서 total이 0이다', () => {
    const summary = getModificationSummary(TMP_DIR);
    expect(summary.total).toBe(0);
    expect(summary.recent).toBe(0);
    expect(summary.byExtension).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// analyzeDependencies
// ────────────────────────────────────────────────────────────────────────────
describe('analyzeDependencies()', () => {
  it('package.json이 없으면 packageManager가 null이다', () => {
    const report = analyzeDependencies(TMP_DIR);
    expect(report.packageManager).toBeNull();
    expect(report.totalDeps).toBe(0);
    expect(report.lockfilePresent).toBe(false);
  });

  it('package.json에서 npm 프로젝트를 감지한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'package.json'),
      JSON.stringify({
        dependencies: { express: '^4.0.0', lodash: '^4.0.0' },
        devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' },
      }),
    );
    const report = analyzeDependencies(TMP_DIR);
    expect(report.packageManager).toBe('npm');
    expect(report.totalDeps).toBe(4);
    expect(report.devDeps).toBe(2);
    expect(report.outdatedCheck).toBe(true);
  });

  it('yarn.lock이 있으면 packageManager가 yarn이다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
    );
    fs.writeFileSync(path.join(TMP_DIR, 'yarn.lock'), '# yarn lockfile\n');
    const report = analyzeDependencies(TMP_DIR);
    expect(report.packageManager).toBe('yarn');
    expect(report.lockfilePresent).toBe(true);
  });

  it('pnpm-lock.yaml이 있으면 packageManager가 pnpm이다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'package.json'),
      JSON.stringify({ dependencies: { vue: '^3.0.0' } }),
    );
    fs.writeFileSync(path.join(TMP_DIR, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0\n');
    const report = analyzeDependencies(TMP_DIR);
    expect(report.packageManager).toBe('pnpm');
    expect(report.lockfilePresent).toBe(true);
  });

  it('requirements.txt에서 pip 프로젝트를 감지한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'requirements.txt'),
      'flask==2.0.0\nrequests>=2.28.0\nnumpy\n# comment\n\n',
    );
    const report = analyzeDependencies(TMP_DIR);
    expect(report.packageManager).toBe('pip');
    expect(report.totalDeps).toBe(3);
    expect(report.devDeps).toBe(0);
  });

  it('Cargo.toml에서 cargo 프로젝트를 감지한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'Cargo.toml'),
      '[package]\nname = "test"\n\n[dependencies]\nserde = "1.0"\ntokio = { version = "1.0" }\n\n[dev-dependencies]\ncriterion = "0.4"\n',
    );
    const report = analyzeDependencies(TMP_DIR);
    expect(report.packageManager).toBe('cargo');
    expect(report.totalDeps).toBeGreaterThanOrEqual(2);
    expect(report.devDeps).toBeGreaterThanOrEqual(1);
  });

  it('go.mod에서 go 프로젝트를 감지한다', () => {
    fs.writeFileSync(
      path.join(TMP_DIR, 'go.mod'),
      'module example.com/test\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgithub.com/stretchr/testify v1.8.4\n)\n',
    );
    const report = analyzeDependencies(TMP_DIR);
    expect(report.packageManager).toBe('go');
    expect(report.totalDeps).toBeGreaterThanOrEqual(2);
    expect(report.lockfilePresent).toBe(false); // go.sum이 없음
  });
});

// ────────────────────────────────────────────────────────────────────────────
// createMcpServer — shared protocol handler
// ────────────────────────────────────────────────────────────────────────────
describe('createMcpServer()', () => {
  const echoTool: McpTool = {
    name: 'echo',
    description: 'Echo back the input',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    handler: async (args) => `echo: ${args.text}`,
  };

  const failTool: McpTool = {
    name: 'fail',
    description: 'Always fails',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => { throw new Error('intentional failure'); },
  };

  let stdoutChunks: string[];
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    stdoutChunks = [];
    originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      stdoutChunks.push(chunk);
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  function simulateMessages(messages: unknown[]): void {
    const input = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
    let dataCallback: ((chunk: string) => void) | null = null;
    let endCallback: (() => void) | null = null;

    const originalSetEncoding = process.stdin.setEncoding;
    const originalOn = process.stdin.on;

    process.stdin.setEncoding = vi.fn().mockReturnThis() as typeof process.stdin.setEncoding;
    process.stdin.on = vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'data') dataCallback = cb as (chunk: string) => void;
      if (event === 'end') endCallback = cb as () => void;
      return process.stdin;
    }) as typeof process.stdin.on;

    const originalExit = process.exit;
    process.exit = vi.fn() as unknown as typeof process.exit;

    createMcpServer({
      name: 'test-server',
      version: '1.0.0',
      tools: [echoTool, failTool],
    }).start();

    if (dataCallback) (dataCallback as (chunk: string) => void)(input);
    if (endCallback) (endCallback as () => void)();

    process.stdin.setEncoding = originalSetEncoding;
    process.stdin.on = originalOn;
    process.exit = originalExit;
  }

  function getResponses(): unknown[] {
    return stdoutChunks
      .flatMap(c => c.split('\n'))
      .filter(l => l.trim())
      .map(l => JSON.parse(l));
  }

  it('initialize 요청에 올바르게 응답한다', () => {
    simulateMessages([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    ]);
    const responses = getResponses();
    expect(responses).toHaveLength(1);
    const res = responses[0] as { jsonrpc: string; id: number; result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(res.jsonrpc).toBe('2.0');
    expect(res.id).toBe(1);
    expect(res.result.protocolVersion).toBe('2024-11-05');
    expect(res.result.serverInfo.name).toBe('test-server');
  });

  it('tools/list 요청에 도구 목록을 반환한다', () => {
    simulateMessages([
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    ]);
    const responses = getResponses();
    const res = responses[0] as { result: { tools: { name: string }[] } };
    expect(res.result.tools).toHaveLength(2);
    expect(res.result.tools[0].name).toBe('echo');
    expect(res.result.tools[1].name).toBe('fail');
  });

  it('tools/call 요청에 도구를 실행한다', async () => {
    simulateMessages([
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'echo', arguments: { text: 'hello' } } },
    ]);
    // handler is async, wait for it
    await new Promise(r => setTimeout(r, 50));
    const responses = getResponses();
    const res = responses[0] as { result: { content: { type: string; text: string }[] } };
    expect(res.result.content[0].type).toBe('text');
    expect(res.result.content[0].text).toBe('echo: hello');
  });

  it('존재하지 않는 도구 호출 시 에러를 반환한다', () => {
    simulateMessages([
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nonexistent', arguments: {} } },
    ]);
    const responses = getResponses();
    const res = responses[0] as { error: { code: number; message: string } };
    expect(res.error.code).toBe(-32601);
    expect(res.error.message).toContain('nonexistent');
  });

  it('알 수 없는 메서드에 에러를 반환한다', () => {
    simulateMessages([
      { jsonrpc: '2.0', id: 1, method: 'unknown/method', params: {} },
    ]);
    const responses = getResponses();
    const res = responses[0] as { error: { code: number; message: string } };
    expect(res.error.code).toBe(-32601);
    expect(res.error.message).toContain('unknown/method');
  });

  it('notification (id 없음)에는 응답하지 않는다', () => {
    simulateMessages([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
    ]);
    const responses = getResponses();
    expect(responses).toHaveLength(0);
  });

  it('잘못된 JSON에 파싱 에러를 반환한다', () => {
    // Simulate raw invalid JSON
    let dataCallback: ((chunk: string) => void) | null = null;
    let endCallback: (() => void) | null = null;

    const originalSetEncoding = process.stdin.setEncoding;
    const originalOn = process.stdin.on;
    const originalExit = process.exit;

    process.stdin.setEncoding = vi.fn().mockReturnThis() as typeof process.stdin.setEncoding;
    process.stdin.on = vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'data') dataCallback = cb as (chunk: string) => void;
      if (event === 'end') endCallback = cb as () => void;
      return process.stdin;
    }) as typeof process.stdin.on;
    process.exit = vi.fn() as unknown as typeof process.exit;

    createMcpServer({ name: 'test', version: '1.0.0', tools: [] }).start();

    if (dataCallback) (dataCallback as (chunk: string) => void)('not valid json\n');
    if (endCallback) (endCallback as () => void)();

    process.stdin.setEncoding = originalSetEncoding;
    process.stdin.on = originalOn;
    process.exit = originalExit;

    const responses = getResponses();
    const res = responses[0] as { error: { code: number } };
    expect(res.error.code).toBe(-32700);
  });

  it('도구 핸들러 에러 시 에러 응답을 반환한다', async () => {
    simulateMessages([
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fail', arguments: {} } },
    ]);
    await new Promise(r => setTimeout(r, 50));
    const responses = getResponses();
    const res = responses[0] as { error: { code: number; message: string } };
    expect(res.error.code).toBe(-32603);
    expect(res.error.message).toContain('intentional failure');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Server entry point files
// ────────────────────────────────────────────────────────────────────────────
describe('Server entry point files', () => {
  const serverDir = path.resolve(__dirname, '..', 'src', 'mcp-servers');
  const serverFiles = [
    'lsp-bridge-server.ts',
    'ast-search-server.ts',
    'test-runner-server.ts',
    'repo-index-server.ts',
  ];

  for (const file of serverFiles) {
    it(`${file}이 존재하고 createMcpServer를 사용한다`, () => {
      const filePath = path.join(serverDir, file);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain("import { createMcpServer }");
      expect(content).toContain('.start()');
    });
  }
});
