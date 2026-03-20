import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  loadPackWorkflows,
  registerPackWorkflows,
  parseMode,
  getEffectiveModeConfig,
  listModes,
} from '../src/engine/modes.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modes-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('modes - extended', () => {
  // ── loadPackWorkflows ──

  describe('loadPackWorkflows', () => {
    it('workflows 디렉토리가 없으면 빈 배열', () => {
      const result = loadPackWorkflows(tmpDir);
      expect(result).toEqual([]);
    });

    it('유효한 워크플로우 파일을 로드한다', () => {
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'custom-mode.json'), JSON.stringify({
        name: 'custom-mode',
        description: '커스텀 모드 테스트',
        claudeArgs: ['--flag'],
        principle: 'test-principle',
        persistent: true,
      }));
      const workflows = loadPackWorkflows(tmpDir);
      expect(workflows.length).toBe(1);
      expect(workflows[0].name).toBe('custom-mode');
      expect(workflows[0].description).toBe('커스텀 모드 테스트');
      expect(workflows[0].claudeArgs).toEqual(['--flag']);
      expect(workflows[0].persistent).toBe(true);
      expect(workflows[0].envOverrides.COMPOUND_MODE).toBe('custom-mode');
    });

    it('name이 없는 워크플로우는 무시한다', () => {
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'bad.json'), JSON.stringify({
        description: 'no name',
      }));
      const workflows = loadPackWorkflows(tmpDir);
      expect(workflows).toEqual([]);
    });

    it('description이 없는 워크플로우는 무시한다', () => {
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'bad.json'), JSON.stringify({
        name: 'no-desc',
      }));
      const workflows = loadPackWorkflows(tmpDir);
      expect(workflows).toEqual([]);
    });

    it('잘못된 JSON 파일은 건너뛴다', () => {
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'bad.json'), 'not json');
      fs.writeFileSync(path.join(workflowsDir, 'good.json'), JSON.stringify({
        name: 'valid',
        description: 'Valid workflow',
      }));
      const workflows = loadPackWorkflows(tmpDir);
      expect(workflows.length).toBe(1);
      expect(workflows[0].name).toBe('valid');
    });

    it('기본값이 올바르게 적용된다', () => {
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'minimal.json'), JSON.stringify({
        name: 'minimal',
        description: 'Minimal workflow',
      }));
      const workflows = loadPackWorkflows(tmpDir);
      expect(workflows[0].claudeArgs).toEqual([]);
      expect(workflows[0].persistent).toBe(false);
      expect(workflows[0].principle).toBe('-');
    });

    it('여러 워크플로우 파일을 로드한다', () => {
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'a.json'), JSON.stringify({
        name: 'wf-a', description: 'Workflow A',
      }));
      fs.writeFileSync(path.join(workflowsDir, 'b.json'), JSON.stringify({
        name: 'wf-b', description: 'Workflow B',
      }));
      const workflows = loadPackWorkflows(tmpDir);
      expect(workflows.length).toBe(2);
    });

    it('.json이 아닌 파일은 무시한다', () => {
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'readme.md'), '# not a workflow');
      const workflows = loadPackWorkflows(tmpDir);
      expect(workflows).toEqual([]);
    });

    it('envOverrides가 병합된다', () => {
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'env.json'), JSON.stringify({
        name: 'env-mode',
        description: 'Env test',
        envOverrides: { CUSTOM_VAR: 'custom' },
      }));
      const workflows = loadPackWorkflows(tmpDir);
      expect(workflows[0].envOverrides.COMPOUND_MODE).toBe('env-mode');
      expect(workflows[0].envOverrides.CUSTOM_VAR).toBe('custom');
    });

    it('composedOf가 전달된다', () => {
      const workflowsDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(workflowsDir, { recursive: true });
      fs.writeFileSync(path.join(workflowsDir, 'composed.json'), JSON.stringify({
        name: 'composed-mode',
        description: 'Composed test',
        composedOf: ['ralph', 'ultrawork'],
      }));
      const workflows = loadPackWorkflows(tmpDir);
      expect(workflows[0].composedOf).toEqual(['ralph', 'ultrawork']);
    });
  });

  // ── registerPackWorkflows ──

  describe('registerPackWorkflows', () => {
    it('내장 모드와 충돌하면 스킵한다', () => {
      const workflows = [{
        name: 'normal' as any,
        description: 'Override normal',
        claudeArgs: [],
        envOverrides: {},
        principle: '-',
        persistent: false,
      }];
      const skipped = registerPackWorkflows(workflows);
      expect(skipped).toContain('normal');
    });

    it('내장 모드가 아닌 워크플로우는 등록된다', () => {
      const uniqueName = `test-wf-${Date.now()}`;
      const workflows = [{
        name: uniqueName as any,
        description: 'Test workflow',
        claudeArgs: [],
        envOverrides: { COMPOUND_MODE: uniqueName },
        principle: '-',
        persistent: false,
      }];
      const skipped = registerPackWorkflows(workflows);
      expect(skipped).toEqual([]);
      // listModes에 포함되는지 확인
      const modes = listModes();
      expect(modes.find(m => m.name === uniqueName)).toBeDefined();
    });

    it('이미 등록된 팩 이름과 충돌하면 스킵한다', () => {
      const dupName = `dup-wf-${Date.now()}`;
      const wf = {
        name: dupName as any,
        description: 'First',
        claudeArgs: [],
        envOverrides: { COMPOUND_MODE: dupName },
        principle: '-',
        persistent: false,
      };
      // 첫 번째 등록
      registerPackWorkflows([wf]);
      // 두 번째 등록 — 충돌
      const skipped = registerPackWorkflows([{ ...wf, description: 'Second' }]);
      expect(skipped).toContain(dupName);
    });
  });

  // ── parseMode - ecomode ──

  describe('parseMode - ecomode', () => {
    it('--eco 플래그는 ecomode', () => {
      expect(parseMode(['--eco', 'task']).mode).toBe('ecomode');
    });

    it('-e 축약 플래그는 ecomode', () => {
      expect(parseMode(['-e', 'task']).mode).toBe('ecomode');
    });

    it('--normal 플래그는 normal', () => {
      expect(parseMode(['--normal', 'task']).mode).toBe('normal');
    });
  });

  // ── getEffectiveModeConfig - unknown mode ──

  describe('getEffectiveModeConfig - edge cases', () => {
    it('unknown mode에서 에러를 던진다', () => {
      expect(() => getEffectiveModeConfig('nonexistent' as any)).toThrow('Unknown mode');
    });

    it('ecomode의 claudeArgs에 모델 ID가 포함된다', () => {
      const config = getEffectiveModeConfig('ecomode');
      expect(config.claudeArgs).toContain('--model');
    });

    it('normal의 claudeArgs는 비어있다', () => {
      const config = getEffectiveModeConfig('normal');
      expect(config.claudeArgs).toEqual([]);
    });
  });
});
