import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadProposals, cleanProposals, saveTeamProposals } from '../src/engine/compound-loop.js';
import type { CompoundInsight } from '../src/engine/compound-loop.js';

describe('proposal helpers', () => {
  let tmpDir: string;
  let proposalsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crossover-test-'));
    proposalsDir = path.join(tmpDir, '.compound', 'proposals');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeInsight = (title: string, content: string): CompoundInsight => ({
    id: `c-${Date.now()}`,
    type: 'rule',
    title,
    content,
    scope: 'team',
    classification: 'team',
    reason: '테스트',
    source: 'manual',
  });

  describe('loadProposals', () => {
    it('존재하지 않는 디렉토리는 빈 배열', () => {
      expect(loadProposals(proposalsDir)).toEqual([]);
    });

    it('proposal JSON 파일을 읽어온다', () => {
      fs.mkdirSync(proposalsDir, { recursive: true });
      const insights = [makeInsight('테스트 규칙', 'API 에러 처리')];
      fs.writeFileSync(
        path.join(proposalsDir, '2026-03-16-123.json'),
        JSON.stringify(insights),
      );

      const loaded = loadProposals(proposalsDir);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].title).toBe('테스트 규칙');
    });

    it('여러 파일을 합쳐서 반환', () => {
      fs.mkdirSync(proposalsDir, { recursive: true });
      fs.writeFileSync(
        path.join(proposalsDir, 'a.json'),
        JSON.stringify([makeInsight('규칙 A', '내용 A')]),
      );
      fs.writeFileSync(
        path.join(proposalsDir, 'b.json'),
        JSON.stringify([makeInsight('규칙 B', '내용 B')]),
      );

      const loaded = loadProposals(proposalsDir);
      expect(loaded).toHaveLength(2);
    });

    it('잘못된 JSON 파일은 건너뜀', () => {
      fs.mkdirSync(proposalsDir, { recursive: true });
      fs.writeFileSync(path.join(proposalsDir, 'bad.json'), 'not json{{{');
      fs.writeFileSync(
        path.join(proposalsDir, 'good.json'),
        JSON.stringify([makeInsight('좋은 규칙', '내용')]),
      );

      const loaded = loadProposals(proposalsDir);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].title).toBe('좋은 규칙');
    });
  });

  describe('cleanProposals', () => {
    it('proposal JSON 파일을 삭제', () => {
      fs.mkdirSync(proposalsDir, { recursive: true });
      fs.writeFileSync(path.join(proposalsDir, 'a.json'), '[]');
      fs.writeFileSync(path.join(proposalsDir, 'b.json'), '[]');

      cleanProposals(proposalsDir);

      const remaining = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.json'));
      expect(remaining).toHaveLength(0);
    });

    it('존재하지 않는 디렉토리는 무시', () => {
      expect(() => cleanProposals(proposalsDir)).not.toThrow();
    });

    it('비-JSON 파일은 유지', () => {
      fs.mkdirSync(proposalsDir, { recursive: true });
      fs.writeFileSync(path.join(proposalsDir, 'readme.md'), '# test');
      fs.writeFileSync(path.join(proposalsDir, 'data.json'), '[]');

      cleanProposals(proposalsDir);

      const remaining = fs.readdirSync(proposalsDir);
      expect(remaining).toContain('readme.md');
      expect(remaining).not.toContain('data.json');
    });
  });

  describe('saveTeamProposals', () => {
    it('proposals 디렉토리에 JSON 파일 생성', () => {
      const insights = [makeInsight('팀 규칙', '배포 전 테스트 필수')];
      saveTeamProposals(insights, tmpDir);

      const files = fs.readdirSync(path.join(tmpDir, '.compound', 'proposals'));
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.json$/);

      const content = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.compound', 'proposals', files[0]), 'utf-8'),
      );
      expect(content).toHaveLength(1);
      expect(content[0].title).toBe('팀 규칙');
    });
  });
});
