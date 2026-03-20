import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_SOLUTIONS, ME_RULES, PACKS_DIR } from '../core/paths.js';
import { resolveScope } from '../core/scope-resolver.js';

export interface CompoundInsight {
  id: string;
  type: 'solution' | 'rule' | 'convention' | 'pattern';
  title: string;
  content: string;
  scope: 'me' | 'team';
  /** 자동 분류: personal (개인 스타일) vs team (공통 패턴) */
  classification: 'personal' | 'team';
  /** 분류 근거 */
  reason: string;
  source: 'session' | 'manual';
}

/** 키워드 기반으로 인사이트를 개인/팀으로 자동 분류 */
export function classifyInsight(title: string, content: string): { classification: 'personal' | 'team'; reason: string } {
  const teamKeywords = [
    'API', 'DB', 'database', 'migration', 'schema', 'deploy', 'CI', 'CD',
    'security', 'auth', 'permission', 'error handling', 'logging', 'monitoring',
    'convention', 'standard', 'guideline', 'rule', 'pattern', 'architecture',
    'naming', 'structure', 'review', 'test strategy', 'documentation',
    '에러 처리', '네이밍', '규칙', '규약', '표준', '패턴', '보안', '인증',
    '배포', '마이그레이션', '아키텍처', '로깅', '모니터링', '구조',
  ];

  const personalKeywords = [
    'shortcut', 'preference', 'my style', 'editor', 'workflow tip',
    'vim', 'vscode', 'alias', 'snippet', 'dotfile',
    '단축키', '내 스타일', '편의', '습관',
  ];

  const text = `${title} ${content}`.toLowerCase();
  const teamScore = teamKeywords.filter(kw => text.includes(kw.toLowerCase())).length;
  const personalScore = personalKeywords.filter(kw => text.includes(kw.toLowerCase())).length;

  if (teamScore > personalScore) {
    return { classification: 'team', reason: `team pattern (${teamScore} keyword matches)` };
  }
  if (personalScore > teamScore) {
    return { classification: 'personal', reason: `personal style (${personalScore} keyword matches)` };
  }
  return { classification: 'personal', reason: 'default (personal)' };
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
        skipped.push(`${insight.title}: cannot determine save path`);
        continue;
      }

      // 중복 체크
      if (fs.existsSync(destPath)) {
        skipped.push(`${insight.title}: already exists`);
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
  const fileName = `${slugify(insight.title)}.md`;

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
    `> Classification: ${insight.classification}`,
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

/** 팀 제안으로 저장 (.compound/proposals/) */
export function saveTeamProposals(insights: CompoundInsight[], cwd: string): void {
  const proposalsDir = path.join(cwd, '.compound', 'proposals');
  fs.mkdirSync(proposalsDir, { recursive: true });

  const date = new Date().toISOString().split('T')[0];
  const filename = `${date}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(proposalsDir, filename),
    JSON.stringify(insights, null, 2),
  );
}

/** .compound/proposals/ 에서 제안 파일 로드 */
export function loadProposals(proposalsDir: string): CompoundInsight[] {
  if (!fs.existsSync(proposalsDir)) return [];

  const files = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.json'));
  const all: CompoundInsight[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(proposalsDir, file), 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        all.push(...parsed);
      }
    } catch {
      // skip malformed files
    }
  }

  return all;
}

/** 제안 파일 정리 */
export function cleanProposals(proposalsDir: string): void {
  if (!fs.existsSync(proposalsDir)) return;

  const files = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    fs.unlinkSync(path.join(proposalsDir, file));
  }
}

/** CLI 핸들러: tenetx compound */
export async function handleCompound(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const scope = resolveScope(cwd);

  // --help 처리
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  Usage: tenetx compound [options]

  Running without options enters interactive mode to collect insights.

  Manual add:
    tenetx compound --solution "title" "content"
    tenetx compound --rule "title" "content"
    tenetx compound --convention "title" "content"
    tenetx compound --to team        Save to team scope
`);
    return;
  }

  // 인자가 없거나 알 수 없는 플래그만 있으면 대화형 모드
  const knownFlags = ['--solution', '--rule', '--convention', '--pattern', '--to'];
  const hasTypeFlag = knownFlags.some(f => args.includes(f));

  if (args.length === 0 || !hasTypeFlag) {
    await interactiveCompound(cwd, scope);
    return;
  }

  console.log('\n  Compound Loop — Accumulating insights\n');
  console.log(`  Scope: ${scope.summary}`);
  console.log();

  // 수동 인사이트 추가
  const type = args.includes('--solution') ? 'solution' as const
    : args.includes('--rule') ? 'rule' as const
    : args.includes('--convention') ? 'convention' as const
    : 'pattern' as const;

  const scopeTarget = args.includes('--to')
    ? (args[args.indexOf('--to') + 1] === 'team' ? 'team' as const : 'me' as const)
    : 'me' as const;

  // --solution/--rule 다음 인자들이 제목과 내용 (-- 접두사 인자 필터)
  const typeFlag = `--${type}`;
  const flagIdx = args.indexOf(typeFlag);
  const positionalArgs = args.slice(flagIdx + 1).filter(a => !a.startsWith('--'));
  const title = positionalArgs[0];
  const content = positionalArgs.slice(1).join(' ');

  if (!title) {
    console.log('  A title is required.');
    console.log('  Usage: tenetx compound --solution "title" "content"');
    return;
  }

  const { classification, reason } = classifyInsight(title, content || title);

  const insight: CompoundInsight = {
    id: `c-${Date.now()}`,
    type,
    title,
    content: content || title,
    scope: scopeTarget,
    classification,
    reason,
    source: 'manual',
  };

  const result = await runCompoundLoop(cwd, [insight]);

  for (const s of result.saved) {
    console.log(`  ✓ Saved: ${s}`);
  }
  for (const s of result.skipped) {
    console.log(`  ─ Skipped: ${s}`);
  }
  console.log();
}

