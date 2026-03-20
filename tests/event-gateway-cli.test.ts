import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-gateway-cli',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  handleGateway,
  loadGatewayConfig,
  isEventEnabled,
  forwardEvent,
} from '../src/engine/event-gateway.js';
import type { GatewayEvent } from '../src/engine/event-gateway.js';
import type { GatewayConfig } from '../src/core/global-config.js';

const COMPOUND_DIR = path.join(TEST_HOME, '.compound');
const GLOBAL_CONFIG_PATH = path.join(COMPOUND_DIR, 'config.json');

describe('event-gateway CLI', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('help 출력 (인자 없음)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleGateway([]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('사용법'));
    logSpy.mockRestore();
  });

  it('config - 유효한 URL 설정', async () => {
    fs.mkdirSync(COMPOUND_DIR, { recursive: true });
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({}));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleGateway(['config', 'https://hooks.example.com/webhook']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Gateway 설정 완료'));
    logSpy.mockRestore();
    // 설정이 저장되었는지 확인
    const config = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
    expect(config.gateway.enabled).toBe(true);
    expect(config.gateway.url).toBe('https://hooks.example.com/webhook');
  });

  it('config - 유효하지 않은 URL', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleGateway(['config', 'http://insecure.com']);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('유효하지 않은 URL'));
    errSpy.mockRestore();
  });

  it('test - gateway 미설정 시', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleGateway(['test']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('설정되지 않았거나'));
    logSpy.mockRestore();
  });

  it('test - 전송 성공', async () => {
    fs.mkdirSync(COMPOUND_DIR, { recursive: true });
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
      gateway: { url: 'https://test.com/webhook', enabled: true },
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('OK', { status: 200 }),
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleGateway(['test']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('테스트 성공'));
    fetchSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('test - 전송 실패', async () => {
    fs.mkdirSync(COMPOUND_DIR, { recursive: true });
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
      gateway: { url: 'https://test.com/webhook', enabled: true },
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fail'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleGateway(['test']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('테스트 실패'));
    fetchSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('disable - gateway 비활성화', async () => {
    fs.mkdirSync(COMPOUND_DIR, { recursive: true });
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
      gateway: { url: 'https://test.com/webhook', enabled: true },
    }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleGateway(['disable']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('비활성화'));
    logSpy.mockRestore();
    const config = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
    expect(config.gateway.enabled).toBe(false);
  });

  // ── loadGatewayConfig ──

  describe('loadGatewayConfig', () => {
    it('설정 파일이 없으면 null', () => {
      expect(loadGatewayConfig()).toBeNull();
    });

    it('gateway가 비활성이면 null', () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: { url: 'https://test.com', enabled: false },
      }));
      expect(loadGatewayConfig()).toBeNull();
    });

    it('활성화된 gateway 설정을 반환', () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: { url: 'https://test.com', enabled: true },
      }));
      const config = loadGatewayConfig();
      expect(config).toBeDefined();
      expect(config!.url).toBe('https://test.com');
    });
  });

  // ── isEventEnabled ──

  describe('isEventEnabled', () => {
    const makeEvent = (type: GatewayEvent['type']): GatewayEvent => ({
      type,
      timestamp: new Date().toISOString(),
      payload: {},
    });

    it('events 필터가 없으면 모든 이벤트 허용', () => {
      const config: GatewayConfig = { url: 'https://test.com', enabled: true };
      expect(isEventEnabled(makeEvent('session-start'), config)).toBe(true);
      expect(isEventEnabled(makeEvent('cost-alert'), config)).toBe(true);
    });

    it('events가 빈 배열이면 모든 이벤트 허용', () => {
      const config: GatewayConfig = { url: 'https://test.com', enabled: true, events: [] };
      expect(isEventEnabled(makeEvent('session-start'), config)).toBe(true);
    });

    it('events 목록에 있는 이벤트만 허용', () => {
      const config: GatewayConfig = {
        url: 'https://test.com',
        enabled: true,
        events: ['session-start', 'cost-alert'],
      };
      expect(isEventEnabled(makeEvent('session-start'), config)).toBe(true);
      expect(isEventEnabled(makeEvent('cost-alert'), config)).toBe(true);
      expect(isEventEnabled(makeEvent('agent-call'), config)).toBe(false);
    });
  });

  // ── forwardEvent ──

  describe('forwardEvent', () => {
    it('gateway가 없으면 false', async () => {
      const result = await forwardEvent({
        type: 'session-start',
        timestamp: new Date().toISOString(),
        payload: {},
      });
      expect(result).toBe(false);
    });

    it('gateway 활성 + 유효한 URL이면 fetch 호출', async () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: { url: 'https://test.com/webhook', enabled: true },
      }));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      const result = await forwardEvent({
        type: 'session-start',
        timestamp: new Date().toISOString(),
        payload: { test: true },
      });
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('이벤트가 필터에 없으면 false', async () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: { url: 'https://test.com/webhook', enabled: true, events: ['cost-alert'] },
      }));
      const result = await forwardEvent({
        type: 'session-start',
        timestamp: new Date().toISOString(),
        payload: {},
      });
      expect(result).toBe(false);
    });

    it('유효하지 않은 URL이면 false', async () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: { url: 'http://insecure.com', enabled: true },
      }));
      const result = await forwardEvent({
        type: 'session-start',
        timestamp: new Date().toISOString(),
        payload: {},
      });
      expect(result).toBe(false);
    });

    it('커스텀 headers를 전달', async () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: {
          url: 'https://test.com/webhook',
          enabled: true,
          headers: { 'X-Custom': 'value' },
        },
      }));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      await forwardEvent({
        type: 'session-start',
        timestamp: new Date().toISOString(),
        payload: {},
      });
      const fetchCall = fetchSpy.mock.calls[0];
      const options = fetchCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('value');
      fetchSpy.mockRestore();
    });
  });
});
