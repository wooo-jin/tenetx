/**
 * Tenetx Orchestration — Contextual Bandit (Factored Beta-TS)
 *
 * 에이전트별 독립 Beta 분포로 포함/제외를 학습.
 * context를 양자화하여 arm 수를 제한하고, cold start는 epsilon-greedy로 처리.
 *
 * 설계 결정:
 *   - Factored Bandit (Kveton et al., 2015): 2^10 조합 → 에이전트별 독립 학습
 *   - Beta-Bernoulli Thompson Sampling: 성공/실패 카운트 기반, 구현 단순
 *   - Cold start: decisions < 30이면 100% fallback, 30-100이면 epsilon-greedy(0.3)
 *   - 상태 persist: ~/.compound/lab/bandit-state.json
 *   - LLM 호출 0, 외부 의존성 0
 *
 * arm 수 (Rev 2 보정):
 *   ~30 arm (카테고리별). Factored 접근으로 실질 수렴은 에이전트당 10 trials.
 *   게이트: 200+ 결정 또는 에이전트당 5+ trials.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { safeReadJSON, atomicWriteJSON } from '../hooks/shared/atomic-write.js';
import type { TaskCategory } from '../engine/signals.js';

// ── Types ──────────────────────────────────────────

export interface BetaParams {
  alpha: number; // 성공 카운트 + prior
  beta: number;  // 실패 카운트 + prior
}

export interface AgentArm {
  /** 에이전트 이름 */
  agentName: string;
  /** context hash → Beta 파라미터 */
  contexts: Record<string, BetaParams>;
}

export interface BanditState {
  agents: Record<string, AgentArm>;
  totalDecisions: number;
  lastUpdated: string;
}

export interface BanditContext {
  taskCategory: TaskCategory;
  qualityFocus: 'low' | 'mid' | 'high';
  riskTolerance: 'low' | 'mid' | 'high';
}

export interface BanditDecision {
  includedAgents: string[];
  source: 'fallback' | 'epsilon-explore' | 'thompson';
  confidence: number;
}

// ── Constants ──────────────────────────────────────

const STATE_PATH = path.join(os.homedir(), '.compound', 'lab', 'bandit-state.json');

/** 카테고리별 후보 에이전트 (executor는 항상 포함) */
const CANDIDATE_AGENTS: Record<string, string[]> = {
  'implement': ['architect', 'test-engineer', 'code-reviewer'],
  'architect': ['critic'],
  'debug-complex': ['debugger', 'test-engineer'],
  'code-review': ['security-reviewer', 'performance-reviewer'],
  'analysis': ['critic'],
  'design': ['architect', 'critic'],
  'explore': [],
  'file-search': [],
  'simple-qa': [],
};

/** 사전 지식 기반 초기 prior (informative) */
const PRIOR_ALPHA: Record<string, Record<string, number>> = {
  'code-reviewer': { 'high': 3, 'mid': 2, 'low': 1 },  // qualityFocus 기반
  'security-reviewer': { 'low': 3, 'mid': 1, 'high': 1 }, // riskTolerance 기반 (반전)
  'test-engineer': { 'high': 3, 'mid': 2, 'low': 1 },
  'architect': { 'high': 2, 'mid': 2, 'low': 1 },
};

const COLD_START_THRESHOLD = 30;
const WARM_THRESHOLD = 100;
const EPSILON = 0.3;

// ── Context Quantization ───────────────────────────

/** 연속값을 3-bin으로 양자화 */
export function quantize(value: number): 'low' | 'mid' | 'high' {
  if (value < 0.4) return 'low';
  if (value > 0.6) return 'high';
  return 'mid';
}

/** 컨텍스트를 해시 문자열로 변환 */
export function hashContext(ctx: BanditContext): string {
  return `${ctx.taskCategory}:${ctx.qualityFocus}:${ctx.riskTolerance}`;
}

// ── Beta-Thompson Sampling ─────────────────────────

