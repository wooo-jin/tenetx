import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-init',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const TEST_CWD = path.join(TEST_HOME, 'test-project');
vi.spyOn(process, 'cwd').mockReturnValue(TEST_CWD);

import { handleInit } from '../../src/core/init.js';
import { createProfile, saveProfile } from '../../src/store/profile-store.js';
import { ensureV1Directories } from '../../src/core/v1-bootstrap.js';

describe('handleInit() v1', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD, { recursive: true });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('handleInit이 export되어 있다', () => {
    expect(typeof handleInit).toBe('function');
  });

  it('프로필이 있으면 이미 존재한다고 안내한다', async () => {
    ensureV1Directories();
    saveProfile(createProfile('test', '균형형', '균형형', '승인 완화', 'onboarding'));

    await handleInit([]);

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Profile already exists');
  });

  it('.claude/rules 디렉토리가 생성된다', async () => {
    ensureV1Directories();
    saveProfile(createProfile('test', '균형형', '균형형', '승인 완화', 'onboarding'));

    await handleInit([]);

    expect(fs.existsSync(path.join(TEST_CWD, '.claude', 'rules'))).toBe(true);
  });
});
