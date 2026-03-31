import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-compound-loop',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  classifyInsight,
  runCompoundLoop,
  saveTeamProposals,
  loadProposals,
  cleanProposals,
  handleCompound,
} from '../src/engine/compound-loop.js';
import type { CompoundInsight } from '../src/engine/compound-loop.js';

const COMPOUND_DIR = path.join(TEST_HOME, '.compound');

function makeInsight(overrides?: Partial<CompoundInsight>): CompoundInsight {
  return {
    id: `c-${Date.now()}`,
    type: 'solution',
    title: 'Test Insight',
    content: 'Test content for insight',
    scope: 'me',
    classification: 'personal',
    reason: 'test',
    source: 'manual',
    ...overrides,
  };
}

describe('compound-loop', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(COMPOUND_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── runCompoundLoop ──

  describe('runCompoundLoop', () => {
    it('인사이트를 파일로 저장한다', async () => {
      const insight = makeInsight({ title: 'My Solution' });
      const result = await runCompoundLoop(TEST_HOME, [insight]);
      expect(result.saved.length).toBe(1);
      expect(result.saved[0]).toContain('My Solution');
    });

    it('중복 인사이트는 건너뛴다', async () => {
      const insight = makeInsight({ title: 'Dup Test' });
      await runCompoundLoop(TEST_HOME, [insight]);
      const result2 = await runCompoundLoop(TEST_HOME, [insight]);
      expect(result2.skipped.length).toBe(1);
      expect(result2.skipped[0]).toContain('already exists');
    });

    it('빈 배열이면 아무것도 저장하지 않는다', async () => {
      const result = await runCompoundLoop(TEST_HOME, []);
      expect(result.saved).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it('rule 타입은 rules 디렉토리에 저장', async () => {
      const insight = makeInsight({ type: 'rule', title: 'My Rule' });
      const result = await runCompoundLoop(TEST_HOME, [insight]);
      expect(result.saved.length).toBe(1);
      expect(result.saved[0]).toContain('rule');
    });

    it('convention 타입은 rules 디렉토리에 저장', async () => {
      const insight = makeInsight({ type: 'convention', title: 'My Convention' });
      const result = await runCompoundLoop(TEST_HOME, [insight]);
      expect(result.saved.length).toBe(1);
    });

    it('여러 인사이트를 한번에 저장', async () => {
      const insights = [
        makeInsight({ title: 'Insight A' }),
        makeInsight({ title: 'Insight B' }),
        makeInsight({ title: 'Insight C' }),
      ];
      const result = await runCompoundLoop(TEST_HOME, insights);
      expect(result.saved.length).toBe(3);
    });
  });

  // ── saveTeamProposals / loadProposals / cleanProposals ──

  describe('saveTeamProposals', () => {
    it('제안을 .compound/proposals/에 저장한다', () => {
      const insights = [makeInsight({ classification: 'team', scope: 'team' })];
      const cwd = TEST_HOME;
      saveTeamProposals(insights, cwd);
      const proposalsDir = path.join(cwd, '.compound', 'proposals');
      expect(fs.existsSync(proposalsDir)).toBe(true);
      const files = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(1);
    });
  });

  describe('loadProposals', () => {
    it('디렉토리가 없으면 빈 배열 반환', () => {
      expect(loadProposals('/nonexistent')).toEqual([]);
    });

    it('저장된 제안을 로드한다', () => {
      const proposalsDir = path.join(TEST_HOME, 'proposals');
      fs.mkdirSync(proposalsDir, { recursive: true });
      const insights = [makeInsight({ title: 'Loaded Proposal' })];
      fs.writeFileSync(path.join(proposalsDir, 'test.json'), JSON.stringify(insights));
      const loaded = loadProposals(proposalsDir);
      expect(loaded.length).toBe(1);
      expect(loaded[0].title).toBe('Loaded Proposal');
    });

    it('잘못된 JSON 파일은 건너뛴다', () => {
      const proposalsDir = path.join(TEST_HOME, 'proposals');
      fs.mkdirSync(proposalsDir, { recursive: true });
      fs.writeFileSync(path.join(proposalsDir, 'bad.json'), 'not json');
      fs.writeFileSync(path.join(proposalsDir, 'good.json'), JSON.stringify([makeInsight()]));
      const loaded = loadProposals(proposalsDir);
      expect(loaded.length).toBe(1);
    });

    it('배열이 아닌 JSON도 건너뛴다', () => {
      const proposalsDir = path.join(TEST_HOME, 'proposals');
      fs.mkdirSync(proposalsDir, { recursive: true });
      fs.writeFileSync(path.join(proposalsDir, 'obj.json'), JSON.stringify({ foo: 'bar' }));
      const loaded = loadProposals(proposalsDir);
      expect(loaded.length).toBe(0);
    });
  });

  describe('cleanProposals', () => {
    it('디렉토리가 없으면 아무 일도 하지 않는다', () => {
      expect(() => cleanProposals('/nonexistent')).not.toThrow();
    });

    it('JSON 파일을 모두 삭제한다', () => {
      const proposalsDir = path.join(TEST_HOME, 'proposals');
      fs.mkdirSync(proposalsDir, { recursive: true });
      fs.writeFileSync(path.join(proposalsDir, 'a.json'), '[]');
      fs.writeFileSync(path.join(proposalsDir, 'b.json'), '[]');
      cleanProposals(proposalsDir);
      const remaining = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.json'));
      expect(remaining.length).toBe(0);
    });
  });

  // ── classifyInsight ──

  describe('classifyInsight', () => {
    it('팀 키워드가 많으면 team 분류', () => {
      const result = classifyInsight('API 에러 처리 규칙', 'API 에러 처리 규약');
      expect(result.classification).toBe('team');
    });

    it('개인 키워드가 많으면 personal 분류', () => {
      const result = classifyInsight('내 스타일 단축키', 'vim 에디터 단축키 습관');
      expect(result.classification).toBe('personal');
    });

    it('동점이면 기본값 personal', () => {
      const result = classifyInsight('일반 제목', '일반 내용');
      expect(result.classification).toBe('personal');
      expect(result.reason).toContain('default');
    });
  });

  // ── handleCompound CLI ──

  describe('handleCompound', () => {
    beforeEach(() => {
      vi.spyOn(process, 'cwd').mockReturnValue(TEST_HOME);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('--help 플래그로 사용법 출력', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleCompound(['--help']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
      logSpy.mockRestore();
    });

    it('-h 플래그로 사용법 출력', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleCompound(['-h']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
      logSpy.mockRestore();
    });

    it('--solution으로 수동 인사이트 추가', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleCompound(['--solution', 'Test Solution', 'Test content here']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Saved'));
      logSpy.mockRestore();
    });

    it('--rule으로 수동 규칙 추가', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleCompound(['--rule', 'Test Rule', 'Rule content']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Saved'));
      logSpy.mockRestore();
    });

    it('--solution 제목 없으면 안내 출력', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleCompound(['--solution']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('title is required'));
      logSpy.mockRestore();
    });

    it('--to team으로 팀 스코프 지정', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleCompound(['--solution', 'Team Rule', 'Content', '--to', 'team']);
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('interactive 서브커맨드는 비대화형 환경에서 안내 출력', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const origIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      await handleCompound(['interactive']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Interactive mode'));
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, configurable: true });
      logSpy.mockRestore();
    });
  });
});
