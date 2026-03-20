import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-plugin-installer',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import { isPluginInstalled, uninstallPlugin } from '../src/core/plugin-installer.js';

const CLAUDE_DIR = path.join(TEST_HOME, '.claude');
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins');
const PLUGIN_DIR = path.join(PLUGINS_DIR, 'tenetx');

describe('plugin-installer', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── isPluginInstalled ──

  describe('isPluginInstalled', () => {
    it('플러그인이 설치되지 않았으면 false', () => {
      expect(isPluginInstalled()).toBe(false);
    });

    it('plugin.json이 있으면 true', () => {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      fs.writeFileSync(path.join(PLUGIN_DIR, 'plugin.json'), '{}');
      expect(isPluginInstalled()).toBe(true);
    });

    it('플러그인 디렉토리만 있고 plugin.json 없으면 false', () => {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      expect(isPluginInstalled()).toBe(false);
    });
  });

  // ── uninstallPlugin ──

  describe('uninstallPlugin', () => {
    it('플러그인 디렉토리가 없어도 true 반환', () => {
      expect(uninstallPlugin()).toBe(true);
    });

    it('플러그인 디렉토리를 삭제한다', () => {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      fs.writeFileSync(path.join(PLUGIN_DIR, 'plugin.json'), '{}');
      expect(uninstallPlugin()).toBe(true);
      expect(fs.existsSync(PLUGIN_DIR)).toBe(false);
    });

    it('settings.json에서 플러그인 참조를 제거한다', () => {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      fs.writeFileSync(path.join(PLUGIN_DIR, 'plugin.json'), '{}');
      const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({
        plugins: [PLUGIN_DIR, '/other/plugin'],
        env: { FOO: 'bar' },
      }));
      expect(uninstallPlugin()).toBe(true);
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(settings.plugins).toEqual(['/other/plugin']);
      expect(settings.env.FOO).toBe('bar');
    });

    it('settings.json에 plugins 배열이 없어도 정상 동작', () => {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      fs.writeFileSync(path.join(PLUGIN_DIR, 'plugin.json'), '{}');
      const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({ env: {} }));
      expect(uninstallPlugin()).toBe(true);
    });
  });
});
