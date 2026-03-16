#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import { scanForSecrets } from './secrets-scan.js';

createMcpServer({
  name: 'tenet-secrets-scan',
  version: '0.2.0',
  tools: [
    {
      name: 'scan_secrets',
      description: 'Scan project files for exposed secrets (API keys, tokens, passwords)',
      inputSchema: {
        type: 'object',
        properties: { cwd: { type: 'string', description: 'Project directory to scan' } },
        required: ['cwd'],
      },
      handler: async (args) => {
        const findings = scanForSecrets(args.cwd as string);
        if (findings.length === 0) return 'No secrets found.';
        return findings.map(f => `[${f.severity}] ${f.file}:${f.line} — ${f.pattern}\n  ${f.snippet}`).join('\n\n');
      },
    },
  ],
}).start();
