#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import { detectPythonEnvironment } from './python-repl.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

createMcpServer({
  name: 'tenetx-python-repl',
  version: '1.0.0',
  tools: [
    {
      name: 'detect_python',
      description: 'Detect Python environment (venv, packages, version)',
      inputSchema: {
        type: 'object',
        properties: { cwd: { type: 'string' } },
        required: ['cwd'],
      },
      handler: async (args) => {
        const env = detectPythonEnvironment(args.cwd as string);
        if (!env) return 'No Python environment detected';
        return `Python: ${env.python}\nVenv: ${env.hasVenv}\nPackages: ${env.packages.join(', ') || 'none'}`;
      },
    },
    {
      name: 'run_python',
      description: 'Execute a Python expression or script',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code to execute' },
          cwd: { type: 'string' },
        },
        required: ['code', 'cwd'],
      },
      handler: async (args) => {
        const env = detectPythonEnvironment(args.cwd as string);
        const python = env?.python ?? 'python3';
        try {
          const { stdout, stderr } = await execFileAsync(python, ['-c', args.code as string], {
            cwd: args.cwd as string,
            timeout: 30000,
            encoding: 'utf8',
          });
          return stdout + (stderr ? '\nstderr: ' + stderr : '');
        } catch (e: unknown) {
          const err = e as { stdout?: string; stderr?: string; message?: string };
          return `Error: ${err.stderr ?? err.message ?? 'Unknown error'}`;
        }
      },
    },
  ],
}).start();
