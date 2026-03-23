/**
 * LSP Session Manager — Language Server 수명 주기 관리
 *
 * 요청마다 새 서버를 시작하지 않고 언어별 클라이언트를 재사용한다.
 * 모든 클라이언트를 한 번에 종료하는 기능도 제공.
 */

import { StdioLspClient } from './lsp-client.js';
import type { HoverResult, Location, Diagnostic, CompletionItem } from './lsp-client.js';
import { getServerForFile, getServerForLanguage } from './lsp-detector.js';

export class LspManager {
  private clients = new Map<string, StdioLspClient>();
  private initializing = new Map<string, Promise<StdioLspClient | null>>();

  /** 언어에 맞는 클라이언트를 가져오거나 새로 생성 */
  async getClient(language: string, rootUri: string): Promise<StdioLspClient | null> {
    const key = `${language}:${rootUri}`;

    // 이미 초기화된 클라이언트
    const existing = this.clients.get(key);
    if (existing) return existing;

    // 초기화 중인 클라이언트가 있으면 대기
    const pending = this.initializing.get(key);
    if (pending) return pending;

    // 새로 생성
    const promise = this.createClient(language, rootUri, key);
    this.initializing.set(key, promise);

    try {
      const client = await promise;
      return client;
    } finally {
      this.initializing.delete(key);
    }
  }

  private async createClient(language: string, rootUri: string, key: string): Promise<StdioLspClient | null> {
    const server = getServerForLanguage(language);
    if (!server) return null;

    const client = new StdioLspClient(server.command, server.args);
    try {
      await client.initialize(rootUri);
      this.clients.set(key, client);
      return client;
    } catch {
      return null;
    }
  }

  /** 파일 경로에서 자동으로 언어를 감지하여 클라이언트 획득 */
  async getClientForFile(file: string, rootUri: string): Promise<StdioLspClient | null> {
    const server = getServerForFile(file);
    if (!server) return null;
    return this.getClient(server.language, rootUri);
  }

  /** 모든 클라이언트 종료 */
  async shutdownAll(): Promise<void> {
    const shutdowns = Array.from(this.clients.values()).map((client) =>
      client.shutdown().catch(() => {
        // 종료 실패는 무시
      }),
    );
    await Promise.all(shutdowns);
    this.clients.clear();
  }

  // ── Convenience Methods ──

  async hoverAt(file: string, line: number, col: number, rootUri: string): Promise<HoverResult | null> {
    const client = await this.getClientForFile(file, rootUri);
    if (!client) return null;
    try {
      return await client.hover(file, line, col);
    } catch {
      return null;
    }
  }

  async definitionOf(file: string, line: number, col: number, rootUri: string): Promise<Location[]> {
    const client = await this.getClientForFile(file, rootUri);
    if (!client) return [];
    try {
      return await client.definition(file, line, col);
    } catch {
      return [];
    }
  }

  async referencesOf(file: string, line: number, col: number, rootUri: string): Promise<Location[]> {
    const client = await this.getClientForFile(file, rootUri);
    if (!client) return [];
    try {
      return await client.references(file, line, col);
    } catch {
      return [];
    }
  }

  async getDiagnostics(file: string, rootUri: string): Promise<Diagnostic[]> {
    const client = await this.getClientForFile(file, rootUri);
    if (!client) return [];
    try {
      return await client.diagnostics(file);
    } catch {
      return [];
    }
  }

  async getCompletions(file: string, line: number, col: number, rootUri: string): Promise<CompletionItem[]> {
    const client = await this.getClientForFile(file, rootUri);
    if (!client) return [];
    try {
      return await client.completion(file, line, col);
    } catch {
      return [];
    }
  }

  /** 현재 활성 클라이언트 수 */
  get activeCount(): number {
    return this.clients.size;
  }

  /** 활성 언어 목록 */
  get activeLanguages(): string[] {
    return Array.from(this.clients.keys()).map((key) => key.split(':')[0]);
  }
}

/** 전역 LspManager 싱글턴 */
let globalManager: LspManager | null = null;

export function getLspManager(): LspManager {
  if (!globalManager) {
    globalManager = new LspManager();
  }
  return globalManager;
}

/** 전역 매니저 종료 (프로세스 종료 시 호출) */
export async function shutdownGlobalLspManager(): Promise<void> {
  if (globalManager) {
    await globalManager.shutdownAll();
    globalManager = null;
  }
}
