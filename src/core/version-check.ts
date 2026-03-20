/**
 * Tenetx — Self Version Check
 *
 * npm registry에서 최신 버전을 조회하여 현재 설치된 버전과 비교합니다.
 * 새 버전이 있으면 업데이트 안내 메시지를 반환합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { debugLog } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** package.json에서 현재 버전 읽기 */
function getCurrentVersion(): string {
  const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

/** npm registry에서 최신 버전 조회 (타임아웃 5초) */
async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://registry.npmjs.org/${packageName}/latest`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    debugLog('version-check', 'npm registry 조회 실패');
    return null;
  }
}

/** semver 비교: a < b이면 true */
function isOlder(current: string, latest: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [aMaj, aMin, aPat] = parse(current);
  const [bMaj, bMin, bPat] = parse(latest);
  if (aMaj !== bMaj) return aMaj < bMaj;
  if (aMin !== bMin) return aMin < bMin;
  return aPat < bPat;
}

/**
 * tenetx 최신 버전 체크.
 * 새 버전이 있으면 안내 메시지를 반환, 없거나 오류 시 null.
 */
export async function checkSelfUpdate(): Promise<string | null> {
  const current = getCurrentVersion();
  const latest = await fetchLatestVersion('tenetx');

  if (!latest) return null;
  if (!isOlder(current, latest)) return null;

  return `⬆ tenetx ${current} → ${latest} update available: npm update -g tenetx`;
}
