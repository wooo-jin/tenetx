import { describe, it, expect } from 'vitest';
import {
  QUALITY_CENTROIDS,
  AUTONOMY_CENTROIDS,
  DEFAULT_JUDGMENT_FACETS,
  DEFAULT_COMMUNICATION_FACETS,
  qualityCentroid,
  autonomyCentroid,
} from '../../src/preset/facet-catalog.js';

describe('facet-catalog', () => {
  it('QUALITY_CENTROIDS has 3 packs', () => {
    expect(Object.keys(QUALITY_CENTROIDS)).toHaveLength(3);
    expect(QUALITY_CENTROIDS).toHaveProperty('보수형');
    expect(QUALITY_CENTROIDS).toHaveProperty('균형형');
    expect(QUALITY_CENTROIDS).toHaveProperty('속도형');
  });

  it('AUTONOMY_CENTROIDS has 3 packs', () => {
    expect(Object.keys(AUTONOMY_CENTROIDS)).toHaveLength(3);
    expect(AUTONOMY_CENTROIDS).toHaveProperty('확인 우선형');
    expect(AUTONOMY_CENTROIDS).toHaveProperty('균형형');
    expect(AUTONOMY_CENTROIDS).toHaveProperty('자율 실행형');
  });

  it('qualityCentroid returns correct centroid', () => {
    const c = qualityCentroid('보수형');
    expect(c.verification_depth).toBeGreaterThan(0);
    expect(c.stop_threshold).toBeGreaterThan(0);
  });

  it('autonomyCentroid returns correct centroid', () => {
    const c = autonomyCentroid('확인 우선형');
    expect(c.confirmation_independence).toBeDefined();
    expect(c.approval_threshold).toBeDefined();
  });

  it('all facet values are between 0 and 1', () => {
    for (const pack of Object.values(QUALITY_CENTROIDS)) {
      for (const val of Object.values(pack)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
    for (const pack of Object.values(AUTONOMY_CENTROIDS)) {
      for (const val of Object.values(pack)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });

  it('DEFAULT_JUDGMENT_FACETS has 3 facets', () => {
    expect(Object.keys(DEFAULT_JUDGMENT_FACETS)).toHaveLength(3);
  });

  it('DEFAULT_COMMUNICATION_FACETS has 3 facets', () => {
    expect(Object.keys(DEFAULT_COMMUNICATION_FACETS)).toHaveLength(3);
  });
});
