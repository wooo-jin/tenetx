import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { setLocale } from '../../src/i18n/index.js';

const { tmpDir, tmpProfile, tmpRulesDir, tmpEvDir, tmpRecDir, tmpSessionsDir, tmpRawLogsDir, tmpSolDir } = vi.hoisted(() => {
  const p = require('node:path');
  const o = require('node:os');
  const tmpDir = p.join(o.tmpdir(), `tenetx-forge-cli-test-${process.pid}`);
  return {
    tmpDir,
    tmpProfile: p.join(tmpDir, 'me', 'forge-profile.json'),
    tmpRulesDir: p.join(tmpDir, 'me', 'rules'),
    tmpEvDir: p.join(tmpDir, 'me', 'behavior'),
    tmpRecDir: p.join(tmpDir, 'me', 'recommendations'),
    tmpSessionsDir: p.join(tmpDir, 'state', 'sessions'),
    tmpRawLogsDir: p.join(tmpDir, 'state', 'raw-logs'),
    tmpSolDir: p.join(tmpDir, 'me', 'solutions'),
  };
});

vi.mock('../../src/core/paths.js', () => ({
  V1_PROFILE: tmpProfile,
  V1_RULES_DIR: tmpRulesDir,
  V1_EVIDENCE_DIR: tmpEvDir,
  V1_RECOMMENDATIONS_DIR: tmpRecDir,
  V1_SESSIONS_DIR: tmpSessionsDir,
  V1_RAW_LOGS_DIR: tmpRawLogsDir,
  V1_SOLUTIONS_DIR: tmpSolDir,
  TENETX_HOME: tmpDir,
  V1_ME_DIR: require('node:path').join(tmpDir, 'me'),
  V1_STATE_DIR: require('node:path').join(tmpDir, 'state'),
  STATE_DIR: require('node:path').join(tmpDir, 'state'),
}));

import { handleForge } from '../../src/forge/cli.js';
import { createProfile, saveProfile } from '../../src/store/profile-store.js';

let consoleLogs: string[] = [];
const originalLog = console.log;

beforeEach(() => {
  setLocale('ko');
  consoleLogs = [];
  console.log = vi.fn((...args: unknown[]) => { consoleLogs.push(args.map(String).join(' ')); });
  fs.mkdirSync(require('node:path').join(tmpDir, 'me'), { recursive: true });
});

afterEach(() => {
  console.log = originalLog;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('handleForge --profile', () => {
  it('shows no profile message when empty', async () => {
    await handleForge(['--profile']);
    expect(consoleLogs.join('\n')).toContain('No v1 profile');
  });

  it('shows profile when exists', async () => {
    saveProfile(createProfile('u', '균형형', '균형형', '승인 완화', 'onboarding'));
    await handleForge(['--profile']);
    const output = consoleLogs.join('\n');
    expect(output).toContain('균형형');
    expect(output).toContain('승인 완화');
  });
});

describe('handleForge --export', () => {
  it('outputs empty object when no profile', async () => {
    await handleForge(['--export']);
    expect(consoleLogs.join('')).toContain('{}');
  });

  it('outputs JSON when profile exists', async () => {
    saveProfile(createProfile('u', '보수형', '확인 우선형', '가드레일 우선', 'onboarding'));
    await handleForge(['--export']);
    const json = JSON.parse(consoleLogs.join(''));
    expect(json.base_packs.quality_pack).toBe('보수형');
  });
});

describe('handleForge --reset', () => {
  it('soft reset deletes profile', async () => {
    saveProfile(createProfile('u', '균형형', '균형형', '승인 완화', 'onboarding'));
    await handleForge(['--reset', 'soft']);
    expect(fs.existsSync(tmpProfile)).toBe(false);
    expect(consoleLogs.join('\n')).toContain('Soft reset');
  });
});
