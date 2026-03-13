import * as fs from 'node:fs';
import { GLOBAL_CONFIG } from './paths.js';

export interface GlobalConfig {
  /** 사용자 프로필 이름 */
  name?: string;
  /** 기본으로 --dangerously-skip-permissions 활성화 */
  dangerouslySkipPermissions?: boolean;
  /** 모델 라우팅 프리셋 */
  modelRouting?: 'default' | 'cost-saving' | 'max-quality';
}

/** ~/.compound/config.json 로드 */
export function loadGlobalConfig(): GlobalConfig {
  if (!fs.existsSync(GLOBAL_CONFIG)) return {};
  try {
    return JSON.parse(fs.readFileSync(GLOBAL_CONFIG, 'utf-8'));
  } catch {
    return {};
  }
}

/** ~/.compound/config.json 저장 */
export function saveGlobalConfig(config: GlobalConfig): void {
  fs.writeFileSync(GLOBAL_CONFIG, JSON.stringify(config, null, 2));
}
