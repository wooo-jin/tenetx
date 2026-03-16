#!/usr/bin/env node
import { createMcpServer } from './shared/protocol.js';
import { detectTestFramework } from './test-runner.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

createMcpServer({
  name: 'tenet-test-runner',
  version: '1.0.0',
  tools: [
    {
      name: 'detect_test_framework',
      description: 'Detect the test framework used in the project',
      inputSchema: {
        type: 'object',
        properties: { cwd: { type: 'string' } },
        required: ['cwd'],
      },
      handler: async (args) => {
        const result = detectTestFramework(args.cwd as string);
        if (!result) return 'No test framework detected';
        return `Framework: ${result.framework}\nCommand: ${result.command}`;
      },
    },
    {
      name: 'run_tests',
      description: 'Run tests in the project',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string' },
          args: { type: 'string', description: 'Additional args' },
        },
        required: ['cwd'],
      },
      handler: async (toolArgs) => {
        const cwd = toolArgs.cwd as string;
        const detected = detectTestFramework(cwd);
        if (!detected) return 'No test framework detected';
        const parts = detected.command.split(' ');
        const cmd = parts[0];
        const cmdArgs = [...parts.slice(1)];
        if (toolArgs.args) cmdArgs.push(toolArgs.args as string);
        try {
          const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
            cwd,
            timeout: 60000,
            encoding: 'utf8',
          });
          return stdout + (stderr ? '\n' + stderr : '');
        } catch (e: unknown) {
          const err = e as { stdout?: string; stderr?: string; message?: string };
          return `Test failed:\n${err.stdout ?? ''}\n${err.stderr ?? err.message ?? ''}`;
        }
      },
    },
  ],
}).start();
