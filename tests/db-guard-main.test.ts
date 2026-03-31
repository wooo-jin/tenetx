import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';

const { TEST_HOME, mockReadStdinJSON } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-db-guard-main',
  mockReadStdinJSON: vi.fn(),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

vi.mock('../src/hooks/shared/read-stdin.js', () => ({
  readStdinJSON: mockReadStdinJSON,
}));

let logOutput: string[];
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  logOutput = [];
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logOutput.push(args.map(a => String(a)).join(' '));
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('db-guard main()', () => {
  it('stdin이 null이면 fail counter 증가 + approve', async () => {
    mockReadStdinJSON.mockResolvedValue(null);
    await import('../src/hooks/db-guard.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('"continue":true'))).toBe(true);
    });
  });

  it('Bash가 아닌 도구면 approve', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Read',
      tool_input: { command: 'DROP TABLE users' },
    });
    await import('../src/hooks/db-guard.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('"continue":true'))).toBe(true);
    });
  });

  it('DROP TABLE이면 reject', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Bash',
      tool_input: { command: 'DROP TABLE users' },
    });
    await import('../src/hooks/db-guard.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('"continue":false'))).toBe(true);
      expect(logOutput.some(l => l.includes('Dangerous SQL'))).toBe(true);
    });
  });

  it('ALTER TABLE DROP COLUMN이면 approve + warning', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Bash',
      tool_input: { command: 'ALTER TABLE users DROP COLUMN email' },
    });
    await import('../src/hooks/db-guard.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('"continue":true'))).toBe(true);
      expect(logOutput.some(l => l.includes('compound-sql-warning'))).toBe(true);
    });
  });

  it('안전한 SELECT면 approve', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Bash',
      tool_input: { command: 'SELECT * FROM users' },
    });
    await import('../src/hooks/db-guard.js');
    await vi.waitFor(() => {
      const lastOutput = logOutput[logOutput.length - 1];
      expect(lastOutput).toContain('"continue":true');
      expect(lastOutput).not.toContain('warning');
    });
  });

  it('DELETE FROM WHERE는 approve', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Bash',
      tool_input: { command: 'DELETE FROM users WHERE id = 1' },
    });
    await import('../src/hooks/db-guard.js');
    await vi.waitFor(() => {
      const lastOutput = logOutput[logOutput.length - 1];
      expect(lastOutput).toContain('"continue":true');
      expect(lastOutput).not.toContain('"continue":false');
    });
  });
});
