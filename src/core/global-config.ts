import * as fs from 'node:fs';
import { GLOBAL_CONFIG, V1_GLOBAL_CONFIG } from './paths.js';
import type { QualityPack, AutonomyPack, TrustPolicy } from '../store/types.js';

export type NotifyVerbosity = 'minimal' | 'session' | 'agent' | 'verbose';

export interface GatewayConfig {
  url: string;
  headers?: Record<string, string>;
  events?: string[];
  enabled: boolean;
}

export interface GlobalConfig {
  /** 사용자 프로필 이름 */
  name?: string;
  /** UI 언어 (ko | en) */
  locale?: 'ko' | 'en';
  /** 기본으로 --dangerously-skip-permissions 활성화 */
  dangerouslySkipPermissions?: boolean;
  /** 모델 라우팅 프리셋 */
  modelRouting?: 'default' | 'cost-saving' | 'max-quality';
  /** 알림 상세도 */
  notifyVerbosity?: NotifyVerbosity;
  /** 이벤트 게이트웨이 설정 */
  gateway?: GatewayConfig;

  // ── v1 fields ──

  /** 현재 적용된 base packs */
  base_packs?: {
    quality_pack: QualityPack;
    autonomy_pack: AutonomyPack;
  };
  /** 사용자 trust 선호 */
  trust_preferences?: {
    desired_policy: TrustPolicy;
  };
  /** tenetx inspect 표시 설정 */
  inspect?: {
    show_facets: boolean;
    show_evidence: boolean;
    max_evidence: number;
  };
  /** 레거시 마이그레이션 백업 경로 */
  legacy_backup?: string;
}

/** v1 config 로드 (~/.tenetx/config.json 우선, 레거시 폴백) */
export function loadGlobalConfig(): GlobalConfig {
  // v1 경로 우선
  if (fs.existsSync(V1_GLOBAL_CONFIG)) {
    try {
      return JSON.parse(fs.readFileSync(V1_GLOBAL_CONFIG, 'utf-8'));
    } catch { /* fall through */ }
  }
  // 레거시 폴백
  if (fs.existsSync(GLOBAL_CONFIG)) {
    try {
      return JSON.parse(fs.readFileSync(GLOBAL_CONFIG, 'utf-8'));
    } catch { /* fall through */ }
  }
  return {};
}

/** v1 config 저장 (~/.tenetx/config.json) */
export function saveGlobalConfig(config: GlobalConfig): void {
  fs.mkdirSync(require('node:path').dirname(V1_GLOBAL_CONFIG), { recursive: true });
  fs.writeFileSync(V1_GLOBAL_CONFIG, JSON.stringify(config, null, 2));
}
