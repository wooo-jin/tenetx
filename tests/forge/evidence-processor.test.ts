import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-evidence-proc',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import { processCorrection, applyFacetDelta } from '../../src/forge/evidence-processor.js';
import { V1_ME_DIR, V1_EVIDENCE_DIR, V1_RULES_DIR } from '../../src/core/paths.js';
import type { CorrectionRequest, QualityFacets, AutonomyFacets } from '../../src/store/types.js';

describe('evidence-processor', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(V1_ME_DIR, { recursive: true });
    fs.mkdirSync(V1_EVIDENCE_DIR, { recursive: true });
    fs.mkdirSync(V1_RULES_DIR, { recursive: true });
  });
  afterEach(() => { fs.rmSync(TEST_HOME, { recursive: true, force: true }); });

  describe('processCorrection', () => {
    it('fix-now creates temporary rule and evidence', () => {
      const req: CorrectionRequest = {
        session_id: 'sess-1',
        kind: 'fix-now',
        message: 'use early return',
        target: 'nesting depth',
        axis_hint: 'quality_safety',
      };
      const result = processCorrection(req);

      expect(result.evidence_event_id).toBeDefined();
      expect(result.temporary_rule).not.toBeNull();
      expect(result.temporary_rule!.scope).toBe('session');
      expect(result.recompose_required).toBe(true);
    });

    it('prefer-from-now creates evidence but no temporary rule', () => {
      const req: CorrectionRequest = {
        session_id: 'sess-2',
        kind: 'prefer-from-now',
        message: 'always use TypeScript strict',
        target: 'tsconfig',
        axis_hint: 'quality_safety',
      };
      const result = processCorrection(req);

      expect(result.evidence_event_id).toBeDefined();
      expect(result.temporary_rule).toBeNull();
      expect(result.recompose_required).toBe(false);
      expect(result.promotion_candidate).toBe(true);
    });

    it('avoid-this creates strong temporary rule', () => {
      const req: CorrectionRequest = {
        session_id: 'sess-3',
        kind: 'avoid-this',
        message: 'do not use any',
        target: 'type annotations',
        axis_hint: null,
      };
      const result = processCorrection(req);

      expect(result.temporary_rule).not.toBeNull();
      expect(result.temporary_rule!.strength).toBe('strong');
      expect(result.promotion_candidate).toBe(true);
    });
  });

  describe('applyFacetDelta', () => {
    const baseQuality: QualityFacets = {
      verification_depth: 0.5,
      stop_threshold: 0.5,
      change_conservatism: 0.5,
    };
    const baseAutonomy: AutonomyFacets = {
      confirmation_independence: 0.5,
      assumption_tolerance: 0.5,
      scope_expansion_tolerance: 0.5,
      approval_threshold: 0.5,
    };

    it('null delta returns copy of original', () => {
      const result = applyFacetDelta(baseQuality, baseAutonomy, null);
      expect(result.quality).toEqual(baseQuality);
      expect(result.autonomy).toEqual(baseAutonomy);
    });

    it('applies positive delta', () => {
      const delta = { quality_safety: { verification_depth: 0.2 } };
      const result = applyFacetDelta(baseQuality, baseAutonomy, delta);
      expect(result.quality.verification_depth).toBeCloseTo(0.7);
    });

    it('clamps to [0, 1]', () => {
      const delta = { quality_safety: { verification_depth: 0.8 } };
      const result = applyFacetDelta(baseQuality, baseAutonomy, delta);
      expect(result.quality.verification_depth).toBe(1.0);
    });

    it('applies autonomy delta', () => {
      const delta = { autonomy: { confirmation_independence: -0.3 } };
      const result = applyFacetDelta(baseQuality, baseAutonomy, delta);
      expect(result.autonomy.confirmation_independence).toBeCloseTo(0.2);
    });
  });
});
