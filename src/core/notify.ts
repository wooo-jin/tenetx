import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from './logger.js';
import { loadGlobalConfig } from './global-config.js';
import type { NotifyVerbosity } from './global-config.js';

export type NotifyChannel = 'macos' | 'terminal' | 'discord' | 'telegram' | 'slack';

// ── Notify Event + Verbosity ──

export type NotifyEventType =
  | 'session-start' | 'session-stop'
  | 'mode-change' | 'cost-alert' | 'error'
  | 'agent-call' | 'agent-done'
  | 'hook-trigger';

export interface NotifyEvent {
  type: NotifyEventType;
  message: string;
  metadata?: Record<string, unknown>;
}

/** 이벤트 타입별 허용 verbosity 레벨 */
const VERBOSITY_MAP: Record<NotifyEventType, NotifyVerbosity[]> = {
  'session-start': ['minimal', 'session', 'agent', 'verbose'],
  'session-stop':  ['minimal', 'session', 'agent', 'verbose'],
  'mode-change':   ['session', 'agent', 'verbose'],
  'cost-alert':    ['session', 'agent', 'verbose'],
  'error':         ['session', 'agent', 'verbose'],
  'agent-call':    ['agent', 'verbose'],
  'agent-done':    ['agent', 'verbose'],
  'hook-trigger':  ['verbose'],
};

/** 이벤트가 현재 verbosity 레벨에서 알림되어야 하는지 판정 */
export function shouldNotify(event: NotifyEvent, verbosity: NotifyVerbosity): boolean {
  const allowed = VERBOSITY_MAP[event.type];
  if (!allowed) return false;
  return allowed.includes(verbosity);
}

/** Verbosity 기반 이벤트 알림 전송 */
export async function notifyEvent(event: NotifyEvent): Promise<void> {
  const config = loadGlobalConfig();
  const verbosity = config.notifyVerbosity ?? 'session';

  if (!shouldNotify(event, verbosity)) return;

  await notify({
    title: `[${event.type}]`,
    message: event.message,
    sound: event.type === 'error' || event.type === 'cost-alert',
  });
}

interface NotifyOptions {
  title: string;
  message: string;
  sound?: boolean;
  channel?: NotifyChannel;
}

interface WebhookConfig {
  enabled: boolean;
  discord?: { webhook: string; tagList?: string };
  telegram?: { botToken: string; chatId: string; tagList?: string };
  slack?: { webhook: string; tagList?: string };
}

const NOTIFY_CONFIG_PATH = path.join(os.homedir(), '.compound', 'notify.json');

/** 알림 설정 로드 */
export function loadNotifyConfig(): WebhookConfig {
  if (!fs.existsSync(NOTIFY_CONFIG_PATH)) {
    return { enabled: false };
  }
  try {
    return JSON.parse(fs.readFileSync(NOTIFY_CONFIG_PATH, 'utf-8'));
  } catch (e) {
    debugLog('notify', 'notify.json 파싱 실패', e);
    return { enabled: false };
  }
}

