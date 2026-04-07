/**
 * solution .md 파일의 단일 mutator — race 방지 + lock 통합
 *
 * 문제 (PR2b motivation):
 *   같은 .md 파일을 mutate하는 여러 경로가 lock 없이 동작했다 (compound-cli retag,
 *   updateSolutionEvidence, updateNegativeEvidence, solution-reader evidence write,
 *   compound-lifecycle updateSolutionFile, …). 동시 hook이 같은 솔루션을 갱신하면
 *   last-writer-wins로 evidence 카운터가 손실됐다.
 *
 * 해결:
 *   - 모든 read-modify-write를 mutateSolutionFile/mutateSolutionByName 헬퍼로 통일
 *   - 헬퍼는 withFileLockSync로 보호된 fresh-read → mutate → atomic write 흐름
 *   - mutator callback이 modified flag를 반환해 no-op write 회피
 *
 * 적용 범위 (PR2b):
 *   - pre-tool-use.ts:268 updateSolutionEvidence
 *   - post-tool-handlers.ts:127 updateNegativeEvidence
 *   - mcp/solution-reader.ts:237 evidence write
 *   - compound-cli.ts:156 retagSolutions
 *   - compound-lifecycle.ts:163 updateSolutionFile
 *
 * 별도 처리 (mutator 패턴이 안 맞음):
 *   - compound-extractor saveSolution (새 파일 create, O_EXCL로 race 차단)
 *   - compound-extractor updateReExtractedCounter (regex in-place, withFileLockSync 직접)
 *   - solution-index V1→V3 migration (parseSolutionV3 불가, withFileLockSync 직접)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { withFileLockSync } from '../hooks/shared/file-lock.js';
import { atomicWriteText } from '../hooks/shared/atomic-write.js';
import {
  parseFrontmatterOnly,
  parseSolutionV3,
  serializeSolutionV3,
  type SolutionV3,
} from './solution-format.js';
import { ME_SOLUTIONS, ME_RULES } from '../core/paths.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('solution-writer');

/**
 * mutator 콜백. fresh-read된 SolutionV3를 받아 in-place mutate.
 * 변경이 일어났으면 true, no-op이면 false 반환.
 *
 * 주의 (M-3 reentrancy):
 *   mutator 콜백 안에서 같은 path로 mutateSolutionFile/mutateSolutionByName을
 *   재호출하지 말 것. file-lock은 advisory + non-reentrant이므로 같은 PID가
 *   같은 path에 대해 재진입하면 stale 검증을 통과하지 못해 timeout 후 silent
 *   false를 받는다. 필요하면 mutator 안에서 in-place mutation만 수행할 것.
 *
 * @returns true → write 발생, false → write skip
 */
export type SolutionMutator = (solution: SolutionV3) => boolean;

/**
 * 단일 .md 파일에 lock 보호된 read-modify-write 수행.
 *
 * - lock 안에서 fresh re-read (다른 mutator의 변경 보존)
 * - mutator가 false 반환하면 write skip
 * - frontmatter.updated는 자동 갱신 (mutator가 명시 설정해도 덮어씀)
 * - atomicWriteText로 tmp → rename
 *
 * 결함이 발생하면 false 반환 (lock timeout, parse 실패, mutator throw 모두).
 * 운영 관측성은 PR2c 후속 hardening에서 다룬다 (현재는 log.debug로만).
 */
export function mutateSolutionFile(filePath: string, mutator: SolutionMutator): boolean {
  try {
    return withFileLockSync(filePath, () => {
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch (e) {
        log.debug(`solution file read 실패: ${filePath}`, e);
        return false;
      }

      const solution = parseSolutionV3(content);
      if (!solution) {
        log.debug(`solution parse 실패: ${filePath}`);
        return false;
      }

      let modified: boolean;
      try {
        modified = mutator(solution);
      } catch (e) {
        log.debug(`solution mutator throw: ${filePath}`, e);
        return false;
      }
      if (!modified) return false;

      solution.frontmatter.updated = new Date().toISOString().split('T')[0];
      atomicWriteText(filePath, serializeSolutionV3(solution));
      return true;
    });
  } catch (e) {
    log.debug(`solution mutate 실패 (lock): ${filePath}`, e);
    return false;
  }
}

/**
 * 솔루션 이름으로 .md 파일을 찾아 mutate한다.
 *
 * C3 fix: 사전 필터를 정확한 frontmatter parse로 교체. 이전엔 substring 매칭
 * 이라 `inc1` 찾을 때 `inc12.md`가 먼저 매치되어 silent miss가 발생했다.
 *
 * PR2c-3 (H-S2 fix): caller가 extraDirs로 project/team scope를 추가할 수 있다.
 * 기본은 ME_SOLUTIONS / ME_RULES만 스캔. solution-injector는 cwd 기반 project
 * 디렉터리를 주입해 해당 scope의 솔루션도 evidence 갱신 받게 할 수 있다.
 *
 * PR2c-3 (L-3 fix): mutator가 false 반환하면 다음 후보로 continue.
 * 같은 name이 여러 파일에 있을 가능성은 invariant 위반이지만, 사용자가 수동
 * 중복을 만들 수 있으므로 fail-safe로 다음 후보 시도.
 *
 * symlink는 보안상 무시 (lstatSync 가드).
 */
export function mutateSolutionByName(
  name: string,
  mutator: SolutionMutator,
  options?: { extraDirs?: string[] },
): boolean {
  const dirs = [ME_SOLUTIONS, ME_RULES, ...(options?.extraDirs ?? [])];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const file of files) {
      const filePath = path.join(dir, file);
      // Security: symlink을 통한 임의 파일 mutate 방지
      try {
        if (fs.lstatSync(filePath).isSymbolicLink()) continue;
      } catch {
        continue;
      }
      // C3 fix: 정확한 frontmatter parse로 사전 필터.
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }
      const fm = parseFrontmatterOnly(content);
      if (!fm || fm.name !== name) continue;

      // lock 안에서 fresh re-read 후 한 번 더 검증
      const result = mutateSolutionFile(filePath, sol => {
        if (sol.frontmatter.name !== name) return false;
        return mutator(sol);
      });
      if (result) return true;
      // L-3 fix: mutator/mutateSolutionFile이 false면 다음 후보로 continue.
      // 같은 name의 다른 파일을 찾아 mutate 시도.
    }
  }
  return false;
}

/**
 * Evidence 카운터 단일 증가 helper.
 * mutateSolutionByName + 카운터 증가 패턴을 한 줄로.
 */
export function incrementEvidence(
  solutionName: string,
  field: 'reflected' | 'negative' | 'injected' | 'sessions' | 'reExtracted',
): boolean {
  return mutateSolutionByName(solutionName, sol => {
    const ev = sol.frontmatter.evidence as unknown as Record<string, number>;
    if (!(field in ev)) return false;
    ev[field] = (ev[field] ?? 0) + 1;
    return true;
  });
}
