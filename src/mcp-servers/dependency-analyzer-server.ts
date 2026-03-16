#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import { analyzeDependencies } from './dependency-analyzer.js';

createMcpServer({
  name: 'tenet-dependency-analyzer',
  version: '0.2.0',
  tools: [
    {
      name: 'analyze_dependencies',
      description: 'Analyze project dependencies (package manager, counts, lockfile)',
      inputSchema: {
        type: 'object',
        properties: { cwd: { type: 'string' } },
        required: ['cwd'],
      },
      handler: async (args) => {
        const report = analyzeDependencies(args.cwd as string);
        if (!report.packageManager) return 'No package manager detected';
        return [
          `Package Manager: ${report.packageManager}`,
          `Dependencies: ${report.totalDeps} (dev: ${report.devDeps})`,
          `Lockfile: ${report.lockfilePresent ? 'present' : 'missing'}`,
          `Outdated check: ${report.outdatedCheck ? 'available' : 'not available'}`,
        ].join('\n');
      },
    },
  ],
}).start();
