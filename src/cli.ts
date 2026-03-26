#!/usr/bin/env node

const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeVersion < 20) {
  console.error(`[Tenetx] Node.js 20 or higher is required. Current: ${process.version}`);
  process.exit(1);
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { prepareHarness, isFirstRun } from './core/harness.js';
import { toggleDashboard, runDashboard } from './core/dashboard.js';
import { spawnClaude } from './core/spawn.js';
import { t, setLocale, type Locale } from './core/i18n.js';
import { loadGlobalConfig, saveGlobalConfig } from './core/global-config.js';

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
    aliases: ['setup'],
    description: 'Initialize project (alias: setup). Use `tenetx forge` for full personalization.',
    category: 'internal',
    handler: async (args) => {
      const { handleInit } = await import('./core/init.js');
      await handleInit(args);
    },
  },
  {
    name: 'philosophy',
    description: 'Manage philosophy (show|edit)',
    category: 'internal',
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
    category: 'internal',
    handler: async (args) => {
      const { handleScan } = await import('./core/scan.js');
      await handleScan(args);
    },
  },
  {
    name: 'verify',
    description: 'Auto verify loop (build+test+constraints) / --review / --gardening / --all',
    category: 'internal',
    handler: async (args) => {
      const { handleVerify } = await import('./core/verify.js');
      await handleVerify(args);
    },
  },
  {
    name: 'stats',
    description: 'Session statistics [--week] (see: tenetx me)',
    category: 'internal',
    handler: async (args) => {
      const { handleStats } = await import('./core/stats.js');
      await handleStats(args);
    },
  },
  {
    name: 'lab',
    description: 'Adaptive optimization (metrics|suggest|history|snapshot|experiment|cost|evolve|patterns|reset)',
    category: 'command',
    handler: async (args) => {
      const { handleLab } = await import('./lab/cli.js');
      await handleLab(args);
    },
  },
  {
    name: 'cost',
    description: 'Session cost tracking (shorthand for lab cost)',
    category: 'internal',
    handler: async (args) => {
      const { printCostSummary } = await import('./lab/cost-tracker.js');
      printCostSummary(args);
    },
  },
  {
    name: 'pick',
    description: 'Cherry-pick insight to Me (<src> --from <pack>)',
    category: 'internal',
    handler: async (args) => {
      const { handlePick } = await import('./pack/crossover.js');
      await handlePick(args);
    },
  },
  {
    name: 'propose',
    description: 'Propose insight to team [--pack <name>]',
    category: 'internal',
    handler: async (args) => {
      const { handlePropose } = await import('./pack/crossover.js');
      await handlePropose(args);
    },
  },
  {
    name: 'proposals',
    description: 'View pending team rule proposals',
    category: 'internal',
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
    category: 'internal',
    handler: async (args) => {
      const { handleAsk } = await import('./core/ask.js');
      await handleAsk(args);
    },
  },
  {
    name: 'codex-spawn',
    aliases: ['codex'],
    description: 'Spawn Codex as teammate in tmux panel',
    category: 'internal',
    handler: async (args) => {
      const { handleCodexSpawn } = await import('./core/codex-spawn.js');
      await handleCodexSpawn(args);
    },
  },
  {
    name: 'providers',
    description: 'Manage providers (enable/disable/model/auth)',
    category: 'internal',
    handler: async (args) => {
      const { handleProviders } = await import('./core/ask.js');
      await handleProviders(args);
    },
  },
  {
    name: 'synth',
    description: 'Multi-model synthesis (status|weights|history)',
    category: 'internal',
    handler: async (args) => {
      const { handleSynth } = await import('./engine/synthesizer.js');
      await handleSynth(args);
    },
  },
  {
    name: 'wait',
    description: 'Rate limit wait + notify (<minutes>)',
    category: 'internal',
    handler: async (args) => {
      const { handleWait } = await import('./core/wait.js');
      await handleWait(args);
    },
  },
  {
    name: 'notify',
    description: 'Send notification / config <channel>',
    category: 'internal',
    handler: async (args) => {
      const { handleNotify } = await import('./core/notify.js');
      await handleNotify(args);
    },
  },
  {
    name: 'status',
    description: 'Print current status line',
    category: 'internal',
    handler: async (_args) => {
      const { printStatus } = await import('./core/status-line.js');
      await printStatus();
    },
  },
  {
    name: 'doctor',
    description: 'Diagnostics',
    category: 'internal',
    handler: async (_args) => {
      const { runDoctor } = await import('./core/doctor.js');
      await runDoctor();
    },
  },
  {
    name: 'install',
    description: 'Install as .claude-plugin format (--plugin required)',
    category: 'internal',
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
    category: 'internal',
    handler: async (args) => {
      const { handleMcp } = await import('./core/mcp-config.js');
      await handleMcp(args);
    },
  },
  {
    name: 'marketplace',
    description: 'Plugin marketplace (see: tenetx pack search)',
    category: 'internal',
    handler: async (args) => {
      const { handleMarketplace } = await import('./core/marketplace.js');
      await handleMarketplace(args);
    },
  },
  {
    name: 'session',
    description: 'Session management (search|list|show)',
    category: 'internal',
    handler: async (args) => {
      const { handleSession } = await import('./core/session-search.js');
      await handleSession(args);
    },
  },
  {
    name: 'worktree',
    description: 'Git worktree management (list|create|remove|teleport)',
    category: 'internal',
    handler: async (args) => {
      const { handleWorktree } = await import('./core/worktree.js');
      await handleWorktree(args);
    },
  },
  {
    name: 'notepad',
    description: 'Notepad (show|add|clear)',
    category: 'internal',
    handler: async (args) => {
      const { handleNotepad } = await import('./core/notepad.js');
      await handleNotepad(args);
    },
  },
  {
    name: 'rules',
    description: 'View personal and team rules',
    category: 'internal',
    handler: async (args) => {
      const { handleRules } = await import('./core/rules-viewer.js');
      await handleRules(args);
    },
  },
  {
    name: 'forge',
    description: 'Signal-based personalization (--scan-only|--profile|--adjust|--export)',
    category: 'command',
    handler: async (args) => {
      const { handleForge } = await import('./forge/cli.js');
      await handleForge(args);
    },
  },
  {
    name: 'me',
    description: 'Personal dashboard: profile, evolution, patterns, agent tuning, cost',
    category: 'command',
    handler: async (args) => {
      const { runMeDashboard } = await import('./forge/me-dashboard.js');
      await runMeDashboard(args);
    },
  },
  {
    name: 'gateway',
    description: 'Event gateway (config <url>|test|disable)',
    category: 'internal',
    handler: async (args) => {
      const { handleGateway } = await import('./engine/event-gateway.js');
      await handleGateway(args);
    },
  },
  {
    name: 'worker',
    description: 'AI Workers (spawn|list|kill|output)',
    category: 'internal',
    handler: async (args) => {
      const { handleWorker } = await import('./core/ai-worker.js');
      await handleWorker(args);
    },
  },
  {
    name: 'governance',
    description: 'Governance report (--json|--trend)',
    category: 'internal',
    handler: async (args) => {
      const { handleGovernance } = await import('./engine/governance.js');
      await handleGovernance(args);
    },
  },
  {
    name: 'remix',
    description: 'Harness remix (browse|inspect|pick|status|update|publish)',
    category: 'internal',
    handler: async (args) => {
      const { handleRemix } = await import('./remix/cli.js');
      await handleRemix(args);
    },
  },
  {
    name: 'uninstall',
    description: 'Remove CH from settings/agents/CLAUDE.md [--force]',
    category: 'internal',
    handler: async (args) => {
      const { handleUninstall } = await import('./core/uninstall.js');
      await handleUninstall(process.cwd(), { force: args.includes('--force') });
    },
  },
  {
    name: 'ast',
    description: 'AST-based code search (search|functions|classes|calls|status)',
    category: 'internal',
    handler: async (args) => {
      const { handleAst } = await import('./engine/ast-cli.js');
      await handleAst(args);
    },
  },
  {
    name: 'lsp',
    description: 'Language Server Protocol (status|hover|definition|references|diagnostics)',
    category: 'internal',
    handler: async (args) => {
      const { handleLsp } = await import('./core/lsp-cli.js');
      await handleLsp(args);
    },
  },
  {
    name: 'swarm',
    description: 'Swarm task management (create|status|cleanup)',
    category: 'command',
    handler: async (args) => {
      const { handleSwarm } = await import('./core/swarm-cli.js');
      await handleSwarm(args);
    },
  },
];

