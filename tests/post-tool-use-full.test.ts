import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-post-tool-use-full',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  ERROR_PATTERNS,
  detectErrorPattern,
  trackModifiedFile,
} from '../src/hooks/post-tool-use.js';

describe('post-tool-use - extended', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── ERROR_PATTERNS ──

  describe('ERROR_PATTERNS', () => {
    it('패턴 목록이 비어있지 않다', () => {
      expect(ERROR_PATTERNS.length).toBeGreaterThan(0);
    });

    it('모든 패턴에 description이 있다', () => {
      for (const p of ERROR_PATTERNS) {
        expect(p.description).toBeTruthy();
      }
    });
  });

  // ── detectErrorPattern ──

  describe('detectErrorPattern', () => {
    it('ENOENT를 감지한다', () => {
      const result = detectErrorPattern('Error: ENOENT: no such file or directory');
      expect(result).not.toBeNull();
      expect(result!.description).toContain('파일 없음');
    });

    it('permission denied를 감지한다', () => {
      const result = detectErrorPattern('EACCES: permission denied');
      expect(result).not.toBeNull();
      expect(result!.description).toContain('권한');
    });

    it('SyntaxError를 감지한다', () => {
      const result = detectErrorPattern('SyntaxError: Unexpected token');
      expect(result).not.toBeNull();
      expect(result!.description).toContain('구문');
    });

    it('out of memory를 감지한다', () => {
      const result = detectErrorPattern('FATAL ERROR: out of memory');
      expect(result).not.toBeNull();
      expect(result!.description).toContain('메모리');
    });

    it('정상 출력에서는 null 반환', () => {
      expect(detectErrorPattern('Build completed successfully.')).toBeNull();
    });

    it('빈 텍스트는 null 반환', () => {
      expect(detectErrorPattern('')).toBeNull();
    });

    it('no space left를 감지한다', () => {
      const result = detectErrorPattern('write ENOSPC: no space left on device');
      expect(result).not.toBeNull();
    });

    it('segmentation fault를 감지한다', () => {
      const result = detectErrorPattern('segmentation fault (core dumped)');
      expect(result).not.toBeNull();
    });
  });

  // ── trackModifiedFile ──

  describe('trackModifiedFile', () => {
    it('새 파일을 추적한다', () => {
      const state = { sessionId: 'test', files: {}, toolCallCount: 0 };
      const result = trackModifiedFile(state, '/path/to/file.ts', 'Edit');
      expect(result.count).toBe(1);
      expect(result.state.files['/path/to/file.ts']).toBeDefined();
      expect(result.state.files['/path/to/file.ts'].tool).toBe('Edit');
    });

    it('같은 파일의 카운트를 증가시킨다', () => {
      const state = { sessionId: 'test', files: {}, toolCallCount: 0 };
      trackModifiedFile(state, '/path/file.ts', 'Edit');
      const result = trackModifiedFile(state, '/path/file.ts', 'Write');
      expect(result.count).toBe(2);
      expect(result.state.files['/path/file.ts'].tool).toBe('Write');
    });

    it('여러 파일을 독립적으로 추적한다', () => {
      const state = { sessionId: 'test', files: {}, toolCallCount: 0 };
      trackModifiedFile(state, '/a.ts', 'Edit');
      trackModifiedFile(state, '/b.ts', 'Write');
      trackModifiedFile(state, '/a.ts', 'Edit');
      expect(state.files['/a.ts'].count).toBe(2);
      expect(state.files['/b.ts'].count).toBe(1);
    });

    it('lastModified를 업데이트한다', () => {
      const state = { sessionId: 'test', files: {}, toolCallCount: 0 };
      trackModifiedFile(state, '/file.ts', 'Edit');
      expect(state.files['/file.ts'].lastModified).toBeTruthy();
    });
  });
});
