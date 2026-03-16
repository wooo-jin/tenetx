#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import { generateRepoIndex } from './repo-index.js';

createMcpServer({
  name: 'tenet-repo-index',
  version: '1.0.0',
  tools: [
    {
      name: 'index_repo',
      description: 'Generate a project structure index/summary',
      inputSchema: {
        type: 'object',
        properties: { cwd: { type: 'string' } },
        required: ['cwd'],
      },
      handler: async (args) => {
        return generateRepoIndex(args.cwd as string);
      },
    },
  ],
}).start();
