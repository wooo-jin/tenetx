/**
 * tenetx init — v1 프로젝트 초기화
 *
 * 온보딩 기반 프로필 생성 + v1 디렉토리 구조 초기화.
 * philosophy/pack 시스템은 v1에서 제거됨.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { profileExists } from '../store/profile-store.js';
import { ensureV1Directories } from './v1-bootstrap.js';

// ── CLI 핸들러 ──

export async function handleInit(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const projectName = path.basename(cwd);

  console.log(`\n  Tenetx Init — ${projectName}\n`);

  // v1 디렉토리 생성
  ensureV1Directories();

  // 프로젝트 .claude/rules 디렉토리 생성
  const rulesDir = path.join(cwd, '.claude', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });

  // 프로필 존재 확인
  if (profileExists()) {
    console.log('  Profile already exists. Your personalization is active.');
    console.log('  Run `tenetx inspect profile` to view your current settings.');
    console.log('  Run `tenetx forge --reset` to re-onboard.\n');
    return;
  }

  console.log('  No profile found. Starting onboarding...\n');

  // 온보딩 실행
  const { runOnboarding } = await import('../forge/onboarding-cli.js');
  await runOnboarding();

  console.log('  Init complete!');
  console.log('  Next steps:');
  console.log('    tenetx                     Start Claude Code with personalization');
  console.log('    tenetx inspect profile     View your profile');
  console.log('    tenetx doctor              Check system health\n');
}
