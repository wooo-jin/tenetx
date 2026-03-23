/**
 * Tenetx — Heuristic Response Evaluator
 *
 * Fast, LLM-free quality evaluation of provider responses.
 * Scores responses on relevance, completeness, code quality, and confidence
 * using pure heuristic analysis (string patterns, structure checks).
 */

import { debugLog } from '../core/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResponseScores {
  /** 0-1: how well the response addresses the task */
  relevance: number;
  /** 0-1: covers all aspects of the question */
  completeness: number;
  /** 0-1: code quality (syntax, patterns) — only meaningful for code responses */
  codeQuality: number;
  /** 0-1: self-assessed certainty (absence of hedging) */
  confidence: number;
}

export interface ResponseEvaluation {
  provider: string;
  response: string;
  scores: ResponseScores;
  /** Weighted composite score */
  overallScore: number;
  /** Whether the response contains code blocks */
  isCodeResponse: boolean;
  /** Detected quality issues */
  issues: string[];
}

// ---------------------------------------------------------------------------
// Hedging / Uncertainty Markers
// ---------------------------------------------------------------------------

const HEDGING_PATTERNS = [
  /I'm not sure/i,
  /I'm not certain/i,
  /I don't know/i,
  /maybe/i,
  /perhaps/i,
  /might be/i,
  /could be/i,
  /not entirely/i,
  /I think/i,
  /잘 모르겠/,
  /확실하지 않/,
  /아마도/,
  /일수도/,
  /것 같기도/,
];

const ERROR_MARKERS = [
  /error/i,
  /rate limit/i,
  /api.*error/i,
  /timed?\s*out/i,
  /truncat/i,
  /no response/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /429/,
  /500/,
  /503/,
];

const REPETITION_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Code Quality Checks
// ---------------------------------------------------------------------------

/** Check if brackets/braces/parens are balanced */
function checkBracketBalance(text: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';

    // Skip escaped characters
    if (prev === '\\') continue;

    // Track string literals
    if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (inString && ch === stringChar) {
      inString = false;
      continue;
    }
    if (inString) continue;

    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
    } else if (ch in pairs) {
      if (stack.length === 0 || stack[stack.length - 1] !== pairs[ch]) {
        return false;
      }
      stack.pop();
    }
  }

  return stack.length === 0;
}

/** Extract code blocks from markdown */
function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```[\s\S]*?```/g;
  let match = regex.exec(text);
  while (match !== null) {
    blocks.push(match[0]);
    match = regex.exec(text);
  }
  return blocks;
}

