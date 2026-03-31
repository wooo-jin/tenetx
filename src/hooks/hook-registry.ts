/**
 * Tenetx — Hook Registry
 *
 * 모든 훅의 메타데이터를 중앙 관리합니다.
 * 단일 소스 오브 트루스: hooks/hook-registry.json
 * postinstall.js와 이 모듈이 동일한 JSON을 읽으므로 중복/불일치 방지.
 *
 * 3개 티어로 분류:
 *   - compound-core: 경험 축적 엔진 (항상 활성)
 *   - safety: 범용 안전 훅 (기본 활성, 개별 비활성 가능)
 *   - workflow: 워크플로우 스킬 훅 (다른 플러그인 감지 시 자동 비활성)
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export type HookTier = 'compound-core' | 'safety' | 'workflow';

export type HookEventType =
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'Stop'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PermissionRequest';

export interface HookEntry {
  /** 고유 이름 (hook-config.json에서 사용) */
  name: string;
  /** 티어 분류 */
  tier: HookTier;
  /** Claude Code 훅 이벤트 */
  event: HookEventType;
  /** 도구명 매칭 패턴 (regex 또는 '*'). Best practice: 필요한 도구만 필터링. */
  matcher: string;
  /** 실행 스크립트 (dist/ 기준 상대 경로) */
  script: string;
  /** 타임아웃 (초) */
  timeout: number;
  /** compound 피드백 루프에 필수인 훅인지 */
  compoundCritical: boolean;
}

/**
 * 단일 소스 오브 트루스: hooks/hook-registry.json
 *
 * 순서가 중요함:
 *   - pre-tool-use는 db-guard/rate-limiter보다 앞에 위치
 *     (Code Reflection + permission hints 주입 타이밍)
 *   - 같은 이벤트 내 훅은 배열 순서대로 실행됨
 */
export const HOOK_REGISTRY: HookEntry[] = require('../../hooks/hook-registry.json');

/** 티어별 훅 목록 조회 */
export function getHooksByTier(tier: HookTier): HookEntry[] {
  return HOOK_REGISTRY.filter(h => h.tier === tier);
}

/** compound-critical 훅만 조회 (이 훅들은 비활성화하면 복리화가 깨짐) */
export function getCompoundCriticalHooks(): HookEntry[] {
  return HOOK_REGISTRY.filter(h => h.compoundCritical);
}
