/**
 * data.ts -- Dashboard data loading functions
 *
 * Extracted from the original dashboard.ts ANSI implementation.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { debugLog } from '../core/logger.js';
import { ME_SOLUTIONS, ME_RULES, PACKS_DIR, SESSIONS_DIR } from '../core/paths.js';
import { loadPhilosophy as loadPhilosophyCore } from '../core/philosophy-loader.js';
import type { Philosophy } from '../core/types.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SessionRecord {
  date: Date;
  project?: string;
  durationMinutes?: number;
  mode?: string;
}

export interface PackInfo {
  name: string;
  version: string;
  remote?: string;
  solutions: number;
  rules: number;
  lastSync?: string;
}

// ── Utility ─────────────────────────────────────────────────────────────────

/** Count .md files in a directory */
export function countMdFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length;
  } catch { return 0; }
}

// ── Session loading ─────────────────────────────────────────────────────────

/** Load sessions from ~/.compound/sessions/ */
export function loadSessions(): SessionRecord[] {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(SESSIONS_DIR, f);
        try {
          const stat = fs.statSync(filePath);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          let durMin: number | undefined;
          if (typeof data.durationMs === 'number') {
            durMin = Math.round(data.durationMs / 60000);
          } else if (typeof data.durationMinutes === 'number') {
            durMin = data.durationMinutes;
          }
          const dateStr = data.startedAt ?? data.startTime;
          return {
            date: dateStr ? new Date(dateStr) : stat.mtime,
            project: data.project ?? data.projectPath ?? data.cwd ?? undefined,
            durationMinutes: durMin,
            mode: data.mode ?? undefined,
          } as SessionRecord;
        } catch {
          const stat = fs.statSync(filePath);
          return { date: stat.mtime } as SessionRecord;
        }
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch { return []; }
}

/** Daily session counts for the last 7 days */
export function getDailySessionCounts(sessions: SessionRecord[]): number[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts: number[] = [];

  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(today.getTime() - i * 86400_000);
    const dayEnd = new Date(dayStart.getTime() + 86400_000);
    counts.push(sessions.filter(s => s.date >= dayStart && s.date < dayEnd).length);
  }
  return counts;
}

/** Today's session count */
export function getTodaySessionCount(sessions: SessionRecord[]): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return sessions.filter(s => s.date >= today).length;
}

/** Average session duration (minutes) */
export function getAvgDuration(sessions: SessionRecord[]): number {
  const withDuration = sessions.filter(s => s.durationMinutes != null && s.durationMinutes > 0);
  if (withDuration.length === 0) return 0;
  const total = withDuration.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  return Math.round(total / withDuration.length);
}

/** Total session duration (minutes) */
export function getTotalDuration(sessions: SessionRecord[]): number {
  return sessions.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
}

// ── Pack loading ────────────────────────────────────────────────────────────

export function loadPacks(): PackInfo[] {
  if (!fs.existsSync(PACKS_DIR)) return [];
  try {
    return fs.readdirSync(PACKS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(entry => {
        const metaPath = path.join(PACKS_DIR, entry.name, 'pack.json');
        let version = '?';
        let remote: string | undefined;
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            version = meta.version ?? '?';
            remote = meta.remote ?? meta.source ?? undefined;
          } catch (e) { debugLog('dashboard', `pack.json 파싱 실패: ${entry.name}`, e); }
        }
        const packDir = path.join(PACKS_DIR, entry.name);
        let lastSync: string | undefined;
        const syncPath = path.join(packDir, '.last-sync');
        if (fs.existsSync(syncPath)) {
          try {
            lastSync = fs.readFileSync(syncPath, 'utf-8').trim();
          } catch (e) { debugLog('dashboard', `.last-sync 파일 읽기 실패: ${entry.name}`, e); }
        }
        return {
          name: entry.name,
          version,
          remote,
          solutions: countMdFiles(path.join(PACKS_DIR, entry.name, 'solutions')),
          rules: countMdFiles(path.join(PACKS_DIR, entry.name, 'rules')),
          lastSync,
        };
      });
  } catch { return []; }
}

// ── Philosophy loading ──────────────────────────────────────────────────────

export { loadPhilosophyCore as loadPhilosophy };
export type { Philosophy };

// ── Git info ────────────────────────────────────────────────────────────────

export function getGitRemote(): string | null {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim() || null;
  } catch { return null; }
}

// ── Date formatting ─────────────────────────────────────────────────────────

export function formatDateTime(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
}

// ── Aggregate loader ────────────────────────────────────────────────────────

export interface DashboardData {
  sessions: SessionRecord[];
  packs: PackInfo[];
  philosophy: Philosophy;
  meSolutions: number;
  meRules: number;
  todayCount: number;
  dailyCounts: number[];
  avgDuration: number;
  totalDuration: number;
  claudeSessionCount: number;
}

/** Load all dashboard data at once */
export function loadDashboardData(): DashboardData {
  const sessions = loadSessions();
  const packs = loadPacks();
  const philosophy = loadPhilosophyCore();
  const meSolutions = countMdFiles(ME_SOLUTIONS);
  const meRules = countMdFiles(ME_RULES);
  const todayCount = getTodaySessionCount(sessions);
  const dailyCounts = getDailySessionCounts(sessions);
  const avgDuration = getAvgDuration(sessions);
  const totalDuration = getTotalDuration(sessions);

  const claudeSessionDir = path.join(os.homedir(), '.claude', 'projects');
  const claudeSessionCount = fs.existsSync(claudeSessionDir)
    ? fs.readdirSync(claudeSessionDir).length : 0;

  return {
    sessions,
    packs,
    philosophy,
    meSolutions,
    meRules,
    todayCount,
    dailyCounts,
    avgDuration,
    totalDuration,
    claudeSessionCount,
  };
}