function findCommand(name: string): Command | undefined {
  return commands.find(
    (c) => c.name === name || (c.aliases?.includes(name))
  );
}

// ---------------------------------------------------------------------------
// Language prompt (first run)
// ---------------------------------------------------------------------------

async function promptLocale(): Promise<Locale> {
  // non-TTY: 기본 영어
  if (!process.stdin.isTTY) return 'en';

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n  ╔══════════════════════════════════════════════╗');
  console.log('  ║  Select Language / 언어 선택                ║');
  console.log('  ╚══════════════════════════════════════════════╝\n');
  console.log('  1) English');
  console.log('  2) 한국어\n');

  return new Promise<Locale>((resolve) => {
    rl.question('  Select / 선택 [1]: ', (answer) => {
      rl.close();
      resolve(answer.trim() === '2' ? 'ko' : 'en');
    });
  });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  // Handle help / version first (special cases not in command array)
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
    // First run detection: show welcome if ~/.compound/ doesn't exist
    const firstRun = isFirstRun();
    let selectedLocale: Locale | undefined;

    if (firstRun) {
      // 첫 실행: 언어 선택
      selectedLocale = await promptLocale();
      setLocale(selectedLocale);

      console.log(`
  ╔══════════════════════════════════════════════╗
  ║  ${t('welcome.title')}║
  ╚══════════════════════════════════════════════╝

${t('welcome.desc')}

${t('welcome.setting_up')}`);
    }

    const context = await prepareHarness(process.cwd());

    if (firstRun && selectedLocale) {
      // 디렉토리 생성 후 locale 저장
      const config = loadGlobalConfig();
      config.locale = selectedLocale;
      saveGlobalConfig(config);

      console.log(`
${t('welcome.complete')}

${t('welcome.next_steps')}
${t('welcome.cmd.init')}
${t('welcome.cmd.init_team')}
${t('welcome.cmd.philosophy')}
${t('welcome.cmd.doctor')}

${t('welcome.learn_more')}
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
      console.error(t('error.no_claude'));
      console.error(t('error.install_claude'));
      console.error(t('error.verify'));
    } else if (msg.includes('ENOENT') && msg.includes('git')) {
      console.error(t('error.no_git'));
      console.error(t('error.install_git'));
    } else if (msg.includes('ENOENT') && msg.includes('node')) {
      console.error(t('error.no_node'));
      console.error(`  Current: ${process.version}\n`);
    } else if (msg.includes('EACCES') || msg.includes('EPERM')) {
      console.error(t('error.permission'));
      console.error(`  Details: ${msg}\n`);
    } else {
      console.error(t('error.generic'), msg);
      console.error(t('error.persist'));
      console.error(t('error.issues'));
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
    tenetx --eco (-e)               Token-saving eco mode

  Magic Keywords (in prompt):
    autopilot <task>            Activate autopilot mode
    ralph <task>                Activate ralph mode
    ulw/ultrawork <task>        Activate ultrawork mode
    ralplan <task>              Activate consensus planning mode
    deep-interview <task>       Activate deep interview mode
    ultrathink                  Extended reasoning mode
    deepsearch                  Deep codebase search
    tdd                         TDD mode
    ecomode/에코모드             Token-saving eco mode
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
