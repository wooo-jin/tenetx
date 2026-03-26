/**
 * Tenetx — Token & Cost Tracker
 *
 * 도구 호출 시 토큰 사용량을 근사 추적하고 모델별 비용을 추정합니다.
 * PostToolUse 훅에서 호출되어 세션별 누적 데이터를 기록합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';

const log = createLogger('token-tracker');

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');

/** 모델별 가격표 ($/1M tokens, 2025 기준) */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  haiku:  { input: 0.25, output: 1.25 },
  sonnet: { input: 3.00, output: 15.00 },
  opus:   { input: 15.00, output: 75.00 },
};

/** 문자 → 토큰 근사 변환 (영문 ~4자/토큰, 한글 ~2자/토큰 평균) */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 한글 비율 추정
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) ?? []).length;
  const otherChars = text.length - koreanChars;
  return Math.ceil(koreanChars / 2 + otherChars / 4);
}

export interface TokenUsage {
  sessionId: string;
  /** 누적 입력 토큰 (근사) */
  inputTokens: number;
  /** 누적 출력 토큰 (근사) */
  outputTokens: number;
  /** 도구 호출 횟수 */
  toolCalls: number;
  /** 모델별 토큰 분배 */
  byModel: Record<string, { input: number; output: number; calls: number }>;
  /** 추정 비용 ($) */
  estimatedCost: number;
  /** 마지막 업데이트 */
  updatedAt: string;
}

function getUsagePath(sessionId: string): string {
  return path.join(STATE_DIR, `token-usage-${sessionId}.json`);
}

export function loadTokenUsage(sessionId: string): TokenUsage {
  const p = getUsagePath(sessionId);
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data.sessionId === sessionId) return data;
    }
  } catch (e) {
    log.debug(`토큰 사용량 로드 실패 (세션: ${sessionId}): ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    sessionId,
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    byModel: {},
    estimatedCost: 0,
    updatedAt: new Date().toISOString(),
  };
}

function saveTokenUsage(usage: TokenUsage): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(getUsagePath(usage.sessionId), JSON.stringify(usage));
}

/** 비용 재계산 */
function recalculateCost(usage: TokenUsage): number {
  let total = 0;
  for (const [model, data] of Object.entries(usage.byModel)) {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING.sonnet;
    total += (data.input / 1_000_000) * pricing.input;
    total += (data.output / 1_000_000) * pricing.output;
  }
  return total;
}

/** 모델 티어 추론 (모델 ID에서) */
export function inferModelTier(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('opus')) return 'opus';
  return 'sonnet'; // 기본값
}

/**
 * 도구 호출 토큰 기록
 * @param sessionId 세션 ID
 * @param inputText 입력 텍스트 (tool_input) — 한글 비율을 반영한 토큰 근사에 사용
 * @param outputText 출력 텍스트 (tool_response) — 한글 비율을 반영한 토큰 근사에 사용
 * @param modelId 모델 ID (선택)
 */
export function recordToolUsage(
  sessionId: string,
  inputText: string,
  outputText: string,
  modelId?: string,
): TokenUsage {
  const usage = loadTokenUsage(sessionId);
  // estimateTokens()로 한글 비율을 반영한 토큰 근사
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);
  const model = modelId ? inferModelTier(modelId) : 'sonnet';

  usage.inputTokens += inputTokens;
  usage.outputTokens += outputTokens;
  usage.toolCalls += 1;

  if (!usage.byModel[model]) {
    usage.byModel[model] = { input: 0, output: 0, calls: 0 };
  }
  usage.byModel[model].input += inputTokens;
  usage.byModel[model].output += outputTokens;
  usage.byModel[model].calls += 1;

  usage.estimatedCost = recalculateCost(usage);
  usage.updatedAt = new Date().toISOString();

  saveTokenUsage(usage);
  return usage;
}

/** 비용을 읽기 쉬운 문자열로 포맷 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/** 토큰 수를 읽기 쉬운 문자열로 포맷 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return tokens.toString();
}

/** 오래된 token-usage 파일 정리 (24시간 초과) */
export function cleanStaleUsageFiles(): void {
  if (!fs.existsSync(STATE_DIR)) return;
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  try {
    for (const f of fs.readdirSync(STATE_DIR)) {
      if (!f.startsWith('token-usage-')) continue;
      const p = path.join(STATE_DIR, f);
      const stat = fs.statSync(p);
      if (now - stat.mtimeMs > MAX_AGE_MS) fs.unlinkSync(p);
    }
  } catch (e) {
    log.debug(`오래된 토큰 사용량 파일 정리 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}
