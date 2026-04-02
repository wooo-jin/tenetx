import { describe, it, expect, vi, beforeEach } from 'vitest';

const hookConfigMocks = vi.hoisted(() => ({
  isHookEnabled: vi.fn<(name: string) => boolean>(),
}));

const pluginDetectorMocks = vi.hoisted(() => ({
  detectInstalledPlugins: vi.fn(),
  getHookConflicts: vi.fn(),
}));

vi.mock('../src/hooks/hook-config.js', () => ({
  isHookEnabled: hookConfigMocks.isHookEnabled,
}));

vi.mock('../src/core/plugin-detector.js', () => ({
  detectInstalledPlugins: pluginDetectorMocks.detectInstalledPlugins,
  getHookConflicts: pluginDetectorMocks.getHookConflicts,
}));

import { generateHooksJson } from '../src/hooks/hooks-generator.js';
import { HOOK_REGISTRY } from '../src/hooks/hook-registry.js';

describe('hooks-generator', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 기본: 모든 훅 활성, 충돌 없음
    hookConfigMocks.isHookEnabled.mockReturnValue(true);
    pluginDetectorMocks.detectInstalledPlugins.mockReturnValue([]);
    pluginDetectorMocks.getHookConflicts.mockReturnValue(new Map());
  });

  describe('generateHooksJson', () => {
    it('충돌 없으면 모든 훅이 포함된 유효한 구조 생성', () => {
      const result = generateHooksJson();

      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('hooks');
      expect(typeof result.description).toBe('string');

      // 모든 훅이 활성이므로 총 커맨드 수 = HOOK_REGISTRY.length
      let totalCommands = 0;
      for (const matchers of Object.values(result.hooks)) {
        for (const m of matchers) {
          totalCommands += m.hooks.length;
        }
      }
      expect(totalCommands).toBe(HOOK_REGISTRY.length);
    });

    it('OMC 감지 시 충돌하는 workflow 훅 비활성화', () => {
      pluginDetectorMocks.detectInstalledPlugins.mockReturnValue([
        { name: 'oh-my-claudecode', overlappingSkills: [], overlappingHooks: ['intent-classifier', 'keyword-detector'] },
      ]);
      pluginDetectorMocks.getHookConflicts.mockReturnValue(new Map([
        ['intent-classifier', 'oh-my-claudecode'],
        ['keyword-detector', 'oh-my-claudecode'],
      ]));

      const result = generateHooksJson();

      // 모든 커맨드에서 충돌 훅이 제거되었는지 확인
      const allCommands: string[] = [];
      for (const matchers of Object.values(result.hooks)) {
        for (const m of matchers) {
          for (const h of m.hooks) {
            allCommands.push(h.command);
          }
        }
      }
      expect(allCommands.some(c => c.includes('intent-classifier'))).toBe(false);
      expect(allCommands.some(c => c.includes('keyword-detector'))).toBe(false);
    });

    it('compound-core 훅은 플러그인 충돌과 무관하게 항상 포함', () => {
      pluginDetectorMocks.detectInstalledPlugins.mockReturnValue([
        { name: 'oh-my-claudecode', overlappingSkills: [], overlappingHooks: ['intent-classifier'] },
      ]);
      pluginDetectorMocks.getHookConflicts.mockReturnValue(new Map([
        ['intent-classifier', 'oh-my-claudecode'],
      ]));

      const result = generateHooksJson();

      const allCommands: string[] = [];
      for (const matchers of Object.values(result.hooks)) {
        for (const m of matchers) {
          for (const h of m.hooks) {
            allCommands.push(h.command);
          }
        }
      }
      // compound-core 훅들이 존재하는지 확인
      expect(allCommands.some(c => c.includes('notepad-injector'))).toBe(true);
      expect(allCommands.some(c => c.includes('post-tool-use'))).toBe(true);
    });

    it('compound-critical workflow 훅은 충돌이 있어도 유지', () => {
      // pre-tool-use는 compound-core 티어이고 compoundCritical: true
      // 이 테스트는 compoundCritical 플래그가 작동하는지 확인
      const criticalHooks = HOOK_REGISTRY.filter(h => h.compoundCritical);

      pluginDetectorMocks.detectInstalledPlugins.mockReturnValue([
        { name: 'some-plugin', overlappingSkills: [], overlappingHooks: criticalHooks.map(h => h.name) },
      ]);
      pluginDetectorMocks.getHookConflicts.mockReturnValue(
        new Map(criticalHooks.map(h => [h.name, 'some-plugin'])),
      );

      const result = generateHooksJson();

      const allCommands: string[] = [];
      for (const matchers of Object.values(result.hooks)) {
        for (const m of matchers) {
          for (const h of m.hooks) {
            allCommands.push(h.command);
          }
        }
      }

      // compound-critical 훅은 모두 포함되어야 함
      for (const hook of criticalHooks) {
        expect(
          allCommands.some(c => c.includes(hook.script)),
          `${hook.name} should be included (compoundCritical)`,
        ).toBe(true);
      }
    });

    it('description에 active/total 개수 포함', () => {
      const result = generateHooksJson();
      expect(result.description).toContain(`${HOOK_REGISTRY.length}/${HOOK_REGISTRY.length} active`);
    });

    it('description에 비활성 훅 수 반영', () => {
      // intent-classifier를 비활성화
      hookConfigMocks.isHookEnabled.mockImplementation((name: string) => name !== 'intent-classifier');

      const result = generateHooksJson();
      const expectedActive = HOOK_REGISTRY.length - 1;
      expect(result.description).toContain(`${expectedActive}/${HOOK_REGISTRY.length} active`);
    });

    it('이벤트별로 올바르게 그룹핑', () => {
      const result = generateHooksJson();

      // UserPromptSubmit 이벤트에 여러 훅이 그룹핑되어야 함
      expect(result.hooks['UserPromptSubmit']).toBeDefined();
      const userPromptHooks = result.hooks['UserPromptSubmit'][0].hooks;
      expect(userPromptHooks.length).toBeGreaterThan(1);

      // PreToolUse 이벤트 존재 확인
      expect(result.hooks['PreToolUse']).toBeDefined();

      // matcher는 '*' 또는 도구 필터 (best practice: 도구별 필터링)
      for (const matchers of Object.values(result.hooks)) {
        for (const m of matchers) {
          expect(typeof m.matcher).toBe('string');
          expect(m.matcher.length).toBeGreaterThan(0);
        }
      }
    });

    it('각 훅 커맨드에 pluginRoot가 포함', () => {
      const result = generateHooksJson({ pluginRoot: '/custom/root' });

      for (const matchers of Object.values(result.hooks)) {
        for (const m of matchers) {
          for (const h of m.hooks) {
            expect(h.command).toContain('/custom/root/');
            expect(h.type).toBe('command');
            expect(h.timeout).toBeGreaterThan(0);
          }
        }
      }
    });

    it('script에 인자가 있는 훅의 커맨드가 올바르게 분리됨 (subagent-tracker)', () => {
      const result = generateHooksJson({ pluginRoot: '/root' });

      const allCommands: string[] = [];
      for (const matchers of Object.values(result.hooks)) {
        for (const m of matchers) {
          for (const h of m.hooks) {
            allCommands.push(h.command);
          }
        }
      }

      // subagent-tracker.js start/stop은 인자가 따옴표 밖에 있어야 함
      const startCmd = allCommands.find(c => c.includes('subagent-tracker') && c.includes('start'));
      const stopCmd = allCommands.find(c => c.includes('subagent-tracker') && c.includes('stop'));

      expect(startCmd).toBeDefined();
      expect(stopCmd).toBeDefined();

      // 올바른 형식: node "/root/hooks/subagent-tracker.js" start
      // 잘못된 형식: node "/root/hooks/subagent-tracker.js start"
      expect(startCmd).toMatch(/subagent-tracker\.js"\s+start/);
      expect(stopCmd).toMatch(/subagent-tracker\.js"\s+stop/);
    });
  });
});
