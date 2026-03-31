/**
 * Tenetx Forge — OPRO-style Prompt Optimizer (Forge v2)
 *
 * philosophy-tuner의 하드코딩 문자열 대신 LLM이 생성한
 * 프롬프트 후보를 관리하고, 보상 기반으로 최적 후보를 선택합니다.
 *
 * 학술 근거:
 * - OPRO (Yang et al., Google DeepMind, ICLR 2024): LLM as Optimizer
 * - DSPy MIPROv2: Bayesian Optimization for prompt tuning
 *
 * 실행 모드: 오프라인 (`tenetx forge optimize` CLI 명령)
 * LLM 호출 실패 시 기존 philosophy-tuner.ts가 fallback으로 동작합니다.
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';

const log = createLogger('opro-tuner');

const OPRO_STATE_PATH = path.join(os.homedir(), '.compound', 'lab', 'opro-state.json');

// ── Types ──

/** 프롬프트 후보 */
export interface PromptCandidate {
  id: string;
  /** 이 후보가 적용되는 차원 범위 */
  dimensionRange: Record<string, { min: number; max: number }>;
  /** 원칙 이름 (philosophy-tuner의 원칙 키) */
  principleName: string;
  /** 생성된 텍스트 */
  text: string;
  /** 생성 항목 (generates 배열) */
  generates: string[];
  /** 보상 점수 이력 */
  rewardHistory: number[];
  /** 평균 보상 */
  avgReward: number;
  /** LLM에 의해 생성됨 여부 */
  llmGenerated: boolean;
  createdAt: string;
}

/** OPRO 전체 상태 */
export interface OPROState {
  /** 원칙별 후보 풀 */
  candidates: Record<string, PromptCandidate[]>;
  /** 최적화 사이클 수 */
  optimizationCycles: number;
  lastOptimized: string;
}

// ── Initialization ──

export function initOPROState(): OPROState {
  return {
    candidates: {},
    optimizationCycles: 0,
    lastOptimized: new Date().toISOString(),
  };
}

// ── Candidate Management ──

/** 기존 하드코딩 원칙을 후보로 등록 (seed candidates) */
export function seedCandidate(
  state: OPROState,
  principleName: string,
  text: string,
  generates: string[],
  dimensionRange: Record<string, { min: number; max: number }>,
): void {
  if (!state.candidates[principleName]) {
    state.candidates[principleName] = [];
  }

  // 중복 방지
  const existing = state.candidates[principleName];
  if (existing.some(c => c.text === text)) return;

  existing.push({
    id: `seed-${principleName}-${existing.length}`,
    dimensionRange,
    principleName,
    text,
    generates,
    rewardHistory: [],
    avgReward: 0.5, // 중립 초기값
    llmGenerated: false,
    createdAt: new Date().toISOString(),
  });
}

/** 보상 기록 추가 */
export function recordCandidateReward(
  state: OPROState,
  principleName: string,
  candidateId: string,
  reward: number,
): boolean {
  const candidates = state.candidates[principleName];
  if (!candidates) return false;

  const candidate = candidates.find(c => c.id === candidateId);
  if (!candidate) return false;

  candidate.rewardHistory.push(reward);
  // 상한 50개 유지 (JSON 직렬화 크기 제한). 이동 평균은 최근 20개 사용.
  if (candidate.rewardHistory.length > 50) {
    candidate.rewardHistory = candidate.rewardHistory.slice(-50);
  }
  const recent = candidate.rewardHistory.slice(-20);
  candidate.avgReward = recent.reduce((a, b) => a + b, 0) / recent.length;
  return true;
}

/**
 * 현재 차원값에 가장 적합한 최적 후보를 반환합니다.
 * 해당 범위에 후보가 없거나 데이터 부족이면 null (→ fallback).
 */
export function selectBestCandidate(
  state: OPROState,
  principleName: string,
  currentDimensions: Record<string, number>,
): PromptCandidate | null {
  const candidates = state.candidates[principleName];
  if (!candidates || candidates.length === 0) return null;

  // 현재 차원값에 매칭되는 후보 필터
  const matching = candidates.filter(c => {
    for (const [dim, range] of Object.entries(c.dimensionRange)) {
      const value = currentDimensions[dim] ?? 0.5;
      if (value < range.min || value > range.max) return false;
    }
    return true;
  });

  if (matching.length === 0) return null;

  // 보상 이력이 3개 이상인 후보 중 최고 평균 보상
  const proven = matching.filter(c => c.rewardHistory.length >= 3);
  if (proven.length === 0) return null;

  proven.sort((a, b) => b.avgReward - a.avgReward);
  return proven[0];
}

/** 낮은 보상 후보 정리 (bottom 20%) */
export function pruneCandidates(state: OPROState): number {
  let pruned = 0;
  for (const [principle, candidates] of Object.entries(state.candidates)) {
    if (candidates.length <= 3) continue; // 최소 3개 유지

    const proven = candidates.filter(c => c.rewardHistory.length >= 5);
    if (proven.length <= 3) continue;

    proven.sort((a, b) => a.avgReward - b.avgReward);
    const cutoff = Math.floor(proven.length * 0.2);
    const toRemove = new Set(proven.slice(0, cutoff).map(c => c.id));

    state.candidates[principle] = candidates.filter(c => !toRemove.has(c.id));
    pruned += toRemove.size;
  }
  return pruned;
}

/**
 * OPRO 메타 프롬프트 생성 (LLM에 전달할 컨텍스트).
 * 상위 K개 후보와 보상을 포함합니다.
 */
export function buildMetaPrompt(
  state: OPROState,
  principleName: string,
  currentDimensions: Record<string, number>,
  topK: number = 5,
): string {
  const candidates = state.candidates[principleName] ?? [];
  // 오름차순 정렬 (OPRO 논문, Yang et al. 2024):
  // LLM의 recency bias를 활용하여 최고 점수 후보가 마지막에 오도록
  const sorted = [...candidates]
    .filter(c => c.rewardHistory.length >= 1)
    .sort((a, b) => a.avgReward - b.avgReward)
    .slice(-topK);

  const lines = [
    `# Prompt Optimization for "${principleName}"`,
    '',
    '## Current Dimension Values:',
    ...Object.entries(currentDimensions).map(([k, v]) => `- ${k}: ${v.toFixed(2)}`),
    '',
    '## Top Performing Prompts (sorted by reward):',
  ];

  for (const c of sorted) {
    lines.push(`### Score: ${c.avgReward.toFixed(3)} (n=${c.rewardHistory.length})`);
    lines.push(`Text: "${c.text}"`);
    lines.push(`Generates: ${JSON.stringify(c.generates)}`);
    lines.push('');
  }

  lines.push('## Task:');
  lines.push('Generate a new, better prompt text and generates list that would score higher.');
  lines.push('The prompt should be specific, actionable, and tailored to the dimension values above.');
  lines.push('Output JSON: { "text": "...", "generates": ["...", "..."] }');

  return lines.join('\n');
}

// ── Persistence ──

export function loadOPROState(): OPROState | null {
  return safeReadJSON<OPROState | null>(OPRO_STATE_PATH, null);
}

export function saveOPROState(state: OPROState): void {
  try {
    atomicWriteJSON(OPRO_STATE_PATH, state, { pretty: true });
  } catch (e) {
    log.debug('OPRO state 저장 실패', e);
  }
}
