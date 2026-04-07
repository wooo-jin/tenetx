import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SolutionIndexEntry } from './solution-format.js';
import { parseFrontmatterOnly, isV1Format, migrateV1toV3 } from './solution-format.js';

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
 */
const cachedIndexes = new Map<string, SolutionIndex>();

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

    const fileEntries: { entry: SolutionIndexEntry; mtime: number }[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(dir, file);

        // Security: symlink을 통한 임의 파일 읽기 방지 (모든 형식 공통)
        if (fs.lstatSync(filePath).isSymbolicLink()) continue;

        let content = fs.readFileSync(filePath, 'utf-8');
        const fileMtime = fs.statSync(filePath).mtimeMs;

        if (!content.trimStart().startsWith('---') && isV1Format(content)) {
          const migrated = migrateV1toV3(content, filePath);
          fs.writeFileSync(filePath, migrated);
          content = migrated;
        }

        const fm = parseFrontmatterOnly(content);
        if (!fm) continue;
        if (fm.status === 'retired') continue;

        fileEntries.push({
          entry: {
            name: fm.name,
            status: fm.status,
            confidence: fm.confidence,
            type: fm.type,
            scope: dirConfig.scope,
            tags: fm.tags,
            identifiers: fm.identifiers,
            filePath,
          },
          mtime: fileMtime,
        });
      } catch {
        // skip broken files
      }
    }

    fileEntries.sort((a, b) => b.mtime - a.mtime);
    // Soft cap on indexed entries (not files read).
    // Bumped from 100 → 500: 100 was too low for accumulated knowledge bases.
    const SOFT_CAP = 500;
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
    return cached;
  }
  const fresh = buildIndex(dirs);
  cachedIndexes.set(sig, fresh);
  return fresh;
}

export function resetIndexCache(): void {
  cachedIndexes.clear();
}
