import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';

const { TEST_HOME, mockReadStdinJSON } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-rate-limiter-main',
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

describe('rate-limiter main()', () => {
  it('stdin이 null이면 approve (fail-open)', async () => {
    mockReadStdinJSON.mockResolvedValue(null);
    await import('../src/hooks/rate-limiter.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('approve'))).toBe(true);
    });
  });

  it('mcp__ 접두사가 아닌 도구는 바로 approve', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Read',
    });
    await import('../src/hooks/rate-limiter.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('approve'))).toBe(true);
    });
  });

  it('mcp__ 접두사 도구는 rate limit 체크', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'mcp__context7__query',
    });
    await import('../src/hooks/rate-limiter.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('approve'))).toBe(true);
    });
  });

  it('toolName 필드도 인식한다', async () => {
    mockReadStdinJSON.mockResolvedValue({
      toolName: 'mcp__fetch__request',
    });
    await import('../src/hooks/rate-limiter.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('approve'))).toBe(true);
    });
  });
});
