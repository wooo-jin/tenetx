import * as fs from 'node:fs';
import * as path from 'node:path';
import { PACKS_DIR, ME_SOLUTIONS, ME_RULES } from '../core/paths.js';
import { createLogger } from '../core/logger.js';
import { loadProposals, cleanProposals } from '../engine/compound-loop.js';
import type { CompoundInsight } from '../engine/compound-loop.js';

const log = createLogger('crossover');

/** 솔루션/규칙 파일 찾기 */
function findFile(packName: string, fileName: string): string | null {
  const packDir = path.join(PACKS_DIR, packName);
  if (!fs.existsSync(packDir)) return null;

  // solutions/ 에서 찾기
  const solPath = path.join(packDir, 'solutions', fileName);
  if (fs.existsSync(solPath)) return solPath;

  // .md 확장자 자동 추가
  const solPathMd = solPath.endsWith('.md') ? solPath : `${solPath}.md`;
  if (fs.existsSync(solPathMd)) return solPathMd;

  // rules/ 에서 찾기
  const rulePath = path.join(packDir, 'rules', fileName);
  if (fs.existsSync(rulePath)) return rulePath;

  const rulePathMd = rulePath.endsWith('.md') ? rulePath : `${rulePath}.md`;
  if (fs.existsSync(rulePathMd)) return rulePathMd;

  return null;
}

/** 파일이 솔루션인지 규칙인지 판별 */
function classifyFile(filePath: string): 'solution' | 'rule' {
  return filePath.includes('/rules/') ? 'rule' : 'solution';
}

/**
 * tenetx pick — 팩의 솔루션/규칙을 개인(Me) 영역으로 복사
 * 자유롭게 가져올 수 있음 (리뷰 불필요)
 */
export async function handlePick(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('  Usage: tenetx pick <file> --from <pack>');
    console.log('  Copies a pack solution/rule to your personal (Me) area.\n');
    console.log('  Examples:');
    console.log('    tenetx pick api-error-handling --from emr');
    console.log('    tenetx pick convention-naming.md --from emr\n');
    return;
  }

  const fileName = args[0];
  const fromIdx = args.indexOf('--from');
  if (fromIdx === -1 || !args[fromIdx + 1]) {
    console.log('  The --from <pack> option is required.');
    return;
  }
  const packName = args[fromIdx + 1];

  // 파일 찾기
  const sourcePath = findFile(packName, fileName);
  if (!sourcePath) {
    console.log(`  ✗ '${fileName}' not found in pack '${packName}'.`);

    // 사용 가능한 파일 목록 표시
    const packDir = path.join(PACKS_DIR, packName);
    if (fs.existsSync(packDir)) {
      console.log('  Available files:');
      for (const subdir of ['solutions', 'rules']) {
        const dir = path.join(packDir, subdir);
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
          for (const f of files) {
            console.log(`    ${subdir}/${f}`);
          }
        }
      }
    }
    console.log();
    return;
  }

  // 타입 판별 및 복사
  const type = classifyFile(sourcePath);
  const destDir = type === 'solution' ? ME_SOLUTIONS : ME_RULES;
  const destPath = path.join(destDir, path.basename(sourcePath));

  fs.mkdirSync(destDir, { recursive: true });

  if (fs.existsSync(destPath)) {
    console.log(`  ⚠ '${path.basename(sourcePath)}' already exists. Overwriting.`);
  }

  fs.copyFileSync(sourcePath, destPath);
  console.log(`  ✓ ${type === 'solution' ? 'Solution' : 'Rule'} picked: ${path.basename(sourcePath)}`);
  console.log(`  → ~/.compound/me/${type === 'solution' ? 'solutions' : 'rules'}/${path.basename(sourcePath)}\n`);
}

/**
 * tenetx propose — compound에서 분류된 팀 규칙을 PR로 제안
 *
 * pack 연결 모드에 따라:
 * - github: 팩 레포에 PR 생성
 * - inline: 이 프로젝트 레포에 PR 생성
 * - local: .compound/rules/ 에 직접 저장
 * - 미연결: 안내 메시지
 */
