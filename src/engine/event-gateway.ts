/**
 * Tenetx — Event Gateway
 *
 * 세션 이벤트를 외부 webhook으로 포워딩합니다.
 * Fire-and-forget 방식으로 실패 시 세션에 영향을 주지 않습니다.
 */

import { loadGlobalConfig, saveGlobalConfig } from '../core/global-config.js';
import type { GatewayConfig } from '../core/global-config.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('gateway');
import { validateWebhookUrl } from '../core/notify.js';

export interface GatewayEvent {
  type: 'session-start' | 'session-stop' | 'mode-change' | 'agent-call' | 'cost-alert' | 'constraint-violation';
  timestamp: string;
  sessionId?: string;
  payload: Record<string, unknown>;
}

/** 글로벌 설정에서 게이트웨이 설정 로드 */
export function loadGatewayConfig(): GatewayConfig | null {
  const config = loadGlobalConfig();
  if (!config.gateway || !config.gateway.enabled) return null;
  return config.gateway;
}

/** 이벤트가 게이트웨이 설정에서 활성화되어 있는지 판정 */
export function isEventEnabled(event: GatewayEvent, config: GatewayConfig): boolean {
  // events 필터가 없거나 빈 배열이면 모든 이벤트 허용
  if (!config.events || config.events.length === 0) return true;
  return config.events.includes(event.type);
}

/** 이벤트를 외부 webhook으로 포워딩 (fire-and-forget) */
export async function forwardEvent(event: GatewayEvent): Promise<boolean> {
  const config = loadGatewayConfig();
  if (!config) return false;

  if (!isEventEnabled(event, config)) return false;

  if (!validateWebhookUrl(config.url)) {
    log.debug(`유효하지 않은 URL: ${config.url}`);
    return false;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers ?? {}),
    };

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    });

    return response.ok;
  } catch (e) {
    log.debug('이벤트 포워딩 실패', e);
    return false;
  }
}

// ── CLI Handler ──

export async function handleGateway(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === 'config' && args[1]) {
    const url = args[1];
    if (!validateWebhookUrl(url)) {
      console.error('  Invalid URL. Please enter an HTTPS URL.');
      return;
    }
    const config = loadGlobalConfig();
    config.gateway = {
      url,
      enabled: true,
      headers: config.gateway?.headers,
      events: config.gateway?.events,
    };
    saveGlobalConfig(config);
    console.log(`  Gateway configured: ${url}`);
    return;
  }

  if (subcommand === 'test') {
    const gwConfig = loadGatewayConfig();
    if (!gwConfig) {
      console.log('  Gateway is not configured or is disabled.');
      console.log('  Configure: tenetx gateway config <url>');
      return;
    }
    console.log(`  Sending test event... (${gwConfig.url})`);
    const testEvent: GatewayEvent = {
      type: 'session-start',
      timestamp: new Date().toISOString(),
      payload: { test: true, source: 'tenetx gateway test' },
    };
    const ok = await forwardEvent(testEvent);
    if (ok) {
      console.log('  Test succeeded!');
    } else {
      console.log('  Test failed. Check the URL and network.');
    }
    return;
  }

  if (subcommand === 'disable') {
    const config = loadGlobalConfig();
    if (config.gateway) {
      config.gateway.enabled = false;
      saveGlobalConfig(config);
    }
    console.log('  Gateway disabled');
    return;
  }

  // help
  console.log('  Usage: tenetx gateway <command>');
  console.log('');
  console.log('  Commands:');
  console.log('    config <url>     Set gateway webhook URL');
  console.log('    test             Send a test event');
  console.log('    disable          Disable the gateway');
}
