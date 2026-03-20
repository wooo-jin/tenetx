/**
 * tenetx proposals — 대기 중인 팀 규칙 제안 목록
 *
 * pack.json의 type에 따라:
 * - github: gh pr list로 열린 compound PR 표시
 * - inline: .compound/proposals/ 파일 표시
 * - 없음: 안내 메시지
 */

import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadPackConfigs } from './pack-config.js';
import { loadProposals } from '../engine/compound-loop.js';

const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

export async function handleProposals(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const packs = loadPackConfigs(cwd);

  console.log(`\n  ${BOLD}Tenetx — Team Rule Proposals${RST}\n`);

  if (packs.length === 0) {
    // 개인 모드: 로컬 proposals만 확인
    const proposalsDir = path.join(cwd, '.compound', 'proposals');
    const proposals = loadProposals(proposalsDir);
    if (proposals.length === 0) {
      console.log('  No pending proposals.');
      console.log(`  ${DIM}Extract insights with tenetx compound.${RST}\n`);
    } else {
      console.log(`  Local proposals: ${proposals.length} (no team connected)\n`);
      for (const p of proposals) {
        console.log(`  • ${p.title}`);
        if (p.content) console.log(`    ${DIM}${p.content.slice(0, 80)}${RST}`);
      }
      console.log(`\n  ${DIM}Connect team: tenetx init --team${RST}\n`);
    }
    return;
  }

  // 연결된 팩별로 proposals 표시
  for (const pack of packs) {
    if (pack.type === 'github' && pack.repo) {
      console.log(`  Pack: ${CYAN}${pack.name}${RST} (${pack.repo})\n`);
      try {
        const result = execFileSync('gh', [
          'pr', 'list',
          '--repo', pack.repo,
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
          console.log('  No pending proposal PRs.');
          console.log(`  ${DIM}Propose with tenetx compound → tenetx propose.${RST}\n`);
        } else {
          console.log(`  Pending proposals: ${YELLOW}${prs.length}${RST}\n`);
          for (const pr of prs) {
            const date = pr.createdAt.split('T')[0];
            console.log(`  ${GREEN}#${pr.number}${RST} ${pr.title}`);
            console.log(`    ${DIM}by ${pr.author.login} · ${date}${RST}`);
            console.log(`    ${DIM}${pr.url}${RST}`);
            console.log();
          }
        }
      } catch {
        console.log(`  ${YELLOW}Failed to fetch GitHub PRs${RST}`);
        console.log(`  ${DIM}Check authentication with gh auth login.${RST}`);
        console.log(`  ${DIM}Or run: gh pr list --repo ${pack.repo}${RST}\n`);
      }
    } else {
      console.log(`  Pack: ${CYAN}${pack.name}${RST} (${pack.type})\n`);
      showLocalProposals(cwd);
    }
  }
}

function showLocalProposals(cwd: string): void {
  const proposalsDir = path.join(cwd, '.compound', 'proposals');
  const proposals = loadProposals(proposalsDir);

  if (proposals.length === 0) {
    console.log('  No pending local proposals.');
    console.log(`  ${DIM}Extract insights with tenetx compound.${RST}\n`);
    return;
  }

  console.log(`  Local proposals: ${YELLOW}${proposals.length}${RST}\n`);
  for (const p of proposals) {
    const icon = p.classification === 'team' ? '👥' : '👤';
    console.log(`  ${icon} ${BOLD}${p.title}${RST}`);
    if (p.content) console.log(`    ${DIM}${p.content.slice(0, 80)}${RST}`);
  }
  console.log(`\n  ${DIM}Propose to team with tenetx propose.${RST}\n`);
}
