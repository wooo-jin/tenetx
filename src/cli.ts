#!/usr/bin/env node

const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeVersion < 18) {
  console.error('[Tenet] Node.js 18 이상이 필요합니다. 현재: ' + process.version);
  process.exit(1);
}

import { prepareHarness, isFirstRun } from './core/harness.js';
import { toggleDashboard, runDashboard } from './core/dashboard.js';
import { spawnClaude } from './core/spawn.js';

const args = process.argv.slice(2);

async function main() {
  // 내부 명령어 처리
  if (args[0] === 'toggle-dashboard') {
    await toggleDashboard();
    return;
  }

  if (args[0] === 'dashboard') {
    await runDashboard();
    return;
  }

  if (args[0] === 'setup') {
    if (args.includes('--project')) {
      const { runProjectSetup } = await import('./core/setup.js');
      await runProjectSetup(process.cwd());
    } else {
      const { runSetup } = await import('./core/setup.js');
      await runSetup();
    }
    return;
  }

  if (args[0] === 'philosophy') {
    const { handlePhilosophy } = await import('./core/philosophy-cli.js');
    await handlePhilosophy(args.slice(1));
    return;
  }

  if (args[0] === 'pack') {
    const { handlePack } = await import('./pack/cli.js');
    await handlePack(args.slice(1));
    return;
  }

  if (args[0] === 'scan') {
    const { handleScan } = await import('./core/scan.js');
    await handleScan(args.slice(1));
    return;
  }

  if (args[0] === 'verify') {
    const { handleVerify } = await import('./core/verify.js');
    await handleVerify(args.slice(1));
    return;
  }

  if (args[0] === 'stats') {
    const { handleStats } = await import('./core/stats.js');
    await handleStats(args.slice(1));
    return;
  }

  if (args[0] === 'pick') {
    const { handlePick } = await import('./pack/crossover.js');
    await handlePick(args.slice(1));
    return;
  }

  if (args[0] === 'propose') {
    const { handlePropose } = await import('./pack/crossover.js');
    await handlePropose(args.slice(1));
    return;
  }

  if (args[0] === 'compound') {
    const { handleCompound } = await import('./engine/compound-loop.js');
    await handleCompound(args.slice(1));
    return;
  }

  if (args[0] === 'ask') {
    const { handleAsk } = await import('./core/ask.js');
    await handleAsk(args.slice(1));
    return;
  }

  if (args[0] === 'providers') {
    const { handleProviders } = await import('./core/ask.js');
    await handleProviders(args.slice(1));
    return;
  }

  if (args[0] === 'wait') {
    const { handleWait } = await import('./core/wait.js');
    await handleWait(args.slice(1));
    return;
  }

  if (args[0] === 'notify') {
    const { handleNotify } = await import('./core/notify.js');
    await handleNotify(args.slice(1));
    return;
  }

  if (args[0] === 'status') {
    const { printStatus } = await import('./core/status-line.js');
    await printStatus();
    return;
  }

  if (args[0] === 'doctor') {
    const { runDoctor } = await import('./core/doctor.js');
    await runDoctor();
    return;
  }

  if (args[0] === 'install' && args.includes('--plugin')) {
    const { installAsPlugin } = await import('./core/plugin-installer.js');
    const result = installAsPlugin();
    if (result.success) {
      console.log(`[tenet] 플러그인 설치 완료: ${result.pluginDir}`);
    } else {
      console.error(`[tenet] 플러그인 설치 실패: ${result.error}`);
      process.exit(1);
    }
    return;
  }

  if (args[0] === 'uninstall') {
    const { handleUninstall } = await import('./core/uninstall.js');
    await handleUninstall(process.cwd(), { force: args.includes('--force') });
    return;
  }

  if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  // 기본 동작: 하네스 적용된 Claude Code 실행
  try {
    // 최초 실행 감지: ~/.compound/ 없으면 웰컴 메시지 출력
    const firstRun = isFirstRun();
    if (firstRun) {
      console.log('\n  Tenet — 환경을 처음 설정합니다.\n');
      console.log('  ~/.compound/ 디렉토리와 기본 철학을 생성합니다.');
      console.log('  이후 `tenet setup`으로 추가 설정을 완료할 수 있습니다.\n');
    }

    const context = await prepareHarness(process.cwd());

    if (firstRun) {
      console.log('  [완료] 초기 설정이 완료되었습니다.\n');
    }

    console.log(`[tenet] Philosophy: ${context.philosophy.name}`);
    console.log(`[tenet] Scope: ${context.scope.summary}`);
    if (context.scope.team) {
      console.log(`[tenet] Pack: ${context.scope.team.name} v${context.scope.team.version}`);
    }
    if (context.modelRouting) {
      const rt = context.modelRouting;
      const parts = Object.entries(rt)
        .filter(([, v]) => (v as string[]).length > 0)
        .map(([k, v]) => `${k}:${(v as string[]).length}`);
      console.log(`[tenet] Routing: ${parts.join(' | ')}`);
    }
    console.log('[tenet] Starting Claude Code...\n');

    await spawnClaude(args, context);
  } catch (err) {
    console.error('[tenet] Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
  Tenet v0.2.0
  Philosophy-driven Claude Code harness

  Usage:
    tenet                          Start Claude Code with harness
    tenet "prompt"                 Start with a prompt
    tenet --resume                 Resume previous session

  Modes:
    tenet --autopilot (-a)         5단계 자율 실행 파이프라인
    tenet --ralph (-r)             PRD 기반 완료 보장 + verify/fix loop
    tenet --team (-t)              전문 에이전트 단계별 파이프라인
    tenet --ultrawork (-u)         최대 병렬성 버스트
    tenet --pipeline (-p)          순차 단계별 처리
    tenet --ccg                    Claude-Codex-Gemini 3모델 합성
    tenet --ralplan                합의 기반 설계 (Planner→Architect→Critic)
    tenet --deep-interview         Socratic 요구사항 명확화

  Magic Keywords (프롬프트 내):
    autopilot <task>            autopilot 모드 활성화
    ralph <task>                ralph 모드 활성화
    ulw/ultrawork <task>        ultrawork 모드 활성화
    ralplan <task>              합의 계획 모드 활성화
    deep-interview <task>       딥 인터뷰 모드 활성화
    ultrathink                  확장 추론 모드
    deepsearch                  코드베이스 심층 탐색
    tdd                         TDD 모드
    canceltenet                    모든 모드 중단

  Commands:
    tenet setup                    Initial setup (global)
    tenet setup --project          Project-specific philosophy setup
    tenet philosophy <show|edit>   Manage philosophy
    tenet pack <install|sync|list> Manage packs
    tenet pick <src> --from <pack> Cherry-pick to Me
    tenet propose <src> --to <pack> Propose to team
    tenet compound                 Compound loop (인사이트 축적)
    tenet ask "question"           멀티 프로바이더 질문 (--compare, --fallback)
    tenet providers                프로바이더 관리 (enable/disable/model/auth)
    tenet wait <minutes>           Rate limit 대기 + 알림
    tenet notify "message"         알림 전송 (Discord/Telegram/Slack)
    tenet notify config <channel>  외부 알림 설정
    tenet install --plugin          Install as .claude-plugin format
    tenet scan                     프로젝트 구조 스캔 + 맵 생성
    tenet scan --constraints       아키텍처 제약 검사
    tenet scan --init-constraints  기본 constraints.json 생성
    tenet scan --md                Markdown 맵 출력
    tenet verify                   자동 검증 루프 (빌드+테스트+제약)
    tenet verify --review          변경 파일 리뷰 루프
    tenet verify --gardening       지식 유지보수 루프
    tenet verify --all             세 루프 모두 실행
    tenet stats [--week]           Session statistics
    tenet doctor                   Diagnostics
    tenet uninstall [--force]      Remove CH from settings/agents/CLAUDE.md
    tenet help                     This help

  Agents (16종, 자동 설치):
    executor, architect, critic, planner, analyst, debugger,
    designer, security-reviewer, code-reviewer, test-engineer,
    writer, qa-tester, verifier, explore, refactoring-expert,
    performance-reviewer

  TUI (inside tmux):
    Ctrl+B → D                  Toggle dashboard panel
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
