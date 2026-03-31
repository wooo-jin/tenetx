import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted로 mock 상태 관리 — vi.mock 호이스팅보다 먼저 실행됨
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn<(p: string) => boolean>(),
  readFileSync: vi.fn<(p: string, enc: string) => string>(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
  };
});

// hook-registry mock — HOOK_REGISTRY 데이터를 직접 제공
vi.mock('../src/hooks/hook-registry.js', () => ({
  HOOK_REGISTRY: [
    { name: 'solution-injector', tier: 'compound-core', event: 'UserPromptSubmit', script: 'hooks/solution-injector.js', timeout: 3, compoundCritical: true },
    { name: 'notepad-injector', tier: 'compound-core', event: 'UserPromptSubmit', script: 'hooks/notepad-injector.js', timeout: 3, compoundCritical: false },
    { name: 'intent-classifier', tier: 'workflow', event: 'UserPromptSubmit', script: 'hooks/intent-classifier.js', timeout: 3, compoundCritical: false },
    { name: 'secret-filter', tier: 'safety', event: 'PostToolUse', script: 'hooks/secret-filter.js', timeout: 3, compoundCritical: false },
    { name: 'pre-tool-use', tier: 'compound-core', event: 'PreToolUse', script: 'hooks/pre-tool-use.js', timeout: 3, compoundCritical: true },
  ],
}));

describe('hook-config', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 모듈 레벨 캐시 초기화를 위해 모듈 리로드
    vi.resetModules();
  });

  // ── isHookEnabled ──

  describe('isHookEnabled', () => {
    it('설정 파일이 없으면 true 반환 (기본값)', async () => {
      mocks.existsSync.mockReturnValue(false);
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('notepad-injector')).toBe(true);
    });

    it('설정 파일 존재하지만 해당 훅 언급 없으면 true 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        hooks: { 'some-other-hook': { enabled: false } },
      }));
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('notepad-injector')).toBe(true);
    });

    it('hooks 섹션에서 enabled: false면 false 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        hooks: { 'notepad-injector': { enabled: false } },
      }));
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('notepad-injector')).toBe(false);
    });

    it('레거시 형식 (최상위 hookName.enabled: false)이면 false 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        'notepad-injector': { enabled: false },
      }));
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('notepad-injector')).toBe(false);
    });

    it('티어가 disabled이면 해당 티어 훅은 false 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        tiers: { workflow: { enabled: false } },
      }));
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('intent-classifier')).toBe(false);
    });

    it('티어가 disabled이어도 개별 훅이 명시적 enabled: true이면 true 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        tiers: { workflow: { enabled: false } },
        hooks: { 'intent-classifier': { enabled: true } },
      }));
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('intent-classifier')).toBe(true);
    });

    it('workflow 티어가 disabled이어도 compound-core 훅은 true 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        tiers: { workflow: { enabled: false } },
      }));
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('solution-injector')).toBe(true);
    });

    it('compound-core 티어를 disabled해도 compound-core 훅은 true 반환 (보호)', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        tiers: { 'compound-core': { enabled: false } },
      }));
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('solution-injector')).toBe(true);
      expect(fn('pre-tool-use')).toBe(true);
    });

    it('safety 티어가 disabled이면 safety 훅은 false 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        tiers: { safety: { enabled: false } },
      }));
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('secret-filter')).toBe(false);
    });

    it('malformed JSON이면 true 반환 (failure-tolerant)', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue('{ invalid json !!');
      const { isHookEnabled: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('notepad-injector')).toBe(true);
    });
  });

  // ── loadHookConfig ──

  describe('loadHookConfig', () => {
    it('설정 파일이 없으면 null 반환', async () => {
      mocks.existsSync.mockReturnValue(false);
      const { loadHookConfig: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('notepad-injector')).toBeNull();
    });

    it('v2 형식에서 훅 설정 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        hooks: { 'notepad-injector': { enabled: true, maxLines: 50 } },
      }));
      const { loadHookConfig: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('notepad-injector')).toEqual({ enabled: true, maxLines: 50 });
    });

    it('레거시 형식에서 훅 설정 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({
        'notepad-injector': { enabled: false },
      }));
      const { loadHookConfig: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('notepad-injector')).toEqual({ enabled: false });
    });

    it('해당 훅이 없으면 null 반환', async () => {
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(JSON.stringify({ hooks: {} }));
      const { loadHookConfig: fn } = await import('../src/hooks/hook-config.js');
      expect(fn('nonexistent')).toBeNull();
    });
  });
});
