/**
 * tenetx rules — 개인/팀 규칙 뷰어
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_RULES, PACKS_DIR } from './paths.js';
import { loadPackConfigs } from './pack-config.js';

const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

function listMdFiles(dir: string): { name: string; firstLine: string }[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8').trim();
      const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('---'))?.replace(/^#+\s*/, '').trim() ?? f;
      return { name: f.replace('.md', ''), firstLine };
    });
}

export async function handleRules(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const sub = args[0];

  console.log(`\n  ${BOLD}Tenetx — 규칙 뷰어${RST}\n`);

  // 개인 규칙
  const personalRules = listMdFiles(ME_RULES);
  console.log(`  ${CYAN}개인 규칙${RST} (${personalRules.length}건) — ~/.compound/me/rules/`);
  if (personalRules.length === 0) {
    console.log(`  ${DIM}없음. tenetx compound 로 추출하세요.${RST}`);
  } else {
    for (const r of personalRules) {
      console.log(`    • ${r.firstLine}`);
    }
  }

  // 팀 규칙 (pack 연결 시)
  const packs = loadPackConfigs(cwd);
  console.log();

  if (packs.length === 0) {
    console.log(`  ${DIM}팀 규칙: 팩 미연결 (tenetx init --team 으로 설정)${RST}`);
  } else {
    for (const pack of packs) {
      if (pack.type === 'inline') {
        const teamRules = listMdFiles(path.join(cwd, '.compound', 'rules'));
        console.log(`  ${YELLOW}팀 규칙${RST} (${teamRules.length}건) — .compound/rules/ (inline:${pack.name})`);
        if (teamRules.length === 0) {
          console.log(`  ${DIM}없음. tenetx compound → tenetx propose 로 추가하세요.${RST}`);
        } else {
          for (const r of teamRules) {
            console.log(`    • ${r.firstLine}`);
          }
        }
      } else if (pack.type === 'github') {
        // 팩별 네임스페이스 디렉토리 우선, 폴백으로 PACKS_DIR
        const nsDir = path.join(cwd, '.compound', 'packs', pack.name, 'rules');
        const legacyDir = path.join(PACKS_DIR, pack.name, 'rules');
        const rulesDir = fs.existsSync(nsDir) ? nsDir : legacyDir;
        const packRules = listMdFiles(rulesDir);
        console.log(`  ${YELLOW}팩 규칙${RST} (${packRules.length}건) — pack:${pack.name}`);
        if (packRules.length === 0) {
          console.log(`  ${DIM}tenetx pack sync 후 확인하세요.${RST}`);
        } else {
          for (const r of packRules) {
            console.log(`    • ${r.firstLine}`);
          }
        }
      }
      console.log();
    }
  }

  // 상세 보기
  if (sub === 'show' && args[1]) {
    const target = args[1];
    const personalPath = path.join(ME_RULES, `${target}.md`);
    const teamPath = path.join(cwd, '.compound', 'rules', `${target}.md`);
    const filePath = fs.existsSync(personalPath) ? personalPath : fs.existsSync(teamPath) ? teamPath : null;
    if (filePath) {
      console.log(`\n  ── ${target} ──\n`);
      console.log(fs.readFileSync(filePath, 'utf-8'));
    } else {
      console.log(`\n  ${DIM}"${target}" 규칙을 찾을 수 없습니다.${RST}`);
    }
  }

  console.log();
}
