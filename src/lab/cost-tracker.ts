/**
 * Tenetx Lab — Session Cost Tracker
 *
 * 세션별 토큰 사용량과 비용을 추적합니다.
 * HUD 상태 표시줄에서 빠르게 읽을 수 있도록 current-session.json을 별도 유지합니다.
 * 모든 I/O는 non-blocking / failure-tolerant로 처리합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from '../core/logger.js';

// ── Storage paths ──
const LAB_COST_DIR = path.join(os.homedir(), '.compound', 'lab', 'cost');
const SESSIONS_FILE = path.join(LAB_COST_DIR, 'sessions.json');
const CURRENT_SESSION_FILE = path.join(LAB_COST_DIR, 'current-session.json');

// ── Model pricing (USD per 1M tokens) ──
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':   { input: 15.0,  output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0,   output: 15.0 },
  'claude-haiku-4-5':  { input: 0.80,  output: 4.0 },
  // Fallback tiers (inferModelTier 결과용)
  opus:   { input: 15.0,  output: 75.0 },
  sonnet: { input: 3.0,   output: 15.0 },
  haiku:  { input: 0.80,  output: 4.0 },
};

// ── Types ──

export interface ModelBreakdown {
  input: number;
  output: number;
  cost: number;
  calls: number;
}

export interface SessionCost {
  sessionId: string;
  startedAt: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  agentCalls: number;
  modelBreakdown: Record<string, ModelBreakdown>;
}

interface SessionsStore {
  sessions: SessionCost[];
}

// ── Directory bootstrap ──

function ensureDir(): void {
  try {
    fs.mkdirSync(LAB_COST_DIR, { recursive: true });
  } catch { /* ignore */ }
}

// ── Pricing helpers ──

