#!/usr/bin/env node

const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeVersion < 20) {
  console.error(`[Tenetx] Node.js 20 or higher is required. Current: ${process.version}`);
  process.exit(1);
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareHarness, isFirstRun } from './core/harness.js';
import { spawnClaude } from './core/spawn.js';
// global-config is used by harness internally

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
const PKG_VERSION: string = pkgJson.version ?? '0.0.0';

const args = process.argv.slice(2);

// ---------------------------------------------------------------------------
// Command Registry — "쓸수록 나를 더 잘 아는 Claude"에 필요한 것만
// ---------------------------------------------------------------------------

interface Command {
  name: string;
  aliases?: string[];
  description: string;
  handler: (args: string[]) => Promise<void>;
}

const commands: Command[] = [
  {
    name: 'forge',
    description: 'Signal-based personalization (--scan-only|--profile|--adjust|--export)',
    handler: async (args) => {
      const { handleForge } = await import('./forge/cli.js');
      await handleForge(args);
    },
  },
  {
    name: 'compound',
    description: 'Preview/save compound insights and manage accumulated knowledge',
    handler: async (args) => {
      const { handleCompound } = await import('./engine/compound-loop.js');
      await handleCompound(args);
    },
  },
  {
    name: 'skill',
    description: 'Skill management (promote|list)',
    handler: async (args) => {
      const sub = args[0];
      if (sub === 'promote' && args[1]) {
        const { promoteSolution } = await import('./engine/skill-promoter.js');
        const triggers = args.includes('--trigger')
          ? args.slice(args.indexOf('--trigger') + 1).filter(a => !a.startsWith('-'))
          : undefined;
        const result = promoteSolution(args[1], triggers);
        if (result.success) {
          console.log(`\n  ✓ Promoted: ${args[1]} → ${result.skillPath}\n`);
        } else {
          console.log(`\n  ✗ ${result.reason}\n`);
        }
      } else if (sub === 'list') {
        const { listSkills } = await import('./engine/skill-promoter.js');
        const skills = listSkills();
        if (skills.length === 0) {
          console.log('\n  No promoted skills yet. Use `tenetx skill promote <solution-name>`\n');
        } else {
          console.log(`\n  Promoted Skills (${skills.length}):\n`);
          for (const s of skills) {
            console.log(`    ${s.name} [${s.status}] triggers: ${s.triggers.join(', ')}`);
          }
          console.log('');
        }
      } else {
        console.log('  Usage:\n    tenetx skill promote <solution-name> [--trigger "keyword"]\n    tenetx skill list');
      }
    },
  },
  {
    name: 'me',
    description: 'Personal dashboard: profile, evolution, patterns',
    handler: async (args) => {
      const { runMeDashboard } = await import('./forge/me-dashboard.js');
      await runMeDashboard(args);
    },
  },
  {
    name: 'config',
    description: 'Configuration (hooks [--regenerate])',
    handler: async (args) => {
      const sub = args[0];
      if (sub === 'hooks') {
        if (args.includes('--regenerate')) {
          const { writeHooksJson } = await import('./hooks/hooks-generator.js');
          const hooksDir = path.join(process.cwd(), 'hooks');
          const result = writeHooksJson(hooksDir, { cwd: process.cwd() });
          console.log(`[tenetx] hooks.json regenerated: ${result.active} active, ${result.disabled} disabled`);
        } else {
          const { displayHookStatus } = await import('./core/config-hooks.js');
          await displayHookStatus(process.cwd());
        }
      } else {
        console.log('Usage: tenetx config hooks [--regenerate]');
      }
    },
  },
  {
    name: 'mcp',
    description: 'MCP server management (list|templates|add|remove)',
    handler: async (args) => {
      const { handleMcp } = await import('./core/mcp-config.js');
      await handleMcp(args);
    },
  },
  {
    name: 'init',
    description: 'Initialize project',
    handler: async (args) => {
      const { handleInit } = await import('./core/init.js');
      await handleInit(args);
    },
  },
  {
    name: 'notepad',
    description: 'Notepad (show|add|clear)',
    handler: async (args) => {
      const { handleNotepad } = await import('./core/notepad.js');
      await handleNotepad(args);
    },
  },
  {
    name: 'doctor',
    description: 'Diagnostics',
    handler: async (_args) => {
      const { runDoctor } = await import('./core/doctor.js');
      await runDoctor();
    },
  },
  // install --plugin 제거됨 — postinstall이 유일한 설치 경로
  // 수동 재설치: node scripts/postinstall.js
  {
    name: 'uninstall',
    description: 'Remove tenetx from settings [--force]',
    handler: async (args) => {
      const { handleUninstall } = await import('./core/uninstall.js');
      await handleUninstall(process.cwd(), { force: args.includes('--force') });
    },
  },
];

