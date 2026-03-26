/**
 * Tenetx — Auto-Update System
 *
 * npm registry에서 최신 버전을 확인하고 캐싱합니다.
 * 업데이트가 있으면 사용자에게 안내 메시지를 반환합니다.
 * 네트워크 오류 시 절대 프로세스를 중단하지 않습니다.
 *
 * ADR: 캐시 파일을 ~/.compound/update-check.json에 저장.
 * 24시간 이내 체크 결과가 있으면 registry 호출을 건너뜁니다.
 * 새 의존성 없음 — Node.js 내장 fetch 사용.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from './logger.js';

const log = createLogger('auto-update');

const execFileAsync = promisify(execFile);

// ─── 상수 ───────────────────────────────────────────────────────────────────

const REGISTRY_URL = 'https://registry.npmjs.org/tenetx/latest';
const CACHE_FILE = path.join(os.homedir(), '.compound', 'update-check.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
const NETWORK_TIMEOUT_MS = 3000;

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface UpdateCache {
  lastCheck: number;   // Unix timestamp (ms)
  latestVersion: string;
}

// ─── 캐시 I/O ────────────────────────────────────────────────────────────────

function readCache(): UpdateCache | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as UpdateCache;
    if (typeof parsed.lastCheck !== 'number' || typeof parsed.latestVersion !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: UpdateCache): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8');
  } catch (err) {
    log.debug(`캐시 저장 실패: ${err}`);
  }
}

function isCacheFresh(cache: UpdateCache): boolean {
  return Date.now() - cache.lastCheck < CACHE_TTL_MS;
}

// ─── npm registry 조회 ───────────────────────────────────────────────────────

async function fetchLatestFromRegistry(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

    const res = await fetch(REGISTRY_URL, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    log.debug('npm registry 조회 실패 (네트워크 오류 무시)');
    return null;
  }
}

// ─── semver 비교 ─────────────────────────────────────────────────────────────

/**
 * semver 비교: current < latest이면 true를 반환.
 * major → minor → patch 순서로 비교.
 * 잘못된 형식은 false 반환 (업데이트 불필요로 처리).
 */
export function shouldNotify(currentVersion: string, latestVersion: string): boolean {
  const parse = (v: string): [number, number, number] | null => {
    const parts = v.replace(/^v/, '').split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return [parts[0], parts[1], parts[2]];
  };

  const cur = parse(currentVersion);
  const lat = parse(latestVersion);

  if (!cur || !lat) return false;

  const [cMaj, cMin, cPat] = cur;
  const [lMaj, lMin, lPat] = lat;

  if (cMaj !== lMaj) return cMaj < lMaj;
  if (cMin !== lMin) return cMin < lMin;
  return cPat < lPat;
}

// ─── 메시지 포맷 ─────────────────────────────────────────────────────────────

/**
 * 업데이트 안내 메시지를 생성.
 * 버전 차이에 따라 major/minor/patch 레벨을 표시.
 */
export function formatUpdateMessage(current: string, latest: string): string {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [cMaj, cMin] = parse(current);
  const [lMaj, lMin] = parse(latest);

  let level: string;
  if (cMaj !== lMaj) {
    level = 'major';
  } else if (cMin !== lMin) {
    level = 'minor';
  } else {
    level = 'patch';
  }

  return `tenetx ${current} → ${latest} (${level} update available)\nRun: npm update -g tenetx`;
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 업데이트 여부를 확인합니다.
 * - 24시간 이내 캐시가 있으면 캐시를 반환합니다.
 * - 캐시가 없거나 만료되면 npm registry를 조회합니다.
 * - 네트워크 오류 시 null을 반환합니다 (프로세스 중단 없음).
 *
 * @param currentVersion 현재 설치된 버전 (기본값: package.json에서 읽음)
 * @returns 업데이트 안내 메시지 또는 null
 */
export async function checkForUpdate(currentVersion?: string): Promise<string | null> {
  try {
    // 캐시 확인
    const cache = readCache();
    let latestVersion: string | null = null;

    if (cache && isCacheFresh(cache)) {
      latestVersion = cache.latestVersion;
    } else {
      latestVersion = await fetchLatestFromRegistry();
      if (latestVersion) {
        writeCache({ lastCheck: Date.now(), latestVersion });
      }
    }

    if (!latestVersion) return null;

    // 현재 버전이 없으면 package.json에서 읽음
    const current = currentVersion ?? readCurrentVersion();
    if (!current) return null;

    if (!shouldNotify(current, latestVersion)) return null;

    return formatUpdateMessage(current, latestVersion);
  } catch {
    // 업데이트 체크가 CLI를 망가뜨리면 안 됨
    return null;
  }
}

/**
 * `npm install -g tenetx@latest`를 실행합니다.
 * 오류 시 에러 메시지를 반환합니다.
 */
export async function performUpdate(): Promise<{ success: boolean; message: string }> {
  try {
    await execFileAsync('npm', ['install', '-g', 'tenetx@latest']);
    return { success: true, message: 'tenetx가 최신 버전으로 업데이트되었습니다.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `업데이트 실패: ${msg}` };
  }
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

function readCurrentVersion(): string | null {
  try {
    // ESM 환경에서 __dirname 없이 package.json 위치를 찾음
    // dist/ 또는 src/ 기준으로 두 단계 상위에 package.json 존재
    const candidates = [
      path.resolve(os.homedir(), '.npm', '_npx'),  // npx 실행 경로는 무관
      path.resolve(new URL(import.meta.url).pathname, '..', '..', '..', 'package.json'),
      path.resolve(new URL(import.meta.url).pathname, '..', '..', 'package.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p) && p.endsWith('package.json')) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf-8')) as { version?: string };
        if (typeof pkg.version === 'string') return pkg.version;
      }
    }
    return null;
  } catch {
    return null;
  }
}
