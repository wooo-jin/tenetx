import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const { tmpDir, tmpProfile } = vi.hoisted(() => {
  const p = require('node:path');
  const o = require('node:os');
  const tmpDir = p.join(o.tmpdir(), `tenetx-test-${process.pid}`);
  return { tmpDir, tmpProfile: p.join(tmpDir, 'me', 'forge-profile.json') };
});

vi.mock('../../src/core/paths.js', () => ({
  V1_PROFILE: tmpProfile,
  STATE_DIR: '/__test_no_state_dir__', // atomic-write의 STATE_DIR auto-detect 비활성
}));

import { createProfile, loadProfile, saveProfile, profileExists, isV1Profile } from '../../src/store/profile-store.js';

beforeEach(() => {
  fs.mkdirSync(path.dirname(tmpProfile), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('profile-store', () => {
  it('createProfile returns valid v1 profile', () => {
    const p = createProfile('user-1', '균형형', '균형형', '승인 완화', 'onboarding');

    expect(p.model_version).toBe('2.0');
    expect(p.base_packs.quality_pack).toBe('균형형');
    expect(p.base_packs.autonomy_pack).toBe('균형형');
    expect(p.trust_preferences.desired_policy).toBe('승인 완화');
    expect(p.axes.quality_safety.facets.verification_depth).toBe(0.60);
    expect(p.axes.autonomy.facets.confirmation_independence).toBe(0.50);
    expect(p.axes.judgment_philosophy.facets.minimal_change_bias).toBe(0.50);
  });

  it('save and load roundtrip', () => {
    const p = createProfile('user-1', '보수형', '확인 우선형', '가드레일 우선', 'onboarding');
    saveProfile(p);

    const loaded = loadProfile();
    expect(loaded).not.toBeNull();
    expect(loaded!.user_id).toBe('user-1');
    expect(loaded!.base_packs.quality_pack).toBe('보수형');
    expect(loaded!.axes.quality_safety.facets.verification_depth).toBe(0.90);
  });

  it('profileExists returns false when no file', () => {
    expect(profileExists()).toBe(false);
  });

  it('profileExists returns true after save', () => {
    saveProfile(createProfile('u', '균형형', '균형형', '승인 완화', 'onboarding'));
    expect(profileExists()).toBe(true);
  });

  it('isV1Profile validates model_version', () => {
    expect(isV1Profile({ model_version: '2.0' })).toBe(true);
    expect(isV1Profile({ model_version: '2.1' })).toBe(true);
    expect(isV1Profile({ model_version: '1.0' })).toBe(false);
    expect(isV1Profile(null)).toBe(false);
    expect(isV1Profile({})).toBe(false);
  });

  it('centroid values differ by pack', () => {
    const conservative = createProfile('u', '보수형', '확인 우선형', '가드레일 우선', 'onboarding');
    const speed = createProfile('u', '속도형', '자율 실행형', '완전 신뢰 실행', 'onboarding');

    expect(conservative.axes.quality_safety.facets.verification_depth).toBeGreaterThan(
      speed.axes.quality_safety.facets.verification_depth,
    );
    expect(conservative.axes.autonomy.facets.confirmation_independence).toBeLessThan(
      speed.axes.autonomy.facets.confirmation_independence,
    );
  });
});
