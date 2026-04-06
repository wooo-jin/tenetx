/**
 * Tenetx v1 — Scope Resolver (simplified)
 *
 * v1에서는 scope = me only. 팀 팩 시스템 제거.
 * compound-loop, solution-injector 호환을 위해 유지.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_DIR, ME_SOLUTIONS, ME_RULES, projectDir } from './paths.js';
import type { ScopeInfo } from './types.js';
import { createLogger } from './logger.js';

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

export function resolveScope(cwd: string, _philosophySource?: 'project' | 'global' | 'default'): ScopeInfo {
  const meSolutions = countFiles(ME_SOLUTIONS);
  const meRules = countFiles(ME_RULES);

  const projDir = projectDir(cwd);
  const projSolutions = countFiles(path.join(projDir, 'solutions'));

  const parts: string[] = [`Me(${meSolutions})`];
  if (projSolutions > 0) parts.push(`Project(${projSolutions})`);

  return {
    me: {
      philosophyPath: path.join(ME_DIR, 'philosophy.json'),
      solutionCount: meSolutions,
      ruleCount: meRules,
    },
    // v1: team scope 제거
    project: {
      path: projDir,
      solutionCount: projSolutions,
    },
    summary: parts.join(' + '),
  };
}
