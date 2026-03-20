import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-event-gateway-full',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  loadGatewayConfig,
  forwardEvent,
} from '../src/engine/event-gateway.js';
import type { GatewayEvent } from '../src/engine/event-gateway.js';

const COMPOUND_DIR = path.join(TEST_HOME, '.compound');
const GLOBAL_CONFIG_PATH = path.join(COMPOUND_DIR, 'config.json');

function makeEvent(type: GatewayEvent['type'] = 'session-start'): GatewayEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    payload: { test: true },
  };
}

describe('event-gateway - extended', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── loadGatewayConfig ──

  describe('loadGatewayConfig', () => {
    it('설정이 없으면 null 반환', () => {
      expect(loadGatewayConfig()).toBeNull();
    });

    it('gateway가 비활성이면 null 반환', () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: { url: 'https://test.com', enabled: false },
      }));
      expect(loadGatewayConfig()).toBeNull();
    });

    it('gateway가 활성이면 설정 반환', () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: { url: 'https://test.com/webhook', enabled: true },
      }));
      const config = loadGatewayConfig();
      expect(config).not.toBeNull();
      expect(config!.url).toBe('https://test.com/webhook');
    });
  });

  // ── forwardEvent ──

  describe('forwardEvent', () => {
    it('gateway 설정이 없으면 false 반환', async () => {
      const result = await forwardEvent(makeEvent());
      expect(result).toBe(false);
    });

    it('이벤트가 필터에 없으면 false 반환', async () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: {
          url: 'https://test.com/webhook',
          enabled: true,
          events: ['cost-alert'],
        },
      }));
      const result = await forwardEvent(makeEvent('session-start'));
      expect(result).toBe(false);
    });

    it('유효하지 않은 URL이면 false 반환', async () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: {
          url: 'http://insecure.example.com/webhook',
          enabled: true,
        },
      }));
      const result = await forwardEvent(makeEvent());
      expect(result).toBe(false);
    });

    it('fetch 성공 시 true 반환', async () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: {
          url: 'https://test.com/webhook',
          enabled: true,
        },
      }));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      const result = await forwardEvent(makeEvent());
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.com/webhook',
        expect.objectContaining({ method: 'POST' }),
      );
      fetchSpy.mockRestore();
    });

    it('fetch 실패 시 false 반환', async () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify({
        gateway: {
          url: 'https://test.com/webhook',
          enabled: true,
        },
      }));
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
      const result = await forwardEvent(makeEvent());
      expect(result).toBe(false);
      fetchSpy.mockRestore();
    });

    it('커스텀 헤더가 전달된다', async () => {
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
      await forwardEvent(makeEvent());
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Custom': 'value' }),
        }),
      );
      fetchSpy.mockRestore();
    });
  });
});
