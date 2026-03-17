#!/usr/bin/env node

const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeVersion < 18) {
  console.error('[Tenetx] Node.js 18 이상이 필요합니다. 현재: ' + process.version);
  process.exit(1);
}

import { prepareHarness, isFirstRun } from './core/harness.js';
import { toggleDashboard, runDashboard } from './core/dashboard.js';
import { spawnClaude } from './core/spawn.js';

const args = process.argv.slice(2);

// ---------------------------------------------------------------------------
// Command Registry
// ---------------------------------------------------------------------------

interface Command {
  name: string;
  aliases?: string[];
  description: string;
  /** help에서 표시할 카테고리 */
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
        const extendsIdx = args.indexOf('--extends');
        const extendsFrom = extendsIdx !== -1 ? args[extendsIdx + 1] : undefined;
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
    description: 'Compound loop (인사이트 축적, 개인/팀 자동 분류)',
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
        console.error('사용법: tenetx install --plugin');
        return;
      }
      const { installAsPlugin } = await import('./core/plugin-installer.js');
      const result = installAsPlugin();
      if (result.success) {
        console.log(`[tenetx] 플러그인 설치 완료: ${result.pluginDir}`);
      } else {
        console.error(`[tenetx] 플러그인 설치 실패: ${result.error}`);
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
    (c) => c.name === name || (c.aliases && c.aliases.includes(name))
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  // help 먼저 처리 (커맨드 배열에 포함되지 않는 특수 케이스)
  if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const cmd = findCommand(args[0]);
  if (cmd) {
    await cmd.handler(args.slice(1));
    return;
  }

  // 기본 동작: 하네스 적용된 Claude Code 실행
  try {
    // 최초 실행 감지: ~/.compound/ 없으면 웰컴 메시지 출력
    const firstRun = isFirstRun();
    if (firstRun) {
      console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Tenetx — 처음 오신 것을 환영합니다!       ║
  ╚══════════════════════════════════════════════╝

  Tenetx는 당신의 개발 철학을 Claude Code에 주입합니다.
  원칙을 선언하면 훅, 모델 라우팅, 에이전트가 자동으로 구성됩니다.

  지금 기본 환경을 설정합니다...`);
    }

    const context = await prepareHarness(process.cwd());

    if (firstRun) {
      console.log(`
  ✓ 초기 설정 완료!

  다음 단계:
    tenetx init              프로젝트 타입 감지 → 맞춤 철학 생성
    tenetx init --team       팀 모드로 시작 (팀원과 철학 공유)
    tenetx philosophy show   현재 철학 확인
    tenetx doctor            환경 진단

  더 알아보기: https://github.com/wooo-jin/tenetx
`);
    }

    console.log(`[tenetx] Philosophy: ${context.philosophy.name} (${context.philosophySource})`);
    console.log(`[tenetx] Scope: ${context.scope.summary}`);
    if (context.scope.team) {
      const t = context.scope.team;
      const assets: string[] = [];
      if (t.ruleCount > 0) assets.push(`규칙 ${t.ruleCount}`);
      if (t.solutionCount > 0) assets.push(`솔루션 ${t.solutionCount}`);
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

    // 사용자 친화적 에러 메시지 변환
    if (msg.includes('ENOENT') && msg.includes('claude')) {
      console.error('\n  [tenetx] Claude Code가 설치되어 있지 않습니다.');
      console.error('  설치: https://docs.anthropic.com/en/docs/claude-code');
      console.error('  확인: tenetx doctor\n');
    } else if (msg.includes('ENOENT') && msg.includes('git')) {
      console.error('\n  [tenetx] Git이 설치되어 있지 않습니다.');
      console.error('  설치: https://git-scm.com/downloads\n');
    } else if (msg.includes('ENOENT') && msg.includes('node')) {
      console.error('\n  [tenetx] Node.js 18 이상이 필요합니다.');
      console.error('  현재: ' + process.version + '\n');
    } else if (msg.includes('EACCES') || msg.includes('EPERM')) {
      console.error('\n  [tenetx] 권한이 부족합니다. sudo 또는 파일 권한을 확인하세요.');
      console.error('  상세: ' + msg + '\n');
    } else {
      console.error('\n  [tenetx] 오류:', msg);
      console.error('  문제가 계속되면: tenetx doctor 로 환경을 진단하세요.');
      console.error('  이슈: https://github.com/wooo-jin/tenetx/issues\n');
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// printHelp — 커맨드 배열에서 자동 생성
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
  Tenetx v1.2.0
  Philosophy-driven Claude Code harness

  Usage:
    tenetx                          Start Claude Code with harness
    tenetx "prompt"                 Start with a prompt
    tenetx --resume                 Resume previous session

  Modes:
    tenetx --autopilot (-a)         5단계 자율 실행 파이프라인
    tenetx --ralph (-r)             PRD 기반 완료 보장 + verify/fix loop
    tenetx --team (-t)              전문 에이전트 단계별 파이프라인
    tenetx --ultrawork (-u)         최대 병렬성 버스트
    tenetx --pipeline (-p)          순차 단계별 처리
    tenetx --ccg                    Claude-Codex-Gemini 3모델 합성
    tenetx --ralplan                합의 기반 설계 (Planner→Architect→Critic)
    tenetx --deep-interview         Socratic 요구사항 명확화

  Magic Keywords (프롬프트 내):
    autopilot <task>            autopilot 모드 활성화
    ralph <task>                ralph 모드 활성화
    ulw/ultrawork <task>        ultrawork 모드 활성화
    ralplan <task>              합의 계획 모드 활성화
    deep-interview <task>       딥 인터뷰 모드 활성화
    ultrathink                  확장 추론 모드
    deepsearch                  코드베이스 심층 탐색
    tdd                         TDD 모드
    canceltenetx                    모든 모드 중단

  Commands:`);

  for (const cmd of commands.filter((c) => c.category !== 'internal')) {
    const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
    const nameWithAliases = `tenetx ${cmd.name}${aliases}`;
    console.log(`    ${nameWithAliases.padEnd(38)}${cmd.description}`);
  }

  console.log(`
  Agents (19종, 자동 설치):
    executor, architect, critic, planner, analyst, debugger,
    designer, security-reviewer, code-reviewer, test-engineer,
    writer, qa-tester, verifier, explore, refactoring-expert,
    performance-reviewer, scientist, git-master, code-simplifier

  TUI (inside tmux):
    Ctrl+B → T                  Toggle dashboard panel
`);
}

main().catch(() => {
  // main() 내부에서 이미 에러 처리됨
  process.exit(1);
});
