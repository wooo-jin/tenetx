/**
 * Tenetx — MultiModelSynthesizer
 *
 * Intelligent evaluation and synthesis engine for multi-model responses.
 * Provides confidence scoring, agreement analysis, weighted synthesis,
 * and provider performance tracking.
 *
 * - No external dependencies (node built-ins only)
 * - No LLM calls for evaluation (pure heuristics via evaluator.ts)
 * - Failure-tolerant file operations
 * - Integrates with lab tracker for event recording
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';

const log = createLogger('synthesizer');
import { evaluateAll, type ResponseEvaluation } from './evaluator.js';
import type { ProviderResponse } from './provider.js';
import { track } from '../lab/tracker.js';

// ---------------------------------------------------------------------------
// Storage Paths
// ---------------------------------------------------------------------------

const SYNTH_DIR = path.join(os.homedir(), '.compound', 'synth');
const PERFORMANCE_PATH = path.join(SYNTH_DIR, 'performance.json');
const HISTORY_PATH = path.join(SYNTH_DIR, 'history.jsonl');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgreementAnalysis {
  /** Elements all providers agree on */
  consensus: string[];
  /** Unique contributions from individual providers */
  uniqueInsights: Array<{ provider: string; insight: string }>;
  /** Points of disagreement between providers */
  contradictions: Array<{ providers: string[]; description: string }>;
  /** 0-1: how much providers agree */
  agreementScore: number;
}

export interface ProviderWeights {
  claude: number;
  codex: number;
  gemini: number;
}

export type SynthesisStrategy = 'consensus' | 'comparison' | 'human-review';

export interface SynthesisResult {
  /** Synthesis strategy used */
  strategy: SynthesisStrategy;
  /** The synthesized/merged output */
  synthesizedContent: string;
  /** Per-provider evaluation scores */
  evaluations: ResponseEvaluation[];
  /** Agreement analysis */
  agreement: AgreementAnalysis;
  /** Provider weights used */
  weights: ProviderWeights;
  /** Best individual provider */
  bestProvider: string;
  /** Timestamp */
  timestamp: string;
  /** Task type (if detected) */
  taskType?: string;
}

export interface PerformanceRecord {
  /** task type -> provider -> running average score */
  byTaskType: Record<string, Record<string, { avgScore: number; count: number }>>;
  /** Overall provider scores */
  overall: Record<string, { avgScore: number; count: number }>;
  /** Last updated */
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Task Type Detection (reuses codex-router patterns)
// ---------------------------------------------------------------------------

const TASK_TYPE_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'architecture', pattern: /아키텍처|설계|구조|architect|design/i },
  { type: 'refactoring', pattern: /리팩토링|refactor|재구조화/i },
  { type: 'security', pattern: /보안|security|인증|auth|취약/i },
  { type: 'migration', pattern: /마이그레이션|migration|호환성/i },
  { type: 'testing', pattern: /테스트|test|단위.*테스트|unit test/i },
  { type: 'implementation', pattern: /구현|implement|만들|추가/i },
  { type: 'debugging', pattern: /디버그|debug|에러|버그|bug/i },
  { type: 'documentation', pattern: /문서|docs|README|설명/i },
  { type: 'review', pattern: /리뷰|review|검토|분석/i },
  { type: 'visualization', pattern: /시각화|visual|차트|chart|그래프/i },
];

function detectTaskType(prompt: string): string {
  for (const { type, pattern } of TASK_TYPE_PATTERNS) {
    if (pattern.test(prompt)) return type;
  }
  return 'general';
}

// ---------------------------------------------------------------------------
// Provider Weight Calculation
// ---------------------------------------------------------------------------

/**
 * Task-type-based default weights.
 *
 * Codex excels at: test writing, batch patterns, type additions, lint fixes
 * Claude excels at: architecture, refactoring, security, migration
 * Gemini excels at: context window, documentation, visualization
 */
