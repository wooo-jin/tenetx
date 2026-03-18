/**
 * Tenetx — Unified Provider Abstraction
 *
 * Claude CLI + Codex 2개 프로바이더를 통합 인터페이스로 추상화합니다.
 * - 비동기 호출 (진정한 병렬 실행 지원)
 * - 재시도 (exponential backoff, HTTP 상태 코드별 분기)
 * - 자동 폴백 (provider 실패 시 다음 provider)
 * - Codex OAuth 인증 (~/.codex/auth.json 토큰 자동 읽기)
 * - 가용성 체크
 * - 응답 비교 모드
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { debugLog } from '../core/logger.js';

const execFileAsync = promisify(execFile);
const CONFIG_PATH = path.join(os.homedir(), '.compound', 'providers.json');
const CODEX_AUTH_PATH = path.join(os.homedir(), '.codex', 'auth.json');

/** 민감한 토큰/키 패턴을 *** 로 마스킹 */
export function maskSensitive(str: string): string {
  return str
    .replace(/Bearer [a-zA-Z0-9_-]+/g, 'Bearer ***')
    .replace(/sk-[a-zA-Z0-9]+/g, 'sk-***')
    .replace(/key-[a-zA-Z0-9]+/g, 'key-***');
}

/** HTTP 상태 코드별 재시도 전략 분류 */
export function classifyHttpStatus(status: number): 'no-retry' | 'retry-with-backoff' | 'retry' {
  if (status === 401 || status === 403) return 'no-retry';
  if (status === 429) return 'retry-with-backoff';
  if (status >= 500) return 'retry';
  return 'retry'; // 기타
}

export type ProviderName = 'claude' | 'codex' | 'gemini';

/** Codex 인증 방식 */
export type CodexAuthMode = 'oauth' | 'cli' | 'apikey';

export interface ProviderConfig {
  name: ProviderName;
  enabled: boolean;
  apiKey?: string;       // env var name 또는 직접 키 (env var 우선)
  authMode?: CodexAuthMode; // codex 전용: oauth(기본) / cli / apikey
  defaultModel?: string;
  maxRetries?: number;
  timeoutMs?: number;
  priority?: number;     // 폴백 순서 (낮을수록 우선)
}

export interface ProviderResponse {
  provider: ProviderName;
  model: string;
  content: string;
  latencyMs: number;
  tokenEstimate?: number;
  error?: string;
}

/** 재시도 불가 에러 (401/403 등) */
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

/** 기본 프로바이더 설정 (Claude + Codex) */
const DEFAULT_CONFIGS: ProviderConfig[] = [
  { name: 'claude', enabled: true, defaultModel: 'claude-sonnet-4-6', maxRetries: 2, timeoutMs: 60000, priority: 1 },
  { name: 'codex', enabled: false, authMode: 'oauth', defaultModel: 'o4-mini', maxRetries: 2, timeoutMs: 60000, priority: 2 },
  { name: 'gemini', enabled: false, apiKey: 'GEMINI_API_KEY', defaultModel: 'gemini-2.5-flash', maxRetries: 2, timeoutMs: 60000, priority: 3 },
];

// ── Codex OAuth 토큰 관리 ──

interface CodexAuthData {
  access_token?: string;
  token_type?: string;
  expires_at?: number;
  refresh_token?: string;
}

/** ~/.codex/auth.json에서 OAuth 토큰 읽기 */
export function readCodexOAuthToken(): string | null {
  try {
    if (!fs.existsSync(CODEX_AUTH_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(CODEX_AUTH_PATH, 'utf-8')) as CodexAuthData;

    if (!data.access_token) return null;

    // 만료 체크 (만료 시간이 있으면)
    if (data.expires_at) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec >= data.expires_at) {
        debugLog('provider', 'Codex OAuth 토큰 만료됨. `codex login`으로 갱신하세요.');
        return null;
      }
    }

    return data.access_token;
  } catch (e) {
    debugLog('provider', maskSensitive(`Codex auth.json 읽기 실패: ${e instanceof Error ? e.message : String(e)}`));
    return null;
  }
}

/** Codex 인증 토큰 해석 (authMode에 따라) */
function resolveCodexAuth(config: ProviderConfig): { mode: CodexAuthMode; token: string | null } {
  const mode = config.authMode ?? 'oauth';

  switch (mode) {
    case 'oauth': {
      const token = readCodexOAuthToken();
      return { mode, token };
    }
    case 'apikey': {
      const token = resolveApiKey(config.apiKey);
      return { mode, token };
    }
    case 'cli':
      return { mode, token: null }; // CLI 모드는 토큰 불필요
  }
}

// ── 설정 관리 ──

/** 프로바이더 설정 로드 */
export function loadProviderConfigs(): ProviderConfig[] {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (Array.isArray(data)) {
        return data
          .map((c: ProviderConfig) => {
            // openai → codex 마이그레이션
            if ((c.name as string) === 'openai') {
              return { ...c, name: 'codex' as ProviderName, authMode: c.authMode ?? 'apikey' };
            }
            return c;
          })
          .filter((c: ProviderConfig) => c.name === 'claude' || c.name === 'codex' || c.name === 'gemini');
      }
    }
  } catch (e) {
    debugLog('provider', '프로바이더 설정 파싱 실패', e);
  }
  return DEFAULT_CONFIGS;
}

