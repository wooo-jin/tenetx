import * as fs from 'node:fs';
import * as path from 'node:path';
import { PACKS_DIR } from '../core/paths.js';
import type { PackMeta } from '../core/types.js';
import {
  parseSource,
  cloneFromGitHub,
  copyFromLocal,
  syncFromGitHub,
  readPackMeta,
  extractPackName,
} from './remote.js';

/** 팩 디렉토리 초기화 */
function ensurePacksDir(): void {
  fs.mkdirSync(PACKS_DIR, { recursive: true });
}

/** 팩 설치 */
export async function installPack(source: string, name?: string): Promise<PackMeta> {
  ensurePacksDir();
  const remote = parseSource(source);
  const packName = name ?? extractPackName(source);
  const destDir = path.join(PACKS_DIR, packName);

  if (fs.existsSync(destDir)) {
    throw new Error(`팩 '${packName}'이 이미 설치되어 있습니다. tenetx pack sync ${packName}으로 업데이트하세요.`);
  }

  console.log(`  소스: ${remote.url} (${remote.type})`);

  switch (remote.type) {
    case 'github':
      console.log('  GitHub에서 클론 중...');
      cloneFromGitHub(remote.url, destDir);
      break;
    case 'local':
      console.log('  로컬 경로에서 복사 중...');
      copyFromLocal(remote.url, destDir);
      break;
    case 'gdrive':
      throw new Error('Google Drive 연동은 아직 지원되지 않습니다.');
    case 's3':
      throw new Error('S3 연동은 아직 지원되지 않습니다.');
  }

  // pack.json 생성/업데이트 (remote 정보 기록)
  const metaPath = path.join(destDir, 'pack.json');
  let meta: PackMeta;

  if (fs.existsSync(metaPath)) {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } else {
    meta = { name: packName, version: '0.1.0' };
  }

  // remote 정보 저장 (sync에서 사용)
  meta.remote = {
    type: remote.type,
    url: remote.url,
    auto_sync: false,
  };

  // provides 카운트 업데이트
  meta.provides = {
    solutions: countFiles(path.join(destDir, 'solutions')),
    rules: countFiles(path.join(destDir, 'rules')),
    atoms: countFiles(path.join(destDir, 'atoms')),
    manuals: countFiles(path.join(destDir, 'manuals')),
    skills: countFiles(path.join(destDir, 'skills')),
    agents: countFiles(path.join(destDir, 'agents')),
    workflows: countFiles(path.join(destDir, 'workflows'), '.json'),
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return meta;
}

/** 팩 동기화 */
export async function syncPack(packName: string): Promise<void> {
  const packDir = path.join(PACKS_DIR, packName);
  if (!fs.existsSync(packDir)) {
    throw new Error(`팩 '${packName}'이 설치되어 있지 않습니다.`);
  }

  const meta = readPackMeta(packDir);
  if (!meta?.remote) {
    throw new Error(`팩 '${packName}'에 remote 정보가 없습니다. 로컬 전용 팩입니다.`);
  }

  console.log(`  동기화: ${packName} (${meta.remote.type})`);

  switch (meta.remote.type) {
    case 'github':
      syncFromGitHub(meta.remote.url, packDir);
      break;
    case 'local':
      copyFromLocal(meta.remote.url, packDir);
      break;
    default:
      throw new Error(`${meta.remote.type} 동기화는 아직 지원되지 않습니다.`);
  }

  // provides 카운트 갱신
  const updatedMeta = readPackMeta(packDir) ?? meta;
  updatedMeta.provides = {
    solutions: countFiles(path.join(packDir, 'solutions')),
    rules: countFiles(path.join(packDir, 'rules')),
    atoms: countFiles(path.join(packDir, 'atoms')),
    manuals: countFiles(path.join(packDir, 'manuals')),
    skills: countFiles(path.join(packDir, 'skills')),
    agents: countFiles(path.join(packDir, 'agents')),
    workflows: countFiles(path.join(packDir, 'workflows'), '.json'),
  };
  fs.writeFileSync(path.join(packDir, 'pack.json'), JSON.stringify(updatedMeta, null, 2));

  console.log('  동기화 완료.');
}

/** 모든 팩 동기화 */
export async function syncAllPacks(): Promise<void> {
  ensurePacksDir();
  const entries = fs.readdirSync(PACKS_DIR, { withFileTypes: true });
  const packs = entries.filter(e => e.isDirectory());

  if (packs.length === 0) {
    console.log('  동기화할 팩이 없습니다.');
    return;
  }

  for (const pack of packs) {
    const meta = readPackMeta(path.join(PACKS_DIR, pack.name));
    if (meta?.remote) {
      try {
        await syncPack(pack.name);
      } catch (err) {
        console.error(`  ✗ ${pack.name}: ${(err as Error).message}`);
      }
    } else {
      console.log(`  ─ ${pack.name}: 로컬 전용 (skip)`);
    }
  }
}

/** 팩 초기화 (새 팩 생성) */
export function initPack(name: string, dir?: string): void {
  const packDir = dir ?? path.join(PACKS_DIR, name);
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(path.join(packDir, 'solutions'), { recursive: true });
  fs.mkdirSync(path.join(packDir, 'rules'), { recursive: true });
  fs.mkdirSync(path.join(packDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(packDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(packDir, 'workflows'), { recursive: true });

  const meta: PackMeta = {
    name,
    version: '0.1.0',
    provides: { solutions: 0, rules: 0, skills: 0, agents: 0, workflows: 0 },
  };

  fs.writeFileSync(path.join(packDir, 'pack.json'), JSON.stringify(meta, null, 2));
}

/** 설치된 팩 목록 */
export function listInstalledPacks(): Array<{ name: string; meta: PackMeta | null }> {
  ensurePacksDir();
  const entries = fs.readdirSync(PACKS_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => ({
      name: e.name,
      meta: readPackMeta(path.join(PACKS_DIR, e.name)),
    }));
}

function countFiles(dir: string, ext = '.md'): number {
  if (!fs.existsSync(dir)) return 0;
  try { return fs.readdirSync(dir).filter(f => f.endsWith(ext)).length; } catch { return 0; }
}
