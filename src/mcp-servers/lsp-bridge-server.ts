#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import { detectLanguageServer } from './lsp-bridge.js';

createMcpServer({
  name: 'tenet-lsp-bridge',
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
  ],
}).start();
