import { describe, it, expect, vi } from 'vitest';

// recommendation-store의 paths mock
const { tmpRecDir } = vi.hoisted(() => {
  const p = require('node:path');
  const o = require('node:os');
  return { tmpRecDir: p.join(o.tmpdir(), `tenetx-onb-test-${process.pid}`, 'me', 'recommendations') };
});
vi.mock('../../src/core/paths.js', () => ({ V1_RECOMMENDATIONS_DIR: tmpRecDir, STATE_DIR: '/__test_no_state_dir__' }));

import { computeOnboarding, onboardingToRecommendation } from '../../src/forge/onboarding.js';

describe('computeOnboarding', () => {
  it('A+A → 보수형 + 확인 우선형 + 가드레일 우선', () => {
    const r = computeOnboarding('A', 'A');
    expect(r.qualityPack).toBe('보수형');
    expect(r.autonomyPack).toBe('확인 우선형');
    expect(r.suggestedTrustPolicy).toBe('가드레일 우선');
    expect(r.qualityScore).toBe(-3);
    expect(r.autonomyScore).toBe(-2);
  });

  it('C+C → 속도형 + 자율 실행형 + 완전 신뢰 실행', () => {
    const r = computeOnboarding('C', 'C');
    expect(r.qualityPack).toBe('속도형');
    expect(r.autonomyPack).toBe('자율 실행형');
    expect(r.suggestedTrustPolicy).toBe('완전 신뢰 실행');
    expect(r.qualityScore).toBe(3);
    expect(r.autonomyScore).toBe(3);
  });

  it('B+B → 균형형 + 균형형 + 승인 완화', () => {
    const r = computeOnboarding('B', 'B');
    expect(r.qualityPack).toBe('균형형');
    expect(r.autonomyPack).toBe('균형형');
    expect(r.suggestedTrustPolicy).toBe('승인 완화');
    expect(r.qualityScore).toBe(0);
    expect(r.autonomyScore).toBe(0);
  });

  it('A+C → 교차 조합: 균형형 + 균형형', () => {
    const r = computeOnboarding('A', 'C');
    expect(r.qualityScore).toBe(1);  // -1+2
    expect(r.autonomyScore).toBe(-1); // -2+1
    expect(r.qualityPack).toBe('균형형');
    expect(r.autonomyPack).toBe('균형형');
  });

  it('confidence is low for neutral (B+B)', () => {
    const r = computeOnboarding('B', 'B');
    expect(r.qualityConfidence).toBe(0.45);
    expect(r.autonomyConfidence).toBe(0.45);
  });

  it('confidence is high for strong signal (A+A)', () => {
    const r = computeOnboarding('A', 'A');
    expect(r.qualityConfidence).toBeGreaterThan(0.8);
    expect(r.autonomyConfidence).toBeGreaterThan(0.7);
  });

  it('confidence penalized for contradiction (A+C)', () => {
    const r = computeOnboarding('A', 'C');
    // quality: -1 + +2 → signs differ → contradiction
    expect(r.qualityConfidence).toBeLessThan(0.6);
  });
});

describe('onboardingToRecommendation', () => {
  it('creates PackRecommendation with proposed status', () => {
    const result = computeOnboarding('B', 'B');
    const rec = onboardingToRecommendation(result);
    expect(rec.status).toBe('proposed');
    expect(rec.source).toBe('onboarding');
    expect(rec.quality_pack).toBe('균형형');
  });
});
