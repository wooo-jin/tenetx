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
import { createLogger } from './logger.js';

const log = createLogger('pack-config');

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

// ── pack.lock ──

/** 팩 잠금 엔트리 */
export interface PackLockEntry {
  /** 잠금된 커밋 SHA */
  resolved: string;
  /** 잠금 시점의 팩 버전 */
  version?: string;
  /** 잠금 시각 */
  lockedAt: string;
}

/** pack.lock 파일 형식 */
export interface PackLockFile {
  lockVersion: 1;
  packs: Record<string, PackLockEntry>;
}

/** .compound/pack.lock 경로 */
export function packLockPath(cwd: string): string {
  return path.join(cwd, '.compound', 'pack.lock');
}

/** pack.lock 로드 (없으면 null) */
export function loadPackLock(cwd: string): PackLockFile | null {
  const lockPath = packLockPath(cwd);
  if (!fs.existsSync(lockPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as PackLockFile;
  } catch { return null; }
}

/** pack.lock 저장 */
export function savePackLock(cwd: string, lock: PackLockFile): void {
  const lockPath = packLockPath(cwd);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
}

/** 현재 연결된 github 팩들의 SHA를 스냅샷하여 pack.lock 생성/갱신 */
export function lockPacks(cwd: string): { locked: string[]; skipped: string[] } {
  const packs = loadPackConfigs(cwd);
  const existing = loadPackLock(cwd) ?? { lockVersion: 1 as const, packs: {} };
  const locked: string[] = [];
  const skipped: string[] = [];

  for (const pack of packs) {
    if (pack.type === 'github' && pack.lastSync) {
      existing.packs[pack.name] = {
        resolved: pack.lastSync,
        lockedAt: new Date().toISOString(),
      };
      locked.push(pack.name);
    } else if (pack.type !== 'github') {
      skipped.push(pack.name);
    }
  }

  savePackLock(cwd, existing);
  return { locked, skipped };
}

/** github 팩의 최신 SHA를 조회하여 lock과 비교, 업데이트 가능 팩 목록 반환 */
export function checkPackUpdates(cwd: string): Array<{
  name: string;
  locked: string;
  latest: string;
  repo: string;
}> {
  const lock = loadPackLock(cwd);
  const packs = loadPackConfigs(cwd);
  const outdated: Array<{ name: string; locked: string; latest: string; repo: string }> = [];

  for (const pack of packs) {
    if (pack.type !== 'github' || !pack.repo) continue;
    const entry = lock?.packs[pack.name];
    if (!entry) continue;

    try {
      const latestSha = execFileSync('gh', [
        'api', `repos/${pack.repo}/commits/HEAD`, '--jq', '.sha',
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }).trim();

      if (latestSha !== entry.resolved) {
        outdated.push({
          name: pack.name,
          locked: entry.resolved.slice(0, 7),
          latest: latestSha.slice(0, 7),
          repo: pack.repo,
        });
      }
    } catch {
      // 네트워크 오류 시 무시
    }
  }

  return outdated;
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
    return { updated: false, message: 'Pack is not a github type.' };
  }

  // 팩별 네임스페이스: .compound/packs/{pack-name}/
  const packDir = path.join(cwd, '.compound', 'packs', config.name);

  // 동기화 대상 디렉토리 (rules, solutions + skills, agents, workflows)
  const syncDirs = ['rules', 'solutions', 'skills', 'agents', 'workflows'];

  try {
    // gh api로 최신 커밋 SHA 확인
    const latestSha = execFileSync('gh', [
      'api', `repos/${config.repo}/commits/HEAD`, '--jq', '.sha',
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

    // 마지막 동기화와 비교
    if (config.lastSync === latestSha) {
      return { updated: false, message: `[${config.name}] Already up to date.` };
    }

    // 디렉토리 생성
    for (const dir of syncDirs) {
      fs.mkdirSync(path.join(packDir, dir), { recursive: true });
    }

    const updateCounts: Record<string, number> = {};

    // 각 디렉토리 동기화
    for (const dirName of syncDirs) {
      updateCounts[dirName] = 0;
      try {
        const fileList = execFileSync('gh', [
          'api', `repos/${config.repo}/contents/${dirName}`, '--jq', '.[].name',
        ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

        if (fileList) {
          for (const filename of fileList.split('\n').filter(Boolean)) {
            const b64 = execFileSync('gh', [
              'api', `repos/${config.repo}/contents/${dirName}/${filename}`, '--jq', '.content',
            ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
            const content = Buffer.from(b64, 'base64').toString('utf-8');
            fs.writeFileSync(path.join(packDir, dirName, filename), content);
            updateCounts[dirName]++;
          }
        }
      } catch {
        log.debug(`[${config.name}] ${dirName} 디렉토리 동기화 실패 (없을 수 있음)`);
      }
    }

    // lastSync 업데이트 — 개별 팩의 lastSync만 갱신
    config.lastSync = latestSha;
    const packs = loadPackConfigs(cwd);
    const idx = packs.findIndex(p => p.name === config.name);
    if (idx >= 0) {
      packs[idx] = config;
      savePackConfigs(cwd, packs);
    }

    const total = Object.values(updateCounts).reduce((a, b) => a + b, 0);
    const parts = Object.entries(updateCounts)
      .filter(([, count]) => count > 0)
      .map(([dir, count]) => `${dir} ${count} items`);
    const message = total > 0
      ? `[${config.name}] ${parts.join(', ')} updated`
      : `[${config.name}] No changes`;

    return { updated: total > 0, message };
  } catch (err) {
    log.debug(`[${config.name}] GitHub pack sync failed`, err);
    return { updated: false, message: `[${config.name}] Sync failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** auto-sync: lock이 있으면 업데이트 알림만, 없으면 기존 동기화 */
export async function autoSyncIfNeeded(cwd: string): Promise<string | null> {
  const packs = loadPackConfigs(cwd);
  const githubPacks = packs.filter(p => p.type === 'github');
  if (githubPacks.length === 0) return null;

  const lock = loadPackLock(cwd);

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

  // lock이 있으면: 자동 sync하지 않고, 업데이트 가능 여부만 체크
  if (lock && Object.keys(lock.packs).length > 0) {
    const outdated = checkPackUpdates(cwd);
    if (outdated.length > 0) {
      const names = outdated.map(o => o.name).join(', ');
      messages.push(`⬆ Pack updates available: ${names} — run tenetx pack sync then tenetx pack lock`);
    }
    return messages.length > 0 ? messages.join('\n') : null;
  }

  // lock이 없으면: 기존 자동 동기화 동작
  for (const pack of githubPacks) {
    const result = await syncGithubPack(pack, cwd);
    if (result.updated) {
      messages.push(result.message);
    }
  }

  return messages.length > 0 ? messages.join('\n') : null;
}
