/**
 * Tenetx — State Directory GC
 *
 * ~/.compound/state/ 내 세션별 파일 중 오래된 것을 정리합니다.
 * 기존 token-tracker의 cleanStaleUsageFiles 패턴을 확장하여
 * 모든 세션 파일에 적용합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { STATE_DIR } from './paths.js';
import { debugLog } from './logger.js';

/**
 * GC 대상 파일 패턴 (접두어 기반)
 *
 * Note: prompt-history.jsonl is a single append-only file (not session-scoped),
 * so it does not need GC. It self-rotates at 500 lines in prompt-learner.ts.
 */
export const GC_FILE_PATTERNS = [
  'permissions-',       // permissions-{sessionId}.jsonl
  'modified-files-',    // modified-files-{sessionId}.json
  'skill-cache-',       // skill-cache-{sessionId}.json
  'token-usage-',       // token-usage-{sessionId}.json
  'solution-cache-',    // solution-cache-{sessionId}.json
  'injection-cache-',   // injection-cache-{sessionId}.json (Phase 2)
] as const;

/** -state.json 접미어 패턴 (모드 상태 파일) */
export const GC_STATE_SUFFIX = '-state.json';

/** 기본 최대 보관 시간 (48시간) */
export const DEFAULT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** active 상태 최대 보호 기간 (7일) — 좀비 방지 */
export const ACTIVE_PROTECTION_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export interface GcOptions {
  /** 최대 보관 시간 (ms). 기본 48시간 */
  maxAgeMs?: number;
  /** 현재 시각 (ms). 테스트용 주입. 기본 Date.now() */
  nowMs?: number;
}

export interface GcResult {
  /** 삭제된 파일 수 */
  deletedCount: number;
  /** 삭제된 파일 이름 목록 */
  deletedFiles: string[];
  /** 에러 발생 파일 */
  errors: string[];
}

/**
 * 파일이 GC 대상인지 판별
 */
export function isGcTarget(filename: string): boolean {
  // 접두어 매칭
  for (const prefix of GC_FILE_PATTERNS) {
    if (filename.startsWith(prefix)) return true;
  }
  // -state.json 접미어 매칭 (context-guard-state.json 등은 제외하지 않음 — GC 대상)
  if (filename.endsWith(GC_STATE_SUFFIX)) return true;
  return false;
}

/**
 * state 디렉토리의 오래된 세션 파일을 정리합니다.
 */
export function cleanStaleStateFiles(options: GcOptions = {}): GcResult {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = options.nowMs ?? Date.now();
  const result: GcResult = { deletedCount: 0, deletedFiles: [], errors: [] };

  if (!fs.existsSync(STATE_DIR)) return result;

  try {
    const files = fs.readdirSync(STATE_DIR);
    for (const f of files) {
      if (!isGcTarget(f)) continue;

      const filePath = path.join(STATE_DIR, f);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          // 활성 모드 상태 파일은 GC에서 보호 (단, 7일 초과 좀비는 제거)
          if (f.endsWith(GC_STATE_SUFFIX)) {
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.active === true) {
                const age = now - stat.mtimeMs;
                if (age <= ACTIVE_PROTECTION_MAX_MS) continue; // 7일 이내 active → 보호
                // 7일 초과 active → 좀비로 간주, GC 진행
              }
            } catch { /* 파싱 실패 시 GC 진행 */ }
          }
          fs.unlinkSync(filePath);
          result.deletedCount++;
          result.deletedFiles.push(f);
        }
      } catch (e) {
        result.errors.push(f);
        debugLog('state-gc', `파일 삭제 실패: ${f}`, e);
      }
    }
  } catch (e) {
    debugLog('state-gc', 'state 디렉토리 읽기 실패', e);
  }

  if (result.deletedCount > 0) {
    debugLog('state-gc', `${result.deletedCount}개 오래된 상태 파일 정리 완료`);
  }

  return result;
}
