import { describe, it, expect } from 'vitest';
import { isEventEnabled } from '../src/engine/event-gateway.js';
import type { GatewayEvent } from '../src/engine/event-gateway.js';
import type { GatewayConfig } from '../src/core/global-config.js';

describe('event-gateway', () => {
  const makeEvent = (type: GatewayEvent['type']): GatewayEvent => ({
    type,
    timestamp: new Date().toISOString(),
    payload: { test: true },
  });

  const makeConfig = (overrides?: Partial<GatewayConfig>): GatewayConfig => ({
    url: 'https://example.com/webhook',
    enabled: true,
    ...overrides,
  });

  // ── isEventEnabled ──

  describe('isEventEnabled', () => {
    it('events 필터가 없으면 모든 이벤트 허용', () => {
      const config = makeConfig();
      expect(isEventEnabled(makeEvent('session-start'), config)).toBe(true);
      expect(isEventEnabled(makeEvent('cost-alert'), config)).toBe(true);
      expect(isEventEnabled(makeEvent('constraint-violation'), config)).toBe(true);
    });

    it('events 필터가 빈 배열이면 모든 이벤트 허용', () => {
      const config = makeConfig({ events: [] });
      expect(isEventEnabled(makeEvent('session-start'), config)).toBe(true);
      expect(isEventEnabled(makeEvent('agent-call'), config)).toBe(true);
    });

    it('events 필터에 포함된 이벤트만 허용', () => {
      const config = makeConfig({ events: ['session-start', 'session-stop'] });
      expect(isEventEnabled(makeEvent('session-start'), config)).toBe(true);
      expect(isEventEnabled(makeEvent('session-stop'), config)).toBe(true);
      expect(isEventEnabled(makeEvent('cost-alert'), config)).toBe(false);
      expect(isEventEnabled(makeEvent('agent-call'), config)).toBe(false);
    });

    it('단일 이벤트 필터', () => {
      const config = makeConfig({ events: ['cost-alert'] });
      expect(isEventEnabled(makeEvent('cost-alert'), config)).toBe(true);
      expect(isEventEnabled(makeEvent('session-start'), config)).toBe(false);
    });
  });

  // ── GatewayEvent 구조 ──

  describe('GatewayEvent structure', () => {
    it('모든 필수 필드를 포함한다', () => {
      const event = makeEvent('session-start');
      expect(event.type).toBe('session-start');
      expect(typeof event.timestamp).toBe('string');
      expect(event.payload).toBeDefined();
    });

    it('sessionId는 선택적이다', () => {
      const event: GatewayEvent = {
        type: 'mode-change',
        timestamp: new Date().toISOString(),
        sessionId: 'test-session-123',
        payload: { mode: 'autopilot' },
      };
      expect(event.sessionId).toBe('test-session-123');
    });

    it('모든 이벤트 타입이 유효하다', () => {
      const types: GatewayEvent['type'][] = [
        'session-start', 'session-stop', 'mode-change',
        'agent-call', 'cost-alert', 'constraint-violation',
      ];
      for (const type of types) {
        const event = makeEvent(type);
        expect(event.type).toBe(type);
      }
    });
  });

  // ── GatewayConfig 구조 ──

  describe('GatewayConfig structure', () => {
    it('기본 설정', () => {
      const config = makeConfig();
      expect(config.url).toBe('https://example.com/webhook');
      expect(config.enabled).toBe(true);
    });

    it('커스텀 헤더 지원', () => {
      const config = makeConfig({
        headers: { Authorization: 'Bearer token123' },
      });
      expect(config.headers?.Authorization).toBe('Bearer token123');
    });
  });
});
