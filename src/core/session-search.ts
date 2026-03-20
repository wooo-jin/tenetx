/**
 * tenetx session — 세션 로그 검색/재사용
 *
 * - tenetx session search "query"   → 과거 세션에서 키워드 검색
 * - tenetx session list [--week]    → 최근 세션 목록
 * - tenetx session show <id>        → 세션 상세 보기
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SESSIONS_DIR } from './paths.js';

interface SessionLog {
  sessionId: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  cwd: string;
  philosophy: string;
  scope: string;
  mode: string;
}

/** 모든 세션 로그 로드 (최신순) */
function loadAllSessions(): Array<SessionLog & { filename: string }> {
  if (!fs.existsSync(SESSIONS_DIR)) return [];

  try {
    return fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'));
          return { ...data, filename: f };
        } catch {
          return null;
        }
      })
      .filter((s): s is SessionLog & { filename: string } => s !== null);
  } catch {
    return [];
  }
}

/** 세션 검색 — 프로젝트 경로, 철학, 모드, 날짜로 매칭 */
export function searchSessions(query: string, options?: {
  project?: string;
  maxResults?: number;
}): Array<SessionLog & { filename: string; relevance: number }> {
  const sessions = loadAllSessions();
  const { maxResults = 20 } = options ?? {};
  const queryLower = query.toLowerCase();
  const projectFilter = options?.project;

  const results = sessions
    .map(session => {
      let relevance = 0;
      const searchable = [
        session.cwd,
        session.philosophy,
        session.scope,
        session.mode,
        session.startTime,
      ].join(' ').toLowerCase();

      // 프로젝트 필터
      if (projectFilter && projectFilter !== 'all' && !session.cwd.includes(projectFilter)) {
        return null;
      }

      // 키워드 매칭
      if (searchable.includes(queryLower)) {
        relevance += 10;
      }

      // 개별 단어 매칭
      const words = queryLower.split(/\s+/);
      for (const word of words) {
        if (searchable.includes(word)) relevance += 3;
      }

      // 날짜 근접성 보너스 (최근 세션 우선)
      const age = Date.now() - new Date(session.startTime).getTime();
      const daysOld = age / (1000 * 60 * 60 * 24);
      if (daysOld < 1) relevance += 5;
      else if (daysOld < 7) relevance += 3;
      else if (daysOld < 30) relevance += 1;

      return relevance > 0 ? { ...session, relevance } : null;
    })
    .filter((s): s is SessionLog & { filename: string; relevance: number } => s !== null)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxResults);

  return results;
}

/** duration을 사람이 읽을 수 있는 문자열로 */
function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}

export async function handleSession(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'search') {
    const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
    if (!query) {
      console.log('  Usage: tenetx session search "query"');
      console.log('  Options: --project <path> --json');
      return;
    }

    const projectFlag = args.includes('--project') ? args[args.indexOf('--project') + 1] : undefined;
    const results = searchSessions(query, { project: projectFlag });

    if (args.includes('--json')) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    console.log(`\n  Session search: "${query}" (${results.length} results)\n`);
    for (const r of results) {
      const date = r.startTime.slice(0, 10);
      const time = r.startTime.slice(11, 16);
      const dur = formatDuration(r.durationMs);
      const proj = path.basename(r.cwd);
      console.log(`  ${date} ${time}  ${proj}  mode:${r.mode}  ${dur}  [${r.philosophy}]`);
    }
    if (results.length === 0) console.log('  No results found.');
    console.log('');
    return;
  }

  if (sub === 'show') {
    const idOrDate = args[1];
    if (!idOrDate) {
      console.log('  Usage: tenetx session show <session-id or date>');
      return;
    }

    const sessions = loadAllSessions();
    const match = sessions.find(s =>
      s.sessionId.startsWith(idOrDate) || s.filename.includes(idOrDate)
    );

    if (!match) {
      console.log(`  Session not found: ${idOrDate}`);
      return;
    }

    console.log('\n  Session Details:\n');
    console.log(`  ID: ${match.sessionId}`);
    console.log(`  Start: ${match.startTime}`);
    if (match.endTime) console.log(`  End: ${match.endTime}`);
    console.log(`  Duration: ${formatDuration(match.durationMs)}`);
    console.log(`  Project: ${match.cwd}`);
    console.log(`  Philosophy: ${match.philosophy}`);
    console.log(`  Mode: ${match.mode}`);
    console.log(`  Scope: ${match.scope}`);
    console.log('');
    return;
  }

  // 기본: list
  const sessions = loadAllSessions();
  const isWeek = args.includes('--week');
  const cutoff = isWeek ? 7 : 30;
  const cutoffMs = Date.now() - cutoff * 24 * 60 * 60 * 1000;

  const recent = sessions.filter(s => new Date(s.startTime).getTime() > cutoffMs);

  console.log(`\n  Recent sessions (${cutoff}d, ${recent.length} total)\n`);
  for (const s of recent.slice(0, 30)) {
    const date = s.startTime.slice(0, 10);
    const time = s.startTime.slice(11, 16);
    const dur = formatDuration(s.durationMs);
    const proj = path.basename(s.cwd);
    console.log(`  ${date} ${time}  ${proj}  mode:${s.mode}  ${dur}`);
  }
  if (recent.length === 0) console.log('  No session history found.');
  console.log('');
}
