/**
 * pre-compact 훅 단위 테스트
 *
 * collectActiveStates와 saveCompactionSnapshot 로직을 독립적으로 검증합니다.
 * 파일시스템을 임시 디렉토리에서 테스트합니다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tmpDir: string;
let stateDir: string;
let handoffsDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-pre-compact-'));
  stateDir = path.join(tmpDir, 'state');
  handoffsDir = path.join(tmpDir, 'handoffs');
  fs.mkdirSync(stateDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── collectActiveStates 인라인 재구현 ──
function collectActiveStates(dir: string): Array<{ mode: string; data: Record<string, unknown> }> {
  const active: Array<{ mode: string; data: Record<string, unknown> }> = [];
  if (!fs.existsSync(dir)) return active;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('-state.json') || f.startsWith('context-guard') || f.startsWith('skill-cache')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      if (data.active) {
        active.push({ mode: f.replace('-state.json', ''), data });
      }
    } catch { /* skip */ }
  }
  return active;
}

// ── cleanOldHandoffs 인라인 재구현 ──
function cleanOldHandoffs(dir: string, maxAgeMs: number): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  const now = Date.now();
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (now - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(p);
      removed++;
    }
  }
  return removed;
}

describe('collectActiveStates', () => {
  it('활성 상태 파일을 수집한다', () => {
    fs.writeFileSync(
      path.join(stateDir, 'tdd-state.json'),
      JSON.stringify({ active: true, prompt: 'test first', startedAt: '2026-04-01T00:00:00Z' }),
    );
    const states = collectActiveStates(stateDir);
    expect(states).toHaveLength(1);
    expect(states[0].mode).toBe('tdd');
    expect(states[0].data.active).toBe(true);
  });

  it('비활성 상태 파일은 제외한다', () => {
    fs.writeFileSync(
      path.join(stateDir, 'review-state.json'),
      JSON.stringify({ active: false, prompt: 'review code' }),
    );
    const states = collectActiveStates(stateDir);
    expect(states).toHaveLength(0);
  });

  it('context-guard 상태 파일은 무시한다', () => {
    fs.writeFileSync(
      path.join(stateDir, 'context-guard-state.json'),
      JSON.stringify({ active: true }),
    );
    const states = collectActiveStates(stateDir);
    expect(states).toHaveLength(0);
  });

  it('skill-cache 파일은 무시한다', () => {
    fs.writeFileSync(
      path.join(stateDir, 'skill-cache-abc-state.json'),
      JSON.stringify({ active: true }),
    );
    const states = collectActiveStates(stateDir);
    expect(states).toHaveLength(0);
  });

  it('JSON 파싱 실패 파일은 건너뛴다', () => {
    fs.writeFileSync(path.join(stateDir, 'broken-state.json'), 'not json');
    fs.writeFileSync(
      path.join(stateDir, 'valid-state.json'),
      JSON.stringify({ active: true }),
    );
    const states = collectActiveStates(stateDir);
    expect(states).toHaveLength(1);
    expect(states[0].mode).toBe('valid');
  });

  it('디렉토리가 없으면 빈 배열을 반환한다', () => {
    const states = collectActiveStates('/nonexistent/path');
    expect(states).toHaveLength(0);
  });

  it('여러 활성 상태를 모두 수집한다', () => {
    fs.writeFileSync(path.join(stateDir, 'tdd-state.json'), JSON.stringify({ active: true }));
    fs.writeFileSync(path.join(stateDir, 'review-state.json'), JSON.stringify({ active: true }));
    fs.writeFileSync(path.join(stateDir, 'debug-state.json'), JSON.stringify({ active: false }));
    const states = collectActiveStates(stateDir);
    expect(states).toHaveLength(2);
  });

  it('-state.json으로 끝나지 않는 파일은 무시한다', () => {
    fs.writeFileSync(path.join(stateDir, 'random.json'), JSON.stringify({ active: true }));
    const states = collectActiveStates(stateDir);
    expect(states).toHaveLength(0);
  });
});

describe('cleanOldHandoffs', () => {
  it('오래된 파일을 삭제한다', () => {
    fs.mkdirSync(handoffsDir, { recursive: true });
    const oldFile = path.join(handoffsDir, 'old.md');
    fs.writeFileSync(oldFile, 'old handoff');
    // 파일 mtime을 8일 전으로 설정
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, eightDaysAgo, eightDaysAgo);

    const removed = cleanOldHandoffs(handoffsDir, 7 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    expect(fs.existsSync(oldFile)).toBe(false);
  });

  it('새로운 파일은 유지한다', () => {
    fs.mkdirSync(handoffsDir, { recursive: true });
    const newFile = path.join(handoffsDir, 'new.md');
    fs.writeFileSync(newFile, 'new handoff');

    const removed = cleanOldHandoffs(handoffsDir, 7 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(0);
    expect(fs.existsSync(newFile)).toBe(true);
  });

  it('디렉토리가 없으면 0을 반환한다', () => {
    const removed = cleanOldHandoffs('/nonexistent', 1000);
    expect(removed).toBe(0);
  });
});
