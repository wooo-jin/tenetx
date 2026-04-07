/**
 * PR1 라운드 2 회귀 테스트 — injection cache backfill
 *
 * 검증 시나리오 (code-reviewer R1 요구사항):
 *   1. 기존 cache의 tags 누락 entry가 매칭 결과로 채워진다
 *   2. tags가 이미 채워진 entry는 덮어쓰지 않는다
 *   3. 매칭 결과에 없는 entry는 그대로 유지
 *   4. 빈 배열 (`tags: []`)은 sentinel로 정당한 상태로 보고 무한 backfill 안 함 (R3)
 *   5. backfill로 만들어진 entry는 fresh.tags의 reference를 공유하지 않는다 (R5)
 *
 * solution-injector.ts main()은 stdin/exit하는 hook이라 직접 호출이 어려우므로,
 * 같은 backfill 로직을 격리한 헬퍼를 직접 검증하는 방식으로 회귀를 잠근다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// solution-injector.ts main() 안의 inline merge 로직과 동일한 식.
// 이 헬퍼가 production 동작과 drift하지 않도록, solution-injector.ts에서
// 머지 식이 바뀔 때 이 테스트 헬퍼도 함께 업데이트해야 한다.
interface CacheEntry {
  name: string;
  identifiers?: unknown;
  tags?: unknown;
  status?: string;
  injectedAt?: string;
}

interface MatchedSolution {
  name: string;
  tags: string[];
  identifiers: string[];
  status?: string;
}

function mergeWithBackfill(
  existing: CacheEntry[],
  toInject: MatchedSolution[],
  allMatched: MatchedSolution[],
): CacheEntry[] {
  const matchedByName = new Map(allMatched.map(m => [m.name, m]));
  const existingNames = new Set(existing.map(s => s.name));
  return [
    ...existing.map(e => {
      // R3 sentinel: tags 키 자체가 없을 때만 backfill (빈 배열은 유지)
      if (e.tags !== undefined) return e;
      const fresh = matchedByName.get(e.name);
      if (!fresh) return e;
      // R5 defensive copy
      return { ...e, tags: [...fresh.tags] };
    }),
    ...toInject
      .filter(s => !existingNames.has(s.name))
      .map(s => ({
        name: s.name,
        identifiers: [...s.identifiers],
        tags: [...s.tags],
        status: s.status,
        injectedAt: '2026-04-07T00:00:00.000Z',
      })),
  ];
}

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'injector-backfill-test-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('mergeWithBackfill — production merge 식과 동일', () => {
  it('R1#1: 기존 cache의 tags 누락 entry가 매칭 결과로 채워진다', () => {
    const existing: CacheEntry[] = [
      // tags 키 자체가 없는 진짜 legacy entry
      { name: 'foo', identifiers: ['oldId'], status: 'experiment', injectedAt: 'old' },
    ];
    const allMatched: MatchedSolution[] = [
      { name: 'foo', tags: ['react', 'hook'], identifiers: ['useState'] },
    ];

    const merged = mergeWithBackfill(existing, [], allMatched);

    expect(merged).toHaveLength(1);
    expect(merged[0].tags).toEqual(['react', 'hook']);
    expect(merged[0].identifiers).toEqual(['oldId']); // 기존 identifiers 유지
    expect(merged[0].status).toBe('experiment');
    expect(merged[0].injectedAt).toBe('old');
  });

  it('R1#2: tags가 이미 채워진 entry는 덮어쓰지 않는다', () => {
    const existing: CacheEntry[] = [
      { name: 'bar', identifiers: ['id'], tags: ['existing'], status: 'experiment' },
    ];
    const allMatched: MatchedSolution[] = [
      { name: 'bar', tags: ['new'], identifiers: ['newid'] },
    ];

    const merged = mergeWithBackfill(existing, [], allMatched);

    expect(merged[0].tags).toEqual(['existing']);
  });

  it('R1#3: 매칭 결과에 없는 entry는 그대로 유지된다', () => {
    const existing: CacheEntry[] = [
      { name: 'orphan', identifiers: ['id'], status: 'experiment' },
    ];
    const allMatched: MatchedSolution[] = [
      { name: 'other', tags: ['t'], identifiers: [] },
    ];

    const merged = mergeWithBackfill(existing, [], allMatched);

    expect(merged).toHaveLength(1);
    expect(merged[0].tags).toBeUndefined(); // sentinel: 매칭 없으면 그대로
  });

  it('R3 sentinel: tags가 빈 배열인 entry는 backfill 안 함 (무한 트리거 방지)', () => {
    const existing: CacheEntry[] = [
      // 정당하게 빈 tags — sentinel이 이걸 legacy로 오해하면 안 됨
      { name: 'empty', identifiers: ['id'], tags: [], status: 'experiment' },
    ];
    const allMatched: MatchedSolution[] = [
      { name: 'empty', tags: ['something'], identifiers: ['id'] },
    ];

    const merged = mergeWithBackfill(existing, [], allMatched);

    // tags 키가 이미 있으므로 (값이 빈 배열이라도) 그대로 유지
    expect(merged[0].tags).toEqual([]);
  });

  it('R5 defensive copy: backfill 결과는 fresh.tags의 reference를 공유하지 않는다', () => {
    const existing: CacheEntry[] = [
      { name: 'foo', identifiers: ['id'], status: 'experiment' },
    ];
    const freshTags = ['t1', 't2'];
    const allMatched: MatchedSolution[] = [
      { name: 'foo', tags: freshTags, identifiers: ['id'] },
    ];

    const merged = mergeWithBackfill(existing, [], allMatched);

    // mutation 격리 검증
    expect(merged[0].tags).toEqual(['t1', 't2']);
    (merged[0].tags as string[]).push('mutated');
    expect(freshTags).toEqual(['t1', 't2']); // 원본 영향 없음
  });

  it('toInject의 신규 entry는 add, dedup by name', () => {
    const existing: CacheEntry[] = [
      { name: 'old', identifiers: ['oid'], tags: ['otag'], status: 'experiment' },
    ];
    const toInject: MatchedSolution[] = [
      { name: 'old', tags: ['ignored'], identifiers: ['ignored'] }, // dedup
      { name: 'new', tags: ['ntag'], identifiers: ['nid'], status: 'experiment' },
    ];

    const merged = mergeWithBackfill(existing, toInject, toInject);

    expect(merged).toHaveLength(2);
    expect(merged[0].name).toBe('old');
    expect(merged[0].tags).toEqual(['otag']); // 기존 유지
    expect(merged[1].name).toBe('new');
  });

  it('R1#4 (early return path): allMatched만 있으면 backfill, toInject 없이도', () => {
    // matches.length === 0 시나리오 (모든 매칭이 이미 injected)
    const existing: CacheEntry[] = [
      { name: 'foo', identifiers: ['id'], status: 'experiment' },
    ];
    const allMatched: MatchedSolution[] = [
      { name: 'foo', tags: ['react'], identifiers: ['id'] },
    ];
    const toInject: MatchedSolution[] = []; // 빈 배열

    const merged = mergeWithBackfill(existing, toInject, allMatched);

    expect(merged).toHaveLength(1);
    expect(merged[0].tags).toEqual(['react']);
  });
});
