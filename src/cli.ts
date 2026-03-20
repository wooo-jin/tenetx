#!/usr/bin/env node

const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeVersion < 18) {
  console.error(`[Tenetx] Node.js 18 or higher is required. Current: ${process.version}`);
  process.exit(1);
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareHarness, isFirstRun } from './core/harness.js';
import { toggleDashboard, runDashboard } from './core/dashboard.js';
import { spawnClaude } from './core/spawn.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
const PKG_VERSION: string = pkgJson.version ?? '0.0.0';

const args = process.argv.slice(2);

// ---------------------------------------------------------------------------
// Command Registry
// ---------------------------------------------------------------------------

interface Command {
  name: string;
  aliases?: string[];
  description: string;
  /** Category for help display */
  category?: 'mode' | 'command' | 'internal';
  handler: (args: string[]) => Promise<void>;
}

const commands: Command[] = [
  {
    name: 'toggle-dashboard',
    description: 'Toggle dashboard panel',
    category: 'internal',
    handler: async (_args) => {
      await toggleDashboard();
    },
  },
  {
    name: 'dashboard',
    description: 'Open dashboard',
    category: 'internal',
    handler: async (_args) => {
      await runDashboard();
    },
  },
  {
    name: 'init',
    description: 'Auto-detect project type and initialize philosophy',
    category: 'command',
    handler: async (args) => {
      const { handleInit } = await import('./core/init.js');
      await handleInit(args);
    },
  },
  {
    name: 'setup',
    description: 'Initial setup (global) / --project [--pack|--extends <name>] / --yes',
    category: 'command',
    handler: async (args) => {
      const isYes = args.includes('--yes') || args.includes('-y');
      if (args.includes('--project')) {
        const packIdx = args.indexOf('--pack');
        const pack = packIdx !== -1 ? args[packIdx + 1] : undefined;
        if (packIdx !== -1 && (!pack || pack.startsWith('--'))) {
          console.error('[tenetx] --pack option requires a value. Example: --pack my-pack');
          process.exit(1);
        }
        const extendsIdx = args.indexOf('--extends');
        const extendsFrom = extendsIdx !== -1 ? args[extendsIdx + 1] : undefined;
        if (extendsIdx !== -1 && (!extendsFrom || extendsFrom.startsWith('--'))) {
          console.error('[tenetx] --extends option requires a value. Example: --extends base-pack');
          process.exit(1);
        }
        const { runProjectSetup } = await import('./core/setup.js');
        await runProjectSetup(process.cwd(), { pack, extends: extendsFrom, yes: isYes });
      } else {
        const { runSetup } = await import('./core/setup.js');
        await runSetup({ yes: isYes });
      }
    },
  },
  {
    name: 'philosophy',
    description: 'Manage philosophy (show|edit)',
    category: 'command',
    handler: async (args) => {
      const { handlePhilosophy } = await import('./core/philosophy-cli.js');
      await handlePhilosophy(args);
    },
  },
  {
    name: 'pack',
    description: 'Manage packs (list|install|add|remove|connected|sync|init)',
    category: 'command',
    handler: async (args) => {
      const { handlePack } = await import('./pack/cli.js');
      await handlePack(args);
    },
  },
  {
    name: 'scan',
    description: 'Scan project structure / --constraints / --init-constraints / --md',
    category: 'command',
    handler: async (args) => {
      const { handleScan } = await import('./core/scan.js');
      await handleScan(args);
    },
  },
  {
    name: 'verify',
    description: 'Auto verify loop (build+test+constraints) / --review / --gardening / --all',
    category: 'command',
    handler: async (args) => {
      const { handleVerify } = await import('./core/verify.js');
      await handleVerify(args);
    },
  },
  {
    name: 'stats',
    description: 'Session statistics [--week]',
    category: 'command',
    handler: async (args) => {
      const { handleStats } = await import('./core/stats.js');
      await handleStats(args);
    },
  },
  {
    name: 'pick',
    description: 'Cherry-pick insight to Me (<src> --from <pack>)',
    category: 'command',
    handler: async (args) => {
      const { handlePick } = await import('./pack/crossover.js');
      await handlePick(args);
    },
  },
  {
    name: 'propose',
    description: 'Propose insight to team [--pack <name>]',
    category: 'command',
    handler: async (args) => {
      const { handlePropose } = await import('./pack/crossover.js');
      await handlePropose(args);
    },
  },
  {
    name: 'proposals',
    description: 'View pending team rule proposals',
    category: 'command',
    handler: async (args) => {
      const { handleProposals } = await import('./core/proposals.js');
      await handleProposals(args);
    },
  },
  {
    name: 'compound',
    description: 'Compound loop (insight accumulation, auto-classified)',
    category: 'command',
    handler: async (args) => {
      const { handleCompound } = await import('./engine/compound-loop.js');
      await handleCompound(args);
    },
  },
  {
    name: 'ask',
    description: 'Multi-provider question ("question" --compare --fallback)',
    category: 'command',
    handler: async (args) => {
      const { handleAsk } = await import('./core/ask.js');
      await handleAsk(args);
    },
  },
  {
    name: 'codex-spawn',
    aliases: ['codex'],
    description: 'Spawn Codex as teammate in tmux panel',
    category: 'command',
    handler: async (args) => {
      const { handleCodexSpawn } = await import('./core/codex-spawn.js');
      await handleCodexSpawn(args);
    },
  },
  {
    name: 'providers',
    description: 'Manage providers (enable/disable/model/auth)',
    category: 'command',
    handler: async (args) => {
      const { handleProviders } = await import('./core/ask.js');
      await handleProviders(args);
    },
  },
  {
    name: 'wait',
    description: 'Rate limit wait + notify (<minutes>)',
    category: 'command',
    handler: async (args) => {
      const { handleWait } = await import('./core/wait.js');
      await handleWait(args);
    },
  },
  {
    name: 'notify',
    description: 'Send notification / config <channel>',
    category: 'command',
    handler: async (args) => {
      const { handleNotify } = await import('./core/notify.js');
      await handleNotify(args);
    },
  },
  {
    name: 'status',
    description: 'Print current status line',
    category: 'command',
    handler: async (_args) => {
      const { printStatus } = await import('./core/status-line.js');
      await printStatus();
    },
  },
  {
    name: 'doctor',
    description: 'Diagnostics',
    category: 'command',
    handler: async (_args) => {
      const { runDoctor } = await import('./core/doctor.js');
      await runDoctor();
    },
  },
  {
    name: 'install',
    description: 'Install as .claude-plugin format (--plugin required)',
    category: 'command',
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
    name: 'mcp',
    description: 'Manage MCP servers (list|templates|add <name>|remove <name>)',
    category: 'command',
    handler: async (args) => {
      const { handleMcp } = await import('./core/mcp-config.js');
      await handleMcp(args);
    },
  },
  {
    name: 'marketplace',
    description: 'Plugin marketplace (search|install|list|remove)',
    category: 'command',
    handler: async (args) => {
      const { handleMarketplace } = await import('./core/marketplace.js');
      await handleMarketplace(args);
    },
  },
  {
    name: 'session',
    description: 'Session management (search|list|show)',
    category: 'command',
    handler: async (args) => {
      const { handleSession } = await import('./core/session-search.js');
      await handleSession(args);
    },
  },
  {
    name: 'worktree',
    description: 'Git worktree management (list|create|remove|teleport)',
    category: 'command',
    handler: async (args) => {
      const { handleWorktree } = await import('./core/worktree.js');
      await handleWorktree(args);
    },
  },
  {
    name: 'notepad',
    description: 'Notepad (show|add|clear)',
    category: 'command',
    handler: async (args) => {
      const { handleNotepad } = await import('./core/notepad.js');
      await handleNotepad(args);
    },
  },
  {
    name: 'rules',
    description: 'View personal and team rules',
    category: 'command',
    handler: async (args) => {
      const { handleRules } = await import('./core/rules-viewer.js');
      await handleRules(args);
    },
  },
  {
    name: 'gateway',
    description: 'Event gateway (config <url>|test|disable)',
    category: 'command',
    handler: async (args) => {
      const { handleGateway } = await import('./engine/event-gateway.js');
      await handleGateway(args);
    },
  },
  {
    name: 'worker',
    description: 'AI Workers (spawn|list|kill|output)',
    category: 'command',
    handler: async (args) => {
      const { handleWorker } = await import('./core/ai-worker.js');
      await handleWorker(args);
    },
  },
  {
    name: 'governance',
    description: 'Governance report (--json|--trend)',
    category: 'command',
    handler: async (args) => {
      const { handleGovernance } = await import('./engine/governance.js');
      await handleGovernance(args);
    },
  },
  {
    name: 'uninstall',
    description: 'Remove CH from settings/agents/CLAUDE.md [--force]',
    category: 'command',
    handler: async (args) => {
      const { handleUninstall } = await import('./core/uninstall.js');
      await handleUninstall(process.cwd(), { force: args.includes('--force') });
    },
  },
];

