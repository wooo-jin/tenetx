/**
 * tests/dashboard/ui-logic.test.ts
 *
 * 대시보드 UI 컴포넌트의 계산 로직 단위 테스트.
 *
 * Ink/React 컴포넌트 렌더링은 ink-testing-library 없이 불가하므로
 * 컴포넌트/유틸에서 export된 순수 함수를 직접 import해 검증한다.
 * 실제 컴포넌트 렌더링 테스트는 별도 통합테스트에서 ink-testing-library와 함께 다룬다.
 */

import { describe, it, expect } from 'vitest';
import type { PackInfo } from '../../src/dashboard/data.js';
import { resolveBarColor, calcBarBlocks } from '../../src/dashboard/ui/Bar.js';
import {
  generateDayLabels,
  calcBlockIndex,
  defaultFmt,
  BLOCKS,
} from '../../src/dashboard/ui/SparkLine.js';
import {
  sumPackSolutions,
  sumPackRules,
  formatTotalDuration,
  generateDateLabels,
  sliceRecentSessions,
  isSessionToday,
} from '../../src/dashboard/utils.js';

// ── Bar 컴포넌트 색상 결정 로직 ──────────────────────────────────────────────

describe('Bar 컴포넌트 - 색상 결정 로직', () => {
  it('값이 green 임계값 미만이면 green을 반환한다', () => {
    expect(resolveBarColor(0)).toBe('green');
    expect(resolveBarColor(49)).toBe('green');
  });

  it('값이 green 임계값 이상 yellow 임계값 미만이면 yellow를 반환한다', () => {
    expect(resolveBarColor(50)).toBe('yellow');
    expect(resolveBarColor(79)).toBe('yellow');
  });

  it('값이 yellow 임계값 이상이면 red를 반환한다', () => {
    expect(resolveBarColor(80)).toBe('red');
    expect(resolveBarColor(100)).toBe('red');
  });

  it('커스텀 임계값이 적용된다', () => {
    expect(resolveBarColor(30, { green: 40, yellow: 70 })).toBe('green');
    expect(resolveBarColor(50, { green: 40, yellow: 70 })).toBe('yellow');
    expect(resolveBarColor(75, { green: 40, yellow: 70 })).toBe('red');
  });
});

describe('Bar 컴포넌트 - filled/empty 블록 계산', () => {
  it('value=0이면 filled=0, empty=width', () => {
    expect(calcBarBlocks(0)).toEqual({ filled: 0, empty: 20 });
  });

  it('value=100이면 filled=width, empty=0', () => {
    expect(calcBarBlocks(100)).toEqual({ filled: 20, empty: 0 });
  });

  it('value=50이면 filled와 empty가 반반이다', () => {
    expect(calcBarBlocks(50)).toEqual({ filled: 10, empty: 10 });
  });

  it('filled + empty는 항상 width와 같다', () => {
    for (const v of [0, 25, 50, 75, 100]) {
      const { filled, empty } = calcBarBlocks(v, 20);
      expect(filled + empty).toBe(20);
    }
  });
});

// ── SparkLine 컴포넌트 - 블록 인덱스 계산 로직 ───────────────────────────────

describe('SparkLine 컴포넌트 - 블록 인덱스 계산', () => {
  it('최솟값은 항상 인덱스 0을 반환한다', () => {
    expect(calcBlockIndex(0, 0, 10)).toBe(0);
    expect(calcBlockIndex(5, 5, 20)).toBe(0);
  });

  it('최댓값은 항상 BLOCKS.length - 1 인덱스를 반환한다', () => {
    expect(calcBlockIndex(10, 0, 10)).toBe(BLOCKS.length - 1);
    expect(calcBlockIndex(20, 5, 20)).toBe(BLOCKS.length - 1);
  });

  it('모든 값이 같을 때(range=0) range를 1로 처리해 인덱스 0을 반환한다', () => {
    // range = 0 → 1 로 대체. (v - min) / 1 = 0. round(0 * 7) = 0
    expect(calcBlockIndex(5, 5, 5)).toBe(0);
  });

  it('중간값은 중간 인덱스에 가깝다', () => {
    // (5 - 0) / 10 * 7 = 3.5 → round → 4
    expect(calcBlockIndex(5, 0, 10)).toBe(4);
  });
});

// ── SparkLine 컴포넌트 - 기본 레이블 생성 로직 ───────────────────────────────

describe('SparkLine 컴포넌트 - 기본 레이블 생성', () => {
  it('length=7이면 7개의 레이블을 생성한다', () => {
    expect(generateDayLabels(7)).toHaveLength(7);
  });

  it('마지막 레이블은 "오늘"이다', () => {
    const labels = generateDayLabels(7);
    expect(labels[6]).toBe('오늘');
  });

  it('마지막에서 두 번째 레이블은 "어제"이다', () => {
    const labels = generateDayLabels(7);
    expect(labels[5]).toBe('어제');
  });

  it('첫 번째 레이블은 "6일전"이다 (length=7)', () => {
    const labels = generateDayLabels(7);
    expect(labels[0]).toBe('6일전');
  });

  it('length=1이면 ["오늘"]을 반환한다', () => {
    expect(generateDayLabels(1)).toEqual(['오늘']);
  });

  it('length=2이면 ["어제", "오늘"]을 반환한다', () => {
    expect(generateDayLabels(2)).toEqual(['어제', '오늘']);
  });
});

