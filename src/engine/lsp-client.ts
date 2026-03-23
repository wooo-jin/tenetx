/**
 * LSP Client — JSON-RPC over stdio
 *
 * Language Server Protocol 클라이언트 구현.
 * 외부 Language Server와 stdio를 통해 JSON-RPC 2.0으로 통신한다.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Types ──

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface HoverResult {
  contents: string;
  range?: Range;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface Diagnostic {
  range: Range;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source?: string;
}

export interface CompletionItem {
  label: string;
  kind: string;
  detail?: string;
}

export interface LspClient {
  initialize(rootUri: string): Promise<void>;
  shutdown(): Promise<void>;
  hover(file: string, line: number, character: number): Promise<HoverResult | null>;
  definition(file: string, line: number, character: number): Promise<Location[]>;
  references(file: string, line: number, character: number): Promise<Location[]>;
  completion(file: string, line: number, character: number): Promise<CompletionItem[]>;
  diagnostics(file: string): Promise<Diagnostic[]>;
}

// ── Helpers ──

const REQUEST_TIMEOUT_MS = 10_000;

/** 로컬 경로를 file:// URI로 변환 */
export function pathToUri(filePath: string): string {
  const absolute = path.resolve(filePath);
  return `file://${absolute}`;
}

/** file:// URI를 로컬 경로로 변환 */
export function uriToPath(uri: string): string {
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.slice(7));
  }
  return uri;
}

/** 파일 확장자에서 LSP languageId를 추정 */
function getLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.lua': 'lua',
    '.zig': 'zig',
  };
  return map[ext] ?? 'plaintext';
}

/** LSP severity 숫자를 문자열로 변환 */
function parseSeverity(sev: number | undefined): Diagnostic['severity'] {
  switch (sev) {
    case 1: return 'error';
    case 2: return 'warning';
    case 3: return 'info';
    case 4: return 'hint';
    default: return 'info';
  }
}

/** LSP CompletionItemKind 숫자를 문자열로 변환 */
function parseCompletionKind(kind: number | undefined): string {
  const kinds: Record<number, string> = {
    1: 'text', 2: 'method', 3: 'function', 4: 'constructor',
    5: 'field', 6: 'variable', 7: 'class', 8: 'interface',
    9: 'module', 10: 'property', 11: 'unit', 12: 'value',
    13: 'enum', 14: 'keyword', 15: 'snippet', 16: 'color',
    17: 'file', 18: 'reference', 19: 'folder', 20: 'enumMember',
    21: 'constant', 22: 'struct', 23: 'event', 24: 'operator',
    25: 'typeParameter',
  };
  return kinds[kind ?? 0] ?? 'unknown';
}

/** MarkupContent 또는 string からテキスト抽出 */
function extractHoverText(contents: unknown): string {
  if (typeof contents === 'string') return contents;
  if (contents && typeof contents === 'object') {
    const obj = contents as Record<string, unknown>;
    if (typeof obj.value === 'string') return obj.value;
    if (Array.isArray(contents)) {
      return contents
        .map((c) => (typeof c === 'string' ? c : (c as Record<string, unknown>).value ?? ''))
        .join('\n');
    }
  }
  return String(contents);
}

