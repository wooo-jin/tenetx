import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleForge } from '../../src/forge/cli.js';

// Mock console.log to capture output
let consoleLogs: string[] = [];
const originalLog = console.log;

beforeEach(() => {
  consoleLogs = [];
  console.log = vi.fn((...args: unknown[]) => {
    consoleLogs.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  console.log = originalLog;
});

describe('handleForge --scan-only', () => {
  it('prints scan results without throwing', async () => {
    await handleForge(['--scan-only']);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Forge');
    expect(output).toContain('Scan');
  });

  it('outputs project facts without dimension estimate', async () => {
    await handleForge(['--scan-only']);
    const output = consoleLogs.join('\n');
    expect(output).toContain('팩트만 수집');
    expect(output).not.toContain('estimate');
  });
});

describe('handleForge --profile', () => {
  it('shows no profile message when no profile exists in a temp dir', async () => {
    const originalCwd = process.cwd;
    process.cwd = () => '/tmp/tenetx-test-nonexistent';
    try {
      await handleForge(['--profile']);
      const output = consoleLogs.join('\n');
      // Either shows profile or "No forge profile found"
      expect(output.length).toBeGreaterThan(0);
    } finally {
      process.cwd = originalCwd;
    }
  });
});

describe('handleForge --export', () => {
  it('outputs valid JSON without throwing', async () => {
    await handleForge(['--export']);
    const output = consoleLogs.join('\n');
    // Should output either "{}" (no profile) or valid JSON profile
    expect(output.length).toBeGreaterThan(0);
    expect(() => JSON.parse(output)).not.toThrow();
  });
});

describe('handleForge --adjust', () => {
  it('shows no profile message in non-interactive mode for nonexistent dir', async () => {
    const originalCwd = process.cwd;
    process.cwd = () => '/tmp/tenetx-test-nonexistent-adjust';
    try {
      await handleForge(['--adjust']);
      const output = consoleLogs.join('\n');
      // No profile -> shows message
      expect(output.length).toBeGreaterThan(0);
    } finally {
      process.cwd = originalCwd;
    }
  });
});

describe('handleForge default (non-interactive)', () => {
  it('skips interview in non-TTY mode', async () => {
    // process.stdin.isTTY is undefined in test runner, so interview is skipped
    await handleForge([]);
    const output = consoleLogs.join('\n');
    // Should proceed through scan phase
    expect(output).toContain('Forge');
  });
});
