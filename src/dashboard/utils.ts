/**
 * utils.ts -- Dashboard 컴포넌트 공유 순수 유틸리티 함수
 *
 * 컴포넌트에서 인라인으로 반복되던 집계·포맷 로직을 추출해 테스트 가능하게 만든다.
 * ADR: 컴포넌트 렌더링 로직과 계산 로직을 분리하면 ink-testing-library 없이도
 *      단위 테스트가 가능하다.
 */

import type { PackInfo } from './data.js';

// ── Pack 집계 ────────────────────────────────────────────────────────────────

/** 설치된 팩들의 솔루션 합계 */
export function sumPackSolutions(packs: PackInfo[]): number {
  return packs.reduce((s, p) => s + p.solutions, 0);
}

/** 설치된 팩들의 룰 합계 */
export function sumPackRules(packs: PackInfo[]): number {
  return packs.reduce((s, p) => s + p.rules, 0);
}

// ── StatsTab - totalDuration 포맷 ────────────────────────────────────────────

/** 총 분(minutes)을 "Nh" 형식으로 포맷한다. 0이면 '-' 반환 */
export function formatTotalDuration(totalMinutes: number): string {
  return totalMinutes > 0 ? `${Math.round(totalMinutes / 60)}h` : '-';
}

// ── StatsTab - 날짜 레이블 생성 ──────────────────────────────────────────────

/** 오늘 기준으로 7일치 "M/D" 형식 레이블 배열을 생성한다 */
export function generateDateLabels(now: Date = new Date()): string[] {
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return labels;
}

// ── LogsTab - 세션 표시 로직 ─────────────────────────────────────────────────

/** 세션 목록에서 최근 N개만 슬라이스한다 */
export function sliceRecentSessions<T>(sessions: T[], limit = 15): T[] {
  return sessions.slice(0, limit);
}

/** 세션 날짜가 오늘인지 판별한다 */
export function isSessionToday(sessionDate: Date, now: Date = new Date()): boolean {
  return sessionDate.toDateString() === now.toDateString();
}
