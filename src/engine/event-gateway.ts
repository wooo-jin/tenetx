/**
 * Tenetx — Event Gateway
 *
 * 세션 이벤트를 외부 webhook으로 포워딩합니다.
 * Fire-and-forget 방식으로 실패 시 세션에 영향을 주지 않습니다.
 */

import { loadGlobalConfig, saveGlobalConfig } from '../core/global-config.js';
import type { GatewayConfig } from '../core/global-config.js';
import { debugLog } from '../core/logger.js';
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
    debugLog('gateway', `유효하지 않은 URL: ${config.url}`);
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
    debugLog('gateway', '이벤트 포워딩 실패', e);
    return false;
  }
}

// ── CLI Handler ──

export async function handleGateway(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === 'config' && args[1]) {
    const url = args[1];
    if (!validateWebhookUrl(url)) {
      console.error('  유효하지 않은 URL입니다. HTTPS URL을 입력하세요.');
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
    console.log(`  Gateway 설정 완료: ${url}`);
    return;
  }

  if (subcommand === 'test') {
    const gwConfig = loadGatewayConfig();
    if (!gwConfig) {
      console.log('  Gateway가 설정되지 않았거나 비활성화 상태입니다.');
      console.log('  설정: tenetx gateway config <url>');
      return;
    }
    console.log(`  테스트 이벤트 전송 중... (${gwConfig.url})`);
    const testEvent: GatewayEvent = {
      type: 'session-start',
      timestamp: new Date().toISOString(),
      payload: { test: true, source: 'tenetx gateway test' },
    };
    const ok = await forwardEvent(testEvent);
    if (ok) {
      console.log('  테스트 성공!');
    } else {
      console.log('  테스트 실패. URL과 네트워크를 확인하세요.');
    }
    return;
  }

  if (subcommand === 'disable') {
    const config = loadGlobalConfig();
    if (config.gateway) {
      config.gateway.enabled = false;
      saveGlobalConfig(config);
    }
    console.log('  Gateway 비활성화됨');
    return;
  }

  // help
  console.log('  사용법: tenetx gateway <command>');
  console.log('');
  console.log('  Commands:');
  console.log('    config <url>     Gateway webhook URL 설정');
  console.log('    test             테스트 이벤트 전송');
  console.log('    disable          Gateway 비활성화');
}
