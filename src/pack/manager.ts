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
import { generatePackContext, generateStarterTemplates } from './pack-generator.js';

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
    throw new Error(`Pack '${packName}' is already installed. Update with: tenetx pack sync ${packName}`);
  }

  console.log(`  Source: ${remote.url} (${remote.type})`);

  switch (remote.type) {
    case 'github':
      console.log('  Cloning from GitHub...');
      cloneFromGitHub(remote.url, destDir);
      break;
    case 'local':
      console.log('  Copying from local path...');
      copyFromLocal(remote.url, destDir);
      break;
    case 'gdrive':
      throw new Error('Google Drive integration is not yet supported.');
    case 's3':
      throw new Error('S3 integration is not yet supported.');
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
    throw new Error(`Pack '${packName}' is not installed.`);
  }

  const meta = readPackMeta(packDir);
  if (!meta?.remote) {
    throw new Error(`Pack '${packName}' has no remote info. It is a local-only pack.`);
  }

  console.log(`  Syncing: ${packName} (${meta.remote.type})`);

  switch (meta.remote.type) {
    case 'github':
      syncFromGitHub(meta.remote.url, packDir);
      break;
    case 'local':
      copyFromLocal(meta.remote.url, packDir);
      break;
    default:
      throw new Error(`${meta.remote.type} sync is not yet supported.`);
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

  console.log('  Sync complete.');
}

/** 모든 팩 동기화 */
export async function syncAllPacks(): Promise<void> {
  ensurePacksDir();
  const entries = fs.readdirSync(PACKS_DIR, { withFileTypes: true });
  const packs = entries.filter(e => e.isDirectory());

  if (packs.length === 0) {
    console.log('  No packs to sync.');
    return;
  }

  for (const pack of packs) {
    const meta = readPackMeta(path.join(PACKS_DIR, pack.name));
    if (meta?.remote) {
      try {
        await syncPack(pack.name);
      } catch (err) {
        console.error(`  ✗ ${pack.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      console.log(`  ─ ${pack.name}: local only (skip)`);
    }
  }
}

export interface InitPackOptions {
  /** 프로젝트 분석 기반 컨텍스트 생성 */
  fromProject?: string;  // cwd 경로
  /** 스타터 템플릿 포함 */
  starter?: boolean;
}

/** 팩 초기화 (새 팩 생성) */
export function initPack(name: string, dir?: string, options?: InitPackOptions): void {
  const packDir = dir ?? path.join(PACKS_DIR, name);
  fs.mkdirSync(packDir, { recursive: true });
  for (const d of ['rules', 'solutions', 'skills', 'agents', 'workflows', 'atoms', 'manuals']) {
    fs.mkdirSync(path.join(packDir, d), { recursive: true });
  }

  // --from-project: 프로젝트 분석 → _context.md 생성
  if (options?.fromProject) {
    generatePackContext({ cwd: options.fromProject, packDir, packName: name });
  }

  // --starter: 예제 템플릿 포함
  if (options?.starter) {
    generateStarterTemplates(packDir);
  }

  // pack.json은 마지막에 생성 (--starter 파일 반영을 위해)
  const meta: PackMeta = {
    name,
    version: '0.1.0',
    provides: {
      rules: countFiles(path.join(packDir, 'rules')),
      solutions: countFiles(path.join(packDir, 'solutions')),
      skills: countFiles(path.join(packDir, 'skills')),
      agents: countFiles(path.join(packDir, 'agents')),
      workflows: countFiles(path.join(packDir, 'workflows'), '.json'),
      atoms: countFiles(path.join(packDir, 'atoms')),
      manuals: countFiles(path.join(packDir, 'manuals')),
    },
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
