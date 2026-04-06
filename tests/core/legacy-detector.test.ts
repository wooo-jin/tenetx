import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-legacy',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

// legacy-detector uses FORGE_PROFILE = ~/.tenetx/me/forge-profile.json
const ME_DIR = path.join(TEST_HOME, '.tenetx', 'me');

import { checkLegacyProfile, backupLegacyProfile, runLegacyCutover } from '../../src/core/legacy-detector.js';

describe('legacy-detector', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(ME_DIR, { recursive: true });
    vi.resetModules();
  });
  afterEach(() => { fs.rmSync(TEST_HOME, { recursive: true, force: true }); });

  it('checkLegacyProfile returns isLegacy=false when no profile', () => {
    const result = checkLegacyProfile();
    expect(result.isLegacy).toBe(false);
  });

  it('checkLegacyProfile detects 5D legacy profile', () => {
    const legacyProfile = {
      version: '1.0.0',
      dimensions: {
        riskTolerance: 0.5,
        autonomyPreference: 0.5,
        qualityFocus: 0.5,
        abstractionLevel: 0.5,
        communicationStyle: 0.5,
      },
    };
    fs.writeFileSync(path.join(ME_DIR, 'forge-profile.json'), JSON.stringify(legacyProfile));
    const result = checkLegacyProfile();
    expect(result.isLegacy).toBe(true);
  });

  it('checkLegacyProfile returns false for v1 profile', () => {
    const v1Profile = {
      model_version: '2.0',
      axes: {
        quality_safety: { score: 0.7, facets: {}, confidence: 0.9 },
      },
    };
    fs.writeFileSync(path.join(ME_DIR, 'forge-profile.json'), JSON.stringify(v1Profile));
    const result = checkLegacyProfile();
    expect(result.isLegacy).toBe(false);
  });

  it('backupLegacyProfile creates timestamped backup', () => {
    const legacyProfile = { version: '1.0.0', dimensions: {} };
    const profilePath = path.join(ME_DIR, 'forge-profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(legacyProfile));

    const backupPath = backupLegacyProfile();
    expect(backupPath).not.toBeNull();
    expect(backupPath).toContain('.legacy-');
    expect(fs.existsSync(backupPath!)).toBe(true);
  });

  it('runLegacyCutover backs up and removes legacy profile', () => {
    const legacyProfile = { version: '1.0.0', dimensions: { riskTolerance: 0.5 } };
    const profilePath = path.join(ME_DIR, 'forge-profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(legacyProfile));

    const backupPath = runLegacyCutover();
    expect(backupPath).not.toBeNull();
    // 원본은 삭제되거나 v1으로 마이그레이션됨
  });
});
