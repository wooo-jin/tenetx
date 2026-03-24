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

let cachedIndex: SolutionIndex | null = null;

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
        let content = fs.readFileSync(filePath, 'utf-8');
        const fileMtime = fs.statSync(filePath).mtimeMs;

        if (!content.trimStart().startsWith('---') && isV1Format(content)) {
          // Safety: reject symlinks to prevent arbitrary file writes
          if (fs.lstatSync(filePath).isSymbolicLink()) continue;
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
    const limited = fileEntries.slice(0, 100);
    for (const { entry } of limited) {
      entries.push(entry);
    }
  }

  return { entries, directoryMtimes, builtAt: Date.now() };
}

export function getOrBuildIndex(dirs: SolutionDirConfig[]): SolutionIndex {
  if (cachedIndex === null || isIndexStale(cachedIndex)) {
    cachedIndex = buildIndex(dirs);
  }
  return cachedIndex;
}

export function resetIndexCache(): void {
  cachedIndex = null;
}