/** Beta 분포에서 샘플링 (Marsaglia & Tsang's method via Gamma decomposition) */
export function sampleBeta(alpha: number, beta: number): number {
  // 간단한 근사: alpha, beta가 충분히 크면 정규 근사 사용
  if (alpha <= 0) alpha = 1;
  if (beta <= 0) beta = 1;

  // Gamma 함수 기반 Beta 샘플링
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

/** Gamma(shape, 1) 분포 샘플링 (Marsaglia & Tsang) */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Box-Muller 정규분포 샘플링 (u1 > 0 보장으로 log(0) 방지) */
function randn(): number {
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── State Management ───────────────────────────────

export function loadBanditState(): BanditState {
  const state = safeReadJSON<BanditState | null>(STATE_PATH, null);
  if (state && state.agents) return state;
  return { agents: {}, totalDecisions: 0, lastUpdated: new Date().toISOString() };
}

export function saveBanditState(state: BanditState): void {
  state.lastUpdated = new Date().toISOString();
  atomicWriteJSON(STATE_PATH, state, { pretty: true });
}

/** 에이전트의 특정 context에 대한 Beta 파라미터 조회 (없으면 prior 생성) */
function getOrCreateParams(
  state: BanditState,
  agentName: string,
  contextHash: string,
  ctx: BanditContext,
): BetaParams {
  if (!state.agents[agentName]) {
    state.agents[agentName] = { agentName, contexts: {} };
  }
  if (!state.agents[agentName].contexts[contextHash]) {
    // Informative prior: 차원 값 기반
    const priorMap = PRIOR_ALPHA[agentName];
    const priorAlpha = priorMap
      ? (priorMap[ctx.qualityFocus] ?? 1)
      : 1;
    state.agents[agentName].contexts[contextHash] = { alpha: priorAlpha, beta: 1 };
  }
  return state.agents[agentName].contexts[contextHash];
}

// ── Decision Making ────────────────────────────────

/**
 * 컨텍스트 기반 에이전트 포함 결정.
 *
 * Cold start 전략:
 *   - < 30 decisions: 100% fallback (pipeline-recommender 사용)
 *   - 30-100: epsilon-greedy (ε=0.3으로 30% 탐색)
 *   - 100+: Thompson Sampling (완전 전환)
 */
export function selectAgents(
  ctx: BanditContext,
  state: BanditState,
): BanditDecision {
  const candidates = CANDIDATE_AGENTS[ctx.taskCategory] ?? [];
  if (candidates.length === 0) {
    return { includedAgents: [], source: 'fallback', confidence: 1.0 };
  }

  const contextHash = hashContext(ctx);

  // Cold start: fallback
  if (state.totalDecisions < COLD_START_THRESHOLD) {
    return {
      includedAgents: candidates,
      source: 'fallback',
      confidence: 0.3,
    };
  }

  // Epsilon-greedy 탐색
  if (state.totalDecisions < WARM_THRESHOLD && Math.random() < EPSILON) {
    // 랜덤 부분집합 선택
    const included = candidates.filter(() => Math.random() > 0.5);
    return {
      includedAgents: included.length > 0 ? included : [candidates[0]],
      source: 'epsilon-explore',
      confidence: 0.4,
    };
  }

  // Thompson Sampling
  const included: string[] = [];
  for (const agent of candidates) {
    const params = getOrCreateParams(state, agent, contextHash, ctx);
    const sample = sampleBeta(params.alpha, params.beta);
    if (sample > 0.5) {
      included.push(agent);
    }
  }

  return {
    includedAgents: included,
    source: 'thompson',
    confidence: Math.min(0.9, 0.5 + state.totalDecisions / 500),
  };
}

/**
 * 결정 결과 피드백 (reward 기반 Beta 업데이트)
 *
 * @param ctx 결정 시점의 컨텍스트
 * @param includedAgents 포함된 에이전트 목록
 * @param reward 0-1 세션 보상
 */
export function updateBandit(
  ctx: BanditContext,
  includedAgents: string[],
  reward: number,
  state: BanditState,
): void {
  const contextHash = hashContext(ctx);
  const candidates = CANDIDATE_AGENTS[ctx.taskCategory] ?? [];
  const success = reward >= 0.5; // 이진화

  for (const agent of candidates) {
    const params = getOrCreateParams(state, agent, contextHash, ctx);
    const wasIncluded = includedAgents.includes(agent);

    if (wasIncluded && success) {
      params.alpha += 1; // 포함 + 성공 → 이 에이전트가 기여함 (필요 증거)
    } else if (wasIncluded && !success) {
      params.beta += 1;  // 포함 + 실패 → 이 에이전트가 도움 안 됨 (불필요 증거)
    } else if (!wasIncluded && success) {
      // 미포함 + 성공 → 이 에이전트 없이도 성공 → 불필요 증거 (약한 beta 증가)
      params.beta += 0.3;
    } else {
      // 미포함 + 실패 → 이 에이전트가 필요했을 수 있음 → 필요 증거 (약한 alpha 증가)
      params.alpha += 0.3;
    }
  }

  state.totalDecisions += 1;
  // persist는 caller 책임 — batch update 시 saveBanditState()를 마지막에 1회 호출
}

// ── Diagnostics ────────────────────────────────────

/** 현재 bandit 상태 요약 */
export function getBanditSummary(state: BanditState): string {
  const lines: string[] = [`  ── Contextual Bandit ──────────────────`];
  lines.push(`  Total decisions: ${state.totalDecisions}`);

  const phase = state.totalDecisions < COLD_START_THRESHOLD ? 'Cold Start (fallback)'
    : state.totalDecisions < WARM_THRESHOLD ? `Warming Up (epsilon-greedy, ε=${EPSILON})`
    : 'Thompson Sampling (exploitation)';
  lines.push(`  Phase: ${phase}`);

  for (const [name, arm] of Object.entries(state.agents)) {
    const ctxCount = Object.keys(arm.contexts).length;
    const totalTrials = Object.values(arm.contexts)
      .reduce((sum, p) => sum + p.alpha + p.beta - 2, 0); // subtract prior
    lines.push(`  ${name.padEnd(22)} contexts: ${ctxCount}, trials: ${Math.round(totalTrials)}`);
  }

  return lines.join('\n');
}
