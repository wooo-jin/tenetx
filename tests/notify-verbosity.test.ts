import { describe, it, expect } from 'vitest';
import { shouldNotify } from '../src/core/notify.js';
import type { NotifyEvent } from '../src/core/notify.js';
import type { NotifyVerbosity } from '../src/core/global-config.js';

describe('notify-verbosity', () => {
  // ── minimal ──

  describe('minimal verbosity', () => {
    const verbosity: NotifyVerbosity = 'minimal';

    it('session-start를 허용한다', () => {
      const event: NotifyEvent = { type: 'session-start', message: 'test' };
      expect(shouldNotify(event, verbosity)).toBe(true);
    });

    it('session-stop을 허용한다', () => {
      const event: NotifyEvent = { type: 'session-stop', message: 'test' };
      expect(shouldNotify(event, verbosity)).toBe(true);
    });

    it('mode-change를 차단한다', () => {
      const event: NotifyEvent = { type: 'mode-change', message: 'test' };
      expect(shouldNotify(event, verbosity)).toBe(false);
    });

    it('cost-alert를 차단한다', () => {
      const event: NotifyEvent = { type: 'cost-alert', message: 'test' };
      expect(shouldNotify(event, verbosity)).toBe(false);
    });

    it('agent-call을 차단한다', () => {
      const event: NotifyEvent = { type: 'agent-call', message: 'test' };
      expect(shouldNotify(event, verbosity)).toBe(false);
    });

    it('hook-trigger를 차단한다', () => {
      const event: NotifyEvent = { type: 'hook-trigger', message: 'test' };
      expect(shouldNotify(event, verbosity)).toBe(false);
    });
  });

  // ── session ──

  describe('session verbosity', () => {
    const verbosity: NotifyVerbosity = 'session';

    it('session-start를 허용한다', () => {
      expect(shouldNotify({ type: 'session-start', message: '' }, verbosity)).toBe(true);
    });

    it('mode-change를 허용한다', () => {
      expect(shouldNotify({ type: 'mode-change', message: '' }, verbosity)).toBe(true);
    });

    it('cost-alert를 허용한다', () => {
      expect(shouldNotify({ type: 'cost-alert', message: '' }, verbosity)).toBe(true);
    });

    it('error를 허용한다', () => {
      expect(shouldNotify({ type: 'error', message: '' }, verbosity)).toBe(true);
    });

    it('agent-call을 차단한다', () => {
      expect(shouldNotify({ type: 'agent-call', message: '' }, verbosity)).toBe(false);
    });

    it('hook-trigger를 차단한다', () => {
      expect(shouldNotify({ type: 'hook-trigger', message: '' }, verbosity)).toBe(false);
    });
  });

  // ── agent ──

  describe('agent verbosity', () => {
    const verbosity: NotifyVerbosity = 'agent';

    it('session-start를 허용한다', () => {
      expect(shouldNotify({ type: 'session-start', message: '' }, verbosity)).toBe(true);
    });

    it('agent-call을 허용한다', () => {
      expect(shouldNotify({ type: 'agent-call', message: '' }, verbosity)).toBe(true);
    });

    it('agent-done을 허용한다', () => {
      expect(shouldNotify({ type: 'agent-done', message: '' }, verbosity)).toBe(true);
    });

    it('hook-trigger를 차단한다', () => {
      expect(shouldNotify({ type: 'hook-trigger', message: '' }, verbosity)).toBe(false);
    });
  });

  // ── verbose ──

  describe('verbose verbosity', () => {
    const verbosity: NotifyVerbosity = 'verbose';

    it('모든 이벤트를 허용한다', () => {
      const types: NotifyEvent['type'][] = [
        'session-start', 'session-stop', 'mode-change',
        'cost-alert', 'error', 'agent-call', 'agent-done', 'hook-trigger',
      ];
      for (const type of types) {
        expect(shouldNotify({ type, message: '' }, verbosity)).toBe(true);
      }
    });
  });

  // ── metadata ──

  it('metadata가 있어도 정상 동작한다', () => {
    const event: NotifyEvent = {
      type: 'cost-alert',
      message: '$5.00 spent',
      metadata: { cost: 5.0, sessionId: 'abc' },
    };
    expect(shouldNotify(event, 'session')).toBe(true);
    expect(shouldNotify(event, 'minimal')).toBe(false);
  });
});
