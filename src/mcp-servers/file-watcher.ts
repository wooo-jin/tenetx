/**
 * File Watcher MCP Server — 프로젝트 파일 변경 감시
 *
 * 최근 수정된 파일을 추적하고 변경 요약을 제공.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServerDefinition } from './types.js';

export const FILE_WATCHER_DEFINITION: McpServerDefinition = {
  name: 'file-watcher',
  description: 'Track recently modified files and summarize changes',
  command: 'node',
  args: ['file-watcher-server.js'],
  builtin: true,
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage']);

/** 파일 목록을 재귀적으로 수집 (건너뛸 디렉토리 제외) */
function walkDir(dir: string, results: { file: string; mtime: Date }[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walkDir(path.join(dir, entry.name), results);
      }
    } else if (entry.isFile()) {
      try {
        const filePath = path.join(dir, entry.name);
        const stat = fs.statSync(filePath);
        results.push({ file: filePath, mtime: stat.mtime });
      } catch { /* ignore */ }
    }
  }
}

/** 최근 수정된 파일 목록 반환 (mtime 내림차순, 최대 50개) */
export function getRecentlyModified(
  cwd: string,
  minutes = 30,
): { file: string; mtime: Date }[] {
  const allFiles: { file: string; mtime: Date }[] = [];
  walkDir(cwd, allFiles);

  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const recent = allFiles.filter(f => f.mtime >= cutoff);

  // mtime 내림차순 정렬
  recent.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return recent.slice(0, 50);
}

/** 프로젝트 변경 요약 반환 */
export function getModificationSummary(
  cwd: string,
): { total: number; recent: number; byExtension: Record<string, number> } {
  const allFiles: { file: string; mtime: Date }[] = [];
  walkDir(cwd, allFiles);

  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const recent = allFiles.filter(f => f.mtime >= cutoff).length;

  const byExtension: Record<string, number> = {};
  for (const { file } of allFiles) {
    const ext = path.extname(file) || '(no ext)';
    byExtension[ext] = (byExtension[ext] ?? 0) + 1;
  }

  return { total: allFiles.length, recent, byExtension };
}
