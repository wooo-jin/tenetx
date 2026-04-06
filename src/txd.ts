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
  // Security warning — txd bypasses all Claude Code permission checks
  console.warn('\n  ⚠  txd: ALL permission checks are disabled (--dangerously-skip-permissions)');
  console.warn('  ⚠  Claude Code will execute tools without asking for confirmation.');
  console.warn('  ⚠  Use only in trusted environments.\n');

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

  const v1 = context.v1;
  console.log(`[tenetx] Profile: ${v1.session ? `${v1.session.quality_pack}/${v1.session.autonomy_pack}` : 'onboarding needed'}`);
  if (v1.session) {
    console.log(`[tenetx] Trust: ${v1.session.effective_trust_policy}`);
  }
  console.log('[tenetx] Mode: dangerously-skip-permissions');
  console.log('[tenetx] Starting Claude Code...\n');

  await spawnClaude(args, context);
}

main().catch((err) => {
  console.error('[tenetx] Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
