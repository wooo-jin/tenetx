/**
 * Tests for lab/experiment.ts
 *
 * Isolation strategy: vi.mock('node:os') redirects homedir() to a tmp directory
 * so experiment files are never written to the real ~/.compound/.
 * Each test run uses a unique directory cleaned up in afterAll.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';

const TEST_HOME = `/tmp/tenetx-test-experiment-${Date.now()}-${process.pid}`;

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const {
  createExperiment,
  addDataPoint,
  completeExperiment,
  cancelExperiment,
  getExperimentStatus,
} = await import('../../src/lab/experiment.js');

const RUN_TAG = `exp-test-${Date.now()}-${process.pid}`;

function uniqueName(label: string): string {
  return `${RUN_TAG}-${label}`;
}

afterAll(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// createExperiment
// ---------------------------------------------------------------------------

describe('createExperiment', () => {
  it('returns an object with a non-empty id of 8 characters', () => {
    const exp = createExperiment(uniqueName('create-id'), 'cost');
    expect(typeof exp.id).toBe('string');
    expect(exp.id).toHaveLength(8);
  });

  it('creates exactly two variants named control and treatment', () => {
    const exp = createExperiment(uniqueName('create-variants'), 'duration');
    expect(exp.variants).toHaveLength(2);
    expect(exp.variants[0].name).toBe('control');
    expect(exp.variants[1].name).toBe('treatment');
  });

  it('initial status is running', () => {
    const exp = createExperiment(uniqueName('create-status'), 'effectiveness');
    expect(exp.status).toBe('running');
  });

  it('uses provided control and treatment descriptions', () => {
    const exp = createExperiment(
      uniqueName('create-desc'),
      'cost',
      'my-control',
      'my-treatment',
    );
    expect(exp.variants[0].description).toBe('my-control');
    expect(exp.variants[1].description).toBe('my-treatment');
  });

  it('falls back to default descriptions when not provided', () => {
    const exp = createExperiment(uniqueName('create-default-desc'), 'cost');
    expect(exp.variants[0].description).toBe('Current configuration');
    expect(exp.variants[1].description).toBe('New configuration');
  });

  it('variants start with empty sessionIds and metricValues', () => {
    const exp = createExperiment(uniqueName('create-empty'), 'success-rate');
    for (const v of exp.variants) {
      expect(v.sessionIds).toEqual([]);
      expect(v.metricValues).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// addDataPoint
// ---------------------------------------------------------------------------

describe('addDataPoint', () => {
  it('returns true and appends value when experiment exists and is running', () => {
    const exp = createExperiment(uniqueName('add-ok'), 'cost');
    const result = addDataPoint(exp.id, 'control', 'sess-1', 42.5);
    expect(result).toBe(true);

    const report = getExperimentStatus(exp.id);
    const control = report!.variantSummaries.find(v => v.name === 'control')!;
    expect(control.sampleSize).toBe(1);
    expect(control.mean).toBeCloseTo(42.5);
  });

  it('returns false when experiment id does not exist', () => {
    const result = addDataPoint('nonexistent-id', 'control', 'sess-x', 1);
    expect(result).toBe(false);
  });

  it('returns false when variant name does not exist in experiment', () => {
    const exp = createExperiment(uniqueName('add-bad-variant'), 'duration');
    const result = addDataPoint(exp.id, 'unknown-variant', 'sess-2', 10);
    expect(result).toBe(false);
  });

  it('returns false when experiment is not in running status', () => {
    const exp = createExperiment(uniqueName('add-cancelled'), 'cost');
    cancelExperiment(exp.id);
    const result = addDataPoint(exp.id, 'control', 'sess-3', 5);
    expect(result).toBe(false);
  });

  it('accumulates multiple data points on the same variant', () => {
    const exp = createExperiment(uniqueName('add-multiple'), 'effectiveness');
    addDataPoint(exp.id, 'treatment', 's1', 0.8);
    addDataPoint(exp.id, 'treatment', 's2', 0.6);
    addDataPoint(exp.id, 'treatment', 's3', 0.7);

    const report = getExperimentStatus(exp.id)!;
    const treatment = report.variantSummaries.find(v => v.name === 'treatment')!;
    expect(treatment.sampleSize).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// completeExperiment
// ---------------------------------------------------------------------------

describe('completeExperiment', () => {
  it('changes status to completed', () => {
    const exp = createExperiment(uniqueName('complete-status'), 'cost');
    const completed = completeExperiment(exp.id);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('completed');
  });

  it('sets endedAt to an ISO string', () => {
    const exp = createExperiment(uniqueName('complete-ended-at'), 'duration');
    const completed = completeExperiment(exp.id);
    expect(completed!.endedAt).toBeDefined();
    expect(() => new Date(completed!.endedAt!)).not.toThrow();
  });

  it('sets a conclusion string', () => {
    const exp = createExperiment(uniqueName('complete-conclusion'), 'cost');
    const completed = completeExperiment(exp.id);
    expect(typeof completed!.conclusion).toBe('string');
    expect(completed!.conclusion!.length).toBeGreaterThan(0);
  });

  it('returns null when experiment id does not exist', () => {
    const result = completeExperiment('does-not-exist');
    expect(result).toBeNull();
  });

  it('returns null when experiment is already completed', () => {
    const exp = createExperiment(uniqueName('complete-twice'), 'effectiveness');
    completeExperiment(exp.id);
    const second = completeExperiment(exp.id);
    expect(second).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cancelExperiment
// ---------------------------------------------------------------------------

describe('cancelExperiment', () => {
  it('returns true and changes status to cancelled', () => {
    const exp = createExperiment(uniqueName('cancel-ok'), 'cost');
    const result = cancelExperiment(exp.id);
    expect(result).toBe(true);

    const report = getExperimentStatus(exp.id)!;
    expect(report.experiment.status).toBe('cancelled');
  });

  it('returns false when experiment id does not exist', () => {
    const result = cancelExperiment('no-such-id');
    expect(result).toBe(false);
  });

  it('returns false when experiment is already cancelled', () => {
    const exp = createExperiment(uniqueName('cancel-twice'), 'duration');
    cancelExperiment(exp.id);
    const second = cancelExperiment(exp.id);
    expect(second).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getExperimentStatus / report structure
// ---------------------------------------------------------------------------

describe('getExperimentStatus', () => {
  it('returns null for a non-existent experiment', () => {
    const result = getExperimentStatus('ghost-id');
    expect(result).toBeNull();
  });

  it('returns a report with the original experiment object', () => {
    const exp = createExperiment(uniqueName('status-exp'), 'cost');
    const report = getExperimentStatus(exp.id)!;
    expect(report.experiment.id).toBe(exp.id);
  });

  it('returns variantSummaries with one entry per variant', () => {
    const exp = createExperiment(uniqueName('status-summaries'), 'effectiveness');
    const report = getExperimentStatus(exp.id)!;
    expect(report.variantSummaries).toHaveLength(2);
  });

  it('each variantSummary has name, sampleSize, mean, median, stdDev', () => {
    const exp = createExperiment(uniqueName('status-fields'), 'cost');
    const report = getExperimentStatus(exp.id)!;
    for (const s of report.variantSummaries) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.sampleSize).toBe('number');
      expect(typeof s.mean).toBe('number');
      expect(typeof s.median).toBe('number');
      expect(typeof s.stdDev).toBe('number');
    }
  });

  it('empty variants produce sampleSize=0 and mean=0', () => {
    const exp = createExperiment(uniqueName('status-empty-variants'), 'duration');
    const report = getExperimentStatus(exp.id)!;
    for (const s of report.variantSummaries) {
      expect(s.sampleSize).toBe(0);
      expect(s.mean).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildReport (indirect) — Welch's t-test significance
// ---------------------------------------------------------------------------

describe('buildReport significance via getExperimentStatus', () => {
  /**
   * Populate both variants of an experiment with n values each.
   * Returns the experiment id for querying the report.
   */
  function populateVariants(
    label: string,
    controlValues: number[],
    treatmentValues: number[],
  ): string {
    const exp = createExperiment(uniqueName(label), 'effectiveness');
    controlValues.forEach((v, i) => addDataPoint(exp.id, 'control', `ctrl-${i}`, v));
    treatmentValues.forEach((v, i) => addDataPoint(exp.id, 'treatment', `trt-${i}`, v));
    return exp.id;
  }

  it('significant=true when n>=10 and groups have a large, clear difference', () => {
    // control: mean ~1.0, treatment: mean ~9.0 — gap is enormous relative to stdDev
    const control = Array.from({ length: 15 }, (_, i) => 1.0 + (i % 3) * 0.05);
    const treatment = Array.from({ length: 15 }, (_, i) => 9.0 + (i % 3) * 0.05);
    const id = populateVariants('sig-true', control, treatment);
    const report = getExperimentStatus(id)!;
    expect(report.significant).toBe(true);
  });

  it('significant=false when n>=10 and both groups have identical values', () => {
    const identical = Array.from({ length: 12 }, () => 5.0);
    const id = populateVariants('sig-false-identical', identical, [...identical]);
    const report = getExperimentStatus(id)!;
    expect(report.significant).toBe(false);
  });

  it('significant=false when n<10 (insufficient sample size)', () => {
    // Only 5 points per variant — below the minimum threshold of 10
    const control = [1.0, 1.1, 1.2, 1.3, 1.4];
    const treatment = [9.0, 9.1, 9.2, 9.3, 9.4];
    const id = populateVariants('sig-false-small-n', control, treatment);
    const report = getExperimentStatus(id)!;
    expect(report.significant).toBe(false);
  });

  it('significant=false when both groups have zero variance (seDiff=0 short-circuit)', () => {
    // All values identical within each group → stdDev=0 → seDiff=0
    const control = Array.from({ length: 12 }, () => 3.0);
    const treatment = Array.from({ length: 12 }, () => 3.0);
    const id = populateVariants('sig-false-zero-var', control, treatment);
    const report = getExperimentStatus(id)!;
    expect(report.significant).toBe(false);
  });

  it('winner is set to the higher-mean variant for effectiveness metric', () => {
    const control = Array.from({ length: 15 }, (_, i) => 1.0 + (i % 3) * 0.05);
    const treatment = Array.from({ length: 15 }, (_, i) => 9.0 + (i % 3) * 0.05);
    const id = populateVariants('winner-effectiveness', control, treatment);
    const report = getExperimentStatus(id)!;
    // treatment has higher mean, and effectiveness is higher-is-better
    expect(report.winner).toBe('treatment');
  });

  it('winner is set to the lower-mean variant for cost metric', () => {
    const exp = createExperiment(uniqueName('winner-cost'), 'cost');
    // control cheaper (mean ~1), treatment expensive (mean ~9)
    Array.from({ length: 15 }, (_, i) => 1.0 + (i % 3) * 0.05)
      .forEach((v, i) => addDataPoint(exp.id, 'control', `c${i}`, v));
    Array.from({ length: 15 }, (_, i) => 9.0 + (i % 3) * 0.05)
      .forEach((v, i) => addDataPoint(exp.id, 'treatment', `t${i}`, v));
    const report = getExperimentStatus(exp.id)!;
    expect(report.winner).toBe('control');
  });
});
