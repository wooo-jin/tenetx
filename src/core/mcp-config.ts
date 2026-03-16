/**
 * mcp-config.ts — MCP 서버 설정 생성기
 *
 * Claude Code settings.json의 mcpServers 섹션을 관리한다.
 * - 기본 MCP 서버 템플릿 제공 (filesystem, fetch, context7, playwright)
 * - 설정 생성 및 주입 (기존 설정과 병합, 덮어쓰기 없음)
 * - CLI 핸들러: tenetx mcp list/add/remove/templates
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSettings, writeSettings } from './settings-lock.js';
import { BUILTIN_MCP_SERVERS } from '../mcp-servers/index.js';

/** dist/mcp-servers/ 디렉토리의 절대 경로 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_SERVERS_DIR = path.resolve(__dirname, '..', 'mcp-servers');

/** MCP 서버 단일 설정 */
export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** 기본 MCP 서버 템플릿 맵 */
const DEFAULT_MCP_TEMPLATES: Record<string, McpServerConfig> = {
  filesystem: {
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-filesystem', '--allow-dir', '.'],
  },
  fetch: {
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-fetch'],
  },
  context7: {
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
  },
  playwright: {
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-playwright'],
  },
};

/**
 * 기본 MCP 서버 템플릿 목록 반환 (외부 + 빌트인 포함)
 * 반환값: 서버 이름 → 설정 객체 맵
 */
export function getDefaultMcpTemplates(): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {};

  // 외부 템플릿
  for (const [k, v] of Object.entries(DEFAULT_MCP_TEMPLATES)) {
    result[k] = { ...v, args: [...v.args], ...(v.env ? { env: { ...v.env } } : {}) };
  }

  // 빌트인 MCP 서버 추가 (args에 절대 경로 해석)
  for (const server of BUILTIN_MCP_SERVERS) {
    const resolvedArgs = server.args.map(arg =>
      arg.endsWith('.js') ? path.join(MCP_SERVERS_DIR, arg) : arg,
    );
    result[server.name] = {
      command: server.command,
      args: resolvedArgs,
      ...(server.env ? { env: { ...server.env } } : {}),
    };
  }

  return result;
}

/**
 * 선택한 서버 이름 목록을 받아 McpServerConfig 맵 생성
 * 알 수 없는 서버 이름은 경고 출력 후 무시
 */
export function generateMcpConfig(
  servers: string[],
): Record<string, McpServerConfig> {
  const templates = getDefaultMcpTemplates();
  const result: Record<string, McpServerConfig> = {};

  for (const name of servers) {
    if (templates[name]) {
      result[name] = { ...templates[name], args: [...templates[name].args] };
    } else {
      console.warn(`[mcp-config] 알 수 없는 MCP 서버 이름: "${name}" — 건너뜁니다.`);
    }
  }

  return result;
}

/**
 * ~/.claude/settings.json의 mcpServers에 서버 설정 주입
 * 기존 mcpServers와 병합 (같은 이름의 서버가 있으면 덮어씀)
 */
export function injectMcpServers(
  servers: Record<string, McpServerConfig>,
): void {
  const settings = readSettings(); // 파싱 실패 시 throw
  const existing = (settings.mcpServers as Record<string, McpServerConfig>) ?? {};
  settings.mcpServers = { ...existing, ...servers };
  writeSettings(settings); // lock + backup + atomic write
}

/**
 * 현재 ~/.claude/settings.json에 등록된 MCP 서버 목록 반환
 * settings.json이 없거나 mcpServers가 없으면 빈 객체 반환
 */
export function listInstalledMcpServers(): Record<string, McpServerConfig> {
  try {
    const settings = readSettings();
    return (settings.mcpServers as Record<string, McpServerConfig>) ?? {};
  } catch {
    return {};
  }
}

/**
 * MCP CLI 핸들러
 *
 * 사용법:
 *   tenetx mcp list                    — 설치된 MCP 서버 목록
 *   tenetx mcp templates               — 사용 가능한 기본 템플릿 목록
 *   tenetx mcp add <name> [<name>...]  — MCP 서버 추가 (템플릿 기준)
 *   tenetx mcp remove <name>           — MCP 서버 제거
 */
export async function handleMcp(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === 'list') {
    const installed = listInstalledMcpServers();
    const names = Object.keys(installed);

    console.log('\n  Tenetx — MCP Servers\n');

    if (names.length === 0) {
      console.log('  설치된 MCP 서버가 없습니다.');
      console.log('  `tenetx mcp add <name>` 으로 추가하세요.\n');
    } else {
      console.log(`  설치된 서버 (${names.length}개):\n`);
      for (const name of names) {
        const cfg = installed[name];
        console.log(`    ${name}`);
        console.log(`      command: ${cfg.command} ${cfg.args.join(' ')}`);
        if (cfg.env && Object.keys(cfg.env).length > 0) {
          console.log(`      env: ${JSON.stringify(cfg.env)}`);
        }
      }
      console.log('');
    }
    return;
  }

  if (sub === 'templates') {
    const templates = getDefaultMcpTemplates();
    console.log('\n  Tenetx — MCP Templates\n');
    console.log(`  사용 가능한 기본 템플릿 (${Object.keys(templates).length}개):\n`);
    for (const [name, cfg] of Object.entries(templates)) {
      console.log(`    ${name}`);
      console.log(`      command: ${cfg.command} ${cfg.args.join(' ')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'add') {
    const serverNames = args.slice(1);
    if (serverNames.length === 0) {
      console.error('  오류: 추가할 서버 이름을 지정하세요.');
      console.error('  사용법: tenetx mcp add <name> [<name>...]');
      console.error('  템플릿 목록: tenetx mcp templates');
      process.exit(1);
    }

    const configs = generateMcpConfig(serverNames);
    const addedNames = Object.keys(configs);

    if (addedNames.length === 0) {
      console.error('  오류: 유효한 서버 이름이 없습니다.');
      process.exit(1);
    }

    injectMcpServers(configs);

    console.log('\n  Tenetx — MCP Add\n');
    for (const name of addedNames) {
      console.log(`  ✓ 추가됨: ${name}`);
    }
    console.log('');
    return;
  }

  if (sub === 'remove') {
    const serverName = args[1];
    if (!serverName) {
      console.error('  오류: 제거할 서버 이름을 지정하세요.');
      console.error('  사용법: tenetx mcp remove <name>');
      process.exit(1);
    }

    let settings: Record<string, unknown>;
    try {
      settings = readSettings();
    } catch {
      console.error('  오류: settings.json 파싱 실패');
      process.exit(1);
      return;
    }

    const mcpServers = (settings.mcpServers as Record<string, McpServerConfig>) ?? {};
    if (!mcpServers[serverName]) {
      console.log(`  "${serverName}"가 설치되어 있지 않습니다.`);
      return;
    }

    delete mcpServers[serverName];
    settings.mcpServers = mcpServers;
    writeSettings(settings); // lock + backup + atomic write

    console.log(`\n  ✓ 제거됨: ${serverName}\n`);
    return;
  }

  // 알 수 없는 서브커맨드
  console.error(`  오류: 알 수 없는 mcp 서브커맨드: "${sub}"`);
  console.error('  사용법: tenetx mcp [list|templates|add|remove]');
  process.exit(1);
}
