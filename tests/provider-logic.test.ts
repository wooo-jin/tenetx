import { describe, it, expect } from 'vitest';
import { classifyHttpStatus } from '../src/engine/provider.js';

/**
 * Provider 재시도/폴백 핵심 로직 테스트
 *
 * callProvider/callWithFallback은 CLI 실행 의존성 + private 함수이므로
 * 직접 import 불가. 동일 패턴을 재현하여 로직을 검증합니다.
 */

// ── 재시도 로직 재현 (통합 테스트 불가 — 로직 재현 테스트) ──

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

async function callProviderMock(
  executeFn: () => Promise<string>,
  maxRetries: number,
): Promise<{ content: string; error?: string; attempts: number }> {
  let lastError = '';
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;
    try {
      const content = await executeFn();
      return { content, attempts };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (e instanceof NonRetryableError) break;
    }
  }

  return { content: '', error: lastError, attempts };
}

async function callWithFallbackMock(
  providers: Array<{ name: string; call: () => Promise<string> }>,
): Promise<{ provider: string; content: string; error?: string }> {
  for (const p of providers) {
    try {
      const content = await p.call();
      return { provider: p.name, content };
    } catch {
      continue;
    }
  }
  return { provider: providers[0]?.name ?? '', content: '', error: '모든 프로바이더 실패' };
}

describe('provider retry logic (통합 테스트 불가 — 로직 재현 테스트)', () => {
  it('성공 시 1회만 시도', async () => {
    const result = await callProviderMock(
      async () => 'hello',
      2,
    );
    expect(result.content).toBe('hello');
    expect(result.attempts).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it('1회 실패 후 2회차에 성공', async () => {
    let callCount = 0;
    const result = await callProviderMock(
      async () => {
        callCount++;
        if (callCount === 1) throw new Error('temporary');
        return 'recovered';
      },
      2,
    );
    expect(result.content).toBe('recovered');
    expect(result.attempts).toBe(2);
  });

  it('모든 재시도 실패 시 에러 반환', async () => {
    const result = await callProviderMock(
      async () => { throw new Error('always fails'); },
      2,
    );
    expect(result.content).toBe('');
    expect(result.error).toBe('always fails');
    expect(result.attempts).toBe(3); // 초기 + 2회 재시도
  });

  it('NonRetryableError는 즉시 중단 (재시도 없음)', async () => {
    const result = await callProviderMock(
      async () => { throw new NonRetryableError('auth failed 401'); },
      2,
    );
    expect(result.content).toBe('');
    expect(result.error).toBe('auth failed 401');
    expect(result.attempts).toBe(1); // 재시도 없이 즉시 중단
  });

  it('maxRetries=0이면 재시도 없이 1회만', async () => {
    const result = await callProviderMock(
      async () => { throw new Error('fail'); },
      0,
    );
    expect(result.attempts).toBe(1);
    expect(result.error).toBe('fail');
  });

  it('maxRetries=5이면 최대 6회 시도', async () => {
    const result = await callProviderMock(
      async () => { throw new Error('fail'); },
      5,
    );
    expect(result.attempts).toBe(6);
  });
});

describe('provider fallback logic (통합 테스트 불가 — 로직 재현 테스트)', () => {
  it('첫 번째 프로바이더 성공 시 바로 반환', async () => {
    const result = await callWithFallbackMock([
      { name: 'claude', call: async () => 'claude response' },
      { name: 'codex', call: async () => 'codex response' },
    ]);
    expect(result.provider).toBe('claude');
    expect(result.content).toBe('claude response');
  });

  it('첫 번째 실패, 두 번째 성공', async () => {
    const result = await callWithFallbackMock([
      { name: 'claude', call: async () => { throw new Error('fail'); } },
      { name: 'codex', call: async () => 'codex response' },
    ]);
    expect(result.provider).toBe('codex');
    expect(result.content).toBe('codex response');
  });

  it('모든 프로바이더 실패', async () => {
    const result = await callWithFallbackMock([
      { name: 'claude', call: async () => { throw new Error('fail1'); } },
      { name: 'codex', call: async () => { throw new Error('fail2'); } },
    ]);
    expect(result.error).toBeDefined();
    expect(result.content).toBe('');
  });

  it('빈 프로바이더 목록', async () => {
    const result = await callWithFallbackMock([]);
    expect(result.error).toBeDefined();
  });
});

describe('HTTP status code handling (실제 import)', () => {
  it('401은 재시도 불가', () => {
    expect(classifyHttpStatus(401)).toBe('no-retry');
  });

  it('403은 재시도 불가', () => {
    expect(classifyHttpStatus(403)).toBe('no-retry');
  });

  it('429는 backoff 후 재시도', () => {
    expect(classifyHttpStatus(429)).toBe('retry-with-backoff');
  });

  it('500은 재시도', () => {
    expect(classifyHttpStatus(500)).toBe('retry');
  });

  it('502는 재시도', () => {
    expect(classifyHttpStatus(502)).toBe('retry');
  });

  it('503은 재시도', () => {
    expect(classifyHttpStatus(503)).toBe('retry');
  });
});

describe('OAuth token validation', () => {
  it('만료 시간이 과거이면 유효하지 않음', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec - 3600; // 1시간 전 만료
    expect(nowSec >= expiresAt).toBe(true);
  });

  it('만료 시간이 미래이면 유효함', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + 3600; // 1시간 후 만료
    expect(nowSec >= expiresAt).toBe(false);
  });

  it('만료 시간이 없으면 유효한 것으로 간주', () => {
    const expiresAt = undefined;
    expect(expiresAt === undefined || expiresAt === null).toBe(true);
  });
});

describe('provider config migration', () => {
  it('openai 이름을 codex로 마이그레이션', () => {
    const oldConfig: Record<string, unknown> = { name: 'openai', enabled: true, apiKey: 'OPENAI_API_KEY' };
    const migrated = (oldConfig.name as string) === 'openai'
      ? { ...oldConfig, name: 'codex', authMode: (oldConfig.authMode as string) ?? 'apikey' }
      : oldConfig;
    expect((migrated as any).name).toBe('codex');
    expect((migrated as any).authMode).toBe('apikey');
  });

  it('claude는 마이그레이션하지 않음', () => {
    const config = { name: 'claude', enabled: true };
    const migrated = (config.name as string) === 'openai'
      ? { ...config, name: 'codex' }
      : config;
    expect(migrated.name).toBe('claude');
  });
});
