import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_SOLUTIONS, ME_RULES } from '../core/paths.js';
import { resolveScope } from '../core/scope-resolver.js';
import { serializeSolutionV3, extractTags, DEFAULT_EVIDENCE, slugify } from './solution-format.js';
import type { SolutionV3, SolutionType } from './solution-format.js';

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
 * Compound Loop — 이미 추출된 인사이트를 저장
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

function getDestPath(insight: CompoundInsight, _teamPackName?: string): string | null {
  const fileName = `${slugify(insight.title)}.md`;

  if (insight.scope === 'me') {
    const dir = insight.type === 'rule' || insight.type === 'convention'
      ? ME_RULES
      : ME_SOLUTIONS;
    return path.join(dir, fileName);
  }

  // v1: 팀 scope 제거 — 모든 인사이트를 개인으로 저장
  const dir = insight.type === 'rule' || insight.type === 'convention'
    ? ME_RULES
    : ME_SOLUTIONS;
  return path.join(dir, fileName);
}

/** Map v1 CompoundInsight type to v3 SolutionType */
function mapInsightType(type: CompoundInsight['type']): SolutionType {
  switch (type) {
    case 'solution': return 'pattern';
    case 'pattern': return 'pattern';
    case 'rule': return 'decision';
    case 'convention': return 'decision';
    default: return 'pattern';
  }
}

