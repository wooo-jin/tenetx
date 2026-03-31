/**
 * Tenetx Lab — A/B Comparison Experiment Management
 *
 * Create and manage experiments comparing different harness configurations.
 */

import * as crypto from 'node:crypto';
import { createLogger } from '../core/logger.js';

const log = createLogger('lab-experiment');
import { saveExperiment, loadExperiment, listExperiments, readEvents } from './store.js';
import type {
  LabExperiment,
  ExperimentMetric,
  ExperimentVariant,
  LabEvent,
} from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new experiment.
 */
export function createExperiment(
  name: string,
  metric: ExperimentMetric,
  controlDescription?: string,
  treatmentDescription?: string,
): LabExperiment {
  const experiment: LabExperiment = {
    id: crypto.randomUUID().slice(0, 8),
    name,
    metric,
    status: 'running',
    startedAt: new Date().toISOString(),
    variants: [
      {
        name: 'control',
        description: controlDescription ?? 'Current configuration',
        sessionIds: [],
        metricValues: [],
      },
      {
        name: 'treatment',
        description: treatmentDescription ?? 'New configuration',
        sessionIds: [],
        metricValues: [],
      },
    ],
  };

  saveExperiment(experiment);
  return experiment;
}

/**
 * Add a data point to an experiment variant.
 */
export function addDataPoint(
  experimentId: string,
  variantName: string,
  sessionId: string,
  metricValue: number,
): boolean {
  const experiment = loadExperiment(experimentId);
  if (!experiment || experiment.status !== 'running') return false;

  const variant = experiment.variants.find(v => v.name === variantName);
  if (!variant) return false;

  variant.sessionIds.push(sessionId);
  variant.metricValues.push(metricValue);

  saveExperiment(experiment);
  return true;
}

/**
 * Complete an experiment and generate a conclusion.
 */
export function completeExperiment(experimentId: string): LabExperiment | null {
  const experiment = loadExperiment(experimentId);
  if (!experiment || experiment.status !== 'running') return null;

  experiment.status = 'completed';
  experiment.endedAt = new Date().toISOString();
  experiment.conclusion = analyzeExperiment(experiment);

  saveExperiment(experiment);
  return experiment;
}

/**
 * Cancel a running experiment.
 */
export function cancelExperiment(experimentId: string): boolean {
  const experiment = loadExperiment(experimentId);
  if (!experiment || experiment.status !== 'running') return false;

  experiment.status = 'cancelled';
  experiment.endedAt = new Date().toISOString();

  saveExperiment(experiment);
  return true;
}

/**
 * Get experiment status with statistical summary.
 */
export function getExperimentStatus(experimentId: string): ExperimentReport | null {
  const experiment = loadExperiment(experimentId);
  if (!experiment) return null;

  return buildReport(experiment);
}

/**
 * List all experiments.
 */
export function getAllExperiments(): LabExperiment[] {
  return listExperiments();
}

/**
 * Auto-assign a session to a variant in ALL running experiments.
 * Uses deterministic hash-based assignment for reproducible A/B splits.
 *
 * Note: 세션은 모든 running experiment에 할당되지만,
 * 반환값은 **첫 번째 새 할당**만 포함합니다 (나머지는 silent).
 */
export function assignSessionVariant(sessionId: string): { experimentId: string; variant: string } | null {
  try {
    const experiments = listExperiments().filter(e => e.status === 'running');
    if (experiments.length === 0) return null;

    let firstAssignment: { experimentId: string; variant: string } | null = null;

    for (const experiment of experiments) {
      // Check if session already assigned to this experiment
      const alreadyAssigned = experiment.variants.some(
        v => v.sessionIds.includes(sessionId),
      );
      if (alreadyAssigned) continue;

      // Deterministic 50/50 split based on SHA-256 hash for uniform distribution
      const hashInput = `${sessionId}:${experiment.id}`;
      const hashBuf = crypto.createHash('sha256').update(hashInput).digest();
      const variantName = hashBuf[0] % 2 === 0 ? 'control' : 'treatment';

      // Record the assignment (without metric value yet)
      const variant = experiment.variants.find(v => v.name === variantName);
      if (variant) {
        variant.sessionIds.push(sessionId);
        saveExperiment(experiment);
      }

      if (!firstAssignment) {
        firstAssignment = { experimentId: experiment.id, variant: variantName };
      }
    }

    return firstAssignment;
  } catch (e) {
    log.debug('Failed to assign session variant', e);
    return null;
  }
}

/**
 * Auto-collect metrics from recent events for running experiments.
 */
