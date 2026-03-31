/**
 * Tenetx — Adaptive Context Budget
 *
 * 다른 플러그인이 감지되면 tenetx의 컨텍스트 주입량을 동적으로 조절합니다.
 * "양보 원칙": 컨텍스트 경쟁 시 tenetx가 먼저 축소합니다.
 *
 * 버짓 계산:
 *   - 다른 플러그인 없음: factor = 1.0 (INJECTION_CAPS 그대로)
 *   - 훅 기반 메모리 플러그인 감지 (OMC, claude-mem 등): factor = 0.5 (50% 축소)
 *
 * 설계 결정:
 *   - 감지 결과는 plugin-detector에서 캐시 (1시간 TTL)
 *   - 하드캡(INJECTION_CAPS)을 초과하지 않음
 *   - MCP 기반 플러그인(Playwright, Context7 등)은 온디맨드 호출이므로
 *     상시 컨텍스트를 점유하지 않아 factor에 영향 없음
 */

import { INJECTION_CAPS } from './injection-caps.js';
import { hasContextInjectingPlugins } from '../../core/plugin-detector.js';

// ── 타입 ──

export interface ContextBudget {
  /** solution-injector 세션 총 주입 상한 (chars) */
  solutionSessionMax: number;
  /** solution 하나당 최대 글자 수 */
  solutionMax: number;
  /** 프롬프트당 최대 솔루션 수 */
  solutionsPerPrompt: number;
  /** notepad-injector 최대 글자 수 */
  notepadMax: number;
  /** skill-injector 스킬당 최대 글자 수 */
  skillContentMax: number;
  /** 축소 계수 (1.0 = 전체, 0.5 = 반) */
  factor: number;
  /** 다른 플러그인 감지 여부 */
  otherPluginsDetected: boolean;
}

// ── 버짓 계산 ──

/**
 * 현재 환경에 맞는 컨텍스트 버짓을 계산합니다.
 * 다른 플러그인이 감지되면 주입량을 축소합니다.
 */
export function calculateBudget(cwd?: string): ContextBudget {
  let otherPluginsDetected = false;
  let factor = 1.0;

  try {
    otherPluginsDetected = hasContextInjectingPlugins(cwd);
    if (otherPluginsDetected) factor = 0.5;
  } catch {
    // 감지 실패 시 보수적 기본값 (충돌 없음으로 간주하면 위험)
    factor = 0.7;
  }

  return {
    solutionSessionMax: Math.floor(INJECTION_CAPS.solutionSessionMax * factor),
    solutionMax: factor < 1.0 ? 800 : INJECTION_CAPS.solutionMax,
    solutionsPerPrompt: factor < 1.0 ? 2 : 3,
    notepadMax: Math.floor(INJECTION_CAPS.notepadMax * factor),
    skillContentMax: Math.floor(INJECTION_CAPS.skillContentMax * factor),
    factor,
    otherPluginsDetected,
  };
}