// ── SparkLine 컴포넌트 - 숫자 포맷 로직 ─────────────────────────────────────

describe('SparkLine 컴포넌트 - 기본 숫자 포맷', () => {
  it('1000 미만의 정수는 그대로 문자열로 반환한다', () => {
    expect(defaultFmt(0)).toBe('0');
    expect(defaultFmt(42)).toBe('42');
    expect(defaultFmt(999)).toBe('999');
  });

  it('1000 이상의 숫자는 K 단위로 변환한다', () => {
    expect(defaultFmt(1000)).toBe('1.0K');
    expect(defaultFmt(1500)).toBe('1.5K');
    expect(defaultFmt(10000)).toBe('10.0K');
  });

  it('소수점이 있는 숫자는 1자리로 포맷한다', () => {
    expect(defaultFmt(3.14)).toBe('3.1');
    expect(defaultFmt(2.5)).toBe('2.5');
  });
});

// ── PackTab 컴포넌트 - 집계 계산 로직 ───────────────────────────────────────

describe('PackTab 컴포넌트 - 팩 집계 계산', () => {
  const packs: PackInfo[] = [
    { name: 'pack-a', version: '1.0.0', solutions: 10, rules: 5 },
    { name: 'pack-b', version: '2.0.0', solutions: 20, rules: 8 },
    { name: 'pack-c', version: '1.5.0', solutions: 0, rules: 3 },
  ];

  it('totalSolutions는 모든 팩의 solutions 합계이다', () => {
    expect(sumPackSolutions(packs)).toBe(30);
  });

  it('totalRules는 모든 팩의 rules 합계이다', () => {
    expect(sumPackRules(packs)).toBe(16);
  });

  it('팩이 없으면 totalSolutions와 totalRules는 0이다', () => {
    expect(sumPackSolutions([])).toBe(0);
    expect(sumPackRules([])).toBe(0);
  });
});

// ── StatsTab 컴포넌트 - totalDuration 시간 변환 ───────────────────────────────

describe('StatsTab 컴포넌트 - 총 시간 표시 로직', () => {
  it('0이면 "-"를 반환한다', () => {
    expect(formatTotalDuration(0)).toBe('-');
  });

  it('60분은 "1h"로 표시한다', () => {
    expect(formatTotalDuration(60)).toBe('1h');
  });

  it('90분은 반올림해 "2h"로 표시한다', () => {
    expect(formatTotalDuration(90)).toBe('2h');
  });

  it('120분은 "2h"로 표시한다', () => {
    expect(formatTotalDuration(120)).toBe('2h');
  });
});

// ── StatsTab 컴포넌트 - 날짜 레이블 생성 ────────────────────────────────────

describe('StatsTab 컴포넌트 - 날짜 레이블 생성', () => {
  it('7개의 레이블을 반환한다', () => {
    expect(generateDateLabels()).toHaveLength(7);
  });

  it('"M/D" 형식의 레이블을 반환한다', () => {
    const fixed = new Date(2024, 0, 10); // 2024-01-10
    const labels = generateDateLabels(fixed);
    expect(labels[6]).toBe('1/10'); // 오늘
    expect(labels[5]).toBe('1/9');  // 어제
    expect(labels[0]).toBe('1/4');  // 6일 전
  });
});

// ── LogsTab 컴포넌트 - 세션 표시 로직 ────────────────────────────────────────

describe('LogsTab 컴포넌트 - 세션 슬라이스 로직', () => {
  it('세션이 15개 이하이면 전체를 표시한다', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    expect(sliceRecentSessions(sessions)).toHaveLength(10);
  });

  it('세션이 15개 초과이면 처음 15개만 표시한다', () => {
    const sessions = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    expect(sliceRecentSessions(sessions)).toHaveLength(15);
  });

  it('초과 세션 개수를 올바르게 계산한다', () => {
    const sessions = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    const recent = sliceRecentSessions(sessions);
    expect(sessions.length - recent.length).toBe(5);
  });
});

describe('LogsTab 컴포넌트 - 오늘 세션 판별 로직', () => {
  it('오늘 날짜의 세션은 isSessionToday=true이다', () => {
    const now = new Date(2024, 5, 15, 10, 0);
    const sessionDate = new Date(2024, 5, 15, 8, 30); // 같은 날
    expect(isSessionToday(sessionDate, now)).toBe(true);
  });

  it('어제 날짜의 세션은 isSessionToday=false이다', () => {
    const now = new Date(2024, 5, 15, 10, 0);
    const yesterday = new Date(2024, 5, 14, 10, 0);
    expect(isSessionToday(yesterday, now)).toBe(false);
  });
});

// ── HomeTab 컴포넌트 - pack 집계 계산 ────────────────────────────────────────

describe('HomeTab 컴포넌트 - pack 집계 계산', () => {
  it('packSolutions는 모든 팩의 solutions 합계이다', () => {
    const packs: PackInfo[] = [
      { name: 'a', version: '1.0', solutions: 5, rules: 2 },
      { name: 'b', version: '1.0', solutions: 15, rules: 7 },
    ];
    expect(sumPackSolutions(packs)).toBe(20);
  });

  it('packRules는 모든 팩의 rules 합계이다', () => {
    const packs: PackInfo[] = [
      { name: 'a', version: '1.0', solutions: 5, rules: 2 },
      { name: 'b', version: '1.0', solutions: 15, rules: 7 },
    ];
    expect(sumPackRules(packs)).toBe(9);
  });
});
