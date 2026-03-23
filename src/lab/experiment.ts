/**
 * Tenetx Lab — A/B Comparison Experiment Management
 *
 * Create and manage experiments comparing different harness configurations.
 */

import * as crypto from 'node:crypto';
import { debugLog } from '../core/logger.js';
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
 * Auto-collect metrics from recent events for running experiments.
 */
export function collectExperimentData(): void {
  try {
    const experiments = listExperiments().filter(e => e.status === 'running');
    if (experiments.length === 0) return;

    const recentEvents = readEvents(Date.now() - 24 * 60 * 60 * 1000);
    const sessionMetrics = recentEvents.filter(e => e.type === 'session-metrics');

    for (const experiment of experiments) {
      for (const event of sessionMetrics) {
        const sessionId = event.sessionId;

        // Check if session already recorded
        const alreadyRecorded = experiment.variants.some(
          v => v.sessionIds.includes(sessionId),
        );
        if (alreadyRecorded) continue;

        // Assign to control by default (user manually assigns treatment)
        const value = extractMetricValue(event, experiment.metric);
        if (value !== null) {
          addDataPoint(experiment.id, 'control', sessionId, value);
        }
      }
    }
  } catch (e) {
    debugLog('lab-experiment', 'Failed to collect experiment data', e);
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
  if (control.sampleSize < 3 || treatment.sampleSize < 3) {
    return 'Insufficient sample size for meaningful comparison.';
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

  if (summaries.length >= 2 && summaries[0].sampleSize >= 3 && summaries[1].sampleSize >= 3) {
    const [a, b] = summaries;
    const isLowerBetter = experiment.metric === 'cost' || experiment.metric === 'duration';
    winner = isLowerBetter
      ? (a.mean < b.mean ? a.name : b.name)
      : (a.mean > b.mean ? a.name : b.name);

    // Simple significance check: difference > 1 standard deviation
    const pooledStd = Math.sqrt((a.stdDev ** 2 + b.stdDev ** 2) / 2);
    significant = pooledStd > 0 && Math.abs(a.mean - b.mean) > pooledStd;
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
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  return { sampleSize: n, mean, median, stdDev };
}
