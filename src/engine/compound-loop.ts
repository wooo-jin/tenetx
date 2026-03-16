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
    return { classification: 'team', reason: `팀 공통 패턴 (${teamScore}개 키워드 매치)` };
  }
  if (personalScore > teamScore) {
    return { classification: 'personal', reason: `개인 스타일 (${personalScore}개 키워드 매치)` };
  }
  return { classification: 'personal', reason: '기본값 (개인)' };
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

/** 개인 규칙으로 저장 */
function savePersonalRule(insight: CompoundInsight): void {
  fs.mkdirSync(ME_RULES, { recursive: true });
  const filename = `${insight.id}.md`;
  const content = `# ${insight.title}\n\n${insight.content}\n`;
  fs.writeFileSync(path.join(ME_RULES, filename), content);
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

  if (args.length === 0) {
    await interactiveCompound(cwd, scope);
    return;
  }

  console.log('\n  Compound Loop — 인사이트 축적\n');
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

  // --solution/--rule 다음 인자들이 제목과 내용
  const typeFlag = `--${type}`;
  const flagIdx = args.indexOf(typeFlag);
  const title = args[flagIdx + 1];
  const content = args.slice(flagIdx + 2).filter(a => !a.startsWith('--')).join(' ');

  if (!title) {
    console.log('  제목이 필요합니다.');
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
    console.log(`  ✓ 저장: ${s}`);
  }
  for (const s of result.skipped) {
    console.log(`  ─ 건너뜀: ${s}`);
  }
  console.log();
}

async function interactiveCompound(cwd: string, scope: ReturnType<typeof resolveScope>): Promise<void> {
  console.log('\n  Tenetx Compound — 오늘의 인사이트\n');
  console.log(`  Scope: ${scope.summary}`);
  console.log();

  // Non-interactive mode
  if (!process.stdin.isTTY) {
    console.log('  대화형 모드가 필요합니다. TTY 환경에서 실행하세요.');
    console.log('  수동 추가: tenetx compound --solution "제목" "내용"');
    console.log('             tenetx compound --rule "제목" "내용"\n');
    return;
  }

  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

  const insights: CompoundInsight[] = [];

  console.log('  인사이트를 입력하세요. 빈 줄 입력 시 종료.\n');

  let idx = 1;
  while (true) {
    const title = await prompt(`  [${idx}] 제목 (빈 줄=종료): `);
    if (!title.trim()) break;

    const content = await prompt('      내용: ');
    const { classification, reason } = classifyInsight(title, content);

    const insight: CompoundInsight = {
      id: `c-${Date.now()}-${idx}`,
      type: 'pattern',
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
    console.log('  인사이트 없음.\n');
    rl.close();
    return;
  }

  // Show summary and let user adjust
  console.log('\n  ── 분류 결과 ──\n');
  for (let i = 0; i < insights.length; i++) {
    const ins = insights[i];
    const icon = ins.classification === 'team' ? '👥 팀' : '👤 개인';
    console.log(`  ${i + 1}. [${icon}] ${ins.title}`);
  }

  console.log('\n  분류를 변경하려면 번호 입력 (예: 2=팀→개인), 엔터=확정');
  const changes = await prompt('  > ');
  if (changes.trim()) {
    for (const num of changes.split(/[,\s]+/)) {
      const changeIdx = parseInt(num) - 1;
      if (changeIdx >= 0 && changeIdx < insights.length) {
        insights[changeIdx].classification = insights[changeIdx].classification === 'team' ? 'personal' : 'team';
        insights[changeIdx].scope = insights[changeIdx].classification === 'team' ? 'team' : 'me';
      }
    }
  }

  // Save
  const personal = insights.filter(i => i.classification === 'personal');
  const team = insights.filter(i => i.classification === 'team');

  // Save personal to ~/.compound/me/rules/
  for (const ins of personal) {
    savePersonalRule(ins);
  }
  if (personal.length > 0) {
    console.log(`\n  ✓ 개인 규칙 ${personal.length}건 저장`);
  }

  // Save team to .compound/proposals/ (for later propose)
  if (team.length > 0) {
    saveTeamProposals(team, cwd);
    console.log(`  ✓ 팀 규칙 후보 ${team.length}건 저장 (.compound/proposals/)`);
    console.log('  → tenetx propose 로 팀에 제안하세요.\n');
  }

  rl.close();
}

