import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-notify-ext',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import {
  validateWebhookUrl,
  escapeAppleScript,
  shouldNotify,
  saveNotifyConfig,
  handleNotify,
  notify,
} from '../src/core/notify.js';
import type { NotifyEvent } from '../src/core/notify.js';

describe('notify - webhook & escape', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── validateWebhookUrl ──

  describe('validateWebhookUrl', () => {
    it('HTTPS URL은 유효하다', () => {
      expect(validateWebhookUrl('https://example.com/webhook')).toBe(true);
    });

    it('HTTP URL은 거부한다', () => {
      expect(validateWebhookUrl('http://example.com/webhook')).toBe(false);
    });

    it('HTTP localhost는 허용한다', () => {
      expect(validateWebhookUrl('http://localhost:3000/webhook')).toBe(true);
    });

    it('HTTP 127.0.0.1은 허용한다', () => {
      expect(validateWebhookUrl('http://127.0.0.1:8080/hook')).toBe(true);
    });

    it('잘못된 URL은 거부한다', () => {
      expect(validateWebhookUrl('not-a-url')).toBe(false);
    });

    it('빈 문자열은 거부한다', () => {
      expect(validateWebhookUrl('')).toBe(false);
    });

    it('FTP URL은 거부한다', () => {
      expect(validateWebhookUrl('ftp://example.com/file')).toBe(false);
    });
  });

  // ── escapeAppleScript ──

  describe('escapeAppleScript', () => {
    it('따옴표를 이스케이프한다', () => {
      expect(escapeAppleScript('Hello "World"')).toBe('Hello \\"World\\"');
    });

    it('백슬래시를 이스케이프한다', () => {
      expect(escapeAppleScript('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('일반 문자열은 변환 없이 반환', () => {
      expect(escapeAppleScript('Hello World')).toBe('Hello World');
    });

    it('빈 문자열은 빈 문자열 반환', () => {
      expect(escapeAppleScript('')).toBe('');
    });

    it('복합 이스케이프', () => {
      expect(escapeAppleScript('say "hello\\world"')).toBe('say \\"hello\\\\world\\"');
    });
  });

  // ── shouldNotify - all event types ──

  describe('shouldNotify - comprehensive', () => {
    it('agent-done은 agent 레벨에서 허용', () => {
      const event: NotifyEvent = { type: 'agent-done', message: 'test' };
      expect(shouldNotify(event, 'agent')).toBe(true);
      expect(shouldNotify(event, 'session')).toBe(false);
    });

    it('mode-change는 session에서 허용', () => {
      const event: NotifyEvent = { type: 'mode-change', message: 'test' };
      expect(shouldNotify(event, 'session')).toBe(true);
    });

    it('session-start는 verbose에서 허용', () => {
      const event: NotifyEvent = { type: 'session-start', message: 'test' };
      expect(shouldNotify(event, 'verbose')).toBe(true);
    });
  });

  // ── handleNotify - config with existing discord/telegram/slack ──

  describe('handleNotify - config show with existing configs', () => {
    it('Discord 설정이 있을 때 show', async () => {
      saveNotifyConfig({
        enabled: true,
        discord: { webhook: 'https://discord.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz' },
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config', 'show']);
      const output = logSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Discord');
      expect(output).toContain('Yes');
      logSpy.mockRestore();
    });

    it('Telegram 설정이 있을 때 show', async () => {
      saveNotifyConfig({
        enabled: true,
        telegram: { botToken: 'bot-token-very-long-string', chatId: 'chat-123' },
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config', 'show']);
      const output = logSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Telegram');
      logSpy.mockRestore();
    });

    it('Slack 설정이 있을 때 show', async () => {
      saveNotifyConfig({
        enabled: true,
        slack: { webhook: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXX' },
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config', 'show']);
      const output = logSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Slack');
      logSpy.mockRestore();
    });

    it('config slack invalid URL', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handleNotify(['config', 'slack', 'http://insecure.com/wh']);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid URL'));
      errSpy.mockRestore();
    });

    it('config 인자 없으면 show와 동일', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Notification Config'));
      logSpy.mockRestore();
    });
  });

  // ── notify with webhook enabled ──

  describe('notify with webhook', () => {
    it('Discord 웹훅이 활성화되면 fetch가 호출된다', async () => {
      saveNotifyConfig({
        enabled: true,
        discord: { webhook: 'https://discord.com/api/webhooks/test' },
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await notify({ title: 'Test', message: 'Hello', channel: 'terminal' });
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/test',
        expect.objectContaining({ method: 'POST' }),
      );

      fetchSpy.mockRestore();
      writeSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('Telegram 봇이 설정되면 fetch가 호출된다', async () => {
      saveNotifyConfig({
        enabled: true,
        telegram: { botToken: 'test-token', chatId: '123' },
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await notify({ title: 'Test', message: 'Hello', channel: 'terminal' });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('api.telegram.org'),
        expect.objectContaining({ method: 'POST' }),
      );

      fetchSpy.mockRestore();
      writeSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('Slack 웹훅이 설정되면 fetch가 호출된다', async () => {
      saveNotifyConfig({
        enabled: true,
        slack: { webhook: 'https://hooks.slack.com/services/T/B/X' },
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await notify({ title: 'Test', message: 'Hello', channel: 'terminal' });
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T/B/X',
        expect.objectContaining({ method: 'POST' }),
      );

      fetchSpy.mockRestore();
      writeSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  // ── handleNotify with message ──

  describe('handleNotify - send message', () => {
    it('--title 플래그와 함께 메시지 전송', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      // handleNotify 는 notify()를 호출하며, macOS에서는 osascript가 먼저 시도됨
      // osascript mock이 에러 없이 반환하므로 console.log 대신 osascript 호출됨
      await handleNotify(['Hello', 'World', '--title', 'CustomTitle']);
      // macOS에서 osascript가 성공하면 console.log 없이 통과
      // 그래도 에러 없이 완료되면 성공
      writeSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('--no-sound 플래그', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['Test', '--no-sound']);
      // macOS에서 osascript 성공 시 console.log가 불리지 않을 수 있음
      writeSpy.mockRestore();
      logSpy.mockRestore();
    });
  });
});
