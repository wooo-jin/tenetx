/**
 * tests/dashboard/data.test.ts
 *
 * data.ts의 순수 함수 단위 테스트.
 * 파일시스템/git에 의존하는 함수(loadSessions, loadPacks, getGitRemote, loadDashboardData)는
 * I/O 사이드이펙트로 인해 렌더링 테스트와 함께 별도 통합테스트에서 다룬다.
 * 여기서는 SessionRecord[] 를 입력받는 계산 함수들을 집중적으로 검증한다.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SessionRecord } from '../../src/dashboard/data.js';
import {
  getDailySessionCounts,
  getTodaySessionCount,
  getAvgDuration,
  getTotalDuration,
  formatDateTime,
  countMdFiles,
} from '../../src/dashboard/data.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** 오늘 기준 daysAgo일 전 날짜를 생성 */
function daysAgo(n: number, hour = 12): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

/** 오늘 날짜 자정(00:00:00) */
function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── getTodaySessionCount ──────────────────────────────────────────────────────

describe('getTodaySessionCount', () => {
  it('빈 세션 배열이면 0을 반환한다', () => {
    expect(getTodaySessionCount([])).toBe(0);
  });

  it('오늘 세션만 카운트한다', () => {
    const sessions: SessionRecord[] = [
      { date: daysAgo(0) },
      { date: daysAgo(0) },
      { date: daysAgo(1) },
    ];
    expect(getTodaySessionCount(sessions)).toBe(2);
  });

  it('어제 세션은 포함하지 않는다', () => {
    const sessions: SessionRecord[] = [
      { date: daysAgo(1) },
      { date: daysAgo(2) },
    ];
    expect(getTodaySessionCount(sessions)).toBe(0);
  });

  it('정확히 자정(00:00:00)인 오늘 세션은 포함한다', () => {
    const midnight = todayMidnight();
    expect(getTodaySessionCount([{ date: midnight }])).toBe(1);
  });
});

// ── getAvgDuration ────────────────────────────────────────────────────────────

describe('getAvgDuration', () => {
  it('세션이 없으면 0을 반환한다', () => {
    expect(getAvgDuration([])).toBe(0);
  });

  it('durationMinutes가 없는 세션만 있으면 0을 반환한다', () => {
    const sessions: SessionRecord[] = [
      { date: new Date() },
      { date: new Date(), durationMinutes: undefined },
    ];
    expect(getAvgDuration(sessions)).toBe(0);
  });

  it('durationMinutes가 0인 세션은 평균 계산에서 제외한다', () => {
    // 0은 유효한 시간이 아니라는 비즈니스 규칙 (코드: durationMinutes > 0)
    const sessions: SessionRecord[] = [
      { date: new Date(), durationMinutes: 0 },
      { date: new Date(), durationMinutes: 60 },
    ];
    expect(getAvgDuration(sessions)).toBe(60);
  });

  it('복수 세션의 평균을 올바르게 계산한다', () => {
    const sessions: SessionRecord[] = [
      { date: new Date(), durationMinutes: 30 },
      { date: new Date(), durationMinutes: 60 },
      { date: new Date(), durationMinutes: 90 },
    ];
    expect(getAvgDuration(sessions)).toBe(60);
  });

  it('소수점 결과는 Math.round로 반올림한다', () => {
    const sessions: SessionRecord[] = [
      { date: new Date(), durationMinutes: 10 },
      { date: new Date(), durationMinutes: 11 },
    ];
    // (10 + 11) / 2 = 10.5 → round → 11
    expect(getAvgDuration(sessions)).toBe(11);
  });
});

// ── getTotalDuration ──────────────────────────────────────────────────────────

describe('getTotalDuration', () => {
  it('세션이 없으면 0을 반환한다', () => {
    expect(getTotalDuration([])).toBe(0);
  });

  it('durationMinutes가 없는 세션은 0으로 누산한다', () => {
    const sessions: SessionRecord[] = [
      { date: new Date() },
      { date: new Date(), durationMinutes: 30 },
    ];
    expect(getTotalDuration(sessions)).toBe(30);
  });

  it('모든 세션의 durationMinutes 합계를 반환한다', () => {
    const sessions: SessionRecord[] = [
      { date: new Date(), durationMinutes: 15 },
      { date: new Date(), durationMinutes: 45 },
      { date: new Date(), durationMinutes: 60 },
    ];
    expect(getTotalDuration(sessions)).toBe(120);
  });
});

