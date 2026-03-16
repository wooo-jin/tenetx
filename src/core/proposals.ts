/**
 * tenet proposals — 대기 중인 팀 규칙 제안 목록
 *
 * pack.json의 type에 따라:
 * - github: gh pr list로 열린 compound PR 표시
 * - inline: .compound/proposals/ 파일 표시
 * - 없음: 안내 메시지
 */

import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadPackConfig } from './pack-config.js';
import { loadProposals } from '../engine/compound-loop.js';

const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

export async function handleProposals(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const packConfig = loadPackConfig(cwd);

  console.log(`\n  ${BOLD}Tenet — 팀 규칙 제안${RST}\n`);

  if (!packConfig) {
    // 개인 모드: 로컬 proposals만 확인
    const proposalsDir = path.join(cwd, '.compound', 'proposals');
    const proposals = loadProposals(proposalsDir);
    if (proposals.length === 0) {
      console.log('  대기 중인 제안이 없습니다.');
      console.log(`  ${DIM}tenet compound 로 인사이트를 추출하세요.${RST}\n`);
    } else {
      console.log(`  로컬 제안 ${proposals.length}건 (팀 미연결)\n`);
      for (const p of proposals) {
        console.log(`  • ${p.title}`);
        if (p.content) console.log(`    ${DIM}${p.content.slice(0, 80)}${RST}`);
      }
      console.log(`\n  ${DIM}팀 연결: tenet init --team${RST}\n`);
    }
    return;
  }

  if (packConfig.type === 'github' && packConfig.repo) {
    // GitHub PR 목록
    console.log(`  팩: ${CYAN}${packConfig.repo}${RST}\n`);
    try {
      const result = execFileSync('gh', [
        'pr', 'list',
        '--repo', packConfig.repo,
        '--search', 'compound in:title',
        '--json', 'number,title,author,createdAt,url',
      ], { encoding: 'utf-8', timeout: 10000 });

      const prs = JSON.parse(result) as Array<{
        number: number;
        title: string;
        author: { login: string };
        createdAt: string;
        url: string;
      }>;

      if (prs.length === 0) {
        console.log('  대기 중인 제안 PR이 없습니다.');
        console.log(`  ${DIM}tenet compound → tenet propose 로 제안하세요.${RST}\n`);
      } else {
        console.log(`  대기 중인 제안 ${YELLOW}${prs.length}${RST}건:\n`);
        for (const pr of prs) {
          const date = pr.createdAt.split('T')[0];
          console.log(`  ${GREEN}#${pr.number}${RST} ${pr.title}`);
          console.log(`    ${DIM}by ${pr.author.login} · ${date}${RST}`);
          console.log(`    ${DIM}${pr.url}${RST}`);
          console.log();
        }
      }
    } catch (e) {
      console.log(`  ${YELLOW}GitHub PR 조회 실패${RST}`);
      console.log(`  ${DIM}gh auth login 으로 인증을 확인하세요.${RST}`);
      console.log(`  ${DIM}또는: gh pr list --repo ${packConfig.repo}${RST}\n`);

      // 로컬 proposals fallback
      showLocalProposals(cwd);
    }
  } else {
    // inline 또는 local
    showLocalProposals(cwd);
  }
}

function showLocalProposals(cwd: string): void {
  const proposalsDir = path.join(cwd, '.compound', 'proposals');
  const proposals = loadProposals(proposalsDir);

  if (proposals.length === 0) {
    console.log('  대기 중인 로컬 제안이 없습니다.');
    console.log(`  ${DIM}tenet compound 로 인사이트를 추출하세요.${RST}\n`);
    return;
  }

  console.log(`  로컬 제안 ${YELLOW}${proposals.length}${RST}건:\n`);
  for (const p of proposals) {
    const icon = p.classification === 'team' ? '👥' : '👤';
    console.log(`  ${icon} ${BOLD}${p.title}${RST}`);
    if (p.content) console.log(`    ${DIM}${p.content.slice(0, 80)}${RST}`);
  }
  console.log(`\n  ${DIM}tenet propose 로 팀에 제안하세요.${RST}\n`);
}
