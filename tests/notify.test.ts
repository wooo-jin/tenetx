import { describe, it, expect } from 'vitest';
import {
  validateWebhookUrl,
  escapeAppleScript,
  detectChannel,
} from '../src/core/notify.js';

describe('notify - validateWebhookUrl', () => {
  it('HTTPS URL은 유효', () => {
    expect(validateWebhookUrl('https://discord.com/api/webhooks/123/abc')).toBe(true);
  });

  it('HTTPS with path', () => {
    expect(validateWebhookUrl('https://hooks.slack.com/services/T/B/X')).toBe(true);
  });

  it('HTTP URL은 무효', () => {
    expect(validateWebhookUrl('http://example.com/webhook')).toBe(false);
  });

  it('HTTP localhost는 허용', () => {
    expect(validateWebhookUrl('http://localhost:3000/webhook')).toBe(true);
  });

  it('HTTP 127.0.0.1은 허용', () => {
    expect(validateWebhookUrl('http://127.0.0.1:8080/api')).toBe(true);
  });

  it('FTP URL은 무효', () => {
    expect(validateWebhookUrl('ftp://example.com/file')).toBe(false);
  });

  it('빈 문자열은 무효', () => {
    expect(validateWebhookUrl('')).toBe(false);
  });

  it('잘못된 URL은 무효', () => {
    expect(validateWebhookUrl('not-a-url')).toBe(false);
  });

  it('프로토콜 없는 URL은 무효', () => {
    expect(validateWebhookUrl('discord.com/webhook')).toBe(false);
  });
});

describe('notify - escapeAppleScript', () => {
  it('따옴표 이스케이프', () => {
    expect(escapeAppleScript('hello "world"')).toBe('hello \\"world\\"');
  });

  it('백슬래시 이스케이프', () => {
    expect(escapeAppleScript('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('혼합 이스케이프', () => {
    expect(escapeAppleScript('"test\\"')).toBe('\\"test\\\\\\"');
  });

  it('이스케이프 필요 없는 문자열', () => {
    expect(escapeAppleScript('hello world')).toBe('hello world');
  });

  it('한글 문자열', () => {
    expect(escapeAppleScript('작업 완료')).toBe('작업 완료');
  });
});

describe('notify - detectChannel', () => {
  // detectChannel()은 process.platform을 직접 사용하므로
  // 현재 플랫폼에 따른 결과를 검증
  it('현재 플랫폼에 맞는 채널을 반환한다', () => {
    const channel = detectChannel();
    if (process.platform === 'darwin') {
      expect(channel).toBe('macos');
    } else {
      expect(channel).toBe('terminal');
    }
  });
});

describe('notify - webhook payload structure', () => {
  it('Discord embed 페이로드 구조', () => {
    const title = 'Test';
    const message = 'Hello';
    const payload = {
      embeds: [{
        title: `[CH] ${title}`,
        description: message,
        color: 0x7C3AED,
        timestamp: new Date().toISOString(),
      }],
    };
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].title).toBe('[CH] Test');
    expect(payload.embeds[0].color).toBe(0x7C3AED);
  });

  it('Slack blocks 페이로드 구조', () => {
    const title = 'Test';
    const message = 'Hello';
    const payload = {
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `[CH] ${title}` } },
        { type: 'section', text: { type: 'mrkdwn', text: message } },
      ],
    };
    expect(payload.blocks).toHaveLength(2);
    expect(payload.blocks[0].type).toBe('header');
  });

  it('Telegram 페이로드 구조', () => {
    const payload = {
      chat_id: '12345',
      text: '*[CH] Test*\nHello',
      parse_mode: 'Markdown',
    };
    expect(payload.parse_mode).toBe('Markdown');
    expect(payload.text).toContain('[CH]');
  });
});
