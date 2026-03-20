import { describe, it, expect } from 'vitest';

import {
  classifyChangeSize,
  generateReviewChecklist,
  getChangedFiles,
  runReviewLoop,
  formatReviewResult,
} from '../src/engine/loops/review-loop.js';
import type { ChangedFile } from '../src/engine/loops/review-loop.js';
import type { LoopResult } from '../src/engine/loops/types.js';

describe('review-loop', () => {
  // ── getChangedFiles ──

  describe('getChangedFiles', () => {
    it('현재 git repo에서 변경 파일을 감지한다', () => {
      // 현재 워킹 디렉토리에 변경이 있으므로 결과가 있을 수 있음
      const files = getChangedFiles(process.cwd());
      expect(Array.isArray(files)).toBe(true);
    });

    it('git이 아닌 디렉토리에서 빈 배열', () => {
      const files = getChangedFiles('/tmp');
      expect(files).toEqual([]);
    });
  });

  // ── classifyChangeSize ──

  describe('classifyChangeSize', () => {
    it('small: 50줄 이하, 3파일 이하', () => {
      const files: ChangedFile[] = [
        { path: 'a.ts', status: 'modified', additions: 10, deletions: 5 },
      ];
      expect(classifyChangeSize(files)).toBe('small');
    });

    it('medium: 300줄 이하, 10파일 이하', () => {
      const files: ChangedFile[] = [
        { path: 'a.ts', status: 'modified', additions: 50, deletions: 30 },
        { path: 'b.ts', status: 'modified', additions: 40, deletions: 20 },
        { path: 'c.ts', status: 'added', additions: 60, deletions: 0 },
        { path: 'd.ts', status: 'modified', additions: 30, deletions: 10 },
      ];
      expect(classifyChangeSize(files)).toBe('medium');
    });

    it('large: 300줄 초과 또는 10파일 초과', () => {
      const files: ChangedFile[] = Array.from({ length: 12 }, (_, i) => ({
        path: `file${i}.ts`,
        status: 'modified' as const,
        additions: 30,
        deletions: 10,
      }));
      expect(classifyChangeSize(files)).toBe('large');
    });

    it('빈 배열은 small', () => {
      expect(classifyChangeSize([])).toBe('small');
    });
  });

  // ── generateReviewChecklist ──

  describe('generateReviewChecklist', () => {
    it('기본 체크리스트 항목을 포함한다', () => {
      const files: ChangedFile[] = [
        { path: 'src/app.ts', status: 'modified', additions: 10, deletions: 5 },
      ];
      const checklist = generateReviewChecklist(files);
      expect(checklist).toContain('변경된 코드의 의도가 명확한가?');
    });

    it('새 기능 추가 시 테스트 체크', () => {
      const files: ChangedFile[] = [
        { path: 'src/feature.ts', status: 'added', additions: 50, deletions: 0 },
      ];
      const checklist = generateReviewChecklist(files);
      expect(checklist.some(c => c.includes('테스트'))).toBe(true);
    });

    it('의존성 변경 시 라이선스 체크', () => {
      const files: ChangedFile[] = [
        { path: 'package.json', status: 'modified', additions: 5, deletions: 2 },
      ];
      const checklist = generateReviewChecklist(files);
      expect(checklist.some(c => c.includes('라이선스'))).toBe(true);
    });

    it('대규모 변경 시 분할 검토 권장', () => {
      const files: ChangedFile[] = Array.from({ length: 15 }, (_, i) => ({
        path: `file${i}.ts`,
        status: 'modified' as const,
        additions: 30,
        deletions: 10,
      }));
      const checklist = generateReviewChecklist(files);
      expect(checklist.some(c => c.includes('분할'))).toBe(true);
    });

    it('보안 파일 변경 시 보안 리뷰 필수', () => {
      const files: ChangedFile[] = [
        { path: 'src/auth/login.ts', status: 'modified', additions: 20, deletions: 10 },
      ];
      const checklist = generateReviewChecklist(files);
      expect(checklist.some(c => c.includes('보안'))).toBe(true);
    });

    it('마이그레이션 파일 감지', () => {
      const files: ChangedFile[] = [
        { path: 'db/migration-20250101.sql', status: 'added', additions: 30, deletions: 0 },
      ];
      const checklist = generateReviewChecklist(files);
      expect(checklist.some(c => c.includes('롤백'))).toBe(true);
    });

    it('리팩터링 변경 감지', () => {
      const files: ChangedFile[] = [
        { path: 'src/utils.ts', status: 'modified', additions: 20, deletions: 20 },
      ];
      const checklist = generateReviewChecklist(files);
      expect(checklist.some(c => c.includes('리팩터링'))).toBe(true);
    });
  });

  // ── formatReviewResult ──

  describe('formatReviewResult', () => {
    it('passed 결과를 포맷한다', () => {
      const result: LoopResult = {
        loopName: 'review',
        status: 'passed',
        steps: [
          { name: 'collect-changes', status: 'passed', message: '3개 파일 변경', startedAt: '' },
        ],
        summary: '3파일 리뷰, 0건 지적',
        suggestions: ['☐ 변경된 코드의 의도가 명확한가?'],
      };
      const formatted = formatReviewResult(result);
      expect(formatted).toContain('✅');
      expect(formatted).toContain('3파일 리뷰');
      expect(formatted).toContain('리뷰 체크리스트');
    });

    it('위반이 있는 결과를 포맷한다', () => {
      const result: LoopResult = {
        loopName: 'review',
        status: 'partial',
        steps: [
          { name: 'constraint-check', status: 'failed', message: '2건 위반', startedAt: '' },
        ],
        summary: '5파일 리뷰, 2건 지적',
      };
      const formatted = formatReviewResult(result);
      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('✗ constraint-check');
    });
  });

  // ── runReviewLoop ──

  describe('runReviewLoop', () => {
    it('changedFiles를 직접 지정할 수 있다', () => {
      const result = runReviewLoop({
        cwd: process.cwd(),
        changedFiles: ['src/cli.ts'],
      });
      expect(result.loopName).toBe('review');
      expect(result.summary).toContain('1파일');
    });

    it('빈 changedFiles면 변경 없음', () => {
      const result = runReviewLoop({
        cwd: '/tmp/empty-nonexistent',
        changedFiles: [],
      });
      expect(result.status).toBe('passed');
      expect(result.summary).toContain('변경 없음');
    });

    it('depth quick이면 change-analysis 생략', () => {
      const result = runReviewLoop({
        cwd: process.cwd(),
        changedFiles: ['src/cli.ts'],
        depth: 'quick',
      });
      expect(result.steps.find(s => s.name === 'change-analysis')).toBeUndefined();
    });

    it('depth standard면 change-analysis 포함', () => {
      const result = runReviewLoop({
        cwd: process.cwd(),
        changedFiles: ['src/cli.ts'],
        depth: 'standard',
      });
      expect(result.steps.find(s => s.name === 'change-analysis')).toBeDefined();
    });

    it('리뷰 체크리스트가 suggestions에 포함', () => {
      const result = runReviewLoop({
        cwd: process.cwd(),
        changedFiles: ['src/cli.ts', 'package.json'],
      });
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.some(s => s.includes('☐'))).toBe(true);
    });
  });
});
