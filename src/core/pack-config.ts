/**
 * pack-config.ts — 프로젝트 팩 연결 설정
 *
 * .compound/pack.json으로 팩 연결 방식을 관리합니다.
 * - inline: 이 레포 자체가 팩 (팀 규칙을 .compound/ 하위에 커밋)
 * - github: 외부 GitHub 레포에서 팩을 가져옴
 * - local: 로컬 경로에서 팩을 가져옴
 *
 * 복수 팩 지원: 하나의 프로젝트에 여러 팩을 연결할 수 있습니다.
 * pack.json 형식:
 *   { "packs": [ { type, name, repo?, ... }, ... ] }
 *
 * 하위 호환: 기존 단일 객체 형식도 자동으로 배열로 래핑됩니다.
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

/** pack.json 파일 형식 */
export interface PackConfigFile {
  packs: PackConnection[];
}

/** .compound/pack.json 경로 */
export function packConfigPath(cwd: string): string {
  return path.join(cwd, '.compound', 'pack.json');
}

/**
 * pack.json 원본 파싱 (하위 호환 포함)
 * - 새 형식: { packs: [...] }
 * - 구 형식: { type, name, ... } → { packs: [{ type, name, ... }] }
 */
function parsePackFile(raw: string): PackConfigFile | null {
  try {
    const parsed = JSON.parse(raw);
    // 새 형식: packs 배열이 있는 경우
    if (Array.isArray(parsed.packs)) {
      return parsed as PackConfigFile;
    }
    // 구 형식: 단일 PackConnection 객체 → 배열로 래핑
    if (parsed.type && parsed.name) {
      return { packs: [parsed as PackConnection] };
    }
    return null;
  } catch {
    return null;
  }
}

/** 모든 팩 설정 로드 (없으면 빈 배열 → 개인 모드) */
export function loadPackConfigs(cwd: string): PackConnection[] {
  const configPath = packConfigPath(cwd);
  if (!fs.existsSync(configPath)) return [];

  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = parsePackFile(raw);
  return config?.packs ?? [];
}

/** @deprecated loadPackConfigs()를 사용하세요. 하위 호환을 위해 첫 번째 팩 반환 */
export function loadPackConfig(cwd: string): PackConnection | null {
  const packs = loadPackConfigs(cwd);
  return packs[0] ?? null;
}

/** 전체 팩 설정 저장 */
export function savePackConfigs(cwd: string, packs: PackConnection[]): void {
  const configPath = packConfigPath(cwd);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const file: PackConfigFile = { packs };
  fs.writeFileSync(configPath, JSON.stringify(file, null, 2));
}

/** @deprecated savePackConfigs()를 사용하세요. 하위 호환용 단일 팩 저장 */
export function savePackConfig(cwd: string, config: PackConnection): void {
  const existing = loadPackConfigs(cwd);
  const idx = existing.findIndex(p => p.name === config.name);
  if (idx >= 0) {
    existing[idx] = config;
  } else {
    existing.push(config);
  }
  savePackConfigs(cwd, existing);
}

/** 팩 추가 (이름 중복 시 교체) */
export function addPack(cwd: string, pack: PackConnection): void {
  const packs = loadPackConfigs(cwd);
  const idx = packs.findIndex(p => p.name === pack.name);
  if (idx >= 0) {
    packs[idx] = pack;
  } else {
    packs.push(pack);
  }
  savePackConfigs(cwd, packs);
}

/** 팩 제거 (이름으로) */
export function removePack(cwd: string, name: string): boolean {
  const packs = loadPackConfigs(cwd);
  const idx = packs.findIndex(p => p.name === name);
  if (idx < 0) return false;
  packs.splice(idx, 1);
  savePackConfigs(cwd, packs);
  return true;
}

/** 현재 프로젝트의 팩 모드 감지 */
export function detectPackMode(cwd: string): 'personal' | 'inline' | 'github' | 'mixed' {
  const packs = loadPackConfigs(cwd);
  if (packs.length === 0) return 'personal';
  const types = new Set(packs.map(p => p.type));
  if (types.size > 1) return 'mixed';
  if (types.has('github')) return 'github';
  return 'inline';
}

/** github 팩 동기화 (gh cli 사용) — 팩별 네임스페이스 디렉토리 */
export async function syncGithubPack(
  config: PackConnection,
  cwd: string,
): Promise<{ updated: boolean; message: string }> {
  if (config.type !== 'github' || !config.repo) {
    return { updated: false, message: '팩이 github 타입이 아닙니다.' };
  }

  // 팩별 네임스페이스: .compound/packs/{pack-name}/rules|solutions
  const packDir = path.join(cwd, '.compound', 'packs', config.name);
  const rulesDir = path.join(packDir, 'rules');
  const solutionsDir = path.join(packDir, 'solutions');

  try {
    // gh api로 최신 커밋 SHA 확인
    const latestSha = execFileSync('gh', [
      'api', `repos/${config.repo}/commits/HEAD`, '--jq', '.sha',
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

    // 마지막 동기화와 비교
    if (config.lastSync === latestSha) {
      return { updated: false, message: `[${config.name}] 이미 최신 상태입니다.` };
    }

    // 디렉토리 생성
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
      debugLog('pack-config', `[${config.name}] rules 디렉토리 동기화 실패 (없을 수 있음)`);
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
      debugLog('pack-config', `[${config.name}] solutions 디렉토리 동기화 실패 (없을 수 있음)`);
    }

    // lastSync 업데이트 — 개별 팩의 lastSync만 갱신
    config.lastSync = latestSha;
    const packs = loadPackConfigs(cwd);
    const idx = packs.findIndex(p => p.name === config.name);
    if (idx >= 0) {
      packs[idx] = config;
      savePackConfigs(cwd, packs);
    }

    const total = rulesUpdated + solutionsUpdated;
    const message = total > 0
      ? `[${config.name}] 규칙 ${rulesUpdated}건, 솔루션 ${solutionsUpdated}건 업데이트됨`
      : `[${config.name}] 변경 사항 없음`;

    return { updated: total > 0, message };
  } catch (err) {
    debugLog('pack-config', `[${config.name}] GitHub 팩 동기화 실패`, err);
    return { updated: false, message: `[${config.name}] 동기화 실패: ${(err as Error).message}` };
  }
}

/** auto-sync: 마지막 sync로부터 1시간 이상이면 자동 동기화 (모든 github 팩 대상) */
export async function autoSyncIfNeeded(cwd: string): Promise<string | null> {
  const packs = loadPackConfigs(cwd);
  const githubPacks = packs.filter(p => p.type === 'github');
  if (githubPacks.length === 0) return null;

  // pack.json mtime으로 1시간 체크
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

  const messages: string[] = [];
  for (const pack of githubPacks) {
    const result = await syncGithubPack(pack, cwd);
    if (result.updated) {
      messages.push(result.message);
    }
  }

  return messages.length > 0 ? messages.join('\n') : null;
}