function getPricing(model: string): { input: number; output: number } {
  // 정확한 모델 ID 매치 시도
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // 모델 ID에서 티어 추론
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return MODEL_PRICING.opus;
  if (lower.includes('haiku')) return MODEL_PRICING.haiku;
  return MODEL_PRICING.sonnet; // 기본값
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getPricing(model);
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

// ── Core functions ──

/** 토큰 사용량 기록 (PostToolUse 훅 등에서 호출) */
export function recordTokenUsage(
  sessionId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): void {
  try {
    ensureDir();
    const session = loadCurrentSession(sessionId);
    const cost = calculateCost(model, inputTokens, outputTokens);

    session.totalInputTokens += inputTokens;
    session.totalOutputTokens += outputTokens;
    session.estimatedCostUsd += cost;
    session.agentCalls += 1;

    if (!session.modelBreakdown[model]) {
      session.modelBreakdown[model] = { input: 0, output: 0, cost: 0, calls: 0 };
    }
    const breakdown = session.modelBreakdown[model];
    breakdown.input += inputTokens;
    breakdown.output += outputTokens;
    breakdown.cost += cost;
    breakdown.calls += 1;

    // current-session.json에 즉시 반영 (HUD 성능용)
    writeCurrentSession(session);

    // sessions.json에도 반영 (히스토리용, 비동기적으로)
    upsertSessionInStore(session);
  } catch (e) {
    debugLog('cost-tracker', `토큰 사용량 기록 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 현재 세션 비용 조회 (O(1) — current-session.json에서 읽기) */
export function getSessionCost(sessionId: string): SessionCost {
  return loadCurrentSession(sessionId);
}

/** 모든 세션 비용 조회 (히스토리) */
export function getAllSessionCosts(days?: number): SessionCost[] {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    const store: SessionsStore = JSON.parse(raw);
    if (!Array.isArray(store.sessions)) return [];

    if (days !== undefined) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return store.sessions.filter(s => new Date(s.startedAt).getTime() >= cutoff);
    }
    return store.sessions;
  } catch {
    return [];
  }
}

/** HUD 표시용 비용 포맷 */
export function formatCostForHud(cost: SessionCost): string {
  const totalTokens = cost.totalInputTokens + cost.totalOutputTokens;
  if (totalTokens === 0) return 'tracking...';

  const tokenStr = formatTokens(totalTokens);
  const costStr = formatUsd(cost.estimatedCostUsd);
  return `${tokenStr} tok (~${costStr})`;
}

/** 현재 세션 파일에서 HUD 표시 문자열을 빠르게 읽기 (status-line 최적화) */
export function readHudCostString(): string | null {
  try {
    if (!fs.existsSync(CURRENT_SESSION_FILE)) return null;
    const raw = fs.readFileSync(CURRENT_SESSION_FILE, 'utf-8');
    const session: SessionCost = JSON.parse(raw);
    if (session.totalInputTokens + session.totalOutputTokens === 0) return null;
    return formatCostForHud(session);
  } catch {
    return null;
  }
}

/** 현재 세션 파일 리셋 (새 세션 시작 시) */
export function resetCurrentSession(sessionId: string): void {
  try {
    ensureDir();
    const session = createEmptySession(sessionId);
    writeCurrentSession(session);
  } catch {
    // non-critical
  }
}

// ── CLI: cost summary display ──

export function printCostSummary(args: string[]): void {
  const isWeek = args.includes('--week');
  const isDaily = args.includes('--daily');
  const isAll = args.includes('--all');
  const isModel = args.includes('--model');

  // 현재 세션 표시
  const sessionId = process.env.COMPOUND_SESSION_ID ?? 'default';
  const current = getSessionCost(sessionId);

  console.log('\n  Tenetx Lab — Cost Tracker\n');

  if (current.agentCalls > 0) {
    console.log('  Current Session:');
    printSessionDetail(current, '    ');
  } else {
    console.log('  Current Session: no usage recorded yet.');
  }

  // 히스토리
  const days = isWeek ? 7 : isDaily ? 1 : isAll ? undefined : 7;
  const periodLabel = isAll ? 'All time' : isWeek ? 'Last 7 days' : isDaily ? 'Today' : 'Last 7 days';
  const sessions = getAllSessionCosts(days);

  if (sessions.length > 0) {
    console.log(`\n  History (${periodLabel}): ${sessions.length} sessions`);
    const totalCost = sessions.reduce((sum, s) => sum + s.estimatedCostUsd, 0);
    const totalInput = sessions.reduce((sum, s) => sum + s.totalInputTokens, 0);
    const totalOutput = sessions.reduce((sum, s) => sum + s.totalOutputTokens, 0);
    const totalCalls = sessions.reduce((sum, s) => sum + s.agentCalls, 0);

    console.log(`    Total: ${formatTokens(totalInput + totalOutput)} tokens, ${formatUsd(totalCost)}, ${totalCalls} calls`);
    console.log(`    Input: ${formatTokens(totalInput)} | Output: ${formatTokens(totalOutput)}`);

    if (isModel) {
      // 모델별 집계
      const modelAgg: Record<string, ModelBreakdown> = {};
      for (const s of sessions) {
        for (const [model, bd] of Object.entries(s.modelBreakdown)) {
          if (!modelAgg[model]) modelAgg[model] = { input: 0, output: 0, cost: 0, calls: 0 };
          modelAgg[model].input += bd.input;
          modelAgg[model].output += bd.output;
          modelAgg[model].cost += bd.cost;
          modelAgg[model].calls += bd.calls;
        }
      }

      console.log('\n    By Model:');
      const sorted = Object.entries(modelAgg).sort((a, b) => b[1].cost - a[1].cost);
      for (const [model, bd] of sorted) {
        const tokens = formatTokens(bd.input + bd.output);
        console.log(`      ${model.padEnd(24)} ${tokens.padStart(8)} tokens  ${formatUsd(bd.cost).padStart(8)}  ${bd.calls} calls`);
      }
    }

    // 일별 집계 (daily breakdown)
    if (isDaily || isWeek || isAll) {
      const byDay: Record<string, { cost: number; calls: number; tokens: number }> = {};
      for (const s of sessions) {
        const day = s.startedAt.slice(0, 10);
        if (!byDay[day]) byDay[day] = { cost: 0, calls: 0, tokens: 0 };
        byDay[day].cost += s.estimatedCostUsd;
        byDay[day].calls += s.agentCalls;
        byDay[day].tokens += s.totalInputTokens + s.totalOutputTokens;
      }

      const sortedDays = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]));
      console.log('\n    By Day:');
      for (const [day, d] of sortedDays.slice(0, 14)) {
        console.log(`      ${day}  ${formatTokens(d.tokens).padStart(8)} tokens  ${formatUsd(d.cost).padStart(8)}  ${d.calls} calls`);
      }
    }
  } else {
    console.log(`\n  No cost history recorded.`);
  }

  console.log();
}

function printSessionDetail(session: SessionCost, indent: string): void {
  const totalTokens = session.totalInputTokens + session.totalOutputTokens;
  console.log(`${indent}Tokens: ${formatTokens(totalTokens)} (in: ${formatTokens(session.totalInputTokens)}, out: ${formatTokens(session.totalOutputTokens)})`);
  console.log(`${indent}Cost:   ${formatUsd(session.estimatedCostUsd)}`);
  console.log(`${indent}Calls:  ${session.agentCalls}`);

  const models = Object.entries(session.modelBreakdown);
  if (models.length > 0) {
    console.log(`${indent}Models:`);
    for (const [model, bd] of models.sort((a, b) => b[1].cost - a[1].cost)) {
      console.log(`${indent}  ${model}: ${formatTokens(bd.input + bd.output)} tokens, ${formatUsd(bd.cost)}, ${bd.calls} calls`);
    }
  }
}

// ── Internal helpers ──

function createEmptySession(sessionId: string): SessionCost {
  return {
    sessionId,
    startedAt: new Date().toISOString(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedCostUsd: 0,
    agentCalls: 0,
    modelBreakdown: {},
  };
}

function loadCurrentSession(sessionId: string): SessionCost {
  try {
    if (fs.existsSync(CURRENT_SESSION_FILE)) {
      const raw = fs.readFileSync(CURRENT_SESSION_FILE, 'utf-8');
      const data: SessionCost = JSON.parse(raw);
      if (data.sessionId === sessionId) return data;
    }
  } catch { /* ignore */ }
  return createEmptySession(sessionId);
}

function writeCurrentSession(session: SessionCost): void {
  try {
    fs.writeFileSync(CURRENT_SESSION_FILE, JSON.stringify(session));
  } catch (e) {
    debugLog('cost-tracker', `current-session 쓰기 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function upsertSessionInStore(session: SessionCost): void {
  try {
    let store: SessionsStore = { sessions: [] };
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      store = JSON.parse(raw);
      if (!Array.isArray(store.sessions)) store.sessions = [];
    }

    const idx = store.sessions.findIndex(s => s.sessionId === session.sessionId);
    if (idx >= 0) {
      store.sessions[idx] = session;
    } else {
      store.sessions.push(session);
    }

    // 90일 이상 된 세션 정리
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    store.sessions = store.sessions.filter(s => new Date(s.startedAt).getTime() >= cutoff);

    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    debugLog('cost-tracker', `sessions.json 쓰기 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatUsd(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
