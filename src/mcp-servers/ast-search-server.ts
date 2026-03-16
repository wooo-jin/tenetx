#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import { astSearch } from './ast-search.js';

createMcpServer({
  name: 'tenet-ast-search',
  version: '1.0.0',
  tools: [
    {
      name: 'ast_search',
      description: 'Search for function/class/interface declarations by pattern',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to match declaration names' },
          cwd: { type: 'string', description: 'Project directory' },
        },
        required: ['pattern', 'cwd'],
      },
      handler: async (args) => {
        const results = astSearch(args.pattern as string, args.cwd as string);
        if (results.length === 0) return 'No declarations found';
        return results
          .map(r => `${r.type} ${r.name}${r.exported ? ' (exported)' : ''} — ${r.file}:${r.line}`)
          .join('\n');
      },
    },
  ],
}).start();
