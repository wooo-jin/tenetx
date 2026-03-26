import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// vi.hoisted로 TEST_HOME 정의
const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-mcp-home',
}));

// node:os mock — homedir()을 임시 디렉토리로 교체
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

import {
  getDefaultMcpTemplates,
  generateMcpConfig,
  injectMcpServers,
  listInstalledMcpServers,
  type McpServerConfig,
} from '../src/core/mcp-config.js';

const TEST_CLAUDE_DIR = path.join(TEST_HOME, '.claude');
const TEST_SETTINGS_PATH = path.join(TEST_CLAUDE_DIR, 'settings.json');

// ────────────────────────────────────────────────────────────────────────────
// getDefaultMcpTemplates()
// ────────────────────────────────────────────────────────────────────────────
describe('getDefaultMcpTemplates()', () => {
  it('기본 템플릿 + 빌트인 서버를 반환한다 (4 + 9 = 13개)', () => {
    const templates = getDefaultMcpTemplates();
    expect(Object.keys(templates)).toHaveLength(13);
  });

  it('filesystem 템플릿이 포함된다', () => {
    const templates = getDefaultMcpTemplates();
    expect(templates.filesystem).toBeDefined();
    expect(templates.filesystem.command).toBe('npx');
    expect(templates.filesystem.args).toContain('@anthropic-ai/mcp-server-filesystem');
  });

  it('fetch 템플릿이 포함된다', () => {
    const templates = getDefaultMcpTemplates();
    expect(templates.fetch).toBeDefined();
    expect(templates.fetch.command).toBe('npx');
    expect(templates.fetch.args).toContain('@anthropic-ai/mcp-server-fetch');
  });

  it('context7 템플릿이 포함된다', () => {
    const templates = getDefaultMcpTemplates();
    expect(templates.context7).toBeDefined();
    expect(templates.context7.command).toBe('npx');
    expect(templates.context7.args).toContain('@upstash/context7-mcp');
  });

  it('playwright 템플릿이 포함된다', () => {
    const templates = getDefaultMcpTemplates();
    expect(templates.playwright).toBeDefined();
    expect(templates.playwright.command).toBe('npx');
    expect(templates.playwright.args).toContain('@anthropic-ai/mcp-server-playwright');
  });

  it('반환값은 원본의 복사본이다 (독립적)', () => {
    const a = getDefaultMcpTemplates();
    const b = getDefaultMcpTemplates();
    a.filesystem.command = 'changed';
    expect(b.filesystem.command).toBe('npx');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// generateMcpConfig()
// ────────────────────────────────────────────────────────────────────────────
describe('generateMcpConfig()', () => {
  it('단일 서버 이름으로 설정 객체를 생성한다', () => {
    const config = generateMcpConfig(['filesystem']);
    expect(config.filesystem).toBeDefined();
    expect(config.filesystem.command).toBe('npx');
  });

  it('여러 서버 이름으로 설정 객체를 생성한다', () => {
    const config = generateMcpConfig(['filesystem', 'fetch']);
    expect(Object.keys(config)).toHaveLength(2);
    expect(config.filesystem).toBeDefined();
    expect(config.fetch).toBeDefined();
  });

  it('알 수 없는 서버 이름은 결과에 포함되지 않는다', () => {
    const config = generateMcpConfig(['unknown-server']);
    expect(Object.keys(config)).toHaveLength(0);
  });

  it('유효한 서버와 알 수 없는 서버가 섞이면 유효한 것만 반환한다', () => {
    const config = generateMcpConfig(['filesystem', 'nonexistent']);
    expect(Object.keys(config)).toHaveLength(1);
    expect(config.filesystem).toBeDefined();
  });

  it('빈 배열을 전달하면 빈 객체를 반환한다', () => {
    const config = generateMcpConfig([]);
    expect(Object.keys(config)).toHaveLength(0);
  });

  it('생성된 설정의 args가 템플릿의 복사본이다', () => {
    const config = generateMcpConfig(['filesystem']);
    config.filesystem.args.push('--extra');
    const again = generateMcpConfig(['filesystem']);
    expect(again.filesystem.args).not.toContain('--extra');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// injectMcpServers()
// ────────────────────────────────────────────────────────────────────────────
describe('injectMcpServers()', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('settings.json이 없어도 mcpServers가 생성된다', () => {
    const servers: Record<string, McpServerConfig> = {
      filesystem: { command: 'npx', args: ['-y', '@anthropic/mcp-filesystem'] },
    };
    injectMcpServers(servers);

    expect(fs.existsSync(TEST_SETTINGS_PATH)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.mcpServers.filesystem).toBeDefined();
  });

  it('기존 settings.json의 다른 키들이 보존된다', () => {
    fs.writeFileSync(
      TEST_SETTINGS_PATH,
      JSON.stringify({ env: { MY_VAR: 'keep' }, customKey: true }),
    );

    injectMcpServers({
      fetch: { command: 'npx', args: ['-y', '@anthropic/mcp-fetch'] },
    });

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.env.MY_VAR).toBe('keep');
    expect(settings.customKey).toBe(true);
    expect(settings.mcpServers.fetch).toBeDefined();
  });

  it('기존 mcpServers와 병합된다 (기존 서버 보존)', () => {
    fs.writeFileSync(
      TEST_SETTINGS_PATH,
      JSON.stringify({
        mcpServers: {
          existing: { command: 'node', args: ['server.js'] },
        },
      }),
    );

    injectMcpServers({
      fetch: { command: 'npx', args: ['-y', '@anthropic/mcp-fetch'] },
    });

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.mcpServers.existing).toBeDefined();
    expect(settings.mcpServers.fetch).toBeDefined();
  });

  it('같은 이름의 서버는 덮어쓴다', () => {
    fs.writeFileSync(
      TEST_SETTINGS_PATH,
      JSON.stringify({
        mcpServers: {
          filesystem: { command: 'old-cmd', args: [] },
        },
      }),
    );

    injectMcpServers({
      filesystem: { command: 'npx', args: ['-y', '@anthropic/mcp-filesystem'] },
    });

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.mcpServers.filesystem.command).toBe('npx');
  });

  it('env 필드가 있는 서버 설정도 올바르게 저장된다', () => {
    injectMcpServers({
      context7: {
        command: 'npx',
        args: ['-y', '@anthropic/mcp-context7'],
        env: { API_KEY: 'test-key' },
      },
    });

    const settings = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf-8'));
    expect(settings.mcpServers.context7.env.API_KEY).toBe('test-key');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// listInstalledMcpServers()
// ────────────────────────────────────────────────────────────────────────────
describe('listInstalledMcpServers()', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('settings.json이 없으면 빈 객체를 반환한다', () => {
    const result = listInstalledMcpServers();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('mcpServers가 없는 settings.json이면 빈 객체를 반환한다', () => {
    fs.writeFileSync(TEST_SETTINGS_PATH, JSON.stringify({ env: {} }));
    const result = listInstalledMcpServers();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('설치된 서버 목록을 반환한다', () => {
    fs.writeFileSync(
      TEST_SETTINGS_PATH,
      JSON.stringify({
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@anthropic/mcp-filesystem'] },
          fetch: { command: 'npx', args: ['-y', '@anthropic/mcp-fetch'] },
        },
      }),
    );

    const result = listInstalledMcpServers();
    expect(Object.keys(result)).toHaveLength(2);
    expect(result.filesystem).toBeDefined();
    expect(result.fetch).toBeDefined();
  });

  it('injectMcpServers 후 listInstalledMcpServers로 조회 가능하다', () => {
    injectMcpServers({
      playwright: { command: 'npx', args: ['-y', '@anthropic/mcp-playwright'] },
    });

    const result = listInstalledMcpServers();
    expect(result.playwright).toBeDefined();
    expect(result.playwright.command).toBe('npx');
  });

  it('깨진 settings.json은 빈 객체를 반환한다', () => {
    fs.writeFileSync(TEST_SETTINGS_PATH, 'invalid json {{{');
    const result = listInstalledMcpServers();
    expect(Object.keys(result)).toHaveLength(0);
  });
});
