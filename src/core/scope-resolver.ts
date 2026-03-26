import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_DIR, ME_SOLUTIONS, ME_RULES, PACKS_DIR, packLinkPath, projectDir, projectPhilosophyPath } from './paths.js';
import type { ScopeInfo } from './types.js';
import { createLogger } from './logger.js';
import { loadPackConfigs } from './pack-config.js';

const log = createLogger('scope-resolver');

/** 디렉토리 내 .md 파일 수 카운트 */
function countFiles(dir: string, ext = '.md'): number {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch (e) {
    log.debug(`countFiles 실패: ${dir}`, e);
    return 0;
  }
}

/** pack.link 파일에서 팀 팩 이름 읽기 */
function readPackLink(cwd: string): string | null {
  const linkPath = packLinkPath(cwd);
  if (!fs.existsSync(linkPath)) return null;

  try {
    const content = fs.readFileSync(linkPath, 'utf-8').trim();
    // 간단한 형식: 팩 이름만 적혀있거나 "pack: emr" 형태
    const match = content.match(/^pack:\s*(.+)$/m);
    return match ? match[1].trim() : content;
  } catch (e) {
    log.debug(`pack.link 읽기 실패: ${linkPath}`, e);
    return null;
  }
}

/** 팩 메타데이터 읽기 */
function readPackMeta(packName: string): { version: string; solutionCount: number; ruleCount: number } | null {
  const packDir = path.join(PACKS_DIR, packName);
  if (!fs.existsSync(packDir)) return null;

  let version = '0.0.0';
  const metaPath = path.join(packDir, 'pack.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      version = meta.version ?? '0.0.0';
    } catch (e) { log.debug(`pack.json 파싱 실패: ${metaPath}`, e); }
  }

  return {
    version,
    solutionCount: countFiles(path.join(packDir, 'solutions')),
    ruleCount: countFiles(path.join(packDir, 'rules')),
  };
}

export function resolveScope(cwd: string, philosophySource?: 'project' | 'global' | 'default'): ScopeInfo {
  // Me
  const meSolutions = countFiles(ME_SOLUTIONS);
  const meRules = countFiles(ME_RULES);

  // Team — pack.link (레거시) 또는 pack.json (현재) 에서 팩 탐색
  let packName = readPackLink(cwd);
  let team: ScopeInfo['team'] ;

  // pack.link가 없으면 pack.json(loadPackConfigs)에서 첫 번째 팩 사용
  if (!packName) {
    try {
      const connectedPacks = loadPackConfigs(cwd);
      if (connectedPacks.length > 0) {
        packName = connectedPacks[0].name;
      }
    } catch { /* pack-config 로드 실패 시 무시 */ }
  }

  if (packName) {
    const packMeta = readPackMeta(packName);
    if (packMeta) {
      team = {
        name: packName,
        version: packMeta.version,
        packPath: path.join(PACKS_DIR, packName),
        solutionCount: packMeta.solutionCount,
        ruleCount: packMeta.ruleCount,
        syncStatus: 'unknown',
      };
    }
  }

  // Project
  const projDir = projectDir(cwd);
  const projSolutions = countFiles(path.join(projDir, 'solutions'));

  // Philosophy 경로: 실제 로드 소스에 따라 결정
  const philosophyPath = philosophySource === 'project'
    ? projectPhilosophyPath(cwd)
    : path.join(ME_DIR, 'philosophy.json');

  // Summary
  const parts: string[] = [`Me(${meSolutions})`];
  if (team) parts.push(`Team/${team.name}(${team.solutionCount})`);
  if (projSolutions > 0) parts.push(`Project(${projSolutions})`);

  return {
    me: {
      philosophyPath,
      solutionCount: meSolutions,
      ruleCount: meRules,
    },
    team,
    project: {
      path: projDir,
      solutionCount: projSolutions,
    },
    summary: parts.join(' + '),
  };
}