/** 알림 설정 저장 */
export function saveNotifyConfig(config: WebhookConfig): void {
  fs.mkdirSync(path.dirname(NOTIFY_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(NOTIFY_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** macOS 네이티브 알림 */
function notifyMacOS(title: string, message: string, sound: boolean): boolean {
  try {
    const soundPart = sound ? 'sound name "default"' : '';
    const script = `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}" ${soundPart}`;
    execFileSync('osascript', ['-e', script], { stdio: 'ignore' });
    return true;
  } catch (e) {
    debugLog('notify', 'macOS 알림 실패', e);
    return false;
  }
}

export function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** 터미널 벨 알림 */
function notifyTerminal(title: string, message: string): void {
  process.stdout.write(`\x1b]0;[tenetx] ${title}\x07`);
  process.stdout.write('\x07');
  console.log(`\n  [tenetx] ${title}: ${message}\n`);
}

/** URL 스킴 검증 (HTTPS 필수, localhost 제외) */
export function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    // localhost/127.0.0.1은 HTTP 허용 (개발용)
    if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) return true;
    return false;
  } catch (e) {
    debugLog('notify', `URL 파싱 실패: ${url}`, e);
    return false;
  }
}

/** HTTP POST 헬퍼 (fetch API 사용, shell injection 방지) */
async function postJSON(url: string, payload: unknown, timeoutMs = 10000): Promise<boolean> {
  if (!validateWebhookUrl(url)) {
    console.error(`[tenetx] Unsafe URL: ${url} (HTTPS required)`);
    return false;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch (e) {
    debugLog('notify', `웹훅 POST 실패: ${url}`, e);
    return false;
  }
}

/** Discord 웹훅 알림 */
async function notifyDiscord(webhook: string, title: string, message: string, tagList?: string): Promise<boolean> {
  const tags = tagList ? `\n${tagList}` : '';
  return postJSON(webhook, {
    embeds: [{
      title: `[Tenetx] ${title}`,
      description: `${message}${tags}`,
      color: 0x7C3AED,
      timestamp: new Date().toISOString(),
    }],
  });
}

/** Telegram 봇 알림 */
async function notifyTelegram(botToken: string, chatId: string, title: string, message: string, tagList?: string): Promise<boolean> {
  const tags = tagList ? `\n${tagList}` : '';
  const text = `*[Tenetx] ${title}*\n${message}${tags}`;
  return postJSON(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  });
}

/** Slack 웹훅 알림 */
async function notifySlack(webhook: string, title: string, message: string, tagList?: string): Promise<boolean> {
  const tags = tagList ? `\n${tagList}` : '';
  return postJSON(webhook, {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `[Tenetx] ${title}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `${message}${tags}` },
      },
    ],
  });
}

/** 알림 전송 (모든 활성 채널로) */
export async function notify(options: NotifyOptions): Promise<void> {
  const channel = options.channel ?? detectChannel();

  // 로컬 알림
  switch (channel) {
    case 'macos':
      if (!notifyMacOS(options.title, options.message, options.sound ?? true)) {
        notifyTerminal(options.title, options.message);
      }
      break;
    case 'terminal':
      notifyTerminal(options.title, options.message);
      break;
    default:
      break;
  }

  // 웹훅 알림 (설정된 채널 모두, 병렬 전송)
  const config = loadNotifyConfig();
  if (!config.enabled) return;

  const promises: Promise<boolean>[] = [];

  if (config.discord?.webhook) {
    promises.push(notifyDiscord(config.discord.webhook, options.title, options.message, config.discord.tagList));
  }
  if (config.telegram?.botToken && config.telegram?.chatId) {
    promises.push(notifyTelegram(config.telegram.botToken, config.telegram.chatId, options.title, options.message, config.telegram.tagList));
  }
  if (config.slack?.webhook) {
    promises.push(notifySlack(config.slack.webhook, options.title, options.message, config.slack.tagList));
  }

  await Promise.allSettled(promises);
}

export function detectChannel(): NotifyChannel {
  if (process.platform === 'darwin') return 'macos';
  return 'terminal';
}

/** CLI 핸들러: tenetx notify */
export async function handleNotify(args: string[]): Promise<void> {
  // tenetx notify config — 알림 설정
  if (args[0] === 'config') {
    await handleNotifyConfig(args.slice(1));
    return;
  }

  if (args.length === 0) {
    console.log('  Usage: tenetx notify "message"');
    console.log('  Options:');
    console.log('    --title "title"    Notification title (default: Tenetx)');
    console.log('    --no-sound         Silent notification');
    console.log('');
    console.log('  External notification setup:');
    console.log('    tenetx notify config discord <webhook-url>');
    console.log('    tenetx notify config telegram <bot-token> <chat-id>');
    console.log('    tenetx notify config slack <webhook-url>');
    console.log('    tenetx notify config show');
    console.log('    tenetx notify config disable');
    return;
  }

  const titleIdx = args.indexOf('--title');
  const title = titleIdx !== -1 ? args[titleIdx + 1] : 'Tenetx';
  const noSound = args.includes('--no-sound');
  const message = args.filter(a => !a.startsWith('--') && a !== title).join(' ');

  await notify({ title, message: message || 'Done', sound: !noSound });
}

/** 알림 설정 CLI */
async function handleNotifyConfig(args: string[]): Promise<void> {
  const config = loadNotifyConfig();

  if (args[0] === 'show' || args.length === 0) {
    console.log('\n  [Notification Config]');
    console.log(`  Enabled: ${config.enabled ? 'Yes' : 'No'}`);
    if (config.discord?.webhook) {
      console.log(`  Discord: ${config.discord.webhook.slice(0, 40)}...`);
    }
    if (config.telegram?.botToken) {
      console.log(`  Telegram: bot=${config.telegram.botToken.slice(0, 10)}... chat=${config.telegram.chatId}`);
    }
    if (config.slack?.webhook) {
      console.log(`  Slack: ${config.slack.webhook.slice(0, 40)}...`);
    }
    console.log();
    return;
  }

  if (args[0] === 'disable') {
    config.enabled = false;
    saveNotifyConfig(config);
    console.log('  Notifications disabled');
    return;
  }

  if (args[0] === 'discord' && args[1]) {
    if (!validateWebhookUrl(args[1])) {
      console.error('  Invalid URL. Please enter an HTTPS URL.');
      return;
    }
    config.enabled = true;
    config.discord = { webhook: args[1], tagList: args[2] };
    saveNotifyConfig(config);
    console.log('  Discord webhook configured');
    return;
  }

  if (args[0] === 'telegram' && args[1] && args[2]) {
    config.enabled = true;
    config.telegram = { botToken: args[1], chatId: args[2], tagList: args[3] };
    saveNotifyConfig(config);
    console.log('  Telegram bot configured');
    return;
  }

  if (args[0] === 'slack' && args[1]) {
    if (!validateWebhookUrl(args[1])) {
      console.error('  Invalid URL. Please enter an HTTPS URL.');
      return;
    }
    config.enabled = true;
    config.slack = { webhook: args[1], tagList: args[2] };
    saveNotifyConfig(config);
    console.log('  Slack webhook configured');
    return;
  }

  console.log('  Unknown config command. Run tenetx notify config show to view current settings.');
}
