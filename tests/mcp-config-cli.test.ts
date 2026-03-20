import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-mcp-cli',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import { handleMcp } from '../src/core/mcp-config.js';

const CLAUDE_DIR = path.join(TEST_HOME, '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

describe('handleMcp - CLI extended', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('list - env가 있는 서버 표시', async () => {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({
      mcpServers: { test: { command: 'node', args: ['s.js'], env: { KEY: 'val' } } },
    }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleMcp(['list']);
    const calls = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(calls).toContain('test');
    expect(calls).toContain('KEY');
    logSpy.mockRestore();
  });

  it('add - 서버 이름 없이 호출하면 에러', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(handleMcp(['add'])).rejects.toThrow('process.exit');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('server name'));
    errSpy.mockRestore();
  });

  it('add - 유효하지 않은 서버만 있으면 에러', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(handleMcp(['add', 'nonexistent-server'])).rejects.toThrow('process.exit');
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('add - 여러 서버를 한 번에 추가', async () => {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({}));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleMcp(['add', 'filesystem', 'fetch']);
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    expect(settings.mcpServers.filesystem).toBeDefined();
    expect(settings.mcpServers.fetch).toBeDefined();
    logSpy.mockRestore();
  });

  it('remove - 서버 이름 없이 호출하면 에러', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(handleMcp(['remove'])).rejects.toThrow('process.exit');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('server name'));
    errSpy.mockRestore();
  });

  it('remove - 설치되지 않은 서버', async () => {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ mcpServers: {} }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleMcp(['remove', 'nonexistent']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not installed'));
    logSpy.mockRestore();
  });

  it('remove - 서버를 제거한다', async () => {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({
      mcpServers: {
        filesystem: { command: 'npx', args: [] },
        fetch: { command: 'npx', args: [] },
      },
    }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleMcp(['remove', 'filesystem']);
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    expect(settings.mcpServers.filesystem).toBeUndefined();
    expect(settings.mcpServers.fetch).toBeDefined();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Removed'));
    logSpy.mockRestore();
  });

  it('알 수 없는 서브커맨드', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(handleMcp(['unknown'])).rejects.toThrow('process.exit');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown'));
    errSpy.mockRestore();
  });

  it('templates - 템플릿 목록 표시', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleMcp(['templates']);
    const calls = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(calls).toContain('filesystem');
    expect(calls).toContain('fetch');
    logSpy.mockRestore();
  });
});
