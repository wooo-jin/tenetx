/**
 * pack-config.ts — 프로젝트 팩 연결 설정
 *
 * .compound/pack.json으로 팩 연결 방식을 관리합니다.
 * - inline: 이 레포 자체가 팩 (팀 규칙을 .compound/ 하위에 커밋)
 * - github: 외부 GitHub 레포에서 팩을 가져옴
 * - local: 로컬 경로에서 팩을 가져옴
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { debugLog } from './logger.js';

export type PackType = 'inline' | 'github' | 'local';

export interface PackConnection {
  /** 팩 연결 방식 */
  type: PackType;
  /** 팩 이름 */
  name: string;
  /** GitHub 레포 (type: github일 때) — "org/repo" 형식 */
  repo?: string;
  /** 로컬 경로 (type: local일 때) */
  localPath?: string;
  /** 마지막 동기화 시각 (ISO 8601) */
  lastSync?: string;
}

/** .compound/pack.json 경로 */
export function packConfigPath(cwd: string): string {
  return path.join(cwd, '.compound', 'pack.json');
}

/** 팩 설정 로드 (없으면 null → 개인 모드) */
export function loadPackConfig(cwd: string): PackConnection | null {
  const configPath = packConfigPath(cwd);
  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as PackConnection;
  } catch {
    return null;
  }
}

/** 팩 설정 저장 */
export function savePackConfig(cwd: string, config: PackConnection): void {
  const configPath = packConfigPath(cwd);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/** 현재 프로젝트의 팩 모드 감지 */
export function detectPackMode(cwd: string): 'personal' | 'inline' | 'github' {
  const config = loadPackConfig(cwd);
  if (!config) return 'personal';
  if (config.type === 'github') return 'github';
  return 'inline';
}

/** github 팩 동기화 (gh cli 사용) */
export async function syncGithubPack(
  config: PackConnection,
  cwd: string,
): Promise<{ updated: boolean; message: string }> {
  if (config.type !== 'github' || !config.repo) {
    return { updated: false, message: '팩이 github 타입이 아닙니다.' };
  }

  const rulesDir = path.join(cwd, '.compound', 'rules');
  const solutionsDir = path.join(cwd, '.compound', 'solutions');

  try {
    // gh api로 최신 커밋 SHA 확인
    const latestSha = execFileSync('gh', [
      'api', `repos/${config.repo}/commits/HEAD`, '--jq', '.sha',
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

    // 마지막 동기화와 비교
    if (config.lastSync === latestSha) {
      return { updated: false, message: '이미 최신 상태입니다.' };
    }

    // rules/ 디렉토리 다운로드
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.mkdirSync(solutionsDir, { recursive: true });

    let rulesUpdated = 0;
    let solutionsUpdated = 0;

    // rules 동기화
    try {
      const rulesJson = execFileSync('gh', [
        'api', `repos/${config.repo}/contents/rules`, '--jq', '.[].name',
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

      if (rulesJson) {
        for (const filename of rulesJson.split('\n').filter(Boolean)) {
          const b64 = execFileSync('gh', [
            'api', `repos/${config.repo}/contents/rules/${filename}`, '--jq', '.content',
          ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
          const content = Buffer.from(b64, 'base64').toString('utf-8');
          fs.writeFileSync(path.join(rulesDir, filename), content);
          rulesUpdated++;
        }
      }
    } catch {
      debugLog('pack-config', 'rules 디렉토리 동기화 실패 (없을 수 있음)');
    }

    // solutions 동기화
    try {
      const solutionsJson = execFileSync('gh', [
        'api', `repos/${config.repo}/contents/solutions`, '--jq', '.[].name',
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

      if (solutionsJson) {
        for (const filename of solutionsJson.split('\n').filter(Boolean)) {
          const b64s = execFileSync('gh', [
            'api', `repos/${config.repo}/contents/solutions/${filename}`, '--jq', '.content',
          ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
          const content = Buffer.from(b64s, 'base64').toString('utf-8');
          fs.writeFileSync(path.join(solutionsDir, filename), content);
          solutionsUpdated++;
        }
      }
    } catch {
      debugLog('pack-config', 'solutions 디렉토리 동기화 실패 (없을 수 있음)');
    }

    // lastSync 업데이트
    config.lastSync = latestSha;
    savePackConfig(cwd, config);

    const total = rulesUpdated + solutionsUpdated;
    const message = total > 0
      ? `팀 규칙 ${rulesUpdated}건, 솔루션 ${solutionsUpdated}건 업데이트됨`
      : '변경 사항 없음';

    return { updated: total > 0, message };
  } catch (err) {
    debugLog('pack-config', 'GitHub 팩 동기화 실패', err);
    return { updated: false, message: `동기화 실패: ${(err as Error).message}` };
  }
}

/** auto-sync: 마지막 sync로부터 1시간 이상이면 자동 동기화 */
export async function autoSyncIfNeeded(cwd: string): Promise<string | null> {
  const config = loadPackConfig(cwd);
  if (!config || config.type !== 'github') return null;

  // lastSync가 ISO 날짜인 경우 시간 비교, SHA인 경우 항상 sync 시도
  // 간단히: lastSync가 없으면 sync, 있으면 파일 mtime으로 1시간 체크
  const configPath = packConfigPath(cwd);
  try {
    const stat = fs.statSync(configPath);
    const hourAgo = Date.now() - 60 * 60 * 1000;
    if (stat.mtimeMs > hourAgo) {
      return null; // 1시간 이내에 수정됨 → 스킵
    }
  } catch {
    return null;
  }

  const result = await syncGithubPack(config, cwd);
  return result.updated ? result.message : null;
}