// ── getDailySessionCounts ────────────────────────────────────────────────────

describe('getDailySessionCounts', () => {
  it('세션이 없으면 7개의 0 배열을 반환한다', () => {
    expect(getDailySessionCounts([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('항상 길이 7의 배열을 반환한다', () => {
    const counts = getDailySessionCounts([]);
    expect(counts).toHaveLength(7);
  });

  it('오늘 세션은 배열의 마지막(인덱스 6) 위치에 카운트된다', () => {
    const sessions: SessionRecord[] = [
      { date: daysAgo(0) },
      { date: daysAgo(0) },
    ];
    const counts = getDailySessionCounts(sessions);
    expect(counts[6]).toBe(2);
  });

  it('어제 세션은 배열의 인덱스 5 위치에 카운트된다', () => {
    const sessions: SessionRecord[] = [
      { date: daysAgo(1) },
    ];
    const counts = getDailySessionCounts(sessions);
    expect(counts[5]).toBe(1);
  });

  it('6일 전 세션은 배열의 인덱스 0 위치에 카운트된다', () => {
    const sessions: SessionRecord[] = [
      { date: daysAgo(6) },
    ];
    const counts = getDailySessionCounts(sessions);
    expect(counts[0]).toBe(1);
  });

  it('7일보다 오래된 세션은 포함하지 않는다', () => {
    const sessions: SessionRecord[] = [
      { date: daysAgo(7) },
      { date: daysAgo(14) },
    ];
    const counts = getDailySessionCounts(sessions);
    expect(counts.every(c => c === 0)).toBe(true);
  });

  it('여러 날에 걸친 세션을 올바르게 집계한다', () => {
    const sessions: SessionRecord[] = [
      { date: daysAgo(0) },
      { date: daysAgo(0) },
      { date: daysAgo(1) },
      { date: daysAgo(3) },
    ];
    const counts = getDailySessionCounts(sessions);
    expect(counts[6]).toBe(2); // 오늘
    expect(counts[5]).toBe(1); // 어제
    expect(counts[3]).toBe(1); // 3일 전
  });
});

// ── formatDateTime ────────────────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('MM/DD HH:mm 형식으로 포맷한다', () => {
    const date = new Date(2024, 0, 5, 9, 3); // 2024-01-05 09:03
    expect(formatDateTime(date)).toBe('01/05 09:03');
  });

  it('월/일/시/분 모두 두 자리로 패딩한다', () => {
    const date = new Date(2024, 2, 1, 1, 7); // 2024-03-01 01:07
    expect(formatDateTime(date)).toBe('03/01 01:07');
  });

  it('12월 31일 23:59 엣지케이스를 올바르게 처리한다', () => {
    const date = new Date(2024, 11, 31, 23, 59);
    expect(formatDateTime(date)).toBe('12/31 23:59');
  });

  it('반환 문자열은 항상 길이 11(MM/DD HH:mm)이다', () => {
    const date = new Date(2024, 5, 15, 14, 30);
    expect(formatDateTime(date)).toHaveLength(11);
  });
});

// ── countMdFiles ──────────────────────────────────────────────────────────────

describe('countMdFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('존재하지 않는 디렉토리는 0을 반환한다', () => {
    expect(countMdFiles(path.join(tmpDir, 'nonexistent'))).toBe(0);
  });

  it('.md 파일이 없는 디렉토리는 0을 반환한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), '');
    fs.writeFileSync(path.join(tmpDir, 'file.ts'), '');
    expect(countMdFiles(tmpDir)).toBe(0);
  });

  it('.md 파일 수를 정확히 반환한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'b.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'c.txt'), '');
    expect(countMdFiles(tmpDir)).toBe(2);
  });

  it('.md 파일만 카운트하고 다른 확장자는 제외한다', () => {
    fs.writeFileSync(path.join(tmpDir, 'note.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'note.mdx'), '');  // .mdx는 제외
    fs.writeFileSync(path.join(tmpDir, 'note.markdown'), '');  // .markdown도 제외
    expect(countMdFiles(tmpDir)).toBe(1);
  });
});
