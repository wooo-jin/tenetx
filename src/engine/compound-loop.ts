import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_SOLUTIONS, ME_RULES, PACKS_DIR } from '../core/paths.js';
import { resolveScope } from '../core/scope-resolver.js';

export interface CompoundInsight {
  type: 'solution' | 'rule' | 'convention' | 'pattern';
  title: string;
  content: string;
  scope: 'me' | 'team';
}

/**
 * Compound Loop — 작업 후 인사이트를 추출하고 축적
 *
 * 흐름:
 * 1. 세션 요약에서 패턴/솔루션/규칙 추출
 * 2. 스코프 분류 (개인 vs 팀)
 * 3. 적절한 위치에 저장
 * 4. 팩 버전 bump (팀 스코프인 경우)
 */
export async function runCompoundLoop(cwd: string, insights: CompoundInsight[]): Promise<{ saved: string[]; skipped: string[] }> {
  const saved: string[] = [];
  const skipped: string[] = [];
  const scope = resolveScope(cwd);

  for (const insight of insights) {
    try {
      const destPath = getDestPath(insight, scope.team?.name);
      if (!destPath) {
        skipped.push(`${insight.title}: 저장 경로를 결정할 수 없음`);
        continue;
      }

      // 중복 체크
      if (fs.existsSync(destPath)) {
        skipped.push(`${insight.title}: 이미 존재`);
        continue;
      }

      // 디렉토리 생성
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // 파일 저장
      const fileContent = formatInsight(insight);
      fs.writeFileSync(destPath, fileContent);
      saved.push(`${insight.scope}/${insight.type}: ${insight.title}`);
    } catch (err) {
      skipped.push(`${insight.title}: ${(err as Error).message}`);
    }
  }

  return { saved, skipped };
}

function getDestPath(insight: CompoundInsight, teamPackName?: string): string | null {
  const fileName = slugify(insight.title) + '.md';

  if (insight.scope === 'me') {
    const dir = insight.type === 'rule' || insight.type === 'convention'
      ? ME_RULES
      : ME_SOLUTIONS;
    return path.join(dir, fileName);
  }

  if (insight.scope === 'team' && teamPackName) {
    const packDir = path.join(PACKS_DIR, teamPackName);
    const dir = insight.type === 'rule' || insight.type === 'convention'
      ? path.join(packDir, 'rules')
      : path.join(packDir, 'solutions');
    return path.join(dir, fileName);
  }

  // 팀 팩이 없으면 개인으로 폴백
  const dir = insight.type === 'rule' || insight.type === 'convention'
    ? ME_RULES
    : ME_SOLUTIONS;
  return path.join(dir, fileName);
}

function formatInsight(insight: CompoundInsight): string {
  const lines: string[] = [
    `# ${insight.title}`,
    '',
    `> Type: ${insight.type}`,
    `> Scope: ${insight.scope}`,
    `> Created: ${new Date().toISOString().split('T')[0]}`,
    '',
    insight.content,
    '',
  ];
  return lines.join('\n');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

/** CLI 핸들러: tenet compound */
export async function handleCompound(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const scope = resolveScope(cwd);

  console.log('\n  Compound Loop — 인사이트 축적\n');
  console.log(`  Scope: ${scope.summary}`);
  console.log();

  if (args.length === 0) {
    console.log('  이 명령은 세션 종료 후 자동으로 실행되거나,');
    console.log('  수동으로 인사이트를 추가할 수 있습니다.\n');
    console.log('  사용법:');
    console.log('    tenet compound --solution "제목" "내용"');
    console.log('    tenet compound --rule "제목" "내용"');
    console.log('    tenet compound --to me|team\n');

    // 현재 축적 현황
    const meSolutions = countMd(ME_SOLUTIONS);
    const meRules = countMd(ME_RULES);
    console.log('  현재 축적:');
    console.log(`    Me: 솔루션 ${meSolutions}, 규칙 ${meRules}`);

    if (scope.team) {
      const teamSol = countMd(path.join(PACKS_DIR, scope.team.name, 'solutions'));
      const teamRul = countMd(path.join(PACKS_DIR, scope.team.name, 'rules'));
      console.log(`    Team/${scope.team.name}: 솔루션 ${teamSol}, 규칙 ${teamRul}`);
    }
    console.log();
    return;
  }

  // 수동 인사이트 추가
  const type = args.includes('--solution') ? 'solution' as const
    : args.includes('--rule') ? 'rule' as const
    : args.includes('--convention') ? 'convention' as const
    : 'pattern' as const;

  const scopeTarget = args.includes('--to')
    ? (args[args.indexOf('--to') + 1] === 'team' ? 'team' as const : 'me' as const)
    : 'me' as const;

  // --solution/--rule 다음 인자들이 제목과 내용
  const typeFlag = `--${type}`;
  const flagIdx = args.indexOf(typeFlag);
  const title = args[flagIdx + 1];
  const content = args.slice(flagIdx + 2).filter(a => !a.startsWith('--')).join(' ');

  if (!title) {
    console.log('  제목이 필요합니다.');
    return;
  }

  const insight: CompoundInsight = {
    type,
    title,
    content: content || title,
    scope: scopeTarget,
  };

  const result = await runCompoundLoop(cwd, [insight]);

  for (const s of result.saved) {
    console.log(`  ✓ 저장: ${s}`);
  }
  for (const s of result.skipped) {
    console.log(`  ─ 건너뜀: ${s}`);
  }
  console.log();
}

function countMd(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length; } catch { return 0; }
}
