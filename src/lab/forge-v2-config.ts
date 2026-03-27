/**
 * Tenetx Lab — Forge v2 Configuration
 *
 * 차세대 개인화 엔진의 feature flag 관리.
 * 각 모듈을 독립적으로 활성화/비활성화할 수 있습니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';
import { atomicWriteJSON } from '../hooks/shared/atomic-write.js';

const log = createLogger('forge-v2-config');

/** Forge v2 각 모듈의 활성화 상태 */
export interface ForgeV2Config {
  /** A: 보상 수집 (기본: true — 수집만 하고 사이드이펙트 없음) */
  rewardCollection: boolean;
  /** B: Thompson Sampling 엔진 (기본: false — 기존 EMA 유지) */
  thompsonSampling: boolean;
  /** C: BKT Preference Tracing (기본: false) */
  preferenceTracing: boolean;
  /** D: 차원 간 상관관계 (기본: false) */
  dimensionCorrelation: boolean;
  /** E: OPRO 프롬프트 최적화 (기본: false — LLM 호출 필요) */
  oproOptimization: boolean;
  /** F: 투명성 알림 (기본: true) */
  transparencyNotifications: boolean;
}

export const DEFAULT_FORGE_V2_CONFIG: ForgeV2Config = {
  rewardCollection: true,
  thompsonSampling: false,
  preferenceTracing: false,
  dimensionCorrelation: false,
  oproOptimization: false,
  transparencyNotifications: true,
};

const CONFIG_PATH = path.join(os.homedir(), '.compound', 'lab', 'forge-v2.json');

/** Forge v2 설정 로드 (없으면 기본값) */
export function loadForgeV2Config(): ForgeV2Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      return { ...DEFAULT_FORGE_V2_CONFIG, ...data };
    }
  } catch (e) {
    log.debug('forge-v2 config load failed, using defaults', e);
  }
  return { ...DEFAULT_FORGE_V2_CONFIG };
}

/** Forge v2 설정 저장 (atomic write) */
export function saveForgeV2Config(config: ForgeV2Config): void {
  atomicWriteJSON(CONFIG_PATH, config, { pretty: true });
}

/**
 * Feature flag 의존성 검증.
 * preferenceTracing, dimensionCorrelation은 thompsonSampling 내부에서만 작동.
 * 무효 조합 시 경고 로그.
 */
export function validateForgeV2Config(config: ForgeV2Config): ForgeV2Config {
  if (config.preferenceTracing && !config.thompsonSampling) {
    log.debug('preferenceTracing requires thompsonSampling — auto-enabling');
    config.thompsonSampling = true;
  }
  if (config.dimensionCorrelation && !config.thompsonSampling) {
    log.debug('dimensionCorrelation requires thompsonSampling — auto-enabling');
    config.thompsonSampling = true;
  }
  return config;
}
