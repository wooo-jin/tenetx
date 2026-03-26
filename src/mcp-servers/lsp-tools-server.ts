#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import {
  lspToolsHover,
  lspToolsDefinition,
  lspToolsReferences,
  lspToolsDiagnostics,
} from './lsp-tools.js';

const server = createMcpServer({
  name: 'tenetx-lsp-tools',
  version: '1.0.0',
  tools: [
    {
      name: 'lsp_hover',
      description: 'Get hover information (type and documentation) at a cursor position using TypeScript Compiler API',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Absolute file path' },
          line: { type: 'number', description: 'Line number (0-based)' },
          character: { type: 'number', description: 'Column number (0-based)' },
          rootDir: { type: 'string', description: 'Project root directory (where tsconfig.json resides)' },
        },
        required: ['file', 'line', 'character', 'rootDir'],
      },
      handler: async (args) =>
        lspToolsHover(
          args.file as string,
          args.line as number,
          args.character as number,
          args.rootDir as string,
        ),
    },
    {
      name: 'lsp_goto_definition',
      description: 'Go to definition at a cursor position using TypeScript Compiler API',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Absolute file path' },
          line: { type: 'number', description: 'Line number (0-based)' },
          character: { type: 'number', description: 'Column number (0-based)' },
          rootDir: { type: 'string', description: 'Project root directory' },
        },
        required: ['file', 'line', 'character', 'rootDir'],
      },
      handler: async (args) =>
        lspToolsDefinition(
          args.file as string,
          args.line as number,
          args.character as number,
          args.rootDir as string,
        ),
    },
    {
      name: 'lsp_find_references',
      description: 'Find all references at a cursor position using TypeScript Compiler API',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Absolute file path' },
          line: { type: 'number', description: 'Line number (0-based)' },
          character: { type: 'number', description: 'Column number (0-based)' },
          rootDir: { type: 'string', description: 'Project root directory' },
        },
        required: ['file', 'line', 'character', 'rootDir'],
      },
      handler: async (args) =>
        lspToolsReferences(
          args.file as string,
          args.line as number,
          args.character as number,
          args.rootDir as string,
        ),
    },
    {
      name: 'lsp_diagnostics',
      description: 'Get TypeScript diagnostics for a file or directory using TypeScript Compiler API',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute file or directory path to diagnose' },
          rootDir: { type: 'string', description: 'Project root directory' },
        },
        required: ['path', 'rootDir'],
      },
      handler: async (args) =>
        lspToolsDiagnostics(args.path as string, args.rootDir as string),
    },
  ],
});

server.start();
