/**
 * Tenetx — Hook Config Loader
 *
 * ~/.compound/hook-config.json 에서 훅별 설정을 읽어 반환합니다.
 * 파일이 없거나 읽기에 실패하면 null 을 반환합니다 (failure-tolerant).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const HOOK_CONFIG_PATH = path.join(os.homedir(), '.compound', 'hook-config.json');

/** 특정 훅의 설정을 반환합니다. 실패 시 null 반환. */
export function loadHookConfig(hookName: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(HOOK_CONFIG_PATH)) return null;
    const raw = fs.readFileSync(HOOK_CONFIG_PATH, 'utf-8');
    const all = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    return all[hookName] ?? null;
  } catch {
    return null;
  }
}
