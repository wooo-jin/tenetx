import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-provider-full',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => '/usr/bin/claude'),
  execFile: vi.fn(),
}));

import {
  readCodexOAuthToken,
  loadProviderConfigs,
  saveProviderConfigs,
  checkProviderAvailability,
  getAvailableProviders,
  callWithFallback,
} from '../src/engine/provider.js';

const COMPOUND_DIR = path.join(TEST_HOME, '.compound');
const CODEX_AUTH_PATH = path.join(TEST_HOME, '.codex', 'auth.json');
const CONFIG_PATH = path.join(COMPOUND_DIR, 'providers.json');

describe('provider - extended', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── readCodexOAuthToken ──

  describe('readCodexOAuthToken', () => {
    it('auth.json이 없으면 null', () => {
      expect(readCodexOAuthToken()).toBeNull();
    });

    it('유효한 토큰을 반환한다', () => {
      fs.mkdirSync(path.dirname(CODEX_AUTH_PATH), { recursive: true });
      fs.writeFileSync(CODEX_AUTH_PATH, JSON.stringify({
        access_token: 'test-token-123',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }));
      expect(readCodexOAuthToken()).toBe('test-token-123');
    });

    it('만료된 토큰은 null', () => {
      fs.mkdirSync(path.dirname(CODEX_AUTH_PATH), { recursive: true });
      fs.writeFileSync(CODEX_AUTH_PATH, JSON.stringify({
        access_token: 'expired-token',
        expires_at: Math.floor(Date.now() / 1000) - 100,
      }));
      expect(readCodexOAuthToken()).toBeNull();
    });

    it('access_token이 없으면 null', () => {
      fs.mkdirSync(path.dirname(CODEX_AUTH_PATH), { recursive: true });
      fs.writeFileSync(CODEX_AUTH_PATH, JSON.stringify({}));
      expect(readCodexOAuthToken()).toBeNull();
    });

    it('잘못된 JSON이면 null', () => {
      fs.mkdirSync(path.dirname(CODEX_AUTH_PATH), { recursive: true });
      fs.writeFileSync(CODEX_AUTH_PATH, 'not json');
      expect(readCodexOAuthToken()).toBeNull();
    });
  });

  // ── loadProviderConfigs / saveProviderConfigs ──

  describe('loadProviderConfigs', () => {
    it('파일이 없으면 기본 설정 반환', () => {
      const configs = loadProviderConfigs();
      expect(configs.length).toBeGreaterThan(0);
      expect(configs[0].name).toBe('claude');
    });

    it('저장된 설정을 로드한다', () => {
      const custom = [
        { name: 'claude', enabled: true, defaultModel: 'opus' },
        { name: 'codex', enabled: true, authMode: 'apikey' },
      ];
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(custom));
      const configs = loadProviderConfigs();
      expect(configs.length).toBe(2);
    });

    it('openai를 codex로 마이그레이션한다', () => {
      const legacy = [
        { name: 'claude', enabled: true },
        { name: 'openai', enabled: true, apiKey: 'OPENAI_API_KEY' },
      ];
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(legacy));
      const configs = loadProviderConfigs();
      expect(configs.find(c => c.name === 'codex')).toBeDefined();
      expect(configs.find(c => (c.name as string) === 'openai')).toBeUndefined();
    });

    it('잘못된 JSON이면 기본 설정 반환', () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, 'bad json');
      const configs = loadProviderConfigs();
      expect(configs.length).toBeGreaterThan(0);
    });
  });

  describe('saveProviderConfigs', () => {
    it('설정을 파일에 저장한다', () => {
      const configs = [{ name: 'claude' as const, enabled: true }];
      saveProviderConfigs(configs);
      expect(fs.existsSync(CONFIG_PATH)).toBe(true);
    });
  });

  // ── checkProviderAvailability ──

  describe('checkProviderAvailability', () => {
    it('비활성 프로바이더는 unavailable', () => {
      const result = checkProviderAvailability({ name: 'claude', enabled: false });
      expect(result.available).toBe(false);
      expect(result.reason).toBe('disabled');
    });

    it('Claude 프로바이더는 which 체크', () => {
      const result = checkProviderAvailability({ name: 'claude', enabled: true });
      expect(result.available).toBe(true);
    });

    it('Gemini API 키 없으면 unavailable', () => {
      const result = checkProviderAvailability({ name: 'gemini', enabled: true, apiKey: 'NONEXISTENT_KEY' });
      expect(result.available).toBe(false);
      expect(result.reason).toContain('API key not set');
    });

    it('알 수 없는 프로바이더는 unavailable', () => {
      const result = checkProviderAvailability({ name: 'unknown' as any, enabled: true });
      expect(result.available).toBe(false);
      expect(result.reason).toContain('unknown provider');
    });

    it('Codex oauth 모드 — 토큰 없으면 unavailable', () => {
      const result = checkProviderAvailability({ name: 'codex', enabled: true, authMode: 'oauth' });
      expect(result.available).toBe(false);
      expect(result.reason).toContain('Codex OAuth');
    });

    it('Codex apikey 모드 — API 키 없으면 unavailable', () => {
      const result = checkProviderAvailability({ name: 'codex', enabled: true, authMode: 'apikey', apiKey: 'NONEXISTENT_KEY' });
      expect(result.available).toBe(false);
      expect(result.reason).toContain('API key not set');
    });
  });

  // ── getAvailableProviders ──

  describe('getAvailableProviders', () => {
    it('가용한 프로바이더 목록을 반환한다', () => {
      const providers = getAvailableProviders();
      // Claude가 설치되어 있으면 최소 1개
      expect(Array.isArray(providers)).toBe(true);
    });
  });

  // ── callWithFallback ──

  describe('callWithFallback', () => {
    it('가용한 프로바이더가 없으면 에러 반환', async () => {
      const result = await callWithFallback('test prompt', undefined, []);
      expect(result.error).toContain('가용한 프로바이더가 없습니다');
      expect(result.content).toBe('');
    });
  });
});
