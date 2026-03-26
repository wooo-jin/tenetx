import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── provider 엔진 전체 모킹 ──
// ask.ts는 외부 LLM API를 호출하므로 테스트에서는 모킹 필수
vi.mock('../../src/engine/provider.js', () => ({
  callProvider: vi.fn(),
  callWithFallback: vi.fn(),
  callAllProviders: vi.fn(),
  loadProviderConfigs: vi.fn(),
  saveProviderConfigs: vi.fn(),
  getProviderSummary: vi.fn(() => []),
  checkProviderAvailability: vi.fn(),
}));

vi.mock('../../src/engine/synthesizer.js', () => ({
  synthesize: vi.fn(),
}));

import { handleAsk, handleProviders } from '../../src/core/ask.js';
import {
  callProvider,
  callWithFallback,
  callAllProviders,
  loadProviderConfigs,
  saveProviderConfigs,
  checkProviderAvailability,
} from '../../src/engine/provider.js';
import { synthesize } from '../../src/engine/synthesizer.js';

// ────────────────────────────────────────────────────────────────────────────
// handleAsk()
// ────────────────────────────────────────────────────────────────────────────
describe('handleAsk()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('인자가 없으면 help를 출력하고 provider를 호출하지 않는다', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleAsk([]);
    expect(callProvider).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('질문만 있고 provider 미지정 시 claude를 기본으로 사용한다', async () => {
    vi.mocked(loadProviderConfigs).mockReturnValue([
      { name: 'claude', enabled: true, priority: 1 },
    ] as ReturnType<typeof loadProviderConfigs>);
    vi.mocked(checkProviderAvailability).mockReturnValue({ available: true });
    vi.mocked(callProvider).mockResolvedValue({
      provider: 'claude',
      content: 'Hello from Claude',
      latencyMs: 100,
      model: undefined,
      error: undefined,
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleAsk(['Hello']);
    expect(callProvider).toHaveBeenCalledOnce();
    expect(vi.mocked(callProvider).mock.calls[0][0]).toMatchObject({ name: 'claude' });
    consoleSpy.mockRestore();
  });

  it('--provider codex 지정 시 codex config로 callProvider가 호출된다', async () => {
    vi.mocked(loadProviderConfigs).mockReturnValue([
      { name: 'codex', enabled: true, priority: 2 },
    ] as ReturnType<typeof loadProviderConfigs>);
    vi.mocked(checkProviderAvailability).mockReturnValue({ available: true });
    vi.mocked(callProvider).mockResolvedValue({
      provider: 'codex',
      content: 'Hello from Codex',
      latencyMs: 200,
      model: undefined,
      error: undefined,
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleAsk(['--provider', 'codex', 'Hello']);
    expect(vi.mocked(callProvider).mock.calls[0][0]).toMatchObject({ name: 'codex' });
    consoleSpy.mockRestore();
  });

  it('지원하지 않는 provider 지정 시 process.exit(1)이 호출된다', async () => {
    vi.mocked(loadProviderConfigs).mockReturnValue([
      { name: 'claude', enabled: true, priority: 1 },
    ] as ReturnType<typeof loadProviderConfigs>);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleAsk(['--provider', 'unknown-provider', 'Hello']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('provider가 unavailable이면 process.exit(1)이 호출된다', async () => {
    vi.mocked(loadProviderConfigs).mockReturnValue([
      { name: 'claude', enabled: false, priority: 1 },
    ] as ReturnType<typeof loadProviderConfigs>);
    vi.mocked(checkProviderAvailability).mockReturnValue({ available: false, reason: 'disabled' });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleAsk(['Hello']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('callProvider가 에러를 반환하면 process.exit(1)이 호출된다', async () => {
    vi.mocked(loadProviderConfigs).mockReturnValue([
      { name: 'claude', enabled: true, priority: 1 },
    ] as ReturnType<typeof loadProviderConfigs>);
    vi.mocked(checkProviderAvailability).mockReturnValue({ available: true });
    vi.mocked(callProvider).mockResolvedValue({
      provider: 'claude',
      content: '',
      latencyMs: 0,
      model: undefined,
      error: 'API key missing',
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleAsk(['Hello']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('--fallback 플래그 시 callWithFallback이 호출된다', async () => {
    vi.mocked(callWithFallback).mockResolvedValue({
      provider: 'claude',
      content: 'fallback response',
      latencyMs: 150,
      model: undefined,
      error: undefined,
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleAsk(['--fallback', 'Hello']);
    expect(callWithFallback).toHaveBeenCalledOnce();
    expect(callProvider).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('--fallback 결과에 에러가 있으면 process.exit(1)이 호출된다', async () => {
    vi.mocked(callWithFallback).mockResolvedValue({
      provider: 'claude',
      content: '',
      latencyMs: 0,
      model: undefined,
      error: 'All providers failed',
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleAsk(['--fallback', 'Hello']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('--all 플래그 시 callAllProviders가 호출된다', async () => {
    vi.mocked(callAllProviders).mockResolvedValue([
      { provider: 'claude', content: 'Answer A', latencyMs: 100, model: undefined, error: undefined },
      { provider: 'codex', content: 'Answer B', latencyMs: 200, model: undefined, error: undefined },
    ]);
    vi.mocked(synthesize).mockReturnValue({
      synthesizedContent: 'Synthesized answer',
      strategy: 'best-of',
      evaluations: [],
      agreement: { consensus: [], uniqueInsights: [], contradictions: [], agreementScore: 0.9 },
      bestProvider: 'claude',
      taskType: 'general',
    } as ReturnType<typeof synthesize>);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleAsk(['--all', 'Hello']);
    expect(callAllProviders).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it('--all 결과가 없으면 "No available providers" 메시지를 출력한다', async () => {
    vi.mocked(callAllProviders).mockResolvedValue([]);
    const logs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg));
    await handleAsk(['--all', 'Hello']);
    expect(logs.some(m => m.includes('No available providers'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('알 수 없는 플래그는 경고를 출력하고 계속 실행한다', async () => {
    vi.mocked(loadProviderConfigs).mockReturnValue([
      { name: 'claude', enabled: true, priority: 1 },
    ] as ReturnType<typeof loadProviderConfigs>);
    vi.mocked(checkProviderAvailability).mockReturnValue({ available: true });
    vi.mocked(callProvider).mockResolvedValue({
      provider: 'claude',
      content: 'ok',
      latencyMs: 50,
      model: undefined,
      error: undefined,
    });
    const logs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg));
    await handleAsk(['--unknown-flag', 'Hello']);
    expect(logs.some(m => m.includes('Unknown option'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('플래그만 있고 질문 텍스트가 없으면 "Please enter a question" 메시지를 출력한다', async () => {
    const logs: string[] = [];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg));
    await handleAsk(['--provider', 'claude']);
    expect(logs.some(m => m.includes('Please enter a question'))).toBe(true);
    consoleSpy.mockRestore();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleProviders()
// ────────────────────────────────────────────────────────────────────────────
describe('handleProviders()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadProviderConfigs).mockReturnValue([
      { name: 'claude', enabled: true, priority: 1 },
      { name: 'codex', enabled: false, priority: 2, authMode: 'oauth' },
    ] as ReturnType<typeof loadProviderConfigs>);
  });

  it('enable 서브커맨드로 provider를 활성화하고 saveProviderConfigs가 호출된다', async () => {
    await handleProviders(['enable', 'codex']);
    expect(saveProviderConfigs).toHaveBeenCalledOnce();
    const saved = vi.mocked(saveProviderConfigs).mock.calls[0][0];
    const codex = saved.find((c: { name: string }) => c.name === 'codex');
    expect(codex.enabled).toBe(true);
  });

  it('disable 서브커맨드로 provider를 비활성화하고 saveProviderConfigs가 호출된다', async () => {
    vi.mocked(loadProviderConfigs).mockReturnValue([
      { name: 'claude', enabled: true, priority: 1 },
    ] as ReturnType<typeof loadProviderConfigs>);
    await handleProviders(['disable', 'claude']);
    expect(saveProviderConfigs).toHaveBeenCalledOnce();
    const saved = vi.mocked(saveProviderConfigs).mock.calls[0][0];
    const claude = saved.find((c: { name: string }) => c.name === 'claude');
    expect(claude.enabled).toBe(false);
  });

  it('enable 서브커맨드에 잘못된 provider 이름을 주면 saveProviderConfigs를 호출하지 않는다', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleProviders(['enable', 'invalid-provider']);
    expect(saveProviderConfigs).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('model 서브커맨드로 defaultModel이 변경된다', async () => {
    await handleProviders(['model', 'claude', 'claude-opus-4']);
    expect(saveProviderConfigs).toHaveBeenCalledOnce();
    const saved = vi.mocked(saveProviderConfigs).mock.calls[0][0];
    const claude = saved.find((c: { name: string }) => c.name === 'claude');
    expect(claude.defaultModel).toBe('claude-opus-4');
  });

  it('model 서브커맨드에 모델명이 없으면 saveProviderConfigs를 호출하지 않는다', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleProviders(['model', 'claude']);
    expect(saveProviderConfigs).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('auth 서브커맨드로 codex authMode가 변경된다', async () => {
    await handleProviders(['auth', 'cli']);
    expect(saveProviderConfigs).toHaveBeenCalledOnce();
    const saved = vi.mocked(saveProviderConfigs).mock.calls[0][0];
    const codex = saved.find((c: { name: string }) => c.name === 'codex');
    expect(codex.authMode).toBe('cli');
  });

  it('auth 서브커맨드에 잘못된 모드를 주면 saveProviderConfigs를 호출하지 않는다', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleProviders(['auth', 'invalid-mode']);
    expect(saveProviderConfigs).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('priority 서브커맨드로 provider 우선순위가 변경된다', async () => {
    await handleProviders(['priority', 'claude', '10']);
    expect(saveProviderConfigs).toHaveBeenCalledOnce();
    const saved = vi.mocked(saveProviderConfigs).mock.calls[0][0];
    const claude = saved.find((c: { name: string }) => c.name === 'claude');
    expect(claude.priority).toBe(10);
  });

  it('priority 서브커맨드에 숫자가 아닌 값을 주면 saveProviderConfigs를 호출하지 않는다', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleProviders(['priority', 'claude', 'not-a-number']);
    expect(saveProviderConfigs).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
