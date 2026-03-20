import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-marketplace-full',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  getPluginsDir,
  getRegistryPath,
} from '../src/core/marketplace.js';
import type { PluginManifest, InstalledPlugin } from '../src/core/marketplace.js';

describe('marketplace', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── 경로 헬퍼 ──

  describe('getPluginsDir', () => {
    it('~/.compound/plugins/ 경로를 반환한다', () => {
      const dir = getPluginsDir();
      expect(dir).toContain('.compound');
      expect(dir).toContain('plugins');
    });
  });

  describe('getRegistryPath', () => {
    it('registry.json 경로를 반환한다', () => {
      const p = getRegistryPath();
      expect(p).toContain('registry.json');
    });
  });

  // ── 타입 구조 검증 ──

  describe('PluginManifest structure', () => {
    it('필수 필드가 정의된다', () => {
      const manifest: PluginManifest = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'A test plugin',
        author: 'tester',
        type: 'skill',
        repository: 'https://github.com/test/plugin',
      };
      expect(manifest.name).toBe('test-plugin');
      expect(manifest.type).toBe('skill');
    });

    it('모든 type 값이 유효하다', () => {
      const types: PluginManifest['type'][] = ['skill', 'agent', 'hook', 'pack'];
      for (const type of types) {
        const manifest: PluginManifest = {
          name: 'test', version: '1.0.0', description: '', author: '', type, repository: '',
        };
        expect(manifest.type).toBe(type);
      }
    });
  });

  describe('InstalledPlugin structure', () => {
    it('설치 메타 정보를 포함한다', () => {
      const installed: InstalledPlugin = {
        name: 'installed',
        version: '1.0.0',
        description: 'Installed plugin',
        author: 'tester',
        type: 'agent',
        repository: 'https://github.com/test/installed',
        installedAt: new Date().toISOString(),
        localPath: '/path/to/plugin',
      };
      expect(installed.installedAt).toBeTruthy();
      expect(installed.localPath).toBeTruthy();
    });
  });
});
