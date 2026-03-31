import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-session-recovery-input',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

describe('session-recovery session context resolution', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses the actual SessionStart payload session_id and cwd when available', async () => {
    const { resolveSessionStartContext } = await import('../src/hooks/session-recovery.js');

    const context = resolveSessionStartContext(JSON.stringify({
      session_id: 'claude-session-123',
      cwd: '/tmp/real-project',
    }));

    expect(context.sessionId).toBe('claude-session-123');
    expect(context.cwd).toBe('/tmp/real-project');
  });

  it('falls back to COMPOUND_CWD and a synthetic session id when stdin is missing', async () => {
    vi.stubEnv('COMPOUND_CWD', '/tmp/from-env');
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const { resolveSessionStartContext } = await import('../src/hooks/session-recovery.js');
    const context = resolveSessionStartContext('');

    expect(context.cwd).toBe('/tmp/from-env');
    expect(context.sessionId).toBe('session-1700000000000');
  });
});
