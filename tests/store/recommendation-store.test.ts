import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

const { tmpDir, tmpRecDir } = vi.hoisted(() => {
  const p = require('node:path');
  const o = require('node:os');
  const tmpDir = p.join(o.tmpdir(), `tenetx-rec-test-${process.pid}`);
  return { tmpDir, tmpRecDir: p.join(tmpDir, 'me', 'recommendations') };
});

vi.mock('../../src/core/paths.js', () => ({
  V1_RECOMMENDATIONS_DIR: tmpRecDir,
  STATE_DIR: '/__test_no_state_dir__',
}));

import { createRecommendation, saveRecommendation, loadRecommendation, loadAllRecommendations, updateRecommendationStatus, loadAcceptedRecommendation, loadLatestRecommendation } from '../../src/store/recommendation-store.js';

beforeEach(() => { fs.mkdirSync(tmpRecDir, { recursive: true }); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('recommendation-store', () => {
  it('create + save + load roundtrip', () => {
    const rec = createRecommendation({
      source: 'onboarding', quality_pack: '균형형', autonomy_pack: '균형형',
      suggested_trust_policy: '승인 완화', confidence: 0.55, reason_summary: 'test',
    });
    saveRecommendation(rec);
    expect(loadRecommendation(rec.recommendation_id)).not.toBeNull();
    expect(loadRecommendation(rec.recommendation_id)!.status).toBe('proposed');
  });

  it('updateRecommendationStatus works', () => {
    const rec = createRecommendation({ source: 'onboarding', quality_pack: '보수형', autonomy_pack: '확인 우선형', suggested_trust_policy: '가드레일 우선', confidence: 0.8, reason_summary: 'r' });
    saveRecommendation(rec);
    updateRecommendationStatus(rec.recommendation_id, 'accepted');
    expect(loadRecommendation(rec.recommendation_id)!.status).toBe('accepted');
  });

  it('loadAcceptedRecommendation finds accepted', () => {
    const r1 = createRecommendation({ source: 'onboarding', quality_pack: '균형형', autonomy_pack: '균형형', suggested_trust_policy: '승인 완화', confidence: 0.5, reason_summary: 'a' });
    saveRecommendation(r1);
    updateRecommendationStatus(r1.recommendation_id, 'accepted');
    expect(loadAcceptedRecommendation()!.recommendation_id).toBe(r1.recommendation_id);
  });

  it('loadLatestRecommendation returns most recent', () => {
    const r1 = createRecommendation({ source: 'onboarding', quality_pack: '균형형', autonomy_pack: '균형형', suggested_trust_policy: '승인 완화', confidence: 0.5, reason_summary: 'old' });
    r1.created_at = '2026-01-01T00:00:00Z';
    saveRecommendation(r1);
    const r2 = createRecommendation({ source: 'mismatch_recommendation', quality_pack: '보수형', autonomy_pack: '확인 우선형', suggested_trust_policy: '가드레일 우선', confidence: 0.7, reason_summary: 'new' });
    r2.created_at = '2026-04-03T00:00:00Z';
    saveRecommendation(r2);
    expect(loadLatestRecommendation()!.reason_summary).toBe('new');
  });
});
