import { describe, it, expect, vi, beforeEach } from 'vitest';

const pluginMocks = vi.hoisted(() => ({
  hasContextInjectingPlugins: vi.fn<(cwd?: string) => boolean>(),
}));

vi.mock('../src/core/plugin-detector.js', () => ({
  hasContextInjectingPlugins: pluginMocks.hasContextInjectingPlugins,
}));

import { calculateBudget, type ContextBudget } from '../src/hooks/shared/context-budget.js';
import { INJECTION_CAPS } from '../src/hooks/shared/injection-caps.js';

describe('context-budget', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('calculateBudget', () => {
    it('플러그인 없으면 factor 1.0 (전체 버짓) 반환', () => {
      pluginMocks.hasContextInjectingPlugins.mockReturnValue(false);
      const budget = calculateBudget();
      expect(budget.factor).toBe(1.0);
      expect(budget.otherPluginsDetected).toBe(false);
    });

    it('플러그인 감지 시 factor 0.5 (50% 버짓) 반환', () => {
      pluginMocks.hasContextInjectingPlugins.mockReturnValue(true);
      const budget = calculateBudget();
      expect(budget.factor).toBe(0.5);
      expect(budget.otherPluginsDetected).toBe(true);
    });

    it('플러그인 없으면 solutionMax는 1500', () => {
      pluginMocks.hasContextInjectingPlugins.mockReturnValue(false);
      const budget = calculateBudget();
      expect(budget.solutionMax).toBe(INJECTION_CAPS.solutionMax);
      expect(budget.solutionMax).toBe(1500);
    });

    it('플러그인 감지 시 solutionMax는 800', () => {
      pluginMocks.hasContextInjectingPlugins.mockReturnValue(true);
      const budget = calculateBudget();
      expect(budget.solutionMax).toBe(800);
    });

    it('플러그인 없으면 solutionsPerPrompt는 3', () => {
      pluginMocks.hasContextInjectingPlugins.mockReturnValue(false);
      const budget = calculateBudget();
      expect(budget.solutionsPerPrompt).toBe(3);
    });

    it('플러그인 감지 시 solutionsPerPrompt는 2', () => {
      pluginMocks.hasContextInjectingPlugins.mockReturnValue(true);
      const budget = calculateBudget();
      expect(budget.solutionsPerPrompt).toBe(2);
    });

    it('플러그인 없으면 solutionSessionMax는 INJECTION_CAPS 원본', () => {
      pluginMocks.hasContextInjectingPlugins.mockReturnValue(false);
      const budget = calculateBudget();
      expect(budget.solutionSessionMax).toBe(INJECTION_CAPS.solutionSessionMax);
    });

    it('플러그인 감지 시 solutionSessionMax는 50% 축소', () => {
      pluginMocks.hasContextInjectingPlugins.mockReturnValue(true);
      const budget = calculateBudget();
      expect(budget.solutionSessionMax).toBe(Math.floor(INJECTION_CAPS.solutionSessionMax * 0.5));
    });

    it('감지 에러 시 보수적 버짓 반환 (factor=0.7)', () => {
      pluginMocks.hasContextInjectingPlugins.mockImplementation(() => {
        throw new Error('detection failed');
      });
      const budget = calculateBudget();
      // 감지 실패 시 "충돌 없음"으로 간주하면 위험 → 보수적 0.7
      expect(budget.factor).toBe(0.7);
      expect(budget.otherPluginsDetected).toBe(false);
    });

    it('notepadMax와 skillContentMax도 factor에 따라 조절', () => {
      pluginMocks.hasContextInjectingPlugins.mockReturnValue(true);
      const budget = calculateBudget();
      expect(budget.notepadMax).toBe(Math.floor(INJECTION_CAPS.notepadMax * 0.5));
      expect(budget.skillContentMax).toBe(Math.floor(INJECTION_CAPS.skillContentMax * 0.5));
    });
  });
});
