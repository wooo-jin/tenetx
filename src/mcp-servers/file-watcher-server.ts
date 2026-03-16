#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import { getRecentlyModified, getModificationSummary } from './file-watcher.js';

createMcpServer({
  name: 'tenetx-file-watcher',
  version: '1.0.0',
  tools: [
    {
      name: 'recent_files',
      description: 'List recently modified files in the project',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          minutes: { type: 'number', description: 'Time window in minutes (default: 30)' },
        },
        required: ['cwd'],
      },
      handler: async (args) => {
        const files = getRecentlyModified(args.cwd as string, args.minutes as number | undefined);
        if (files.length === 0) return 'No recently modified files';
        return files.map(f => `${f.file} — ${f.mtime.toISOString()}`).join('\n');
      },
    },
    {
      name: 'modification_summary',
      description: 'Get summary of file modifications by extension',
      inputSchema: {
        type: 'object',
        properties: { cwd: { type: 'string' } },
        required: ['cwd'],
      },
      handler: async (args) => {
        const summary = getModificationSummary(args.cwd as string);
        const extLines = Object.entries(summary.byExtension)
          .sort((a, b) => b[1] - a[1])
          .map(([ext, count]) => `  ${ext}: ${count}`)
          .join('\n');
        return `Total files: ${summary.total}\nRecently modified: ${summary.recent}\nBy extension:\n${extLines}`;
      },
    },
  ],
}).start();
