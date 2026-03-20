import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  detectCommands,
  runVerifyLoop,
  formatVerifyResult,
} from '../src/engine/loops/verify-loop.js';
import type { LoopResult } from '../src/engine/loops/types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-loop-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('verify-loop', () => {
  // ── detectCommands ──

  describe('detectCommands', () => {
    it('빈 디렉토리에서 빈 객체 반환', () => {
      const cmds = detectCommands(tmpDir);
      expect(cmds.build).toBeUndefined();
      expect(cmds.test).toBeUndefined();
    });

    it('package.json에 build/test 스크립트가 있으면 감지', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        scripts: { build: 'tsc', test: 'vitest' },
      }));
      const cmds = detectCommands(tmpDir);
      expect(cmds.build).toBe('npm run build');
      expect(cmds.test).toBe('npm test');
    });

    it('tsconfig.json이 있으면 typeCheck를 npx tsc --noEmit으로 감지', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        scripts: {},
      }));
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
      const cmds = detectCommands(tmpDir);
      expect(cmds.typeCheck).toBe('npx tsc --noEmit');
    });

    it('typecheck 스크립트가 있으면 그것을 사용', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        scripts: { typecheck: 'tsc --noEmit' },
      }));
      const cmds = detectCommands(tmpDir);
      expect(cmds.typeCheck).toBe('npm run typecheck');
    });

    it('pyproject.toml이 있으면 Python 프로젝트로 감지', () => {
      fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[tool.poetry]');
      const cmds = detectCommands(tmpDir);
      expect(cmds.test).toBe('pytest');
      expect(cmds.typeCheck).toBe('mypy .');
    });

    it('go.mod가 있으면 Go 프로젝트로 감지', () => {
      fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/app');
      const cmds = detectCommands(tmpDir);
      expect(cmds.build).toBe('go build ./...');
      expect(cmds.test).toBe('go test ./...');
    });

    it('잘못된 package.json이면 빈 객체 반환', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), 'bad json');
      const cmds = detectCommands(tmpDir);
      expect(cmds.build).toBeUndefined();
    });
  });

  // ── formatVerifyResult ──

  describe('formatVerifyResult', () => {
    it('passed 결과를 포맷한다', () => {
      const result: LoopResult = {
        loopName: 'verify',
        status: 'passed',
        steps: [
          { name: 'type-check', status: 'passed', message: 'Type check passed', startedAt: '' },
          { name: 'build', status: 'passed', message: 'Build succeeded', startedAt: '' },
        ],
        summary: '2/2 steps passed',
      };
      const formatted = formatVerifyResult(result);
      expect(formatted).toContain('✅');
      expect(formatted).toContain('2/2 steps passed');
      expect(formatted).toContain('✓ type-check');
    });

    it('failed 결과를 포맷한다', () => {
      const result: LoopResult = {
        loopName: 'verify',
        status: 'failed',
        steps: [
          { name: 'build', status: 'failed', message: 'Build failed: Error', startedAt: '' },
        ],
        summary: '0/1 steps passed, 1 failed',
        suggestions: ['Fix build errors.'],
      };
      const formatted = formatVerifyResult(result);
      expect(formatted).toContain('❌');
      expect(formatted).toContain('✗ build');
      expect(formatted).toContain('Fix build errors.');
    });

    it('partial 결과를 포맷한다', () => {
      const result: LoopResult = {
        loopName: 'verify',
        status: 'partial',
        steps: [
          { name: 'type-check', status: 'passed', message: 'passed', startedAt: '' },
          { name: 'test', status: 'failed', message: 'failed', startedAt: '' },
        ],
        summary: '1/2 steps passed, 1 failed',
      };
      const formatted = formatVerifyResult(result);
      expect(formatted).toContain('⚠️');
    });

    it('suggestions가 없으면 권장 조치 생략', () => {
      const result: LoopResult = {
        loopName: 'verify',
        status: 'passed',
        steps: [],
        summary: '0/0',
      };
      const formatted = formatVerifyResult(result);
      expect(formatted).not.toContain('Recommended actions');
    });
  });

  // ── runVerifyLoop ──

  describe('runVerifyLoop', () => {
    it('빈 디렉토리에서 명령이 없으면 passed 반환', () => {
      const result = runVerifyLoop({ cwd: tmpDir });
      expect(result.loopName).toBe('verify');
      expect(result.status).toBe('passed');
    });

    it('package.json이 있는 프로젝트에서 실행', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        scripts: {},
      }));
      const result = runVerifyLoop({ cwd: tmpDir, checkTypes: false, checkConstraints: false });
      expect(result.loopName).toBe('verify');
      expect(result.status).toBe('passed');
    });

    it('타입 체크를 비활성화할 수 있다', () => {
      const result = runVerifyLoop({ cwd: tmpDir, checkTypes: false });
      expect(result.steps.find(s => s.name === 'type-check')).toBeUndefined();
    });

    it('제약 검사를 비활성화할 수 있다', () => {
      const result = runVerifyLoop({ cwd: tmpDir, checkConstraints: false });
      expect(result.steps.find(s => s.name === 'constraints')).toBeUndefined();
    });

    it('커스텀 buildCommand로 실행', () => {
      const result = runVerifyLoop({
        cwd: tmpDir,
        buildCommand: 'echo "build ok"',
        checkTypes: false,
        checkConstraints: false,
      });
      const buildStep = result.steps.find(s => s.name === 'build');
      expect(buildStep).toBeDefined();
      expect(buildStep!.status).toBe('passed');
    });

    it('실패하는 빌드 커맨드', () => {
      const result = runVerifyLoop({
        cwd: tmpDir,
        buildCommand: 'false',
        checkTypes: false,
        checkConstraints: false,
      });
      const buildStep = result.steps.find(s => s.name === 'build');
      expect(buildStep).toBeDefined();
      expect(buildStep!.status).toBe('failed');
      expect(result.status).toBe('failed');
      expect(result.suggestions).toBeDefined();
    });

    it('커스텀 testCommand로 실행', () => {
      const result = runVerifyLoop({
        cwd: tmpDir,
        testCommand: 'echo "test ok"',
        checkTypes: false,
        checkConstraints: false,
      });
      const testStep = result.steps.find(s => s.name === 'test');
      expect(testStep).toBeDefined();
      expect(testStep!.status).toBe('passed');
    });

    it('summary 포맷이 올바르다', () => {
      const result = runVerifyLoop({
        cwd: tmpDir,
        buildCommand: 'echo ok',
        testCommand: 'echo ok',
        checkTypes: false,
        checkConstraints: false,
      });
      expect(result.summary).toContain('2/2 steps passed');
    });
  });
});
