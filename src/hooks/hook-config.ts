/**
 * Tenetx — Hook Config Loader
 *
 * ~/.compound/hook-config.json 에서 훅별 설정을 읽어 반환합니다.
 * 파일이 없거나 읽기에 실패하면 null 을 반환합니다 (failure-tolerant).
 *
 * 설정 형식 (hook-config.json):
 * {
 *   "tiers": { "compound-core": { "enabled": true }, "safety": { "enabled": true }, "workflow": { "enabled": true } },
 *   "hooks": { "hookName": { "enabled": false, ...customConfig } },
 *   "hookName": { "enabled": false }  // 레거시 호환 (hooks 키 없이 직접 지정)
 * }
 *
 * 안전 보장:
 *   - compound-core 티어는 tiers 설정으로 비활성화 불가 (복리화 보호)
 *   - 개별 hooks.hookName.enabled: false 로만 비활성화 가능
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { HOOK_REGISTRY } from './hook-registry.js';
import { TENETX_HOME } from '../core/paths.js';

const HOOK_CONFIG_PATH = path.join(TENETX_HOME, 'hook-config.json');

/**
 * 훅 → 티어 매핑 (hook-registry.ts에서 자동 파생).
 * 이중 구현 방지: HOOK_REGISTRY가 단일 소스 오브 트루스.
 */
const HOOK_TIER_MAP: Record<string, 'compound-core' | 'safety' | 'workflow'> =
  Object.fromEntries(HOOK_REGISTRY.map(h => [h.name, h.tier]));

/** 프로세스 내 설정 캐시 (각 훅은 별도 프로세스이므로 수명 = 1회 실행) */
let _configCache: Record<string, unknown> | null | undefined;

/** 전체 설정 파일을 파싱합니다. 실패 시 null. 프로세스 내 캐싱. */
function loadFullConfig(): Record<string, unknown> | null {
  if (_configCache !== undefined) return _configCache;
  try {
    if (!fs.existsSync(HOOK_CONFIG_PATH)) {
      _configCache = null;
      return null;
    }
    _configCache = JSON.parse(fs.readFileSync(HOOK_CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
    return _configCache;
  } catch {
    _configCache = null;
    return null;
  }
}

/** 특정 훅의 설정을 반환합니다. 실패 시 null 반환. */
export function loadHookConfig(hookName: string): Record<string, unknown> | null {
  const all = loadFullConfig();
  if (!all) return null;

  // v2 형식: hooks.hookName
  const hooksSection = all.hooks as Record<string, Record<string, unknown>> | undefined;
  if (hooksSection?.[hookName]) return hooksSection[hookName];

  // 레거시 형식: 최상위에 hookName 직접 지정
  const legacy = all[hookName] as Record<string, unknown> | undefined;
  return legacy ?? null;
}

/**
 * 훅이 활성화되어 있는지 확인합니다.
 *
 * 우선순위:
 *   1. hooks.hookName.enabled (개별 훅 설정)
 *   2. tiers.tierName.enabled (티어 설정) — compound-core는 티어 비활성화 무시
 *   3. hookName.enabled (레거시 형식)
 *   4. 기본값 true (하위호환)
 */
export function isHookEnabled(hookName: string): boolean {
  const all = loadFullConfig();
  if (!all) return true;

  // 1) 개별 훅 설정 (v2: hooks 섹션)
  const hooksSection = all.hooks as Record<string, Record<string, unknown>> | undefined;
  if (hooksSection?.[hookName]?.enabled === false) return false;
  if (hooksSection?.[hookName]?.enabled === true) return true;

  // 2) 티어 설정 — compound-core는 절대 티어 비활성화로 끄지 않음
  const tier = HOOK_TIER_MAP[hookName];
  if (tier && tier !== 'compound-core') {
    const tiers = all.tiers as Record<string, Record<string, unknown>> | undefined;
    if (tiers?.[tier]?.enabled === false) return false;
  }

  // 3) 레거시 형식 (최상위 hookName.enabled)
  const legacy = all[hookName] as Record<string, unknown> | undefined;
  if (legacy?.enabled === false) return false;

  // 4) 기본값: 활성화
  return true;
}
