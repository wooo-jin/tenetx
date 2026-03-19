import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PackMeta } from '../core/types.js';

export interface RemoteSource {
  type: 'github' | 'local' | 'gdrive' | 's3';
  url: string;
}

/** 소스 문자열을 파싱하여 remote 타입과 URL 추출 */
export function parseSource(source: string): RemoteSource {
  // GitHub URL 또는 shorthand (owner/repo)
  if (source.startsWith('https://github.com/') || source.startsWith('git@github.com:')) {
    return { type: 'github', url: source };
  }
  if (/^[\w-]+\/[\w.-]+$/.test(source)) {
    return { type: 'github', url: `https://github.com/${source}.git` };
  }

  // 로컬 경로
  if (source.startsWith('/') || source.startsWith('./') || source.startsWith('~')) {
    return { type: 'local', url: source };
  }

  // Google Drive
  if (source.startsWith('gdrive://') || source.includes('drive.google.com')) {
    return { type: 'gdrive', url: source };
  }

  // S3
  if (source.startsWith('s3://')) {
    return { type: 's3', url: source };
  }

  // 기본: GitHub shorthand로 시도
  return { type: 'github', url: `https://github.com/${source}.git` };
}

/** GitHub 리포에서 팩 클론 */
export function cloneFromGitHub(url: string, destDir: string): void {
  // .git 확장자 보장
  const gitUrl = url.endsWith('.git') ? url : `${url}.git`;

  try {
    execFileSync('git', ['clone', '--depth', '1', gitUrl, destDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    throw new Error(`GitHub 클론 실패: ${gitUrl}\n${err instanceof Error ? err.message : String(err)}`);
  }

  // .git 디렉토리 제거 (팩은 flat copy로 관리)
  const gitDir = path.join(destDir, '.git');
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }
}

/** GitHub 리포에서 팩 업데이트 (pull) */
export function syncFromGitHub(url: string, destDir: string): void {
  // .git이 없으면 다시 클론
  const gitDir = path.join(destDir, '.git');
  if (!fs.existsSync(gitDir)) {
    // 기존 파일 백업 없이 새로 클론
    const tmpDir = `${destDir}._sync_tmp`;
    try {
      cloneFromGitHub(url, tmpDir);
      // pack.json의 remote 설정 보존
      const localMeta = path.join(destDir, 'pack.json');
      if (fs.existsSync(localMeta)) {
        const meta = JSON.parse(fs.readFileSync(localMeta, 'utf-8'));
        const newMeta = path.join(tmpDir, 'pack.json');
        if (fs.existsSync(newMeta)) {
          const newData = JSON.parse(fs.readFileSync(newMeta, 'utf-8'));
          newData.remote = meta.remote;
          fs.writeFileSync(newMeta, JSON.stringify(newData, null, 2));
        }
      }
      // 교체
      fs.rmSync(destDir, { recursive: true, force: true });
      fs.renameSync(tmpDir, destDir);
    } catch (err) {
      // 실패 시 tmp 정리
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      throw err;
    }
    return;
  }

  // .git이 있으면 pull
  try {
    execFileSync('git', ['pull', '--ff-only'], { cwd: destDir, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`Git pull 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 로컬 경로에서 팩 복사 */
export function copyFromLocal(sourcePath: string, destDir: string): void {
  const resolved = sourcePath.replace(/^~/, os.homedir());
  if (!fs.existsSync(resolved)) {
    throw new Error(`경로를 찾을 수 없습니다: ${resolved}`);
  }

  fs.cpSync(resolved, destDir, { recursive: true });
}

/** 팩 디렉토리에서 메타데이터 읽기 */
export function readPackMeta(packDir: string): PackMeta | null {
  const metaPath = path.join(packDir, 'pack.json');
  if (!fs.existsSync(metaPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as PackMeta;
  } catch {
    return null;
  }
}

/** 팩 이름 추출 (URL 또는 경로에서) */
export function extractPackName(source: string): string {
  // GitHub: owner/repo → repo
  const githubMatch = source.match(/\/([^/]+?)(?:\.git)?$/);
  if (githubMatch) return githubMatch[1];

  // 로컬: 마지막 디렉토리명
  return path.basename(source.replace(/\/$/, ''));
}