function findCommand(name: string): Command | undefined {
  return commands.find(
    (c) => c.name === name || (c.aliases?.includes(name))
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  // Handle help first (special case not in command array)
  if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const cmd = findCommand(args[0]);
  if (cmd) {
    await cmd.handler(args.slice(1));
    return;
  }

  // Default: run Claude Code with harness
  try {
    // First run detection: show welcome if ~/.compound/ doesn't exist
    const firstRun = isFirstRun();
    if (firstRun) {
      console.log(`
  ╔══════════════════════════════════════════════╗
  ║       Welcome to Tenetx!                    ║
  ╚══════════════════════════════════════════════╝

  Tenetx injects your development philosophy into Claude Code.
  Declare principles, and hooks, model routing, and agents are
  configured automatically.

  Setting up the default environment now...`);
    }

    const context = await prepareHarness(process.cwd());

    if (firstRun) {
      console.log(`
  ✓ Initial setup complete!

  Next steps:
    tenetx init              Detect project type → generate philosophy
    tenetx init --team       Start in team mode (share philosophy)
    tenetx philosophy show   View current philosophy
    tenetx doctor            Run diagnostics

  Learn more: https://github.com/wooo-jin/tenetx
`);
    }

    console.log(`[tenetx] Philosophy: ${context.philosophy.name} (${context.philosophySource})`);
    console.log(`[tenetx] Scope: ${context.scope.summary}`);
    if (context.scope.team) {
      const t = context.scope.team;
      const assets: string[] = [];
      if (t.ruleCount > 0) assets.push(`rules ${t.ruleCount}`);
      if (t.solutionCount > 0) assets.push(`solutions ${t.solutionCount}`);
      const assetStr = assets.length > 0 ? ` (${assets.join(', ')})` : '';
      console.log(`[tenetx] Pack: ${t.name} v${t.version}${assetStr}`);
    }
    if (context.modelRouting) {
      const rt = context.modelRouting;
      const parts = Object.entries(rt)
        .filter(([, v]) => (v as string[]).length > 0)
        .map(([k, v]) => `${k}:${(v as string[]).length}`);
      console.log(`[tenetx] Routing: ${parts.join(' | ')}`);
    }
    console.log('[tenetx] Starting Claude Code...\n');

    await spawnClaude(args, context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // User-friendly error message conversion
    if (msg.includes('ENOENT') && msg.includes('claude')) {
      console.error('\n  [tenetx] Claude Code is not installed.');
      console.error('  Install: https://docs.anthropic.com/en/docs/claude-code');
      console.error('  Verify: tenetx doctor\n');
    } else if (msg.includes('ENOENT') && msg.includes('git')) {
      console.error('\n  [tenetx] Git is not installed.');
      console.error('  Install: https://git-scm.com/downloads\n');
    } else if (msg.includes('ENOENT') && msg.includes('node')) {
      console.error('\n  [tenetx] Node.js 18 or higher is required.');
      console.error(`  Current: ${process.version}\n`);
    } else if (msg.includes('EACCES') || msg.includes('EPERM')) {
      console.error('\n  [tenetx] Permission denied. Check file permissions or use sudo.');
      console.error(`  Details: ${msg}\n`);
    } else {
      console.error('\n  [tenetx] Error:', msg);
      console.error('  If the problem persists: run tenetx doctor for diagnostics.');
      console.error('  Issues: https://github.com/wooo-jin/tenetx/issues\n');
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// printHelp — auto-generated from command array
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
  Tenetx v${PKG_VERSION}
  Philosophy-driven Claude Code harness

  Usage:
    tenetx                          Start Claude Code with harness
    tenetx "prompt"                 Start with a prompt
    tenetx --resume                 Resume previous session

  Modes:
    tenetx --autopilot (-a)         5-phase autonomous execution pipeline
    tenetx --ralph (-r)             PRD-based completion guarantee + verify/fix loop
    tenetx --team (-t)              Specialized agent staged pipeline
    tenetx --ultrawork (-u)         Maximum parallelism burst
    tenetx --pipeline (-p)          Sequential stage processing
    tenetx --ccg                    Claude-Codex-Gemini tri-model synthesis
    tenetx --ralplan                Consensus planning (Planner→Architect→Critic)
    tenetx --deep-interview         Socratic requirement clarification

  Magic Keywords (in prompt):
    autopilot <task>            Activate autopilot mode
    ralph <task>                Activate ralph mode
    ulw/ultrawork <task>        Activate ultrawork mode
    ralplan <task>              Activate consensus planning mode
    deep-interview <task>       Activate deep interview mode
    ultrathink                  Extended reasoning mode
    deepsearch                  Deep codebase search
    tdd                         TDD mode
    canceltenetx                    Cancel all modes

  Commands:`);

  for (const cmd of commands.filter((c) => c.category !== 'internal')) {
    const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
    const nameWithAliases = `tenetx ${cmd.name}${aliases}`;
    console.log(`    ${nameWithAliases.padEnd(38)}${cmd.description}`);
  }

  console.log(`
  Agents (19 types, auto-installed):
    executor, architect, critic, planner, analyst, debugger,
    designer, security-reviewer, code-reviewer, test-engineer,
    writer, qa-tester, verifier, explore, refactoring-expert,
    performance-reviewer, scientist, git-master, code-simplifier

  TUI (inside tmux):
    Ctrl+B → T                  Toggle dashboard panel
`);
}

main().catch(() => {
  // Error already handled inside main()
  process.exit(1);
});
