import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-marketplace-ext',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => ''),
  execFile: vi.fn(),
}));

import {
  loadRegistry,
  saveRegistry,
  searchPlugins,
  listInstalledPlugins,
  removePlugin,
  handleMarketplace,
} from '../src/core/marketplace.js';

const PLUGINS_DIR = path.join(TEST_HOME, '.compound', 'plugins');
const REGISTRY_PATH = path.join(PLUGINS_DIR, 'registry.json');
const INSTALLED_PATH = path.join(PLUGINS_DIR, 'installed.json');

describe('marketplace - extended', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── loadRegistry ──

  describe('loadRegistry', () => {
    it('기본 내장 레지스트리를 반환한다', () => {
      const registry = loadRegistry();
      expect(registry.plugins.length).toBeGreaterThan(0);
      expect(registry.updatedAt).toBeTruthy();
    });

    it('로컬 레지스트리와 병합한다', () => {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify({
        plugins: [
          { name: 'custom-plugin', version: '1.0.0', description: 'Custom', author: 'me', type: 'skill', repository: 'https://example.com' },
        ],
        updatedAt: '2025-01-01',
      }));
      const registry = loadRegistry();
      expect(registry.plugins.find(p => p.name === 'custom-plugin')).toBeDefined();
      // 기본 플러그인도 포함
      expect(registry.plugins.length).toBeGreaterThan(1);
    });

    it('로컬 플러그인이 기본보다 우선한다', () => {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify({
        plugins: [
          { name: 'tenetx-skill-tdd', version: '2.0.0', description: 'Override', author: 'me', type: 'skill', repository: 'https://override.com' },
        ],
        updatedAt: '2025-01-01',
      }));
      const registry = loadRegistry();
      const tdd = registry.plugins.find(p => p.name === 'tenetx-skill-tdd');
      expect(tdd!.version).toBe('2.0.0');
    });

    it('잘못된 JSON이면 기본 레지스트리만 반환', () => {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      fs.writeFileSync(REGISTRY_PATH, 'bad json');
      const registry = loadRegistry();
      expect(registry.plugins.length).toBeGreaterThan(0);
    });
  });

  // ── saveRegistry ──

  describe('saveRegistry', () => {
    it('레지스트리를 파일에 저장한다', () => {
      const registry = { plugins: [], updatedAt: new Date().toISOString() };
      saveRegistry(registry);
      expect(fs.existsSync(REGISTRY_PATH)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
      expect(saved.plugins).toEqual([]);
    });

    it('디렉토리가 없어도 자동 생성', () => {
      expect(fs.existsSync(PLUGINS_DIR)).toBe(false);
      saveRegistry({ plugins: [], updatedAt: '' });
      expect(fs.existsSync(REGISTRY_PATH)).toBe(true);
    });
  });

  // ── searchPlugins ──

  describe('searchPlugins', () => {
    it('키워드로 플러그인을 검색한다', () => {
      const results = searchPlugins('tdd');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('tdd');
    });

    it('빈 쿼리는 전체 반환', () => {
      const results = searchPlugins('');
      expect(results.length).toBeGreaterThan(0);
    });

    it('없는 키워드는 빈 배열', () => {
      const results = searchPlugins('zzzznonexistent');
      expect(results.length).toBe(0);
    });

    it('커스텀 레지스트리에서 검색', () => {
      const registry = {
        plugins: [
          { name: 'my-plugin', version: '1.0.0', description: 'My test plugin', author: '', type: 'skill' as const, repository: '' },
        ],
        updatedAt: '',
      };
      const results = searchPlugins('my-plugin', registry);
      expect(results.length).toBe(1);
    });

    it('AND 검색: 복수 키워드', () => {
      const results = searchPlugins('skill tdd');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ── listInstalledPlugins ──

  describe('listInstalledPlugins', () => {
    it('installed.json이 없으면 빈 배열', () => {
      expect(listInstalledPlugins()).toEqual([]);
    });

    it('localPath가 존재하는 항목만 반환', () => {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      const existingDir = path.join(PLUGINS_DIR, 'existing');
      fs.mkdirSync(existingDir);
      fs.writeFileSync(INSTALLED_PATH, JSON.stringify([
        { name: 'existing', localPath: existingDir, version: '1.0.0', type: 'skill', description: '', author: '', repository: '', installedAt: '' },
        { name: 'missing', localPath: '/nonexistent/path', version: '1.0.0', type: 'skill', description: '', author: '', repository: '', installedAt: '' },
      ]));
      const list = listInstalledPlugins();
      expect(list.length).toBe(1);
      expect(list[0].name).toBe('existing');
    });
  });

  // ── removePlugin ──

  describe('removePlugin', () => {
    it('설치되지 않은 플러그인 제거 시 실패', () => {
      const result = removePlugin('nonexistent');
      expect(result.success).toBe(false);
      expect(result.message).toContain('is not installed');
    });

    it('설치된 플러그인을 제거한다', () => {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      const pluginDir = path.join(PLUGINS_DIR, 'test-plugin');
      fs.mkdirSync(pluginDir);
      fs.writeFileSync(INSTALLED_PATH, JSON.stringify([
        { name: 'test-plugin', localPath: pluginDir, version: '1.0.0', type: 'skill', description: '', author: '', repository: '', installedAt: '' },
      ]));
      const result = removePlugin('test-plugin');
      expect(result.success).toBe(true);
      expect(fs.existsSync(pluginDir)).toBe(false);
    });

    it('대소문자 무시하여 매칭', () => {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      const pluginDir = path.join(PLUGINS_DIR, 'MyPlugin');
      fs.mkdirSync(pluginDir);
      fs.writeFileSync(INSTALLED_PATH, JSON.stringify([
        { name: 'MyPlugin', localPath: pluginDir, version: '1.0.0', type: 'skill', description: '', author: '', repository: '', installedAt: '' },
      ]));
      const result = removePlugin('myplugin');
      expect(result.success).toBe(true);
    });
  });

  // ── handleMarketplace CLI ──

  describe('handleMarketplace', () => {
    it('search - 결과가 있을 때', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMarketplace(['search', 'tdd']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('search results'));
      logSpy.mockRestore();
    });

    it('search - 결과가 없을 때', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMarketplace(['search', 'zzzznonexistent']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No search results'));
      logSpy.mockRestore();
    });

    it('list - 설치된 플러그인이 없을 때', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMarketplace(['list']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No plugins installed'));
      logSpy.mockRestore();
    });

    it('list - 설치된 플러그인이 있을 때', async () => {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      const pluginDir = path.join(PLUGINS_DIR, 'listed-plugin');
      fs.mkdirSync(pluginDir);
      fs.writeFileSync(INSTALLED_PATH, JSON.stringify([
        { name: 'listed-plugin', localPath: pluginDir, version: '1.0.0', type: 'skill', description: '', author: '', repository: '', installedAt: '2025-01-01' },
      ]));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMarketplace(['list']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('listed-plugin'));
      logSpy.mockRestore();
    });

    it('remove - 성공', async () => {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      const pluginDir = path.join(PLUGINS_DIR, 'removable');
      fs.mkdirSync(pluginDir);
      fs.writeFileSync(INSTALLED_PATH, JSON.stringify([
        { name: 'removable', localPath: pluginDir, version: '1.0.0', type: 'skill', description: '', author: '', repository: '', installedAt: '' },
      ]));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMarketplace(['remove', 'removable']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('removed'));
      logSpy.mockRestore();
    });

    it('기본 help 출력', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMarketplace([]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Marketplace'));
      logSpy.mockRestore();
    });

    it('알 수 없는 서브커맨드도 help', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMarketplace(['unknown']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Marketplace'));
      logSpy.mockRestore();
    });
  });
});
