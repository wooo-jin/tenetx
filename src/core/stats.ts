import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SESSIONS_DIR } from './paths.js';
import { debugLog } from './logger.js';
import { formatCost, formatTokenCount } from '../engine/token-tracker.js';

interface SessionLog {
  sessionId?: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  cwd?: string;
  philosophy?: string;
  scope?: string;
  mode?: string;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

function loadSessions(sinceMs?: number): SessionLog[] {
  if (!fs.existsSync(SESSIONS_DIR)) return [];

  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  const sessions: SessionLog[] = [];

  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const session = JSON.parse(raw) as SessionLog;

      if (sinceMs !== undefined && session.startTime) {
        const startTime = new Date(session.startTime).getTime();
        if (startTime < sinceMs) continue;
      }

      sessions.push(session);
    } catch (err) {
      debugLog('stats', `세션 파일 파싱 실패: ${file}`, err);
    }
  }

  return sessions;
}

export async function handleStats(args: string[]): Promise<void> {
  const isWeek = args.includes('--week');
  const isMonth = args.includes('--month');

  let periodLabel = '전체';
  let sinceMs: number | undefined;

  if (isWeek) {
    periodLabel = '최근 7일';
    sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  } else if (isMonth) {
    periodLabel = '최근 30일';
    sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  }

  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log('\n  Tenetx — 세션 통계\n');
    console.log('  아직 기록된 세션이 없습니다.');
    console.log('  tenetx 명령어로 Claude Code를 실행하면 세션이 기록됩니다.\n');
    return;
  }

  const sessions = loadSessions(sinceMs);

  console.log('\n  Tenetx — 세션 통계\n');
  console.log(`  기간: ${periodLabel}`);
  console.log(`  세션 수: ${sessions.length}`);

  if (sessions.length === 0) {
    console.log('  해당 기간에 세션이 없습니다.\n');
    return;
  }

  // 총 사용 시간 계산
  const totalMs = sessions.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
  const avgMs = totalMs / sessions.length;

  console.log(`  총 사용 시간: ${formatDuration(totalMs)}`);
  console.log(`  평균 세션: ${formatDuration(avgMs)}`);

  // 모드별 빈도
  const modeCounts: Record<string, number> = {};
  for (const s of sessions) {
    const mode = s.mode ?? 'default';
    modeCounts[mode] = (modeCounts[mode] ?? 0) + 1;
  }

  const sortedModes = Object.entries(modeCounts).sort((a, b) => b[1] - a[1]);
  console.log('\n  모드별:');
  for (const [mode, count] of sortedModes) {
    const pct = ((count / sessions.length) * 100).toFixed(1);
    const modeCol = mode.padEnd(12);
    console.log(`    ${modeCol}${String(count).padStart(3)} (${pct}%)`);
  }

  // 프로젝트 TOP 3
  const cwdCounts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.cwd) {
      cwdCounts[s.cwd] = (cwdCounts[s.cwd] ?? 0) + 1;
    }
  }

  const sortedCwds = Object.entries(cwdCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (sortedCwds.length > 0) {
    console.log('\n  프로젝트 TOP 3:');
    for (const [cwd, count] of sortedCwds) {
      console.log(`    ${cwd.padEnd(40)}${String(count).padStart(3)}회`);
    }
  }

  // 현재/최근 세션 토큰 사용량
  const stateDir = path.join(os.homedir(), '.compound', 'state');
  if (fs.existsSync(stateDir)) {
    try {
      const usageFiles = fs.readdirSync(stateDir).filter(f => f.startsWith('token-usage-'));
      if (usageFiles.length > 0) {
        console.log('\n  토큰 사용량 (최근 세션):');
        // 최신 3개만 표시
        const sorted = usageFiles
          .map(f => ({ name: f, mtime: fs.statSync(path.join(stateDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, 3);
        for (const { name } of sorted) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(stateDir, name), 'utf-8'));
            const tokens = formatTokenCount((data.inputTokens ?? 0) + (data.outputTokens ?? 0));
            const cost = formatCost(data.estimatedCost ?? 0);
            const calls = data.toolCalls ?? 0;
            const id = (data.sessionId ?? 'unknown').slice(0, 8);
            console.log(`    ${id}… ${tokens} tokens, ${cost}, ${calls}회 호출`);
          } catch { /* skip */ }
        }
      }
    } catch { /* ignore */ }
  }

  console.log();
}