export async function handlePropose(args: string[]): Promise<void> {
  const cwd = process.cwd();

  // --pack <name> 옵션 파싱
  const packIdx = args.indexOf('--pack');
  const targetPackName = packIdx !== -1 ? args[packIdx + 1] : undefined;

  // Load pending proposals from .compound/proposals/
  const proposalsDir = path.join(cwd, '.compound', 'proposals');
  const proposals = loadProposals(proposalsDir);

  if (proposals.length === 0) {
    console.log('\n  No team rules to propose.');
    console.log('  Extract insights first with: tenetx compound\n');
    return;
  }

  console.log(`\n  Proposing team rules — ${proposals.length} item(s)\n`);
  for (const p of proposals) {
    console.log(`  • ${p.title}: ${p.content.slice(0, 60)}`);
  }

  // Load pack configs (복수 팩 지원)
  let packs: PackConnection[] = [];
  try {
    const { loadPackConfigs } = await import('../core/pack-config.js');
    packs = loadPackConfigs(cwd);
  } catch {
    log.debug('pack-config 로드 실패, local 모드로 폴백');
  }

  if (packs.length === 0) {
    // 개인 모드: 로컬 저장으로 폴백
    await proposeViaLocal(proposals, cwd);
    console.log('  No packs connected. Saved locally.');
    console.log('  Team setup: tenetx init --team\n');
    cleanProposals(proposalsDir);
    return;
  }

  // 대상 팩 결정: --pack 옵션이 있으면 해당 팩, 없으면 첫 번째 팩
  let targetPack: PackConnection;
  if (targetPackName) {
    const found = packs.find(p => p.name === targetPackName);
    if (!found) {
      console.log(`\n  ✗ Pack '${targetPackName}' is not connected.`);
      console.log('  Connected packs:');
      for (const p of packs) {
        console.log(`    • ${p.name} (${p.type})`);
      }
      console.log('  Usage: tenetx propose --pack <name>\n');
      return;
    }
    targetPack = found;
  } else if (packs.length > 1) {
    // 복수 팩인데 --pack 미지정 → 안내 후 첫 번째 사용
    console.log(`  ${packs.length} packs connected. Proposing to the first pack.`);
    console.log(`  Specify a pack: tenetx propose --pack <name>`);
    for (const p of packs) {
      console.log(`    • ${p.name} (${p.type})`);
    }
    console.log();
    targetPack = packs[0];
  } else {
    targetPack = packs[0];
  }

  console.log(`  Target pack: ${targetPack.name} (${targetPack.type})\n`);

  switch (targetPack.type) {
    case 'github': {
      await proposeViaGithubPR(targetPack, proposals, cwd);
      break;
    }
    case 'inline': {
      await proposeViaInlinePR(proposals, cwd);
      break;
    }
    default: {
      await proposeViaLocal(proposals, cwd);
      break;
    }
  }

  // Clean up proposals after successful propose
  cleanProposals(proposalsDir);
}

/** pack-config.ts 에서 정의되는 타입 (로컬 미러) */
interface PackConnection {
  type: 'github' | 'inline' | 'local';
  name: string;
  repo?: string;
}

async function proposeViaGithubPR(_config: PackConnection, proposals: CompoundInsight[], cwd: string): Promise<void> {
  const { execFileSync } = await import('node:child_process');

  const branchName = `compound/${new Date().toISOString().split('T')[0]}-${Date.now().toString(36)}`;
  const title = `compound: ${proposals.map(p => p.title).join(', ')}`;
  const body = proposals.map(p => `## ${p.title}\n\n${p.content}`).join('\n\n---\n\n');

  // Write rules to .compound/rules/ and commit
  const rulesContent = proposals.map(p => `# ${p.title}\n\n${p.content}`).join('\n\n---\n\n');
  const rulesFile = path.join(cwd, '.compound', 'rules', `compound-${Date.now()}.md`);
  fs.mkdirSync(path.dirname(rulesFile), { recursive: true });
  fs.writeFileSync(rulesFile, rulesContent);

  try {
    execFileSync('git', ['checkout', '-b', branchName], { cwd, stdio: 'pipe' });
    execFileSync('git', ['add', rulesFile], { cwd, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', title], { cwd, stdio: 'pipe' });

    const result = execFileSync('gh', ['pr', 'create', '--title', title, '--body', body], { cwd, encoding: 'utf-8', stdio: 'pipe' });
    console.log(`\n  ✓ PR created: ${result.trim()}`);

    // Switch back to previous branch
    execFileSync('git', ['checkout', '-'], { cwd, stdio: 'pipe' });
  } catch (e) {
    // git branch 복원
    try { execFileSync('git', ['checkout', '-'], { cwd, stdio: 'pipe' }); } catch (checkoutErr) { log.debug('git checkout - failed during error recovery — branch cleanup may be incomplete', checkoutErr); }
    try { execFileSync('git', ['branch', '-D', branchName], { cwd, stdio: 'pipe' }); } catch (deleteErr) { log.debug(`git branch -D ${branchName} failed — temp branch may remain`, deleteErr); }

    // gh 미설치 시 로컬 폴백 + 설치 안내
    const isGhMissing = e instanceof Error && e.message.includes('ENOENT');
    if (isGhMissing) {
      console.log('  gh (GitHub CLI) is not installed.');
      console.log('  Install: brew install gh (macOS) / apt install gh (Linux)');
      console.log('  Authenticate: gh auth login');
      console.log('');
    }
    console.log('  PR creation failed → falling back to local save');
    log.debug('gh pr create 실패', e);
    await proposeViaLocal(proposals, cwd);
  }
}

async function proposeViaInlinePR(proposals: CompoundInsight[], cwd: string): Promise<void> {
  await proposeViaGithubPR({ type: 'inline', name: 'project' }, proposals, cwd);
}

async function proposeViaLocal(proposals: CompoundInsight[], cwd: string): Promise<void> {
  const rulesDir = path.join(cwd, '.compound', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  const filename = `compound-${Date.now()}.md`;
  const content = proposals.map(p => `# ${p.title}\n\n${p.content}`).join('\n\n---\n\n');
  fs.writeFileSync(path.join(rulesDir, filename), content);
  console.log(`\n  ✓ Team rules saved: .compound/rules/${filename}`);
  console.log('  Let your team lead know.\n');
}
