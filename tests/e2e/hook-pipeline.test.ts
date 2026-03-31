/**
 * E2E Hook Pipeline Test
 *
 * Spawns actual compiled hook scripts and validates stdin → stdout JSON protocol.
 * Unlike unit tests, this verifies the real I/O contract that Claude Code depends on.
 */
import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import * as path from 'node:path';

const DIST_DIR = path.join(__dirname, '../../dist/hooks');

function runHook(hookName: string, input: unknown): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const hookPath = path.join(DIST_DIR, `${hookName}.js`);
    const child = execFile('node', [hookPath], { timeout: 10000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });

    if (child.stdin) {
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    }
  });
}

function parseOutput(stdout: string): Record<string, unknown> | null {
  try {
    // Hook may output multiple lines; the JSON output is typically the last line
    const lines = stdout.split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]) as Record<string, unknown>;
      } catch { continue; }
    }
    return null;
  } catch {
    return null;
  }
}

describe('Hook Pipeline E2E', () => {
  it('solution-injector: null input → approve', async () => {
    const result = await runHook('solution-injector', null);
    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    expect(output?.continue).toBe(true);
  });

  it('solution-injector: valid prompt → approve (with or without solutions)', async () => {
    const result = await runHook('solution-injector', {
      prompt: 'fix the login bug',
      session_id: 'e2e-test-session',
    });
    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    expect(output?.continue).toBe(true);
    // message is optional — only present when solutions are injected
    if (output?.systemMessage) {
      expect(typeof output.systemMessage).toBe('string');
    }
  });

  it('keyword-detector: non-magic keyword → approve without skill', async () => {
    const result = await runHook('keyword-detector', {
      prompt: 'add a button to the page',
      session_id: 'e2e-test-session',
    });
    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    expect(output?.continue).toBe(true);
  });

  it('pre-tool-use: Read tool → approve (not dangerous)', async () => {
    const result = await runHook('pre-tool-use', {
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test.txt' },
      session_id: 'e2e-test-session',
    });
    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    expect(output?.continue).toBe(true);
  });

  it('slop-detector: clean Write → approve', async () => {
    const result = await runHook('slop-detector', {
      tool_name: 'Write',
      tool_input: { content: 'function add(a: number, b: number): number { return a + b; }' },
    });
    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    expect(output?.continue).toBe(true);
    // Should NOT contain slop warning for clean code
    expect(output?.systemMessage ?? '').not.toContain('compound-slop-warning');
  });

  it('db-guard: SELECT query → approve', async () => {
    const result = await runHook('db-guard', {
      tool_name: 'Bash',
      tool_input: { command: 'psql -c "SELECT * FROM users"' },
      session_id: 'e2e-test-session',
    });
    const output = parseOutput(result.stdout);
    expect(output).not.toBeNull();
    // db-guard should approve SELECT (read-only)
    expect(output?.continue).toBe(true);
  });

  it('hooks output valid JSON on stdout', async () => {
    // All hooks must output valid JSON — Claude Code depends on this
    const hooks = ['solution-injector', 'keyword-detector', 'pre-tool-use', 'slop-detector'];
    for (const hook of hooks) {
      const result = await runHook(hook, { prompt: 'test', session_id: 'e2e-json-check' });
      const output = parseOutput(result.stdout);
      expect(output, `${hook} must output valid JSON`).not.toBeNull();
      expect(output?.continue, `${hook} must include continue field`).toBeDefined();
    }
  });
});
