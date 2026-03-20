import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-mcp-config-full',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  getDefaultMcpTemplates,
  generateMcpConfig,
  injectMcpServers,
  listInstalledMcpServers,
  handleMcp,
} from '../src/core/mcp-config.js';

const CLAUDE_DIR = path.join(TEST_HOME, '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

describe('mcp-config - extended', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── getDefaultMcpTemplates ──

  describe('getDefaultMcpTemplates', () => {
    it('기본 템플릿을 반환한다', () => {
      const templates = getDefaultMcpTemplates();
      expect(Object.keys(templates).length).toBeGreaterThan(0);
    });

    it('filesystem 템플릿이 포함된다', () => {
      const templates = getDefaultMcpTemplates();
      expect(templates.filesystem).toBeDefined();
      expect(templates.filesystem.command).toBe('npx');
    });

    it('fetch 템플릿이 포함된다', () => {
      const templates = getDefaultMcpTemplates();
      expect(templates.fetch).toBeDefined();
    });

    it('context7 템플릿이 포함된다', () => {
      const templates = getDefaultMcpTemplates();
      expect(templates.context7).toBeDefined();
    });

    it('playwright 템플릿이 포함된다', () => {
      const templates = getDefaultMcpTemplates();
      expect(templates.playwright).toBeDefined();
    });

    it('빌트인 MCP 서버도 포함된다', () => {
      const templates = getDefaultMcpTemplates();
      const keys = Object.keys(templates);
      expect(keys.length).toBeGreaterThan(4);
    });
  });

  // ── generateMcpConfig ──

  describe('generateMcpConfig', () => {
    it('알려진 서버 설정을 생성한다', () => {
      const config = generateMcpConfig(['filesystem', 'fetch']);
      expect(Object.keys(config).length).toBe(2);
      expect(config.filesystem).toBeDefined();
      expect(config.fetch).toBeDefined();
    });

    it('빈 목록이면 빈 설정 반환', () => {
      const config = generateMcpConfig([]);
      expect(Object.keys(config).length).toBe(0);
    });

    it('알 수 없는 서버는 무시한다', () => {
      const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = generateMcpConfig(['unknown-server', 'filesystem']);
      expect(config.filesystem).toBeDefined();
      expect(config['unknown-server']).toBeUndefined();
      logSpy.mockRestore();
    });
  });

  // ── injectMcpServers ──

  describe('injectMcpServers', () => {
    it('settings.json에 MCP 서버를 주입한다', () => {
      fs.mkdirSync(CLAUDE_DIR, { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ env: {} }));
      injectMcpServers({ filesystem: { command: 'npx', args: ['-y', 'test'] } });
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.mcpServers.filesystem).toBeDefined();
    });

    it('기존 서버와 병합한다', () => {
      fs.mkdirSync(CLAUDE_DIR, { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify({
        mcpServers: { existing: { command: 'node', args: [] } },
      }));
      injectMcpServers({ newServer: { command: 'npx', args: [] } });
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.mcpServers.existing).toBeDefined();
      expect(settings.mcpServers.newServer).toBeDefined();
    });
  });

  // ── listInstalledMcpServers ──

  describe('listInstalledMcpServers', () => {
    it('settings.json이 없으면 빈 객체 반환', () => {
      const servers = listInstalledMcpServers();
      expect(Object.keys(servers).length).toBe(0);
    });

    it('설치된 서버 목록을 반환한다', () => {
      fs.mkdirSync(CLAUDE_DIR, { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify({
        mcpServers: { test: { command: 'node', args: [] } },
      }));
      const servers = listInstalledMcpServers();
      expect(servers.test).toBeDefined();
    });
  });

  // ── handleMcp ──

  describe('handleMcp', () => {
    it('list - 설치된 서버가 없을 때', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMcp(['list']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('MCP Servers'));
      logSpy.mockRestore();
    });

    it('list - 서버가 있을 때', async () => {
      fs.mkdirSync(CLAUDE_DIR, { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify({
        mcpServers: { test: { command: 'node', args: ['test.js'] } },
      }));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMcp(['list']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('test'));
      logSpy.mockRestore();
    });

    it('templates', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMcp(['templates']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('MCP Templates'));
      logSpy.mockRestore();
    });

    it('add - 서버를 추가한다', async () => {
      fs.mkdirSync(CLAUDE_DIR, { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify({}));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMcp(['add', 'filesystem']);
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.mcpServers.filesystem).toBeDefined();
      logSpy.mockRestore();
    });

    it('인자 없으면 list 실행', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleMcp([]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('MCP Servers'));
      logSpy.mockRestore();
    });
  });
});