/** Check for repetition/looping in response */
function detectRepetition(text: string): boolean {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 20);
  if (lines.length < 6) return false;

  const freq = new Map<string, number>();
  for (const line of lines) {
    freq.set(line, (freq.get(line) ?? 0) + 1);
  }

  for (const count of freq.values()) {
    if (count >= REPETITION_THRESHOLD) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scoring Functions
// ---------------------------------------------------------------------------

/** Score code response quality (heuristic) */
function scoreCodeQuality(response: string): { score: number; issues: string[] } {
  const codeBlocks = extractCodeBlocks(response);
  const issues: string[] = [];

  if (codeBlocks.length === 0) {
    return { score: 0.5, issues }; // No code blocks but might be text-only
  }

  let score = 0.7; // Base score for having code

  // Check that all code blocks are properly closed
  const openCount = (response.match(/```/g) ?? []).length;
  if (openCount % 2 !== 0) {
    score -= 0.2;
    issues.push('Unclosed code block');
  }

  // Check bracket balance in code blocks
  for (const block of codeBlocks) {
    if (!checkBracketBalance(block)) {
      score -= 0.15;
      issues.push('Unbalanced brackets in code');
      break;
    }
  }

  // Check for import/export patterns (indicates complete file)
  const hasImports = /import\s+/m.test(response);
  const hasExports = /export\s+/m.test(response);
  if (hasImports || hasExports) {
    score += 0.1;
  }

  // Check for reasonable code length (not truncated)
  const totalCodeLength = codeBlocks.reduce((sum, b) => sum + b.length, 0);
  if (totalCodeLength > 50) {
    score += 0.05;
  }
  if (totalCodeLength < 20 && codeBlocks.length > 0) {
    score -= 0.1;
    issues.push('Very short code block (possibly truncated)');
  }

  return { score: Math.max(0, Math.min(1, score)), issues };
}

/** Score relevance to the original prompt */
function scoreRelevance(response: string, prompt: string): number {
  if (!response || response.length < 10) return 0;

  // Extract significant words from prompt (3+ chars, no stop words)
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'for', 'with',
    'from', 'into', 'that', 'this', 'what', 'how', 'why', 'when',
    'where', 'which', 'who', 'whom',
  ]);

  const promptWords = prompt.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  if (promptWords.length === 0) return 0.5;

  const responseLower = response.toLowerCase();
  let found = 0;
  for (const word of promptWords) {
    if (responseLower.includes(word)) found++;
  }

  // Keyword overlap ratio
  const ratio = found / promptWords.length;
  return Math.min(1, ratio * 1.2); // Slight boost since not all words need exact match
}

/** Score completeness based on response structure */
function scoreCompleteness(response: string, prompt: string): number {
  if (!response || response.length < 20) return 0;

  let score = 0.4; // Base score

  // Length relative to question complexity
  const promptLength = prompt.length;
  const responseLength = response.length;

  if (promptLength > 200 && responseLength < 100) {
    score -= 0.2; // Short answer to complex question
  } else if (responseLength > promptLength * 0.5) {
    score += 0.1;
  }

  // Has structure (headings, lists, paragraphs)
  const hasHeadings = /^#+\s/m.test(response);
  const hasLists = /^[\s]*[-*]\s/m.test(response) || /^\d+\.\s/m.test(response);
  const hasParagraphs = (response.match(/\n\n/g) ?? []).length >= 2;

  if (hasHeadings) score += 0.1;
  if (hasLists) score += 0.1;
  if (hasParagraphs) score += 0.05;

  // Has code blocks when question seems to ask for code
  const asksForCode = /코드|code|구현|implement|작성|write|함수|function|예시|example/i.test(prompt);
  const hasCode = extractCodeBlocks(response).length > 0;
  if (asksForCode && hasCode) score += 0.15;
  if (asksForCode && !hasCode) score -= 0.1;

  // Multiple sections/points covered
  const sectionCount = (response.match(/^#+\s/gm) ?? []).length;
  if (sectionCount >= 2) score += 0.1;

  return Math.max(0, Math.min(1, score));
}

/** Score confidence (inverse of hedging) */
function scoreConfidence(response: string): { score: number; issues: string[] } {
  if (!response || response.length < 20) return { score: 0, issues: ['Empty or very short response'] };

  const issues: string[] = [];
  let hedgingCount = 0;

  for (const pattern of HEDGING_PATTERNS) {
    const matches = response.match(new RegExp(pattern.source, `${pattern.flags}g`));
    if (matches) hedgingCount += matches.length;
  }

  // Check for error markers
  let hasErrors = false;
  for (const pattern of ERROR_MARKERS) {
    if (pattern.test(response)) {
      hasErrors = true;
      issues.push('Contains error markers');
      break;
    }
  }

  // Check for repetition
  if (detectRepetition(response)) {
    issues.push('Repetitive content detected');
  }

  let score = 1.0;

  // Penalize hedging
  const hedgingRatio = hedgingCount / Math.max(1, response.split(/\s+/).length);
  score -= Math.min(0.4, hedgingRatio * 20);

  // Penalize errors
  if (hasErrors) score -= 0.3;

  // Penalize repetition
  if (detectRepetition(response)) score -= 0.2;

  return { score: Math.max(0, Math.min(1, score)), issues };
}

// ---------------------------------------------------------------------------
// Main Evaluation Function
// ---------------------------------------------------------------------------

/**
 * Evaluate a provider response using heuristics (no LLM calls).
 *
 * @param provider - Provider name
 * @param response - Response content
 * @param prompt - Original prompt/question
 * @param latencyMs - Response time in milliseconds
 * @returns ResponseEvaluation with scores and issues
 */
export function evaluateResponse(
  provider: string,
  response: string,
  prompt: string,
  latencyMs?: number,
): ResponseEvaluation {
  const issues: string[] = [];

  // Detect if code response
  const codeBlocks = extractCodeBlocks(response);
  const isCodeResponse = codeBlocks.length > 0;

  // Score each axis
  const relevance = scoreRelevance(response, prompt);
  const completeness = scoreCompleteness(response, prompt);
  const { score: codeQuality, issues: codeIssues } = scoreCodeQuality(response);
  const { score: confidence, issues: confIssues } = scoreConfidence(response);

  issues.push(...codeIssues, ...confIssues);

  // Latency-based minor adjustment
  if (latencyMs !== undefined && latencyMs > 60_000) {
    issues.push('Very slow response (>60s)');
  }

  // Empty/error response
  if (!response || response.trim().length === 0) {
    return {
      provider,
      response,
      scores: { relevance: 0, completeness: 0, codeQuality: 0, confidence: 0 },
      overallScore: 0,
      isCodeResponse: false,
      issues: ['Empty response'],
    };
  }

  const scores: ResponseScores = { relevance, completeness, codeQuality, confidence };

  // Weighted composite
  const weights = isCodeResponse
    ? { relevance: 0.25, completeness: 0.25, codeQuality: 0.30, confidence: 0.20 }
    : { relevance: 0.30, completeness: 0.35, codeQuality: 0.05, confidence: 0.30 };

  const overallScore =
    scores.relevance * weights.relevance +
    scores.completeness * weights.completeness +
    scores.codeQuality * weights.codeQuality +
    scores.confidence * weights.confidence;

  debugLog('evaluator', `${provider}: rel=${relevance.toFixed(2)} comp=${completeness.toFixed(2)} code=${codeQuality.toFixed(2)} conf=${confidence.toFixed(2)} => ${overallScore.toFixed(2)}`);

  return {
    provider,
    response,
    scores,
    overallScore: Math.max(0, Math.min(1, overallScore)),
    isCodeResponse,
    issues,
  };
}

/**
 * Evaluate multiple provider responses.
 */
export function evaluateAll(
  responses: Array<{ provider: string; response: string; latencyMs?: number }>,
  prompt: string,
): ResponseEvaluation[] {
  return responses.map(r =>
    evaluateResponse(r.provider, r.response, prompt, r.latencyMs)
  );
}
