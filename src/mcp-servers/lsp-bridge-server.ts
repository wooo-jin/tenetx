#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import {
  detectLanguageServer,
  lspHover,
  lspDefinition,
  lspReferences,
  lspDiagnostics,
  lspStatus,
  lspShutdown,
} from './lsp-bridge.js';

const server = createMcpServer({
  name: 'tenetx-lsp-bridge',
  version: '1.0.0',
  tools: [
    {
      name: 'detect_language_server',
      description: 'Detect available language server for the project',
      inputSchema: {
        type: 'object',
        properties: { cwd: { type: 'string', description: 'Project directory' } },
        required: ['cwd'],
      },
      handler: async (args) => {
        const result = detectLanguageServer(args.cwd as string);
        return result ? `Detected: ${result}` : 'No language server detected';
      },
    },
    {
      name: 'lsp_hover',
      description: 'Get hover information at a file position',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File path' },
          line: { type: 'number', description: 'Line number (0-based)' },
          character: { type: 'number', description: 'Column number (0-based)' },
          rootUri: { type: 'string', description: 'Project root directory' },
        },
        required: ['file', 'line', 'character', 'rootUri'],
      },
      handler: async (args) =>
        lspHover(
          args.file as string,
          args.line as number,
          args.character as number,
          args.rootUri as string,
        ),
    },
    {
      name: 'lsp_definition',
      description: 'Go to definition at a file position',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File path' },
          line: { type: 'number', description: 'Line number (0-based)' },
          character: { type: 'number', description: 'Column number (0-based)' },
          rootUri: { type: 'string', description: 'Project root directory' },
        },
        required: ['file', 'line', 'character', 'rootUri'],
      },
      handler: async (args) =>
        lspDefinition(
          args.file as string,
          args.line as number,
          args.character as number,
          args.rootUri as string,
        ),
    },
    {
      name: 'lsp_references',
      description: 'Find all references at a file position',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File path' },
          line: { type: 'number', description: 'Line number (0-based)' },
          character: { type: 'number', description: 'Column number (0-based)' },
          rootUri: { type: 'string', description: 'Project root directory' },
        },
        required: ['file', 'line', 'character', 'rootUri'],
      },
      handler: async (args) =>
        lspReferences(
          args.file as string,
          args.line as number,
          args.character as number,
          args.rootUri as string,
        ),
    },
    {
      name: 'lsp_diagnostics',
      description: 'Get diagnostics for a file',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File path' },
          rootUri: { type: 'string', description: 'Project root directory' },
        },
        required: ['file', 'rootUri'],
      },
      handler: async (args) =>
        lspDiagnostics(args.file as string, args.rootUri as string),
    },
    {
      name: 'lsp_status',
      description: 'Show language server status',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => lspStatus(),
    },
  ],
});

// 프로세스 종료 시 LSP 서버들 정리
process.on('SIGTERM', async () => {
  await lspShutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await lspShutdown();
  process.exit(0);
});

server.start();
