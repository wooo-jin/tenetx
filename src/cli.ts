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
    name: 'lab',
    description: 'Adaptive optimization (metrics|suggest|history|experiment|cost|evolve|patterns)',
    handler: async (args) => {
      const { handleLab } = await import('./lab/cli.js');
      await handleLab(args);
    },
  },
  {
    name: 'compound',
    description: 'Compound loop (knowledge accumulation)',
    handler: async (args) => {
      const { handleCompound } = await import('./engine/compound-loop.js');
      await handleCompound(args);
    },
  },
  {
    name: 'me',
    description: 'Personal dashboard: profile, evolution, patterns, cost',
    handler: async (args) => {
      const { runMeDashboard } = await import('./forge/me-dashboard.js');
      await runMeDashboard(args);
    },
  },
  {
    name: 'cost',
    description: 'Session cost tracking',
    handler: async (args) => {
      const { printCostSummary } = await import('./lab/cost-tracker.js');
      printCostSummary(args);
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
  {
    name: 'install',
    description: 'Install as plugin (--plugin)',
    handler: async (args) => {
      if (!args.includes('--plugin')) {
        console.error('Usage: tenetx install --plugin');
        return;
      }
      const { installAsPlugin } = await import('./core/plugin-installer.js');
      const result = installAsPlugin();
      if (result.success) {
        console.log(`[tenetx] Plugin installed: ${result.pluginDir}`);
      } else {
        console.error(`[tenetx] Plugin installation failed: ${result.error}`);
        process.exit(1);
      }
    },
  },
  {
    name: 'uninstall',
    description: 'Remove tenetx from settings [--force]',
    handler: async (args) => {
      const { handleUninstall } = await import('./core/uninstall.js');
      await handleUninstall(process.cwd(), { force: args.includes('--force') });
    },
  },
];

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

    console.log(`[tenetx] Scope: ${context.scope.summary}`);
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
    tenetx                          Start Claude Code with harness
    tenetx "prompt"                 Start with a prompt
    tenetx --resume                 Resume previous session
    tenetx --eco (-e)               Token-saving eco mode

  Commands:
    tenetx forge                    Personalize your coding profile
    tenetx lab                      Adaptive optimization engine
    tenetx compound                 Knowledge accumulation loop
    tenetx me                       Personal dashboard
    tenetx cost                     Session cost tracking
    tenetx config hooks             Hook management
    tenetx mcp                      MCP server management
    tenetx notepad                  Session notepad
    tenetx doctor                   System diagnostics
    tenetx install --plugin         Register as Claude Code plugin
    tenetx uninstall                Remove tenetx
`);
}

main().catch(() => {
  process.exit(1);
});