// ── StdioLspClient ──

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class StdioLspClient implements LspClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private buffer = '';
  private initialized = false;
  private openedFiles = new Set<string>();
  private diagnosticsMap = new Map<string, Diagnostic[]>();

  private readonly command: string;
  private readonly args: string[];

  constructor(command: string, args: string[]) {
    this.command = command;
    this.args = args;
  }

  // ── Lifecycle ──

  async initialize(rootUri: string): Promise<void> {
    if (this.initialized) return;

    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout!.on('data', (chunk: Buffer) => this.handleData(chunk));
    this.process.stderr!.on('data', () => {
      // stderr는 무시 (디버그 로그 용도)
    });
    this.process.on('error', () => {
      // 프로세스 에러는 pending request reject로 처리
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error('LSP server process error'));
      }
      this.pendingRequests.clear();
    });
    this.process.on('exit', () => {
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error('LSP server process exited'));
      }
      this.pendingRequests.clear();
      this.process = null;
      this.initialized = false;
    });

    // Initialize request
    const uri = rootUri.startsWith('file://') ? rootUri : pathToUri(rootUri);
    await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: uri,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['plaintext', 'markdown'] },
          definition: { linkSupport: false },
          references: {},
          completion: {
            completionItem: { snippetSupport: false },
          },
          publishDiagnostics: {},
        },
      },
    });

    // Send initialized notification
    this.sendNotification('initialized', {});
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    if (!this.process || !this.initialized) return;

    // Close all opened documents
    for (const uri of this.openedFiles) {
      this.sendNotification('textDocument/didClose', {
        textDocument: { uri },
      });
    }
    this.openedFiles.clear();

    try {
      await this.sendRequest('shutdown', null);
    } catch {
      // shutdown 실패는 무시
    }

    this.sendNotification('exit', null);
    this.initialized = false;

    // 프로세스가 아직 살아 있으면 강제 종료
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  // ── Core operations ──

  async hover(file: string, line: number, character: number): Promise<HoverResult | null> {
    await this.ensureFileOpen(file);
    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri: pathToUri(file) },
      position: { line, character },
    }) as Record<string, unknown> | null;

    if (!result || !result.contents) return null;

    return {
      contents: extractHoverText(result.contents),
      range: result.range as Range | undefined,
    };
  }

  async definition(file: string, line: number, character: number): Promise<Location[]> {
    await this.ensureFileOpen(file);
    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri: pathToUri(file) },
      position: { line, character },
    });

    return this.normalizeLocations(result);
  }

  async references(file: string, line: number, character: number): Promise<Location[]> {
    await this.ensureFileOpen(file);
    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri: pathToUri(file) },
      position: { line, character },
      context: { includeDeclaration: true },
    });

    return this.normalizeLocations(result);
  }

  async completion(file: string, line: number, character: number): Promise<CompletionItem[]> {
    await this.ensureFileOpen(file);
    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri: pathToUri(file) },
      position: { line, character },
    });

    if (!result) return [];

    const items = Array.isArray(result) ? result : (result as Record<string, unknown>).items;
    if (!Array.isArray(items)) return [];

    return items.map((item: Record<string, unknown>) => ({
      label: String(item.label ?? ''),
      kind: parseCompletionKind(item.kind as number | undefined),
      detail: item.detail ? String(item.detail) : undefined,
    }));
  }

  async diagnostics(file: string): Promise<Diagnostic[]> {
    await this.ensureFileOpen(file);
    const uri = pathToUri(file);

    // 서버가 publishDiagnostics로 보낸 것이 있으면 반환
    // 잠시 대기하여 서버가 diagnostics를 보낼 시간을 준다
    await new Promise((r) => setTimeout(r, 500));
    return this.diagnosticsMap.get(uri) ?? [];
  }

  // ── Internal ──

  private async ensureFileOpen(filePath: string): Promise<void> {
    const uri = pathToUri(filePath);
    if (this.openedFiles.has(uri)) return;

    let text: string;
    try {
      text = fs.readFileSync(filePath, 'utf-8');
    } catch {
      text = '';
    }

    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: getLanguageId(filePath),
        version: 1,
        text,
      },
    });
    this.openedFiles.add(uri);
  }

  private normalizeLocations(result: unknown): Location[] {
    if (!result) return [];

    // 단일 Location
    if (!Array.isArray(result) && typeof result === 'object') {
      const loc = result as Record<string, unknown>;
      if (loc.uri && loc.range) {
        return [{ uri: String(loc.uri), range: loc.range as Range }];
      }
      // LocationLink
      if (loc.targetUri && loc.targetRange) {
        return [{
          uri: String(loc.targetUri),
          range: loc.targetRange as Range,
        }];
      }
      return [];
    }

    if (!Array.isArray(result)) return [];

    return result
      .map((item: Record<string, unknown>) => {
        if (item.uri && item.range) {
          return { uri: String(item.uri), range: item.range as Range };
        }
        if (item.targetUri && item.targetRange) {
          return { uri: String(item.targetUri), range: item.targetRange as Range };
        }
        return null;
      })
      .filter((x): x is Location => x !== null);
  }

  // ── JSON-RPC Transport ──

  private handleData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf-8');
    this.processBuffer();
  }

  private processBuffer(): void {
    while (true) {
      // Content-Length 헤더 파싱
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        // 헤더 형식이 잘못됨 — 스킵
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (this.buffer.length < bodyEnd) break; // 아직 바디가 다 안 왔음

      const body = this.buffer.slice(bodyStart, bodyEnd);
      this.buffer = this.buffer.slice(bodyEnd);

      try {
        const message = JSON.parse(body) as Record<string, unknown>;
        this.handleMessage(message);
      } catch {
        // JSON 파싱 실패 — 무시
      }
    }
  }

  private handleMessage(message: Record<string, unknown>): void {
    // Response (id 있음)
    if ('id' in message && (message.result !== undefined || message.error !== undefined)) {
      const id = message.id as number;
      const pending = this.pendingRequests.get(id);
      if (!pending) return;

      this.pendingRequests.delete(id);
      clearTimeout(pending.timer);

      if (message.error) {
        const err = message.error as Record<string, unknown>;
        pending.reject(new Error(String(err.message ?? 'LSP error')));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    // Notification (id 없음)
    if (message.method === 'textDocument/publishDiagnostics') {
      const params = message.params as Record<string, unknown>;
      const uri = String(params.uri ?? '');
      const rawDiags = (params.diagnostics ?? []) as Record<string, unknown>[];
      this.diagnosticsMap.set(uri, rawDiags.map((d) => ({
        range: d.range as Range,
        severity: parseSeverity(d.severity as number | undefined),
        message: String(d.message ?? ''),
        source: d.source ? String(d.source) : undefined,
      })));
    }
    // 다른 notification은 무시
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('LSP process not running'));
        return;
      }

      const id = ++this.requestId;
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      const message = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.process.stdin.write(message);
      } catch {
        this.pendingRequests.delete(id);
        clearTimeout(timer);
        reject(new Error('Failed to write to LSP process'));
      }
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) return;

    const body = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    });

    const message = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

    try {
      this.process.stdin.write(message);
    } catch {
      // notification 실패는 무시
    }
  }
}