/** Infer identifiers from title and content for Code Reflection matching */
function inferIdentifiers(title: string, content: string): string[] {
  const text = `${title} ${content}`;
  // Extract PascalCase words (likely class/component names)
  const pascalCase = text.match(/\b[A-Z][a-zA-Z0-9]{3,}\b/g) ?? [];
  // Extract camelCase words starting with lowercase (likely function names)
  const camelCase = text.match(/\b[a-z][a-zA-Z0-9]{3,}(?=[A-Z])\w*/g) ?? [];
  // Extract quoted strings that look like identifiers
  const quoted = text.match(/['"`]([a-zA-Z][a-zA-Z0-9-]{3,})['"`]/g)?.map(s => s.slice(1, -1)) ?? [];

  const all = [...new Set([...pascalCase, ...camelCase, ...quoted])]
    .filter(id => id.length >= 4 && id.length <= 50);

  return all.slice(0, 10); // max 10 identifiers
}

function formatInsight(insight: CompoundInsight): string {
  const today = new Date().toISOString().split('T')[0];
  const solution: SolutionV3 = {
    frontmatter: {
      name: slugify(insight.title),
      version: 1,
      status: 'candidate',
      confidence: 0.5,
      type: mapInsightType(insight.type),
      scope: insight.scope as 'me' | 'team' | 'project',
      tags: extractTags(`${insight.title} ${insight.content}`),
      identifiers: inferIdentifiers(insight.title, insight.content),
      evidence: { ...DEFAULT_EVIDENCE },
      created: today,
      updated: today,
      supersedes: null,
      extractedBy: insight.source === 'manual' ? 'manual' : 'auto',
    },
    context: '',
    content: insight.content,
  };
  return serializeSolutionV3(solution);
}

// slugify is imported from solution-format.ts (single source of truth)

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

  Default:
    tenetx compound             Preview auto analysis from recent session/code changes
    tenetx compound --save      Persist previewed insights

  Manual add:
    tenetx compound --solution "title" "content"
    tenetx compound --rule "title" "content"
    tenetx compound --convention "title" "content"
    tenetx compound --to team        Save to team scope

  Inspect & manage:
    tenetx compound list             List saved entries (solutions and rules)
    tenetx compound inspect <name>   Show saved entry details
    tenetx compound remove <name>    Remove a saved entry
    tenetx compound rollback --since 2026-03-20
                                     Rollback unused auto-extracted solutions since date

  Lifecycle:
    tenetx compound --lifecycle      Run promotion/demotion/circuit-breaker check
    tenetx compound --verify <name>  Manually promote solution to verified

  Auto-extraction:
    tenetx compound --pause-auto     Pause auto-extraction
    tenetx compound --resume-auto    Resume auto-extraction

  Interactive:
    tenetx compound interactive
`);
    return;
  }

  // --pause-auto / --resume-auto
  if (args.includes('--pause-auto') || args.includes('pause-auto')) {
    const { pauseExtraction } = await import('./compound-extractor.js');
    pauseExtraction();
    console.log('  자동 추출이 중단되었습니다. resume-auto로 재개할 수 있습니다.\n');
    return;
  }

  if (args.includes('--resume-auto') || args.includes('resume-auto')) {
    const { resumeExtraction } = await import('./compound-extractor.js');
    resumeExtraction();
    console.log('  자동 추출이 재개되었습니다.\n');
    return;
  }

  // --- lifecycle command ---
  if (args.includes('--lifecycle') || args.includes('lifecycle')) {
    const { runLifecycleCheck } = await import('./compound-lifecycle.js');
    const result = runLifecycleCheck();
    console.log('\n  Compound Lifecycle Check\n');
    if (result.promoted.length) {
      console.log('  Promoted:');
      for (const p of result.promoted) console.log(`    ↑ ${p}`);
    }
    if (result.demoted.length) {
      console.log('  Demoted:');
      for (const d of result.demoted) console.log(`    ↓ ${d}`);
    }
    if (result.retired.length) {
      console.log('  Retired:');
      for (const r of result.retired) console.log(`    ✗ ${r}`);
    }
    if (result.contradictions.length) {
      console.log('  Contradictions:');
      for (const c of result.contradictions) console.log(`    ⚠ ${c}`);
    }
    if (!result.promoted.length && !result.demoted.length && !result.retired.length && !result.contradictions.length) {
      console.log('  No lifecycle changes needed.\n');
    }
    console.log();
    return;
  }

  // --- verify command ---
  if (args.includes('--verify')) {
    const nameIdx = args.indexOf('--verify') + 1;
    const name = args[nameIdx];
    if (!name || name.startsWith('--')) {
      console.log('  Usage: tenetx compound --verify <solution-name>\n');
      return;
    }
    const { verifySolution } = await import('./compound-lifecycle.js');
    if (verifySolution(name)) {
      console.log(`  ✓ "${name}" verified 상태로 승격됨\n`);
    } else {
      console.log(`  ✗ "${name}" 솔루션을 찾을 수 없거나 업데이트 실패\n`);
    }
    return;
  }

  // --- list command ---
  if (args.includes('list') || args.includes('--list')) {
    const { listSolutions } = await import('./compound-cli.js');
    listSolutions();
    return;
  }

  // --- inspect command ---
  if (args.includes('inspect') || args.includes('--inspect')) {
    const nameIdx = Math.max(args.indexOf('inspect'), args.indexOf('--inspect')) + 1;
    const name = args[nameIdx];
    if (!name || name.startsWith('--')) {
      console.log('  Usage: tenetx compound inspect <solution-name>\n');
      return;
    }
    const { inspectSolution } = await import('./compound-cli.js');
    inspectSolution(name);
    return;
  }

  // --- remove command ---
  if (args.includes('remove') || args.includes('--remove')) {
    const nameIdx = Math.max(args.indexOf('remove'), args.indexOf('--remove')) + 1;
    const name = args[nameIdx];
    if (!name || name.startsWith('--')) {
      console.log('  Usage: tenetx compound remove <solution-name>\n');
      return;
    }
    const { removeSolution } = await import('./compound-cli.js');
    removeSolution(name);
    return;
  }

  // --- retag command ---
  if (args.includes('retag') || args.includes('--retag')) {
    const { retagSolutions } = await import('./compound-cli.js');
    retagSolutions();
    return;
  }

  // --- rollback command ---
  if (args.includes('rollback') || args.includes('--rollback')) {
    const sinceIdx = args.indexOf('--since');
    const since = sinceIdx !== -1 ? args[sinceIdx + 1] : undefined;
    if (!since) {
      console.log('  Usage: tenetx compound rollback --since 2026-03-20\n');
      return;
    }
    const { rollbackSolutions } = await import('./compound-cli.js');
    rollbackSolutions(since);
    return;
  }

  // --- explicit interactive command ---
  if (args.includes('interactive') || args.includes('--interactive')) {
    await interactiveCompound(cwd, scope);
    return;
  }

  // --- preview-first default mode ---
  if (args.length === 0) {
    const { previewExtraction } = await import('./compound-extractor.js');
    const result = await previewExtraction(cwd);

    console.log('\n  Compound Preview\n');
    console.log(`  Scope: ${scope.summary}`);
    console.log();

    if (result.preview.length === 0) {
      console.log(`  No auto-analysis preview available${result.reason ? `: ${result.reason}` : '.'}`);
      console.log('  Run `tenetx compound --save` after meaningful code changes, or `tenetx compound interactive` for manual capture.\n');
      return;
    }

    console.log('  Preview only — nothing was saved.\n');
    for (const [index, insight] of result.preview.entries()) {
      console.log(`  ${index + 1}. [${insight.type}] ${insight.name}`);
      console.log(`     ${insight.content.split('\n')[0]}`);
    }

    if (result.skipped.length > 0) {
      console.log('\n  Skipped:');
      for (const entry of result.skipped.slice(0, 5)) {
        console.log(`    - ${entry}`);
      }
    }

    console.log('\n  Run `tenetx compound --save` to persist this preview.\n');
    return;
  }

  // --- auto save mode ---
  if (args.includes('--save')) {
    const { runExtraction } = await import('./compound-extractor.js');
    const sessionId = `compound-cli-${Date.now()}`;
    const result = await runExtraction(cwd, sessionId);

    console.log('\n  Compound Save\n');
    console.log(`  Scope: ${scope.summary}`);
    console.log();

    if (result.extracted.length === 0 && result.skipped.length === 0) {
      console.log(`  No insights saved${result.reason ? `: ${result.reason}` : '.'}\n`);
      return;
    }

    for (const saved of result.extracted) {
      console.log(`  ✓ Saved: ${saved}`);
    }
    for (const skipped of result.skipped) {
      console.log(`  ─ Skipped: ${skipped}`);
    }
    if (result.reason) {
      console.log(`  Reason: ${result.reason}`);
    }
    console.log();
    return;
  }

  // 인자가 없거나 알 수 없는 플래그만 있으면 수동 추가/interactive가 아닌 것으로 간주
  const knownFlags = [
    '--solution', '--rule', '--convention', '--pattern', '--to', '--pause-auto', '--resume-auto',
    '--lifecycle', '--verify', '--save', '--interactive',
    'list', 'inspect', 'remove', 'rollback', 'retag', 'lifecycle',
    '--list', '--inspect', '--remove', '--rollback', '--retag', '--since', 'interactive',
  ];
  const hasTypeFlag = knownFlags.some(f => args.includes(f));

  if (!hasTypeFlag) {
    console.log('  Unknown compound arguments. Run `tenetx compound --help` for usage.\n');
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
    console.log('  Interactive mode: run `tenetx compound interactive` in a TTY environment\n');
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
