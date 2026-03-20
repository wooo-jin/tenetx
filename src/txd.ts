#!/usr/bin/env node

/**
 * txd — tenetx --dangerously-skip-permissions 의 단축 명령
 * 모든 인자를 그대로 전달하되, --dangerously-skip-permissions 를 자동 주입
 */

const args = process.argv.slice(2);

// 이미 포함되어 있으면 중복 추가하지 않음
if (!args.includes('--dangerously-skip-permissions')) {
  args.unshift('--dangerously-skip-permissions');
}

// cli.ts 의 main 로직을 재사용
import { prepareHarness, isFirstRun } from './core/harness.js';
import { spawnClaude } from './core/spawn.js';

async function main() {
  // txd는 서브커맨드 없이 바로 Claude Code 실행 전용
  const firstRun = isFirstRun();
  if (firstRun) {
    console.log('\n  Tenetx — Setting up for the first time.\n');
    console.log('  Creating ~/.compound/ directory and default philosophy.');
    console.log('  Run `tenetx setup` afterwards to complete additional configuration.\n');
  }

  const context = await prepareHarness(process.cwd());

  if (firstRun) {
    console.log('  [Done] Initial setup complete.\n');
  }

  console.log(`[tenetx] Philosophy: ${context.philosophy.name}`);
  console.log(`[tenetx] Scope: ${context.scope.summary}`);
  if (context.scope.team) {
    console.log(`[tenetx] Pack: ${context.scope.team.name} v${context.scope.team.version}`);
  }
  if (context.modelRouting) {
    const rt = context.modelRouting;
    const parts = Object.entries(rt)
      .filter(([, v]) => (v as string[]).length > 0)
      .map(([k, v]) => `${k}:${(v as string[]).length}`);
    console.log(`[tenetx] Routing: ${parts.join(' | ')}`);
  }
  console.log('[tenetx] Mode: dangerously-skip-permissions');
  console.log('[tenetx] Starting Claude Code...\n');

  await spawnClaude(args, context);
}

main().catch((err) => {
  console.error('[tenetx] Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