/** 프로바이더 설정 저장 */
export function saveProviderConfigs(configs: ProviderConfig[]): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2));
}

/** API 키 해석: 환경변수명이면 env에서 읽기, 아니면 직접 사용 */
function resolveApiKey(keyOrEnvName?: string): string | null {
  if (!keyOrEnvName) return null;
  if (/^[A-Z_]+$/.test(keyOrEnvName)) {
    return process.env[keyOrEnvName] ?? null;
  }
  return keyOrEnvName;
}

// ── 가용성 체크 ──

/** 프로바이더 가용성 체크 */
export function checkProviderAvailability(config: ProviderConfig): { available: boolean; reason?: string } {
  if (!config.enabled) return { available: false, reason: 'disabled' };

  if (config.name === 'claude') {
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(whichCmd, ['claude'], { encoding: 'utf-8', timeout: 3000 });
      return { available: true };
    } catch {
      return { available: false, reason: 'Claude CLI not found' };
    }
  }

  if (config.name === 'codex') {
    const { mode, token } = resolveCodexAuth(config);

    if (mode === 'cli') {
      try {
        const whichCmdCodex = process.platform === 'win32' ? 'where' : 'which';
        execFileSync(whichCmdCodex, ['codex'], { encoding: 'utf-8', timeout: 3000 });
        return { available: true };
      } catch {
        return { available: false, reason: 'Codex CLI not found' };
      }
    }

    if (mode === 'oauth') {
      if (!token) {
        return { available: false, reason: 'Codex OAuth 토큰 없음 (`codex login` 필요)' };
      }
      return { available: true };
    }

    if (mode === 'apikey') {
      if (!token) {
        return { available: false, reason: `API key not set (${config.apiKey ?? 'OPENAI_API_KEY'})` };
      }
      return { available: true };
    }
  }

  if (config.name === 'gemini') {
    const key = resolveApiKey(config.apiKey);
    if (!key) {
      return { available: false, reason: `API key not set (${config.apiKey ?? 'GEMINI_API_KEY'})` };
    }
    return { available: true };
  }

  return { available: false, reason: 'unknown provider' };
}

/** 가용한 프로바이더 목록 (priority 순) */
export function getAvailableProviders(): Array<ProviderConfig & { available: true }> {
  const configs = loadProviderConfigs();
  return configs
    .filter(c => checkProviderAvailability(c).available)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)) as Array<ProviderConfig & { available: true }>;
}

// ── 프로바이더 호출 ──

/** 단일 프로바이더 호출 (재시도 포함, NonRetryableError는 즉시 실패) */
export async function callProvider(
  config: ProviderConfig,
  prompt: string,
  model?: string,
): Promise<ProviderResponse> {
  const startTime = Date.now();
  const targetModel = model ?? config.defaultModel ?? '';
  const maxRetries = config.maxRetries ?? 2;
  const timeout = config.timeoutMs ?? 30000;

  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const content = await executeProviderCall(config, prompt, targetModel, timeout);
      return {
        provider: config.name,
        model: targetModel,
        content,
        latencyMs: Date.now() - startTime,
        tokenEstimate: Math.ceil(content.length / 4),
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      debugLog('provider', `${config.name} 시도 ${attempt + 1}/${maxRetries + 1} 실패: ${maskSensitive(lastError)}`);

      if (e instanceof NonRetryableError) break;

      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  return {
    provider: config.name,
    model: targetModel,
    content: '',
    latencyMs: Date.now() - startTime,
    error: lastError,
  };
}

/** 프로바이더별 실제 호출 */
async function executeProviderCall(
  config: ProviderConfig,
  prompt: string,
  model: string,
  timeout: number,
): Promise<string> {
  switch (config.name) {
    case 'claude':
      return callClaude(prompt, model, timeout);
    case 'codex':
      return callCodex(config, prompt, model, timeout);
    case 'gemini':
      return callGemini(config, prompt, model, timeout);
    default:
      throw new Error(`알 수 없는 프로바이더: ${config.name}`);
  }
}

/** Claude CLI 비동기 호출 */
async function callClaude(prompt: string, model: string, timeout: number): Promise<string> {
  const args = ['-p', prompt, ...(model ? ['--model', model] : [])];
  try {
    const { stdout } = await execFileAsync('claude', args, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (e) {
    throw new Error(`claude CLI: ${(e as Error).message}`);
  }
}

/** Codex 호출 (authMode에 따라 CLI 또는 API) */
async function callCodex(config: ProviderConfig, prompt: string, model: string, timeout: number): Promise<string> {
  const { mode, token } = resolveCodexAuth(config);

  if (mode === 'cli') {
    return callCodexCli(prompt, model, timeout);
  }

  // oauth 또는 apikey — 둘 다 Bearer 토큰으로 OpenAI API 호출
  if (!token) {
    throw new NonRetryableError(
      mode === 'oauth'
        ? 'Codex OAuth 토큰 없음. `codex login`을 실행하세요.'
        : 'OpenAI API 키가 설정되지 않았습니다.'
    );
  }

  return callOpenAIApi(prompt, model, timeout, token);
}

/** Codex CLI 비동기 호출 (exec 서브커맨드 + -o로 출력 캡처) */
async function callCodexCli(prompt: string, model: string, timeout: number): Promise<string> {
  const tmpOut = path.join(os.tmpdir(), `codex-out-${Date.now()}.txt`);
  const args = [
    'exec',
    '--full-auto',
    '-o', tmpOut,
    ...(model ? ['-m', model] : []),
    prompt,
  ];
  try {
    await execFileAsync('codex', args, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    });
    // -o 옵션으로 마지막 메시지를 파일에 기록
    if (fs.existsSync(tmpOut)) {
      const content = fs.readFileSync(tmpOut, 'utf-8').trim();
      fs.unlinkSync(tmpOut);
      return content;
    }
    return '(Codex 출력 없음)';
  } catch (e) {
    // 임시 파일 정리
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
    throw new Error(`codex CLI: ${(e as Error).message}`);
  }
}

/** OpenAI API 호출 (OAuth 토큰 또는 API 키 — 둘 다 Bearer) */
async function callOpenAIApi(prompt: string, model: string, timeout: number, bearerToken: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'o4-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const msg = `OpenAI API ${res.status}: ${text.slice(0, 200)}`;

    // 401/403: 인증 실패 — 재시도 무의미
    if (res.status === 401 || res.status === 403) {
      throw new NonRetryableError(msg);
    }

    // 429: rate limit — Retry-After 헤더 존중
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10);
      if (retryAfter > 0) {
        await sleep(retryAfter * 1000);
      }
    }

    throw new Error(msg);
  }

  const json = await res.json() as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? '응답 없음';
}

