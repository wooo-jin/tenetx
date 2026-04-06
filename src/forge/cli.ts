/**
 * Tenetx Forge — v1 CLI Handler
 *
 * tenetx forge                  v1 onboarding (첫 실행) 또는 profile 요약
 * tenetx forge --profile        현재 v1 profile 표시
 * tenetx forge --export         Profile JSON 출력
 * tenetx forge --reset soft     Soft reset
 * tenetx forge --reset learning Learning reset
 * tenetx forge --reset full     Full reset
 */

import { loadProfile, profileExists } from '../store/profile-store.js';
import { renderProfile } from '../renderer/inspect-renderer.js';
import { runOnboarding } from './onboarding-cli.js';

export async function handleForge(args: string[]): Promise<void> {
  if (args.includes('--profile')) {
    handleShowProfile();
    return;
  }

  if (args.includes('--export')) {
    handleExport();
    return;
  }

  if (args.includes('--reset')) {
    const level = args[args.indexOf('--reset') + 1] ?? 'soft';
    await handleReset(level);
    return;
  }

  // Default: profile이 있으면 보여주고, 없으면 onboarding
  if (profileExists()) {
    handleShowProfile();
  } else {
    await runOnboarding();
  }
}

function handleShowProfile(): void {
  const profile = loadProfile();
  if (!profile) {
    console.log('\n  No v1 profile found. Run `tenetx forge` or `tenetx onboarding`.\n');
    return;
  }
  console.log('\n' + renderProfile(profile) + '\n');
}

function handleExport(): void {
  const profile = loadProfile();
  if (!profile) {
    console.log('{}');
    return;
  }
  console.log(JSON.stringify(profile, null, 2));
}

async function handleReset(level: string): Promise<void> {
  const validLevels = ['soft', 'learning', 'full'];
  if (!validLevels.includes(level)) {
    console.log(`  Invalid reset level: ${level}`);
    console.log(`  Valid levels: ${validLevels.join(', ')}`);
    return;
  }

  // 동적 import로 store 모듈 로드
  const fs = await import('node:fs');
  const { V1_PROFILE, V1_RULES_DIR, V1_EVIDENCE_DIR, V1_RECOMMENDATIONS_DIR, V1_SESSIONS_DIR, V1_RAW_LOGS_DIR, V1_SOLUTIONS_DIR } = await import('../core/paths.js');

  const deleteDirs = (dirs: string[]) => {
    for (const dir of dirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
      } catch { /* ignore */ }
    }
  };

  const deleteFile = (p: string) => {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  };

  if (level === 'soft') {
    deleteFile(V1_PROFILE);
    deleteDirs([V1_RULES_DIR, V1_RECOMMENDATIONS_DIR, V1_SESSIONS_DIR]);
    console.log('\n  Soft reset 완료. Profile + Rule + Recommendation + Session 초기화.');
  } else if (level === 'learning') {
    deleteFile(V1_PROFILE);
    deleteDirs([V1_RULES_DIR, V1_EVIDENCE_DIR, V1_RECOMMENDATIONS_DIR, V1_SESSIONS_DIR, V1_RAW_LOGS_DIR]);
    console.log('\n  Learning reset 완료. 개인 학습 전체 초기화.');
  } else if (level === 'full') {
    deleteFile(V1_PROFILE);
    deleteDirs([V1_RULES_DIR, V1_EVIDENCE_DIR, V1_RECOMMENDATIONS_DIR, V1_SESSIONS_DIR, V1_RAW_LOGS_DIR, V1_SOLUTIONS_DIR]);
    console.log('\n  Full reset 완료. Compound 포함 전체 초기화.');
  }

  // Reset 후 자동 온보딩 (interactive 환경에서만)
  if (process.stdin.isTTY) {
    console.log('  새 프로필을 생성합니다.\n');
    await runOnboarding();
  } else {
    console.log('  tenetx forge 또는 tenetx onboarding 으로 새 프로필을 생성하세요.\n');
  }
}
