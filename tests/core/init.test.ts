import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TEST_CWD = '/tmp/tenetx-test-init-project';

// handleInit()는 내부에서 process.cwd()를 호출하므로 전역 process.cwd를 스파이로 교체
vi.spyOn(process, 'cwd').mockReturnValue(TEST_CWD);

// runOnboarding은 interactive이므로 mock 처리
vi.mock('../../src/forge/onboarding-cli.js', () => ({
  runOnboarding: vi.fn().mockResolvedValue(undefined),
}));

import { handleInit } from '../../src/core/init.js';

// ────────────────────────────────────────────────────────────────────────────
// handleInit() — v1 온보딩 기반 초기화
// ────────────────────────────────────────────────────────────────────────────
describe('handleInit() v1', () => {
  beforeEach(() => {
    fs.rmSync(TEST_CWD, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_CWD, { recursive: true, force: true });
  });

  it('handleInit이 export되어 있다', () => {
    expect(typeof handleInit).toBe('function');
  });

  it('handleInit 호출 시 .claude/rules 디렉토리가 생성된다', async () => {
    await handleInit([]);
    expect(fs.existsSync(path.join(TEST_CWD, '.claude', 'rules'))).toBe(true);
  });

  it('프로필이 없으면 onboarding이 호출된다', async () => {
    const { runOnboarding } = await import('../../src/forge/onboarding-cli.js');
    await handleInit([]);
    expect(runOnboarding).toHaveBeenCalled();
  });
});