export function collectExperimentData(): void {
  try {
    const experiments = listExperiments().filter(e => e.status === 'running');
    if (experiments.length === 0) return;

    const recentEvents = readEvents(Date.now() - 24 * 60 * 60 * 1000);
    const sessionMetrics = recentEvents.filter(e => e.type === 'session-metrics');

    for (const experiment of experiments) {
      let changed = false;
      for (const event of sessionMetrics) {
        const sessionId = event.sessionId;

        // Find which variant this session belongs to
        const assignedVariant = experiment.variants.find(
          v => v.sessionIds.includes(sessionId),
        );
        if (!assignedVariant) continue; // session not part of this experiment

        // Skip if metric already recorded for this session
        const sessionIdx = assignedVariant.sessionIds.indexOf(sessionId);
        if (sessionIdx < assignedVariant.metricValues.length) continue;

        const value = extractMetricValue(event, experiment.metric);
        if (value !== null) {
          assignedVariant.metricValues.push(value);
          changed = true;
        }
      }
      // experiment당 1회만 저장 (루프 내 반복 I/O 방지)
      if (changed) saveExperiment(experiment);
    }
  } catch (e) {
    log.debug('Failed to collect experiment data', e);
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

export interface ExperimentReport {
  experiment: LabExperiment;
  variantSummaries: VariantSummary[];
  winner?: string;
  significant: boolean;
}

interface VariantSummary {
  name: string;
  sampleSize: number;
  mean: number;
  median: number;
  stdDev: number;
}

function extractMetricValue(event: LabEvent, metric: ExperimentMetric): number | null {
  const p = event.payload;
  switch (metric) {
    case 'cost':
      return typeof p.estimatedCost === 'number' ? p.estimatedCost : null;
    case 'duration':
      return typeof p.durationMs === 'number' ? p.durationMs : null;
    case 'success-rate': {
      // Binary: 1 for success, 0 for failure
      const result = p.result as string | undefined;
      return result === 'success' ? 1 : result === 'error' ? 0 : null;
    }
    case 'effectiveness':
      return typeof p.effectivenessScore === 'number' ? p.effectivenessScore : null;
    default:
      return null;
  }
}

function analyzeExperiment(experiment: LabExperiment): string {
  const report = buildReport(experiment);
  if (report.variantSummaries.length < 2) {
    return 'Insufficient data for comparison.';
  }

  const [control, treatment] = report.variantSummaries;
  if (control.sampleSize < 10 || treatment.sampleSize < 10) {
    return `Insufficient sample size (control: ${control.sampleSize}, treatment: ${treatment.sampleSize}). Need ≥10 per variant.`;
  }

  const diff = treatment.mean - control.mean;
  const pctDiff = control.mean !== 0
    ? ((diff / Math.abs(control.mean)) * 100).toFixed(1)
    : 'N/A';

  const better = experiment.metric === 'cost' || experiment.metric === 'duration'
    ? diff < 0 ? 'treatment' : 'control'
    : diff > 0 ? 'treatment' : 'control';

  return `${better === 'treatment' ? 'Treatment' : 'Control'} performed better. `
    + `Mean difference: ${diff > 0 ? '+' : ''}${diff.toFixed(2)} (${pctDiff}%). `
    + `Control: ${control.mean.toFixed(2)} (n=${control.sampleSize}), `
    + `Treatment: ${treatment.mean.toFixed(2)} (n=${treatment.sampleSize}).`;
}

function buildReport(experiment: LabExperiment): ExperimentReport {
  const summaries: VariantSummary[] = experiment.variants.map(v => ({
    name: v.name,
    ...computeStats(v),
  }));

  // Determine winner (simple comparison)
  let winner: string | undefined;
  let significant = false;

  // Minimum n=10 per variant for meaningful statistical comparison
  // (n<10 yields power<30% even for large effects — Cohen 1988)
  if (summaries.length >= 2 && summaries[0].sampleSize >= 10 && summaries[1].sampleSize >= 10) {
    const [a, b] = summaries;
    const isLowerBetter = experiment.metric === 'cost' || experiment.metric === 'duration';
    winner = isLowerBetter
      ? (a.mean < b.mean ? a.name : b.name)
      : (a.mean > b.mean ? a.name : b.name);

    // Welch's t-test with Welch-Satterthwaite degrees of freedom
    const v1 = (a.stdDev ** 2) / a.sampleSize;
    const v2 = (b.stdDev ** 2) / b.sampleSize;
    const seDiff = Math.sqrt(v1 + v2);
    // Welch-Satterthwaite df: accounts for unequal variances and sample sizes
    const df = (v1 + v2) ** 2 / (
      (v1 ** 2) / (a.sampleSize - 1) + (v2 ** 2) / (b.sampleSize - 1)
    );
    // t critical value approximation for p<0.05 two-tailed
    // Conservative approx: t ≈ 1.96 as df→∞, inflated for small df
    // Always >= actual t-value (conservative — avoids false positives)
    // Verified: df=5→2.64(actual 2.571), df=10→2.30(2.228), df=30→2.07(2.042)
    const tCrit = df >= 120 ? 1.96 : 1.96 + 3.4 / df;
    significant = seDiff > 0 && Math.abs(a.mean - b.mean) > tCrit * seDiff;
  }

  return { experiment, variantSummaries: summaries, winner, significant };
}

function computeStats(variant: ExperimentVariant): {
  sampleSize: number; mean: number; median: number; stdDev: number;
} {
  const values = variant.metricValues;
  if (values.length === 0) {
    return { sampleSize: 0, mean: 0, median: 0, stdDev: 0 };
  }

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  // Use sample variance (n-1) for unbiased estimation, not population variance (n)
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(n - 1, 1);
  const stdDev = Math.sqrt(variance);

  return { sampleSize: n, mean, median, stdDev };
}
