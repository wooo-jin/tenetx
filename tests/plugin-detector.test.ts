import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted: 모든 mock 함수를 호이스팅 스코프에서 정의
const mocks = vi.hoisted(() => ({
  existsSync: vi.fn<(p: string) => boolean>(),
  readFileSync: vi.fn<(p: string, enc?: string) => string>(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn<(p: string) => string[]>(),
  unlinkSync: vi.fn(),
  TEST_HOME: '/tmp/tenetx-test-plugin-detector',
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    mkdirSync: mocks.mkdirSync,
    readdirSync: mocks.readdirSync,
    unlinkSync: mocks.unlinkSync,
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mocks.TEST_HOME };
});

import {
  detectInstalledPlugins,
  getSkillConflicts,
  getHookConflicts,
  hasContextInjectingPlugins,
  invalidatePluginCache,
} from '../src/core/plugin-detector.js';

describe('plugin-detector', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 캐시 무효화: existsSync를 false로 설정하면 캐시 파일도 없음
    // 매 테스트마다 캐시를 클리어하기 위해 invalidatePluginCache 호출
    invalidatePluginCache();
  });

  // ── detectInstalledPlugins ──

  describe('detectInstalledPlugins', () => {
    it('플러그인 없으면 빈 배열 반환', () => {
      mocks.existsSync.mockReturnValue(false);
      const result = detectInstalledPlugins();
      expect(result).toEqual([]);
    });

    it('~/.omc 디렉토리로 oh-my-claudecode 감지', () => {
      mocks.existsSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('.omc')) return true;
        return false;
      });
      mocks.readdirSync.mockReturnValue([]);

      const result = detectInstalledPlugins();
      const omc = result.find(p => p.name === 'oh-my-claudecode');
      expect(omc).toBeDefined();
      expect(omc!.detectedBy).toBe('signature');
    });

    it('cwd의 .omc 디렉토리로 oh-my-claudecode 감지', () => {
      const testCwd = '/test/project';
      mocks.existsSync.mockImplementation((p: string) => {
        // 홈 디렉토리 시그니처는 없고, cwd 로컬 시그니처만 있음
        if (typeof p === 'string' && p === `${testCwd}/.omc`) return true;
        return false;
      });
      mocks.readdirSync.mockReturnValue([]);

      const result = detectInstalledPlugins(testCwd);
      const omc = result.find(p => p.name === 'oh-my-claudecode');
      expect(omc).toBeDefined();
      expect(omc!.detectedBy).toBe('signature');
    });

    it('oh-my-claudecode 감지 시 11개 overlapping skills 반환', () => {
      mocks.existsSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('.omc')) return true;
        return false;
      });
      mocks.readdirSync.mockReturnValue([]);

      const result = detectInstalledPlugins();
      const omc = result.find(p => p.name === 'oh-my-claudecode');
      expect(omc).toBeDefined();
      expect(omc!.overlappingSkills).toHaveLength(11);
      expect(omc!.overlappingSkills).toContain('autopilot');
      expect(omc!.overlappingSkills).toContain('tdd');
    });

    it('~/.codex/superpowers로 Superpowers 감지', () => {
      mocks.existsSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('.codex/superpowers')) return true;
        return false;
      });
      mocks.readdirSync.mockReturnValue([]);

      const result = detectInstalledPlugins();
      const sp = result.find(p => p.name === 'superpowers');
      expect(sp).toBeDefined();
      expect(sp!.detectedBy).toBe('signature');
      expect(sp!.overlappingSkills).toContain('tdd');
    });
  });

  // ── getSkillConflicts ──

  describe('getSkillConflicts', () => {
    it('OMC 감지 시 올바른 스킬 충돌 Map 반환', () => {
      mocks.existsSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('.omc')) return true;
        return false;
      });
      mocks.readdirSync.mockReturnValue([]);

      const conflicts = getSkillConflicts();
      expect(conflicts).toBeInstanceOf(Map);
      expect(conflicts.get('autopilot')).toBe('oh-my-claudecode');
      expect(conflicts.get('tdd')).toBe('oh-my-claudecode');
      expect(conflicts.size).toBe(11);
    });

    it('플러그인 없으면 빈 Map 반환', () => {
      mocks.existsSync.mockReturnValue(false);
      const conflicts = getSkillConflicts();
      expect(conflicts.size).toBe(0);
    });
  });

  // ── hasContextInjectingPlugins ──

  describe('hasContextInjectingPlugins', () => {
    it('플러그인 감지 시 true 반환', () => {
      mocks.existsSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('.omc')) return true;
        return false;
      });
      mocks.readdirSync.mockReturnValue([]);

      expect(hasContextInjectingPlugins()).toBe(true);
    });

    it('플러그인 없으면 false 반환', () => {
      mocks.existsSync.mockReturnValue(false);
      expect(hasContextInjectingPlugins()).toBe(false);
    });
  });

  // ── 캐시 ──

  describe('cache', () => {
    it('두 번째 호출은 캐시에서 반환 (재스캔하지 않음)', () => {
      // 첫 호출: 캐시 파일 없음 → 스캔 실행 → 캐시 저장
      // 캐시 파일 로드를 시뮬레이션: 첫 호출 후 캐시 파일이 존재하도록 설정
      let firstCallDone = false;
      const cachedData = JSON.stringify({
        plugins: [],
        timestamp: new Date().toISOString(),
      });

      mocks.existsSync.mockImplementation((p: string) => {
        // 캐시 파일 경로 (detected-plugins.json 포함)
        if (typeof p === 'string' && p.includes('detected-plugins.json')) {
          return firstCallDone; // 첫 호출 후에는 캐시 존재
        }
        return false;
      });
      mocks.readFileSync.mockReturnValue(cachedData);
      mocks.readdirSync.mockReturnValue([]);

      detectInstalledPlugins();
      firstCallDone = true;

      // 두 번째 호출 — readdirSync 추가 호출 없어야 함 (캐시에서 반환)
      const readdirCountAfterFirst = mocks.readdirSync.mock.calls.length;
      detectInstalledPlugins();
      // 캐시에서 반환했으므로 readdirSync 추가 호출 없음
      expect(mocks.readdirSync.mock.calls.length).toBe(readdirCountAfterFirst);
    });

    it('invalidatePluginCache 후 재스캔 실행', () => {
      mocks.existsSync.mockReturnValue(false);
      detectInstalledPlugins();

      invalidatePluginCache();

      // 캐시 무효화 후 다시 스캔해야 하므로 existsSync 재호출
      const callsBefore = mocks.existsSync.mock.calls.length;
      detectInstalledPlugins();
      expect(mocks.existsSync.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  // ── getHookConflicts ──

  describe('getHookConflicts', () => {
    it('OMC 감지 시 훅 충돌 반환', () => {
      mocks.existsSync.mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('.omc')) return true;
        return false;
      });
      mocks.readdirSync.mockReturnValue([]);

      const conflicts = getHookConflicts();
      expect(conflicts.get('intent-classifier')).toBe('oh-my-claudecode');
      expect(conflicts.get('keyword-detector')).toBe('oh-my-claudecode');
    });
  });
});
