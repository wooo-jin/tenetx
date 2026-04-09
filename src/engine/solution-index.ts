import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SolutionIndexEntry } from './solution-format.js';
import { parseFrontmatterOnly, isV1Format, migrateV1toV3 } from './solution-format.js';
import { defaultNormalizer } from './term-normalizer.js';
import { withFileLockSync } from '../hooks/shared/file-lock.js';
import { atomicWriteText } from '../hooks/shared/atomic-write.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('solution-index');

export interface SolutionDirConfig {
  dir: string;
  scope: 'me' | 'team' | 'project';
}

export interface SolutionIndex {
  entries: SolutionIndexEntry[];
  directoryMtimes: Record<string, number>;
  builtAt: number;
}

/**
 * Cache keyed by an order-preserving directory signature.
 *
 * Why this matters:
 *   - `buildIndex` accumulates entries in dir order, and `solution-reader`
 *     returns the first match — so dir order is the precedence chain
 *     (me > team > project, by convention).
 *   - The previous single `cachedIndex` global was reused regardless of the
 *     `dirs` argument, so different cwd contexts received stale results
 *     when their cached dirs' mtimes hadn't changed.
 *   - We must NOT sort the signature: `[me,project]` and `[project,me]` are
 *     legitimately different precedence chains and need separate cache slots.
 *
 * PR2c-2: LRU eviction with insertion-order touch.
 *   long-running MCP 서버가 여러 cwd를 처리하면 cache가 무한 누적될 수 있음.
 *   Map의 insertion order를 LRU 시뮬레이션에 활용 — set/get 시 delete + set으로
 *   touch해 가장 최근 사용된 entry가 마지막에 오게 한다. 32 초과 시 oldest evict.
 */
const MAX_CACHE_ENTRIES = 32;
const cachedIndexes = new Map<string, SolutionIndex>();

/**
 * SOFT_CAP: 디렉터리당 인덱싱되는 entry 수 상한 (parse 후 slice).
 *   100 → 500 상향 (accumulated knowledge base에 100은 너무 낮음).
 *
 * HARD_CAP: 디렉터리당 read+parse하는 파일 수 상한.
 *   SOFT_CAP만으로는 readFileSync + YAML parse가 N번 발생해 hook이 수십 초
 *   블록될 수 있음. HARD_CAP 초과 시 statSync로 cheap mtime 정렬해 상위만 처리.
 */
const SOFT_CAP = 500;
const HARD_CAP = 5000;

/**
 * Build an escape-safe, order-preserving signature for a dirs set.
 * JSON.stringify avoids delimiter collisions when paths contain `|` or `:`.
 */
function dirsSignature(dirs: SolutionDirConfig[]): string {
  return JSON.stringify(dirs.map(d => [d.scope, d.dir]));
}

export function isIndexStale(index: SolutionIndex): boolean {
  for (const [dir, mtime] of Object.entries(index.directoryMtimes)) {
    try {
      const current = fs.statSync(dir).mtimeMs;
      if (current !== mtime) return true;
    } catch {
      // Dir doesn't exist anymore
      return true;
    }
  }
  return false;
}

