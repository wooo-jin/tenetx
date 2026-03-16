import * as fs from 'node:fs';
import * as path from 'node:path';
import { PACKS_DIR, ME_SOLUTIONS, ME_RULES } from '../core/paths.js';
import { debugLog } from '../core/logger.js';
import { loadProposals, cleanProposals } from '../engine/compound-loop.js';
import type { CompoundInsight } from '../engine/compound-loop.js';

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
 * tenet pick — 팩의 솔루션/규칙을 개인(Me) 영역으로 복사
 * 자유롭게 가져올 수 있음 (리뷰 불필요)
 */
export async function handlePick(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('  사용법: tenet pick <file> --from <pack>');
    console.log('  팩의 솔루션/규칙을 개인(Me) 영역으로 복사합니다.\n');
    console.log('  예시:');
    console.log('    tenet pick api-error-handling --from emr');
    console.log('    tenet pick convention-naming.md --from emr\n');
    return;
  }

  const fileName = args[0];
  const fromIdx = args.indexOf('--from');
  if (fromIdx === -1 || !args[fromIdx + 1]) {
    console.log('  --from <pack> 옵션이 필요합니다.');
    return;
  }
  const packName = args[fromIdx + 1];

  // 파일 찾기
  const sourcePath = findFile(packName, fileName);
  if (!sourcePath) {
    console.log(`  ✗ 팩 '${packName}'에서 '${fileName}'을 찾을 수 없습니다.`);

    // 사용 가능한 파일 목록 표시
    const packDir = path.join(PACKS_DIR, packName);
    if (fs.existsSync(packDir)) {
      console.log('  사용 가능한 파일:');
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
    console.log(`  ⚠ '${path.basename(sourcePath)}'가 이미 존재합니다. 덮어씁니다.`);
  }

  fs.copyFileSync(sourcePath, destPath);
  console.log(`  ✓ ${type === 'solution' ? '솔루션' : '규칙'} pick 완료: ${path.basename(sourcePath)}`);
  console.log(`  → ~/.compound/me/${type === 'solution' ? 'solutions' : 'rules'}/${path.basename(sourcePath)}\n`);
}

/**
 * tenet propose — compound에서 분류된 팀 규칙을 PR로 제안
 *
 * pack 연결 모드에 따라:
 * - github: 팩 레포에 PR 생성
 * - inline: 이 프로젝트 레포에 PR 생성
 * - local: .compound/rules/ 에 직접 저장
 * - 미연결: 안내 메시지
 */
export async function handlePropose(_args: string[]): Promise<void> {
  const cwd = process.cwd();

  // Load pending proposals from .compound/proposals/
  const proposalsDir = path.join(cwd, '.compound', 'proposals');
  const proposals = loadProposals(proposalsDir);

  if (proposals.length === 0) {
    console.log('\n  제안할 팀 규칙이 없습니다.');
    console.log('  먼저 tenet compound 로 인사이트를 추출하세요.\n');
    return;
  }

  console.log(`\n  팀 규칙 제안 — ${proposals.length}건\n`);
  for (const p of proposals) {
    console.log(`  • ${p.title}: ${p.content.slice(0, 60)}`);
  }

  // Load pack config
  let packConfig: PackConnection | null = null;
  try {
    const { loadPackConfig } = await import('../core/pack-config.js');
    packConfig = loadPackConfig(cwd);
  } catch {
    debugLog('crossover', 'pack-config 로드 실패, local 모드로 폴백');
  }

  if (!packConfig) {
    // 개인 모드: 로컬 저장으로 폴백
    await proposeViaLocal(proposals, cwd);
    console.log('  팩이 연결되어 있지 않습니다. 로컬에 저장되었습니다.');
    console.log('  팀 설정: tenet init --team\n');
    cleanProposals(proposalsDir);
    return;
  }

  switch (packConfig.type) {
    case 'github': {
      await proposeViaGithubPR(packConfig, proposals, cwd);
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
    console.log(`\n  ✓ PR 생성: ${result.trim()}`);

    // Switch back to previous branch
    execFileSync('git', ['checkout', '-'], { cwd, stdio: 'pipe' });
  } catch (e) {
    // git branch 복원
    try { execFileSync('git', ['checkout', '-'], { cwd, stdio: 'pipe' }); } catch { /* best effort */ }
    try { execFileSync('git', ['branch', '-D', branchName], { cwd, stdio: 'pipe' }); } catch { /* best effort */ }

    // gh 미설치 시 로컬 폴백 + 설치 안내
    const isGhMissing = e instanceof Error && e.message.includes('ENOENT');
    if (isGhMissing) {
      console.log('  gh (GitHub CLI)가 설치되어 있지 않습니다.');
      console.log('  설치: brew install gh (macOS) / apt install gh (Linux)');
      console.log('  인증: gh auth login');
      console.log('');
    }
    console.log('  PR 생성 실패 → 로컬 저장으로 전환');
    debugLog('crossover', 'gh pr create 실패', e);
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
  console.log(`\n  ✓ 팀 규칙 저장: .compound/rules/${filename}`);
  console.log('  팀장에게 알려주세요.\n');
}