const DEFAULT_WEIGHTS: Record<string, ProviderWeights> = {
  architecture: { claude: 0.5, codex: 0.2, gemini: 0.3 },
  refactoring: { claude: 0.5, codex: 0.25, gemini: 0.25 },
  security: { claude: 0.5, codex: 0.25, gemini: 0.25 },
  migration: { claude: 0.45, codex: 0.25, gemini: 0.3 },
  testing: { claude: 0.25, codex: 0.5, gemini: 0.25 },
  implementation: { claude: 0.35, codex: 0.4, gemini: 0.25 },
  debugging: { claude: 0.4, codex: 0.35, gemini: 0.25 },
  documentation: { claude: 0.3, codex: 0.2, gemini: 0.5 },
  review: { claude: 0.4, codex: 0.3, gemini: 0.3 },
  visualization: { claude: 0.25, codex: 0.2, gemini: 0.55 },
  general: { claude: 0.4, codex: 0.3, gemini: 0.3 },
};

/**
 * Get task-type-specific provider weights.
 * Adjusts defaults based on historical performance data.
 */
export function getTaskWeights(taskType: string): ProviderWeights {
  const base = DEFAULT_WEIGHTS[taskType] ?? DEFAULT_WEIGHTS.general;
  const perf = loadPerformance();

  // If we have enough performance data, adjust weights
  const taskPerf = perf.byTaskType[taskType];
  if (!taskPerf) return { ...base };

  const providers = Object.keys(taskPerf);
  const hasEnoughData = providers.every(p => (taskPerf[p]?.count ?? 0) >= 3);
  if (!hasEnoughData) return { ...base };

  // Blend base weights with performance-based weights
  const totalScore = providers.reduce((sum, p) => sum + (taskPerf[p]?.avgScore ?? 0), 0);
  if (totalScore <= 0) return { ...base };

  const perfWeights: ProviderWeights = {
    claude: (taskPerf.claude?.avgScore ?? 0) / totalScore,
    codex: (taskPerf.codex?.avgScore ?? 0) / totalScore,
    gemini: (taskPerf.gemini?.avgScore ?? 0) / totalScore,
  };

  // 70% base + 30% performance (gradual adaptation)
  return {
    claude: base.claude * 0.7 + perfWeights.claude * 0.3,
    codex: base.codex * 0.7 + perfWeights.codex * 0.3,
    gemini: base.gemini * 0.7 + perfWeights.gemini * 0.3,
  };
}

// ---------------------------------------------------------------------------
// Agreement Analysis
// ---------------------------------------------------------------------------

/** Extract key sentences/points from a response */
function extractKeyPoints(response: string): string[] {
  const lines = response.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 15)
    .filter(l => !l.startsWith('```') && !l.startsWith('import '))
    .filter(l => !l.match(/^[-*]\s*$/));

  // Focus on list items and heading content
  const points: string[] = [];
  for (const line of lines) {
    // List items
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      points.push(line.replace(/^[-*\d.]+\s+/, '').trim());
    }
    // Headings
    else if (/^#+\s+/.test(line)) {
      points.push(line.replace(/^#+\s+/, '').trim());
    }
    // Significant sentences
    else if (line.length > 30 && line.endsWith('.')) {
      points.push(line);
    }
  }

  return points.length > 0 ? points : lines.slice(0, 10);
}

/** Simple word-based similarity between two strings */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Analyze agreement between multiple provider responses.
 */