async function interactiveCompound(cwd: string, scope: ReturnType<typeof resolveScope>): Promise<void> {
  console.log("\n  Tenetx Compound — Today's insights\n");
  console.log(`  Scope: ${scope.summary}`);
  console.log();

  // Non-interactive mode: 대화 없이 안내만 출력
  if (!process.stdin.isTTY) {
    console.log('  Non-interactive environment. Add insights via manual mode.\n');
    console.log('  Usage:');
    console.log('    tenetx compound --solution "title" "content"');
    console.log('    tenetx compound --rule "title" "content"');
    console.log('    tenetx compound --convention "title" "content"');
    console.log('    tenetx compound --to team          Save to team scope\n');
    console.log('  Interactive mode: run tenetx compound in a TTY environment\n');
    return;
  }

  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

  const insights: CompoundInsight[] = [];

  console.log('  Enter insights. Press enter on empty line to finish.\n');

  let idx = 1;
  while (true) {
    const title = await prompt(`  [${idx}] Title (empty=quit): `);
    if (!title.trim()) break;

    const content = await prompt('      Content: ');
    const typeChoiceStr = await prompt('      Type (1=solution 2=rule 3=convention 4=pattern) [1]: ');
    const typeMap = { '1': 'solution', '2': 'rule', '3': 'convention', '4': 'pattern' } as const;
    const insightType = typeMap[typeChoiceStr.trim() as keyof typeof typeMap] ?? 'solution';
    const { classification, reason } = classifyInsight(title, content);

    const insight: CompoundInsight = {
      id: `c-${Date.now()}-${idx}`,
      type: insightType,
      title: title.trim(),
      content: content.trim(),
      classification,
      reason,
      scope: classification === 'team' ? 'team' : 'me',
      source: 'manual',
    };
    insights.push(insight);

    const icon = classification === 'team' ? '👥' : '👤';
    console.log(`      → ${icon} ${classification} (${reason})\n`);
    idx++;
  }

  if (insights.length === 0) {
    console.log('  No insights.\n');
    rl.close();
    return;
  }

  // Show summary and let user adjust
  console.log('\n  ── Classification results ──\n');
  for (let i = 0; i < insights.length; i++) {
    const ins = insights[i];
    const icon = ins.classification === 'team' ? '👥 Team' : '👤 Personal';
    console.log(`  ${i + 1}. [${icon}] ${ins.title}`);
  }

  console.log('\n  Enter number to toggle classification (e.g. 2=team→personal), enter to confirm');
  const changes = await prompt('  > ');
  if (changes.trim()) {
    for (const num of changes.split(/[,\s]+/)) {
      const changeIdx = parseInt(num, 10) - 1;
      if (changeIdx >= 0 && changeIdx < insights.length) {
        insights[changeIdx].classification = insights[changeIdx].classification === 'team' ? 'personal' : 'team';
        insights[changeIdx].scope = insights[changeIdx].classification === 'team' ? 'team' : 'me';
      }
    }
  }

  // Save — runCompoundLoop을 통해 타입별 올바른 경로에 저장
  const personal = insights.filter(i => i.classification === 'personal');
  const team = insights.filter(i => i.classification === 'team');

  if (personal.length > 0) {
    const result = await runCompoundLoop(cwd, personal);
    for (const s of result.saved) console.log(`\n  ✓ Saved: ${s}`);
    for (const s of result.skipped) console.log(`  ─ Skipped: ${s}`);
  }

  // Save team to .compound/proposals/ (for later propose)
  if (team.length > 0) {
    saveTeamProposals(team, cwd);
    console.log(`  ✓ ${team.length} team rule candidate(s) saved (.compound/proposals/)`);
    console.log('  → Run tenetx propose to share with the team.\n');
  }

  rl.close();
}

