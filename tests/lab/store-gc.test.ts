/**
 * Tests for lab/store.ts — GC / Rotation functions
 *
 * Isolation strategy: vi.mock('node:os') redirects homedir() to a tmp directory
 * so these tests never touch the real ~/.compound/lab directory.
 * Each test gets a fresh tmp directory via beforeEach.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-store-gc',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  rotateEventsIfNeeded,
  cleanOldArchives,
  readEvents,
  appendEvent,
  EVENTS_PATH,
  LAB_DIR,
} from '../../src/lab/store.js';
import type { LabEvent } from '../../src/lab/types.js';

const ARCHIVE_DIR = path.join(LAB_DIR, 'archive');

function makeEvent(id: string): LabEvent {
  return {
    id,
    type: 'agent-call',
    timestamp: new Date().toISOString(),
    sessionId: `gc-test-sess`,
    payload: { name: 'executor', result: 'success' },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// rotateEventsIfNeeded()
// ────────────────────────────────────────────────────────────────────────────
describe('rotateEventsIfNeeded()', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(LAB_DIR, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('events.jsonl이 없으면 false를 반환한다', () => {
    expect(rotateEventsIfNeeded()).toBe(false);
  });

  it('events.jsonl이 10MB 미만이면 false를 반환한다 (rotate하지 않는다)', () => {
    // 1KB 파일 생성
    fs.writeFileSync(EVENTS_PATH, 'x'.repeat(1024));
    expect(rotateEventsIfNeeded()).toBe(false);
    // 파일이 그대로 남아있어야 함
    expect(fs.existsSync(EVENTS_PATH)).toBe(true);
  });

  it('events.jsonl이 10MB 이상이면 true를 반환하고 archive로 이동한다', () => {
    // 10MB + 1 바이트 파일 생성
    const tenMbPlusOne = 10 * 1024 * 1024 + 1;
    const buf = Buffer.alloc(tenMbPlusOne, 'a');
    fs.writeFileSync(EVENTS_PATH, buf);

    const result = rotateEventsIfNeeded();
    expect(result).toBe(true);
    // 원본 events.jsonl은 삭제됨
    expect(fs.existsSync(EVENTS_PATH)).toBe(false);
    // archive 디렉토리에 파일이 생성됨
    const archiveFiles = fs.readdirSync(ARCHIVE_DIR).filter(f => f.startsWith('events.') && f.endsWith('.jsonl'));
    expect(archiveFiles.length).toBe(1);
  });

  it('같은 날 두 번 rotate하면 counter 접미사가 붙은 두 번째 archive가 생성된다', () => {
    const tenMbPlusOne = 10 * 1024 * 1024 + 1;
    const buf = Buffer.alloc(tenMbPlusOne, 'b');

    // 첫 번째 rotation
    fs.writeFileSync(EVENTS_PATH, buf);
    rotateEventsIfNeeded();

    // 두 번째 rotation (같은 날짜)
    fs.writeFileSync(EVENTS_PATH, buf);
    rotateEventsIfNeeded();

    const archiveFiles = fs.readdirSync(ARCHIVE_DIR)
      .filter(f => f.startsWith('events.') && f.endsWith('.jsonl'));
    expect(archiveFiles.length).toBe(2);
    // 두 번째 파일은 counter 접미사 포함 (예: events.2026-03-26.1.jsonl)
    expect(archiveFiles.some(f => /events\.\d{4}-\d{2}-\d{2}\.\d+\.jsonl/.test(f))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// cleanOldArchives()
// ────────────────────────────────────────────────────────────────────────────
describe('cleanOldArchives()', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('archive 디렉토리가 없으면 0을 반환한다', () => {
    fs.rmSync(ARCHIVE_DIR, { recursive: true, force: true });
    expect(cleanOldArchives()).toBe(0);
  });

  it('archive 디렉토리가 비어있으면 0을 반환한다', () => {
    expect(cleanOldArchives()).toBe(0);
  });

  it('90일 미만의 archive 파일은 삭제하지 않는다', () => {
    const recentFile = path.join(ARCHIVE_DIR, 'events.2026-03-01.jsonl');
    fs.writeFileSync(recentFile, '{"id":"recent"}\n');
    // mtime을 최근 시간으로 설정 (1일 전)
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    fs.utimesSync(recentFile, oneDayAgo, oneDayAgo);

    const removed = cleanOldArchives();
    expect(removed).toBe(0);
    expect(fs.existsSync(recentFile)).toBe(true);
  });

  it('90일을 초과한 archive 파일을 삭제하고 삭제 건수를 반환한다', () => {
    const oldFile = path.join(ARCHIVE_DIR, 'events.2025-01-01.jsonl');
    fs.writeFileSync(oldFile, '{"id":"old"}\n');
    // mtime을 91일 전으로 설정
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, ninetyOneDaysAgo, ninetyOneDaysAgo);

    const removed = cleanOldArchives();
    expect(removed).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
  });

  it('최신 파일은 유지하고 오래된 파일만 삭제한다', () => {
    const oldFile = path.join(ARCHIVE_DIR, 'events.2025-01-01.jsonl');
    const newFile = path.join(ARCHIVE_DIR, 'events.2026-03-01.jsonl');
    fs.writeFileSync(oldFile, '{"id":"old"}\n');
    fs.writeFileSync(newFile, '{"id":"new"}\n');

    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, ninetyOneDaysAgo, ninetyOneDaysAgo);

    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    fs.utimesSync(newFile, oneDayAgo, oneDayAgo);

    const removed = cleanOldArchives();
    expect(removed).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(newFile)).toBe(true);
  });

  it('events. 접두어가 없는 파일은 건드리지 않는다', () => {
    const irrelevantFile = path.join(ARCHIVE_DIR, 'snapshots-2025-01-01.jsonl');
    fs.writeFileSync(irrelevantFile, 'data\n');
    // mtime을 91일 전으로 설정해도 삭제되지 않아야 함
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    fs.utimesSync(irrelevantFile, ninetyOneDaysAgo, ninetyOneDaysAgo);

    cleanOldArchives();
    expect(fs.existsSync(irrelevantFile)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// readEvents() — archive + current file 통합 읽기
// ────────────────────────────────────────────────────────────────────────────
describe('readEvents() — archive + current 통합', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(LAB_DIR, { recursive: true });
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('archive 파일의 이벤트와 현재 파일의 이벤트를 합쳐서 반환한다', () => {
    // archive에 이벤트 기록
    const archiveEvent = makeEvent('archive-event-1');
    const archivePath = path.join(ARCHIVE_DIR, 'events.2026-01-01.jsonl');
    fs.writeFileSync(archivePath, `${JSON.stringify(archiveEvent)}\n`);

    // 현재 events.jsonl에 이벤트 기록
    const currentEvent = makeEvent('current-event-1');
    fs.writeFileSync(EVENTS_PATH, `${JSON.stringify(currentEvent)}\n`);

    const events = readEvents();
    expect(events.some(e => e.id === 'archive-event-1')).toBe(true);
    expect(events.some(e => e.id === 'current-event-1')).toBe(true);
  });

  it('archive가 없어도 현재 파일의 이벤트를 반환한다', () => {
    const event = makeEvent('only-current-1');
    fs.writeFileSync(EVENTS_PATH, `${JSON.stringify(event)}\n`);

    const events = readEvents();
    expect(events.some(e => e.id === 'only-current-1')).toBe(true);
  });

  it('events.jsonl이 없어도 archive 파일의 이벤트를 반환한다', () => {
    const archiveEvent = makeEvent('only-archive-1');
    const archivePath = path.join(ARCHIVE_DIR, 'events.2026-02-01.jsonl');
    fs.writeFileSync(archivePath, `${JSON.stringify(archiveEvent)}\n`);

    const events = readEvents();
    expect(events.some(e => e.id === 'only-archive-1')).toBe(true);
  });

  it('malformed JSON 줄은 건너뛰고 나머지 이벤트를 반환한다', () => {
    const validEvent = makeEvent('valid-event-skip-test');
    const content = `not-valid-json\n${JSON.stringify(validEvent)}\n{broken\n`;
    fs.writeFileSync(EVENTS_PATH, content);

    const events = readEvents();
    expect(events.some(e => e.id === 'valid-event-skip-test')).toBe(true);
  });

  it('sinceMs 필터가 archive 파일에도 적용된다', () => {
    const oldTs = new Date(Date.now() - 200_000).toISOString();
    const newTs = new Date(Date.now() - 1_000).toISOString();

    const oldArchiveEvent = makeEvent('archive-old-event');
    oldArchiveEvent.timestamp = oldTs;

    const newArchiveEvent = makeEvent('archive-new-event');
    newArchiveEvent.timestamp = newTs;

    const archivePath = path.join(ARCHIVE_DIR, 'events.2026-03-01.jsonl');
    fs.writeFileSync(archivePath,
      `${JSON.stringify(oldArchiveEvent)}\n${JSON.stringify(newArchiveEvent)}\n`
    );

    const since = Date.now() - 100_000; // 100초 전 이후만
    const events = readEvents(since);
    expect(events.some(e => e.id === 'archive-new-event')).toBe(true);
    expect(events.some(e => e.id === 'archive-old-event')).toBe(false);
  });

  it('appendEvent가 10MB 초과 시 자동 rotate하고 이후 이벤트는 새 파일에 기록한다', () => {
    // 10MB를 초과하는 데이터를 events.jsonl에 직접 써서 rotation 트리거
    const tenMbPlusOne = 10 * 1024 * 1024 + 1;
    const buf = Buffer.alloc(tenMbPlusOne, 'z');
    fs.writeFileSync(EVENTS_PATH, buf);

    // appendEvent 호출 시 내부적으로 rotateEventsIfNeeded()가 실행됨
    const event = makeEvent('post-rotate-event');
    appendEvent(event);

    // archive에 rotation된 파일이 있어야 함
    const archiveFiles = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.jsonl'));
    expect(archiveFiles.length).toBeGreaterThanOrEqual(1);

    // 새 events.jsonl에서 post-rotate-event를 찾을 수 있어야 함
    const events = readEvents();
    expect(events.some(e => e.id === 'post-rotate-event')).toBe(true);
  });
});
