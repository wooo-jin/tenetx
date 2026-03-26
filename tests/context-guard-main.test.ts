import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';

const { TEST_HOME, mockReadStdinJSON } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-ctx-guard-main',
  mockReadStdinJSON: vi.fn(),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

vi.mock('../src/hooks/shared/read-stdin.js', () => ({
  readStdinJSON: mockReadStdinJSON,
}));

vi.mock('../src/core/logger.js', () => ({
  debugLog: vi.fn(),
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

let logOutput: string[];

beforeEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  logOutput = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logOutput.push(args.map(a => String(a)).join(' '));
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('context-guard main()', () => {
  it('stdin이 null이면 approve', async () => {
    mockReadStdinJSON.mockResolvedValue(null);
    await import('../src/hooks/context-guard.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('approve'))).toBe(true);
    });
  });

  it('프롬프트가 있으면 상태를 기록하고 approve', async () => {
    mockReadStdinJSON.mockResolvedValue({
      prompt: 'Hello, please help me with something.',
      session_id: 'test-session-1',
    });
    await import('../src/hooks/context-guard.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('approve'))).toBe(true);
    });
  });

  it('stop_hook_type이 있으면 approve', async () => {
    mockReadStdinJSON.mockResolvedValue({
      stop_hook_type: 'end_turn',
      session_id: 'test-session-2',
    });
    await import('../src/hooks/context-guard.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('approve'))).toBe(true);
    });
  });

  it('context limit 에러가 있으면 handoff 저장', async () => {
    mockReadStdinJSON.mockResolvedValue({
      stop_hook_type: 'error',
      error: 'context window limit exceeded',
      session_id: 'test-session-3',
    });
    await import('../src/hooks/context-guard.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('approve'))).toBe(true);
      expect(logOutput.some(l => l.includes('Context limit'))).toBe(true);
    });
  });

  it('error만 있고 stop_hook_type이 없으면 approve', async () => {
    mockReadStdinJSON.mockResolvedValue({
      error: 'some random error',
      session_id: 'test-session-4',
    });
    await import('../src/hooks/context-guard.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('approve'))).toBe(true);
    });
  });
});
