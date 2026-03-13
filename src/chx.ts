#!/usr/bin/env node

/**
 * tenetx — tenet --dangerously-skip-permissions 의 단축 명령
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
  // chx는 서브커맨드 없이 바로 Claude Code 실행 전용
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
