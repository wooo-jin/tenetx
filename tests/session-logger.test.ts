import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-session-logger',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import { startSessionLog } from '../src/core/session-logger.js';
import type { HarnessContext } from '../src/core/types.js';

const SESSIONS_DIR = path.join(TEST_HOME, '.compound', 'sessions');

function makeContext(overrides?: Partial<HarnessContext>): HarnessContext {
  return {
    cwd: '/tmp/test-project',
    philosophy: {
      name: 'test-philosophy',
      version: '1.0.0',
      scope: 'Me(5)',
      principles: [],
    },
    philosophySource: 'default' as const,
    scope: {
      me: { philosophyPath: '', solutionCount: 0, ruleCount: 0 },
      project: { path: '/tmp/test-project', solutionCount: 0 },
      summary: 'Me(5)',
    },
    inTmux: false,
    ...overrides,
  } as HarnessContext;
}

describe('session-logger', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  describe('startSessionLog', () => {
    it('세션 로그 파일을 생성한다', () => {
      const ctx = makeContext();
      startSessionLog(ctx);

      expect(fs.existsSync(SESSIONS_DIR)).toBe(true);
      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      expect(files.length).toBeGreaterThanOrEqual(1);
    });

    it('세션 로그에 필수 필드가 포함된다', () => {
      const ctx = makeContext();
      startSessionLog(ctx);

      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      const logContent = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, files[files.length - 1]), 'utf-8'));

      expect(logContent.sessionId).toBeTruthy();
      expect(logContent.startTime).toBeTruthy();
      expect(logContent.cwd).toBe('/tmp/test-project');
      expect(logContent.philosophy).toBe('test-philosophy');
      expect(logContent.scope).toBe('Me(5)');
    });

    it('파일명이 날짜_UUID 형식이다', () => {
      const ctx = makeContext();
      startSessionLog(ctx);

      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      const latestFile = files[files.length - 1];
      // Format: YYYY-MM-DD_UUID.json
      expect(latestFile).toMatch(/^\d{4}-\d{2}-\d{2}_[\w-]+\.json$/);
    });

    it('90일 이상 된 세션 로그를 정리한다', () => {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });

      // 100일 전 파일 생성
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const oldDateStr = oldDate.toISOString().slice(0, 10);
      const oldFile = `${oldDateStr}_old-session-id.json`;
      fs.writeFileSync(path.join(SESSIONS_DIR, oldFile), JSON.stringify({ sessionId: 'old' }));

      // 최근 파일 생성
      const recentDate = new Date();
      const recentDateStr = recentDate.toISOString().slice(0, 10);
      const recentFile = `${recentDateStr}_recent-session-id.json`;
      fs.writeFileSync(path.join(SESSIONS_DIR, recentFile), JSON.stringify({ sessionId: 'recent' }));

      const ctx = makeContext();
      startSessionLog(ctx);

      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      // 오래된 파일은 삭제됨
      expect(files.find(f => f.includes('old-session-id'))).toBeUndefined();
      // 최근 파일은 유지됨
      expect(files.find(f => f.includes('recent-session-id'))).toBeDefined();
    });

    it('COMPOUND_MODE 환경변수를 모드로 사용한다', () => {
      const origMode = process.env.COMPOUND_MODE;
      process.env.COMPOUND_MODE = 'ralph';

      const ctx = makeContext();
      startSessionLog(ctx);

      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      const logContent = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, files[files.length - 1]), 'utf-8'));
      expect(logContent.mode).toBe('ralph');

      if (origMode === undefined) {
        delete process.env.COMPOUND_MODE;
      } else {
        process.env.COMPOUND_MODE = origMode;
      }
    });

    it('여러 번 호출해도 에러 없이 동작한다', () => {
      const ctx = makeContext();
      startSessionLog(ctx);
      startSessionLog(ctx);

      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      expect(files.length).toBeGreaterThanOrEqual(2);
    });
  });
});