function buildIndex(dirs: SolutionDirConfig[]): SolutionIndex {
  const entries: SolutionIndexEntry[] = [];
  const directoryMtimes: Record<string, number> = {};

  for (const dirConfig of dirs) {
    const { dir } = dirConfig;

    let dirStat: fs.Stats;
    try {
      dirStat = fs.statSync(dir);
    } catch {
      continue; // skip non-existent dirs
    }

    directoryMtimes[dir] = dirStat.mtimeMs;

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    } catch {
      continue;
    }

    // HARD_CAP: read+parse 비용 상한. 초과 시 cheap statSync 정렬로 상위만 처리.
    if (files.length > HARD_CAP) {
      console.warn(`[tenetx] Warning: ${dir} contains ${files.length} files; pre-filtering to the ${HARD_CAP} most recent before parsing.`);
      const stats: { f: string; m: number }[] = [];
      for (const f of files) {
        try {
          const m = fs.statSync(path.join(dir, f)).mtimeMs;
          stats.push({ f, m });
        } catch {
          // skip unreadable
        }
      }
      stats.sort((a, b) => b.m - a.m);
      files = stats.slice(0, HARD_CAP).map(s => s.f);
    }

    const fileEntries: { entry: SolutionIndexEntry; mtime: number }[] = [];

    // C2: diagnostic counters for solutions dropped during index build.
    // Pre-C2 these were silent `continue` statements — users had no way
    // to know a file existed on disk but was missing from the index
    // (observed cause: auto-compound writing frontmatter with the wrong
    // evidence schema, which made the whole file disappear from searches
    // without any user-visible feedback). Logging them at debug level
    // makes `tenetx doctor` / log inspection surface the gap while
    // keeping the normal output quiet.
    let droppedMalformed = 0;
    let droppedRetired = 0;
    let droppedIoError = 0;
    let droppedSymlink = 0;

    for (const file of files) {
      try {
        const filePath = path.join(dir, file);

        // Security: symlink을 통한 임의 파일 읽기 방지 (모든 형식 공통)
        const lst = fs.lstatSync(filePath);
        if (lst.isSymbolicLink()) {
          droppedSymlink++;
          continue;
        }

        // A1 performance fix (2026-04-09): short-circuit tiny files
        // before doing YAML parse on the hot path. A valid v3 solution
        // needs at minimum a `---` fence + `name:` + `version:` +
        // `status:` + `confidence:` + `type:` + `scope:` + `tags:` +
        // `identifiers:` + `evidence:` block + closing `---` + a body,
        // which is ~200 bytes at absolute minimum. Files smaller than
        // 64 bytes cannot possibly contain valid frontmatter, so we
        // skip the readFileSync + YAML parse on them. Observed in
        // production: a test that planted 6000 empty .md files was
        // spending the entire 3s hook budget parsing YAML on files
        // that were 0 bytes. The optimization cuts that path from
        // ~7s to ~100ms.
        if (lst.size < 64) {
          droppedMalformed++;
          log.debug(`dropped (file too small: ${lst.size} bytes): ${filePath}`);
          continue;
        }

        let content = fs.readFileSync(filePath, 'utf-8');
        const fileMtime = lst.mtimeMs;

        if (!content.trimStart().startsWith('---') && isV1Format(content)) {
          // PR2b: V1→V3 migration도 lock으로 보호. 동시 hook이 같은 V1 파일을
          // 마이그레이션하면 last-writer-wins로 손상될 수 있다. parseSolutionV3를
          // 못 쓰는 케이스라 mutateSolutionFile API 대신 명시적 lock + atomic write.
          try {
            withFileLockSync(filePath, () => {
              const fresh = fs.readFileSync(filePath, 'utf-8');
              if (fresh.trimStart().startsWith('---')) return; // 다른 mutator가 이미 마이그레이션
              if (!isV1Format(fresh)) return;
              const migrated = migrateV1toV3(fresh, filePath);
              atomicWriteText(filePath, migrated);
              content = migrated;
            });
          } catch { /* lock 실패는 non-fatal */ }
        }

        const fm = parseFrontmatterOnly(content);
        if (!fm) {
          droppedMalformed++;
          log.debug(`dropped (malformed frontmatter): ${filePath}`);
          continue;
        }
        if (fm.status === 'retired') {
          droppedRetired++;
          continue;
        }

        fileEntries.push({
          entry: {
            name: fm.name,
            status: fm.status,
            confidence: fm.confidence,
            type: fm.type,
            scope: dirConfig.scope,
            tags: fm.tags,
            // T2: pre-expand via the shared term normalizer. Once per solution
            // per index build, not once per solution per query. Safe to
            // recompute on rebuild (cheap: O(N_tags) Map lookups).
            normalizedTags: defaultNormalizer.normalizeTerms(fm.tags),
            identifiers: fm.identifiers,
            filePath,
          },
          mtime: fileMtime,
        });
      } catch (e) {
        droppedIoError++;
        log.debug(`dropped (i/o or parse error) ${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Summary log for silently dropped files.
    //
    // Design: the index is rebuilt on every hook invocation when the
    // directory mtime is stale, so a warn-on-every-drop policy would
    // spam stderr on every matching prompt. Instead:
    //   - debug-level always: the per-file log calls above already
    //     capture each drop path for log inspection / `tenetx doctor`
    //   - warn-level only when the drop rate is materially high
    //     (>10% of files OR >10 files in absolute terms), which
    //     indicates a structural problem — e.g. auto-compound writing
    //     malformed frontmatter in bulk, not a single one-off file
    //   - retired drops are always debug (expected filter semantics)
    //
    // Pre-H-1 (first pass of C2): every non-zero drop warn'd and
    // leaked into test stderr. H-1 downgrades to debug for small counts.
    const totalBad = droppedMalformed + droppedIoError + droppedSymlink;
    const totalScanned = files.length;
    const badRatio = totalScanned > 0 ? totalBad / totalScanned : 0;
    if (totalBad >= 10 || (totalBad > 0 && badRatio >= 0.1)) {
      log.warn(
        `${dir}: ${droppedMalformed} malformed, ${droppedIoError} i/o errors, ${droppedSymlink} symlinks skipped (${totalBad}/${totalScanned} files)`,
      );
    } else if (totalBad > 0) {
      log.debug(
        `${dir}: ${droppedMalformed} malformed, ${droppedIoError} i/o errors, ${droppedSymlink} symlinks skipped (${totalBad}/${totalScanned} files)`,
      );
    }
    if (droppedRetired > 0) {
      log.debug(`${dir}: ${droppedRetired} retired solutions filtered (expected)`);
    }

    fileEntries.sort((a, b) => b.mtime - a.mtime);
    if (fileEntries.length > SOFT_CAP) {
      console.warn(`[tenetx] Warning: ${dir} has ${fileEntries.length} solutions, only the ${SOFT_CAP} most recent are indexed.`);
    }
    const limited = fileEntries.slice(0, SOFT_CAP);
    for (const { entry } of limited) {
      entries.push(entry);
    }
  }

  return { entries, directoryMtimes, builtAt: Date.now() };
}

export function getOrBuildIndex(dirs: SolutionDirConfig[]): SolutionIndex {
  const sig = dirsSignature(dirs);
  const cached = cachedIndexes.get(sig);
  if (cached && !isIndexStale(cached)) {
    // LRU touch: re-insert으로 가장 최근 사용 표시
    cachedIndexes.delete(sig);
    cachedIndexes.set(sig, cached);
    return cached;
  }
  // Stale rebuild path도 LRU touch — JS Map.set on existing key는
  // insertion order를 갱신하지 않으므로 hot cwd가 자주 invalidate되면
  // 영원히 oldest로 남는다. delete + set으로 강제 reorder.
  cachedIndexes.delete(sig);
  const fresh = buildIndex(dirs);
  cachedIndexes.set(sig, fresh);
  // Evict oldest until size within cap
  while (cachedIndexes.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cachedIndexes.keys().next().value;
    if (oldestKey === undefined) break;
    cachedIndexes.delete(oldestKey);
  }
  return fresh;
}

export function resetIndexCache(): void {
  cachedIndexes.clear();
}