export function analyzeAgreement(
  evaluations: ResponseEvaluation[],
): AgreementAnalysis {
  const validEvals = evaluations.filter(e => e.response.length > 0);

  if (validEvals.length < 2) {
    return {
      consensus: [],
      uniqueInsights: [],
      contradictions: [],
      agreementScore: validEvals.length === 1 ? 1 : 0,
    };
  }

  // Extract key points from each provider
  const providerPoints = new Map<string, string[]>();
  for (const ev of validEvals) {
    providerPoints.set(ev.provider, extractKeyPoints(ev.response));
  }

  const consensus: string[] = [];
  const uniqueInsights: Array<{ provider: string; insight: string }> = [];
  const contradictions: Array<{ providers: string[]; description: string }> = [];

  // Find consensus: points that appear (similar) in all responses
  const providers = Array.from(providerPoints.keys());
  const firstProvider = providers[0];
  const firstPoints = providerPoints.get(firstProvider) ?? [];

  for (const point of firstPoints) {
    const matchingProviders = [firstProvider];

    for (let i = 1; i < providers.length; i++) {
      const otherPoints = providerPoints.get(providers[i]) ?? [];
      const bestSim = Math.max(0, ...otherPoints.map(op => textSimilarity(point, op)));
      if (bestSim > 0.3) {
        matchingProviders.push(providers[i]);
      }
    }

    if (matchingProviders.length === providers.length) {
      consensus.push(point);
    }
  }

  // Find unique insights: points that only appear in one provider
  for (const [provider, points] of providerPoints) {
    const otherProviders = providers.filter(p => p !== provider);
    for (const point of points) {
      let isUnique = true;
      for (const otherProvider of otherProviders) {
        const otherPoints = providerPoints.get(otherProvider) ?? [];
        const bestSim = Math.max(0, ...otherPoints.map(op => textSimilarity(point, op)));
        if (bestSim > 0.25) {
          isUnique = false;
          break;
        }
      }
      if (isUnique && point.length > 20) {
        uniqueInsights.push({ provider, insight: point });
      }
    }
  }

  // Detect contradictions: look for opposing sentiments on same topic
  const negationPairs = [
    [/should/i, /should not|shouldn't/i],
    [/recommend/i, /not recommend|avoid/i],
    [/use/i, /don't use|avoid using/i],
    [/필요/i, /불필요|필요.*없/i],
    [/좋/i, /나쁘|좋지.*않/i],
  ];

  for (let i = 0; i < providers.length; i++) {
    for (let j = i + 1; j < providers.length; j++) {
      const respA = evaluations.find(e => e.provider === providers[i])?.response ?? '';
      const respB = evaluations.find(e => e.provider === providers[j])?.response ?? '';

      for (const [positive, negative] of negationPairs) {
        if (
          (positive.test(respA) && negative.test(respB)) ||
          (negative.test(respA) && positive.test(respB))
        ) {
          contradictions.push({
            providers: [providers[i], providers[j]],
            description: `Opposing views detected (${positive.source} vs ${negative.source})`,
          });
        }
      }
    }
  }

  // Calculate overall agreement score
  const pairwiseSimilarities: number[] = [];
  for (let i = 0; i < validEvals.length; i++) {
    for (let j = i + 1; j < validEvals.length; j++) {
      pairwiseSimilarities.push(
        textSimilarity(validEvals[i].response, validEvals[j].response)
      );
    }
  }

  const avgSimilarity = pairwiseSimilarities.length > 0
    ? pairwiseSimilarities.reduce((a, b) => a + b, 0) / pairwiseSimilarities.length
    : 0;

  // Adjust by consensus ratio
  const totalPoints = Array.from(providerPoints.values())
    .reduce((sum, pts) => sum + pts.length, 0);
  const consensusRatio = totalPoints > 0
    ? (consensus.length * providers.length) / totalPoints
    : 0;

  const agreementScore = Math.min(1, avgSimilarity * 0.6 + consensusRatio * 0.4);

  return {
    consensus: consensus.slice(0, 10),
    uniqueInsights: uniqueInsights.slice(0, 10),
    contradictions: contradictions.slice(0, 5),
    agreementScore,
  };
}

// ---------------------------------------------------------------------------
// Synthesis Strategy
// ---------------------------------------------------------------------------

function chooseSynthesisStrategy(agreementScore: number): SynthesisStrategy {
  if (agreementScore > 0.8) return 'consensus';
  if (agreementScore >= 0.4) return 'comparison';
  return 'human-review';
}

// ---------------------------------------------------------------------------
// Content Synthesis
// ---------------------------------------------------------------------------

function synthesizeConsensus(
  evaluations: ResponseEvaluation[],
  agreement: AgreementAnalysis,
  _weights: ProviderWeights,
): string {
  const best = evaluations.reduce((a, b) => a.overallScore > b.overallScore ? a : b);
  const parts: string[] = [];

  parts.push('## Synthesis Result (High Agreement)\n');

  if (agreement.consensus.length > 0) {
    parts.push('### Consensus Points');
    for (const point of agreement.consensus) {
      parts.push(`- ${point}`);
    }
    parts.push('');
  }

  parts.push('### Best Response');
  parts.push(`Provider: **${best.provider}** (score: ${(best.overallScore * 100).toFixed(0)}%)\n`);
  parts.push(best.response);

  if (agreement.uniqueInsights.length > 0) {
    parts.push('\n### Additional Insights');
    for (const { provider, insight } of agreement.uniqueInsights) {
      if (provider !== best.provider) {
        parts.push(`- [${provider}] ${insight}`);
      }
    }
  }

  return parts.join('\n');
}

function synthesizeComparison(
  evaluations: ResponseEvaluation[],
  agreement: AgreementAnalysis,
  weights: ProviderWeights,
): string {
  const parts: string[] = [];

  parts.push('## Synthesis Result (Structured Comparison)\n');
  parts.push(`Agreement level: ${(agreement.agreementScore * 100).toFixed(0)}%\n`);

  // Score table
  parts.push('### Provider Scores');
  parts.push('| Provider | Relevance | Completeness | Code Quality | Confidence | Overall |');
  parts.push('|----------|-----------|--------------|--------------|------------|---------|');
  for (const ev of evaluations) {
    if (ev.response.length === 0) continue;
    const s = ev.scores;
    parts.push(
      `| ${ev.provider} | ${(s.relevance * 100).toFixed(0)}% | ${(s.completeness * 100).toFixed(0)}% | ${(s.codeQuality * 100).toFixed(0)}% | ${(s.confidence * 100).toFixed(0)}% | **${(ev.overallScore * 100).toFixed(0)}%** |`
    );
  }
  parts.push('');

  if (agreement.consensus.length > 0) {
    parts.push('### Common Points');
    for (const point of agreement.consensus) {
      parts.push(`- ${point}`);
    }
    parts.push('');
  }

  if (agreement.contradictions.length > 0) {
    parts.push('### Points of Disagreement');
    for (const c of agreement.contradictions) {
      parts.push(`- ${c.providers.join(' vs ')}: ${c.description}`);
    }
    parts.push('');
  }

  // Individual responses (abbreviated)
  parts.push('### Individual Responses\n');
  const sorted = [...evaluations]
    .filter(e => e.response.length > 0)
    .sort((a, b) => b.overallScore - a.overallScore);

  for (const ev of sorted) {
    const weight = weights[ev.provider as keyof ProviderWeights] ?? 0;
    parts.push(`#### ${ev.provider} (score: ${(ev.overallScore * 100).toFixed(0)}%, weight: ${(weight * 100).toFixed(0)}%)`);
    // Show first 500 chars as preview
    const preview = ev.response.length > 500
      ? `${ev.response.slice(0, 500)}...\n\n*(truncated — full response available)*`
      : ev.response;
    parts.push(preview);
    parts.push('');
  }

  return parts.join('\n');
}

function synthesizeHumanReview(
  evaluations: ResponseEvaluation[],
  agreement: AgreementAnalysis,
): string {
  const parts: string[] = [];

  parts.push('## Synthesis Result (Low Agreement — Human Review Recommended)\n');
  parts.push(`Agreement level: ${(agreement.agreementScore * 100).toFixed(0)}% — responses diverge significantly.\n`);

  if (agreement.contradictions.length > 0) {
    parts.push('### Key Contradictions');
    for (const c of agreement.contradictions) {
      parts.push(`- ${c.providers.join(' vs ')}: ${c.description}`);
    }
    parts.push('');
  }

  parts.push('### All Responses (ranked by score)\n');
  const sorted = [...evaluations]
    .filter(e => e.response.length > 0)
    .sort((a, b) => b.overallScore - a.overallScore);

  for (const ev of sorted) {
    parts.push(`#### ${ev.provider} (score: ${(ev.overallScore * 100).toFixed(0)}%)`);
    if (ev.issues.length > 0) {
      parts.push(`Issues: ${ev.issues.join(', ')}`);
    }
    parts.push(ev.response);
    parts.push('');
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Main Synthesize Function
// ---------------------------------------------------------------------------

/**
 * Synthesize multiple provider responses into a single weighted result.
 *
 * @param responses - Provider responses from callAllProviders
 * @param prompt - Original user prompt
 * @param sessionId - Session ID for lab tracking (optional)
 * @returns SynthesisResult with evaluations, agreement, and synthesized content
 */
export function synthesize(
  responses: ProviderResponse[],
  prompt: string,
  sessionId?: string,
): SynthesisResult {
  const taskType = detectTaskType(prompt);
  const weights = getTaskWeights(taskType);

  // Filter to successful responses
  const validResponses = responses.filter(r => !r.error && r.content.length > 0);

  if (validResponses.length === 0) {
    return {
      strategy: 'human-review',
      synthesizedContent: 'No valid provider responses received.',
      evaluations: [],
      agreement: { consensus: [], uniqueInsights: [], contradictions: [], agreementScore: 0 },
      weights,
      bestProvider: 'none',
      timestamp: new Date().toISOString(),
      taskType,
    };
  }

  // Evaluate all responses
  const evaluations = evaluateAll(
    validResponses.map(r => ({
      provider: r.provider,
      response: r.content,
      latencyMs: r.latencyMs,
    })),
    prompt,
  );

  // Analyze agreement
  const agreement = analyzeAgreement(evaluations);

  // Choose synthesis strategy
  const strategy = chooseSynthesisStrategy(agreement.agreementScore);

  // Apply provider weights to overall scores
  for (const ev of evaluations) {
    const weight = weights[ev.provider as keyof ProviderWeights] ?? 0.33;
    ev.overallScore = ev.overallScore * (0.7 + weight * 0.6);
  }

  // Determine best provider
  const bestEval = evaluations.reduce((a, b) => a.overallScore > b.overallScore ? a : b);

  // Generate synthesized content
  let synthesizedContent: string;
  switch (strategy) {
    case 'consensus':
      synthesizedContent = synthesizeConsensus(evaluations, agreement, weights);
      break;
    case 'comparison':
      synthesizedContent = synthesizeComparison(evaluations, agreement, weights);
      break;
    case 'human-review':
      synthesizedContent = synthesizeHumanReview(evaluations, agreement);
      break;
  }

  const result: SynthesisResult = {
    strategy,
    synthesizedContent,
    evaluations,
    agreement,
    weights,
    bestProvider: bestEval.provider,
    timestamp: new Date().toISOString(),
    taskType,
  };

  // Record performance
  recordSynthesisResult(taskType, evaluations);

  // Track in lab
  if (sessionId) {
    track('synthesis', sessionId, {
      taskType,
      strategy,
      agreementScore: agreement.agreementScore,
      bestProvider: bestEval.provider,
      providerCount: evaluations.length,
      scores: Object.fromEntries(evaluations.map(e => [e.provider, e.overallScore])),
    });
  }

  // Append to history
  appendHistory(result, prompt);

  return result;
}

// ---------------------------------------------------------------------------
// Performance Tracking
// ---------------------------------------------------------------------------

function ensureSynthDir(): void {
  try {
    fs.mkdirSync(SYNTH_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

export function loadPerformance(): PerformanceRecord {
  try {
    if (fs.existsSync(PERFORMANCE_PATH)) {
      return JSON.parse(fs.readFileSync(PERFORMANCE_PATH, 'utf-8')) as PerformanceRecord;
    }
  } catch (e) {
    log.debug('Failed to read performance data', e);
  }
  return { byTaskType: {}, overall: {}, lastUpdated: new Date().toISOString() };
}

function savePerformance(data: PerformanceRecord): void {
  try {
    ensureSynthDir();
    const tmpFile = `${PERFORMANCE_PATH}.tmp.${process.pid}`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, PERFORMANCE_PATH);
  } catch (e) {
    log.debug('Failed to save performance data', e);
  }
}

/**
 * Record synthesis evaluation results for future weight optimization.
 */
export function recordSynthesisResult(
  taskType: string,
  evaluations: ResponseEvaluation[],
): void {
  try {
    const perf = loadPerformance();

    if (!perf.byTaskType[taskType]) {
      perf.byTaskType[taskType] = {};
    }

    for (const ev of evaluations) {
      // Update task-type specific
      const taskEntry = perf.byTaskType[taskType][ev.provider] ?? { avgScore: 0, count: 0 };
      taskEntry.avgScore = (taskEntry.avgScore * taskEntry.count + ev.overallScore) / (taskEntry.count + 1);
      taskEntry.count += 1;
      perf.byTaskType[taskType][ev.provider] = taskEntry;

      // Update overall
      const overallEntry = perf.overall[ev.provider] ?? { avgScore: 0, count: 0 };
      overallEntry.avgScore = (overallEntry.avgScore * overallEntry.count + ev.overallScore) / (overallEntry.count + 1);
      overallEntry.count += 1;
      perf.overall[ev.provider] = overallEntry;
    }

    perf.lastUpdated = new Date().toISOString();
    savePerformance(perf);
  } catch (e) {
    log.debug('Failed to record synthesis result', e);
  }
}

// ---------------------------------------------------------------------------
// History (append-only JSONL)
// ---------------------------------------------------------------------------

interface HistoryEntry {
  timestamp: string;
  prompt: string;
  taskType: string;
  strategy: SynthesisStrategy;
  agreementScore: number;
  bestProvider: string;
  providerScores: Record<string, number>;
}

function appendHistory(result: SynthesisResult, prompt: string): void {
  try {
    ensureSynthDir();
    const entry: HistoryEntry = {
      timestamp: result.timestamp,
      prompt: prompt.slice(0, 200),
      taskType: result.taskType ?? 'general',
      strategy: result.strategy,
      agreementScore: result.agreement.agreementScore,
      bestProvider: result.bestProvider,
      providerScores: Object.fromEntries(
        result.evaluations.map(e => [e.provider, e.overallScore])
      ),
    };
    fs.appendFileSync(HISTORY_PATH, `${JSON.stringify(entry)}\n`);
  } catch (e) {
    log.debug('Failed to append history', e);
  }
}

export function readHistory(limit = 20): HistoryEntry[] {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return [];
    const content = fs.readFileSync(HISTORY_PATH, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const entries: HistoryEntry[] = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as HistoryEntry);
      } catch {
        // Skip malformed lines
      }
    }

    return entries.slice(-limit);
  } catch (e) {
    log.debug('Failed to read history', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// CLI Handlers
// ---------------------------------------------------------------------------

const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

/** CLI: tenetx synth status */
function showStatus(): void {
  const perf = loadPerformance();
  console.log('\n  Tenetx Synth -- Provider Performance\n');

  if (Object.keys(perf.overall).length === 0) {
    console.log('  No synthesis data yet. Use `tenetx ask --all` or `--compare` to generate data.\n');
    return;
  }

  console.log(`  ${BOLD}Overall Provider Scores${RST}\n`);
  console.log(`  ${padRight('Provider', 12)} ${padRight('Avg Score', 12)} ${padRight('Syntheses', 12)}`);
  console.log(`  ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(12)}`);

  const sortedProviders = Object.entries(perf.overall)
    .sort(([, a], [, b]) => b.avgScore - a.avgScore);

  for (const [provider, data] of sortedProviders) {
    const scoreStr = `${(data.avgScore * 100).toFixed(1)}%`;
    console.log(`  ${padRight(provider, 12)} ${GREEN}${padRight(scoreStr, 12)}${RST} ${padLeft(String(data.count), 8)}`);
  }

  console.log(`\n  ${DIM}Last updated: ${perf.lastUpdated}${RST}\n`);
}

/** CLI: tenetx synth weights */
function showWeights(): void {
  console.log('\n  Tenetx Synth -- Task-Type Weights\n');

  const perf = loadPerformance();
  const taskTypes = Object.keys(DEFAULT_WEIGHTS);

  console.log(`  ${padRight('Task Type', 18)} ${padRight('Claude', 10)} ${padRight('Codex', 10)} ${padRight('Gemini', 10)} ${padRight('Data', 6)}`);
  console.log(`  ${'-'.repeat(18)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(6)}`);

  for (const taskType of taskTypes) {
    const weights = getTaskWeights(taskType);
    const hasData = !!perf.byTaskType[taskType];
    const dataLabel = hasData ? `${CYAN}yes${RST}` : `${DIM}no${RST}`;

    console.log(
      `  ${padRight(taskType, 18)} ${padRight(`${(weights.claude * 100).toFixed(0)}%`, 10)} ${padRight(`${(weights.codex * 100).toFixed(0)}%`, 10)} ${padRight(`${(weights.gemini * 100).toFixed(0)}%`, 10)} ${dataLabel}`
    );
  }

  console.log(`\n  ${DIM}Weights adapt based on historical performance data.${RST}\n`);
}

/** CLI: tenetx synth history */
function showHistory(): void {
  console.log('\n  Tenetx Synth -- Recent Synthesis History\n');

  const history = readHistory(15);

  if (history.length === 0) {
    console.log('  No synthesis history yet.\n');
    return;
  }

  console.log(`  ${padRight('Time', 22)} ${padRight('Task', 16)} ${padRight('Strategy', 14)} ${padRight('Agreement', 12)} ${padRight('Best', 10)}`);
  console.log(`  ${'-'.repeat(22)} ${'-'.repeat(16)} ${'-'.repeat(14)} ${'-'.repeat(12)} ${'-'.repeat(10)}`);

  for (const entry of history.reverse()) {
    const time = entry.timestamp.replace('T', ' ').slice(0, 19);
    const task = padRight(entry.taskType.slice(0, 15), 16);
    const strategy = padRight(entry.strategy, 14);
    const agreement = `${(entry.agreementScore * 100).toFixed(0)}%`;
    const best = padRight(entry.bestProvider, 10);

    const stratColor = entry.strategy === 'consensus' ? GREEN
      : entry.strategy === 'comparison' ? YELLOW : '\x1b[31m';

    console.log(`  ${DIM}${time}${RST} ${task} ${stratColor}${strategy}${RST} ${padLeft(agreement, 10)}   ${best}`);
  }

  console.log();
}

/** CLI entry point: tenetx synth */
export async function handleSynth(args: string[]): Promise<void> {
  const sub = args[0] ?? 'status';

  switch (sub) {
    case 'status':
      showStatus();
      break;
    case 'weights':
      showWeights();
      break;
    case 'history':
      showHistory();
      break;
    case '--help':
    case '-h':
      printSynthHelp();
      break;
    default:
      console.log(`  Unknown synth subcommand: ${sub}`);
      console.log('  Run "tenetx synth --help" for usage.\n');
  }
}

function printSynthHelp(): void {
  console.log(`
  Tenetx Synth -- Multi-Model Synthesis Engine

  Usage:
    tenetx synth                Show provider performance stats
    tenetx synth status         Show provider performance stats
    tenetx synth weights        Show current task-type weights
    tenetx synth history        Show recent synthesis results

  Integration:
    tenetx ask --all "question"     Calls all providers + synthesizes
    tenetx ask --compare "question" Calls all providers + shows evaluation

  Storage:
    ~/.compound/synth/performance.json  Provider performance by task type
    ~/.compound/synth/history.jsonl     Recent synthesis results
`);
}
