import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-notify-full',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import {
  shouldNotify,
  loadNotifyConfig,
  saveNotifyConfig,
  notify,
  handleNotify,
  detectChannel,
} from '../src/core/notify.js';
import type { NotifyEvent } from '../src/core/notify.js';

const COMPOUND_DIR = path.join(TEST_HOME, '.compound');
const NOTIFY_CONFIG = path.join(COMPOUND_DIR, 'notify.json');

describe('notify - extended', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── shouldNotify ──

  describe('shouldNotify', () => {
    const makeEvent = (type: NotifyEvent['type']): NotifyEvent => ({
      type,
      message: 'test',
    });

    it('session-start는 minimal에서 허용', () => {
      expect(shouldNotify(makeEvent('session-start'), 'minimal')).toBe(true);
    });

    it('session-stop는 minimal에서 허용', () => {
      expect(shouldNotify(makeEvent('session-stop'), 'minimal')).toBe(true);
    });

    it('mode-change는 minimal에서 차단', () => {
      expect(shouldNotify(makeEvent('mode-change'), 'minimal')).toBe(false);
    });

    it('agent-call은 agent 레벨에서 허용', () => {
      expect(shouldNotify(makeEvent('agent-call'), 'agent')).toBe(true);
    });

    it('agent-call은 session 레벨에서 차단', () => {
      expect(shouldNotify(makeEvent('agent-call'), 'session')).toBe(false);
    });

    it('hook-trigger는 verbose에서만 허용', () => {
      expect(shouldNotify(makeEvent('hook-trigger'), 'verbose')).toBe(true);
      expect(shouldNotify(makeEvent('hook-trigger'), 'agent')).toBe(false);
      expect(shouldNotify(makeEvent('hook-trigger'), 'session')).toBe(false);
    });

    it('error는 session 이상에서 허용', () => {
      expect(shouldNotify(makeEvent('error'), 'session')).toBe(true);
      expect(shouldNotify(makeEvent('error'), 'agent')).toBe(true);
      expect(shouldNotify(makeEvent('error'), 'verbose')).toBe(true);
    });

    it('cost-alert는 session 이상에서 허용', () => {
      expect(shouldNotify(makeEvent('cost-alert'), 'session')).toBe(true);
      expect(shouldNotify(makeEvent('cost-alert'), 'minimal')).toBe(false);
    });
  });

  // ── loadNotifyConfig / saveNotifyConfig ──

  describe('loadNotifyConfig', () => {
    it('파일이 없으면 enabled: false 반환', () => {
      const config = loadNotifyConfig();
      expect(config.enabled).toBe(false);
    });

    it('유효한 설정을 로드한다', () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(NOTIFY_CONFIG, JSON.stringify({
        enabled: true,
        discord: { webhook: 'https://discord.com/api/webhooks/123/abc' },
      }));
      const config = loadNotifyConfig();
      expect(config.enabled).toBe(true);
      expect(config.discord?.webhook).toBe('https://discord.com/api/webhooks/123/abc');
    });

    it('잘못된 JSON이면 enabled: false 반환', () => {
      fs.mkdirSync(COMPOUND_DIR, { recursive: true });
      fs.writeFileSync(NOTIFY_CONFIG, 'not json');
      const config = loadNotifyConfig();
      expect(config.enabled).toBe(false);
    });
  });

  describe('saveNotifyConfig', () => {
    it('설정을 파일에 저장한다', () => {
      saveNotifyConfig({ enabled: true, discord: { webhook: 'https://test.com/wh' } });
      expect(fs.existsSync(NOTIFY_CONFIG)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(NOTIFY_CONFIG, 'utf-8'));
      expect(saved.enabled).toBe(true);
      expect(saved.discord.webhook).toBe('https://test.com/wh');
    });

    it('디렉토리가 없으면 자동 생성', () => {
      expect(fs.existsSync(COMPOUND_DIR)).toBe(false);
      saveNotifyConfig({ enabled: false });
      expect(fs.existsSync(COMPOUND_DIR)).toBe(true);
    });
  });

  // ── notify (local channels) ──

  describe('notify', () => {
    it('terminal 채널은 stdout에 출력한다', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await notify({ title: 'Test', message: 'Hello', channel: 'terminal' });
      expect(writeSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Test'));
      writeSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('웹훅이 비활성이면 웹훅 전송하지 않음', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await notify({ title: 'Test', message: 'Hello', channel: 'terminal' });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
      writeSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  // ── handleNotify ──

  describe('handleNotify', () => {
    it('인자 없으면 사용법 출력', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify([]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
      logSpy.mockRestore();
    });

    it('config show는 현재 설정을 출력한다', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config', 'show']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Notification Config'));
      logSpy.mockRestore();
    });

    it('config disable은 알림을 비활성화한다', async () => {
      saveNotifyConfig({ enabled: true });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config', 'disable']);
      const config = loadNotifyConfig();
      expect(config.enabled).toBe(false);
      logSpy.mockRestore();
    });

    it('config discord는 Discord 웹훅을 설정한다', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config', 'discord', 'https://discord.com/api/webhooks/123/abc']);
      const config = loadNotifyConfig();
      expect(config.enabled).toBe(true);
      expect(config.discord?.webhook).toBe('https://discord.com/api/webhooks/123/abc');
      logSpy.mockRestore();
    });

    it('config discord with invalid URL은 에러 출력', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handleNotify(['config', 'discord', 'http://insecure.com/wh']);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid URL'));
      errSpy.mockRestore();
    });

    it('config telegram은 Telegram 봇을 설정한다', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config', 'telegram', 'bot-token-123', 'chat-456']);
      const config = loadNotifyConfig();
      expect(config.telegram?.botToken).toBe('bot-token-123');
      expect(config.telegram?.chatId).toBe('chat-456');
      logSpy.mockRestore();
    });

    it('config slack은 Slack 웹훅을 설정한다', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config', 'slack', 'https://hooks.slack.com/services/T/B/X']);
      const config = loadNotifyConfig();
      expect(config.slack?.webhook).toBe('https://hooks.slack.com/services/T/B/X');
      logSpy.mockRestore();
    });

    it('config unknown은 안내 메시지 출력', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotify(['config', 'unknown-channel']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown config'));
      logSpy.mockRestore();
    });

    it('메시지 전송 (terminal 채널)', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      // 직접 notify를 terminal 채널로 호출
      await notify({ title: 'Test', message: 'Hello World', channel: 'terminal' });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Hello World'));
      writeSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  // ── detectChannel ──

  describe('detectChannel', () => {
    it('darwin이면 macos 반환', () => {
      if (process.platform === 'darwin') {
        expect(detectChannel()).toBe('macos');
      }
    });

    it('반환값이 유효한 채널이다', () => {
      const channel = detectChannel();
      expect(['macos', 'terminal']).toContain(channel);
    });
  });
});