/** 최소 편집 거리 (유사 명령 제안용) */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findCommand(name: string): Command | undefined {
  return commands.find(
    (c) => c.name === name || (c.aliases?.includes(name)),
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }
  if (args[0] === '--version' || args[0] === '-V') {
    console.log(PKG_VERSION);
    return;
  }

  const cmd = findCommand(args[0]);
  if (cmd) {
    await cmd.handler(args.slice(1));
    return;
  }

  // 등록되지 않은 서브커맨드는 에러 처리
  // 플래그(--resume 등), 따옴표 프롬프트, 인자 없는 실행은 하네스로 통과
  if (args[0] && !args[0].startsWith('-') && !args[0].startsWith('"') && !args[0].startsWith("'")) {
    const suggestion = commands
      .map(c => ({ name: c.name, dist: levenshtein(args[0], c.name) }))
      .filter(c => c.dist <= 3)
      .sort((a, b) => a.dist - b.dist)[0];
    const hint = suggestion ? `\n  Did you mean: tenetx ${suggestion.name}` : '';
    console.error(`[tenetx] Unknown command: ${args[0]}${hint}\n  Run "tenetx help" for available commands.`);
    process.exit(1);
  }

  // Default: run Claude Code with harness
  try {
    const firstRun = isFirstRun();

    if (firstRun) {
      console.log(`
  ╔══════════════════════════════════════════════╗
  ║  Welcome to Tenetx                          ║
  ╚══════════════════════════════════════════════╝

  The more you use Claude with Tenetx,
  the better Claude gets at helping YOU.

  Setting up...`);
    }

    const context = await prepareHarness(process.cwd());

    if (firstRun) {
      console.log(`
  Setup complete!

  Next steps:
    tenetx forge          Personalize your profile
    tenetx doctor         Check system health
`);
    }

    const bold = '\x1b[1m';
    const cyan = '\x1b[36m';
    const dim = '\x1b[2m';
    const reset = '\x1b[0m';
    console.log(`
  ${bold}${cyan}▀█▀ █▀▀ █▄░█ █▀▀ ▀█▀ ▀▄▀${reset}
  ${bold}${cyan}░█░ ██▄ █░▀█ ██▄ ░█░ █░█${reset}  ${dim}v${PKG_VERSION}${reset}

  ${dim}The Claude Code harness that learns from you.${reset}
  ${dim}Scope: ${context.scope.summary}${reset}
`);
    console.log('[tenetx] Starting Claude Code...\n');

    await spawnClaude(args, context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ENOENT') && msg.includes('claude')) {
      console.error('[tenetx] Claude Code not found. Install: npm install -g @anthropic-ai/claude-code');
    } else {
      console.error('[tenetx] Error:', msg);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// printHelp
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
  Tenetx v${PKG_VERSION}
  The more you use Claude, the better it knows you.

  Usage:
    tenetx                          Start Claude Code (harness mode)
    tenetx "prompt"                 Start with a prompt
    tenetx --resume                 Resume previous session

  Commands:
    tenetx forge                    Personalize your coding profile
    tenetx compound                 Manage accumulated knowledge
    tenetx me                       Personal dashboard
    tenetx config hooks             Hook management
    tenetx doctor                   System diagnostics
    tenetx uninstall                Remove tenetx

  Harness mode (default):
    Wraps Claude Code with auto-compound, session recording, and safety hooks.
    Sessions are recorded and searchable via compound session-search MCP tool.
`);
}

main().catch(() => {
  process.exit(1);
});