/** Google Gemini API 호출 */
async function callGemini(config: ProviderConfig, prompt: string, model: string, timeout: number): Promise<string> {
  const apiKey = resolveApiKey(config.apiKey);
  if (!apiKey) {
    throw new NonRetryableError('Gemini API 키가 설정되지 않았습니다.');
  }

  const targetModel = model || config.defaultModel || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const msg = `Gemini API ${res.status}: ${text.slice(0, 200)}`;

    if (res.status === 401 || res.status === 403) {
      throw new NonRetryableError(msg);
    }
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10);
      if (retryAfter > 0) {
        await sleep(retryAfter * 1000);
      }
    }
    throw new Error(msg);
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '응답 없음';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── 폴백 / 병렬 호출 ──

/** 폴백 체인 호출: 첫 번째 성공한 프로바이더 반환 */
export async function callWithFallback(
  prompt: string,
  model?: string,
  providers?: ProviderConfig[],
): Promise<ProviderResponse> {
  const startTime = Date.now();
  const available = providers ?? getAvailableProviders();
  if (available.length === 0) {
    return {
      provider: 'claude',
      model: '',
      content: '',
      latencyMs: 0,
      error: '가용한 프로바이더가 없습니다',
    };
  }

  for (const config of available) {
    const result = await callProvider(config, prompt, model);
    if (!result.error) return result;
    debugLog('provider', `${config.name} 폴백 실패: ${maskSensitive(result.error)}`);
  }

  return {
    provider: available[0].name,
    model: model ?? '',
    content: '',
    latencyMs: Date.now() - startTime,
    error: '모든 프로바이더가 실패했습니다',
  };
}

/** 모든 가용 프로바이더에 병렬 호출 (비교/합성용) */
export async function callAllProviders(
  prompt: string,
  model?: string,
): Promise<ProviderResponse[]> {
  const available = getAvailableProviders();
  const results = await Promise.allSettled(
    available.map(config => callProvider(config, prompt, model))
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const reason = r.reason;
    const errorMsg = reason instanceof Error ? reason.message : String(reason);
    return {
      provider: available[i].name,
      model: model ?? '',
      content: '',
      latencyMs: 0,
      error: errorMsg,
    };
  });
}

// ── 상태 조회 ──

/** 프로바이더 상태 요약 (doctor/status용) */
export function getProviderSummary(): Array<{
  name: ProviderName;
  enabled: boolean;
  available: boolean;
  reason?: string;
  model: string;
  authMode?: CodexAuthMode;
}> {
  const configs = loadProviderConfigs();
  return configs.map(c => {
    const { available, reason } = checkProviderAvailability(c);
    return {
      name: c.name,
      enabled: c.enabled,
      available,
      reason,
      model: c.defaultModel ?? '',
      authMode: c.name === 'codex' ? (c.authMode ?? 'oauth') : c.name === 'gemini' ? ('apikey' as CodexAuthMode) : undefined,
    };
  });
}
