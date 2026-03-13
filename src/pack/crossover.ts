import * as fs from 'node:fs';
import * as path from 'node:path';
import { PACKS_DIR, ME_SOLUTIONS, ME_RULES } from '../core/paths.js';
import { debugLog } from '../core/logger.js';

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
 * tenet propose — 개인 솔루션/규칙을 팩에 제안
 * 팀 리뷰가 필요 (PR 생성 또는 pending 디렉토리에 저장)
 */
export async function handlePropose(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('  사용법: tenet propose <file> --to <pack>');
    console.log('  개인 솔루션/규칙을 팩에 제안합니다. (리뷰 필요)\n');
    console.log('  예시:');
    console.log('    tenet propose debugging-pattern.md --to emr');
    console.log('    tenet propose my-convention.md --to emr\n');
    return;
  }

  const fileName = args[0];
  const toIdx = args.indexOf('--to');
  if (toIdx === -1 || !args[toIdx + 1]) {
    console.log('  --to <pack> 옵션이 필요합니다.');
    return;
  }
  const packName = args[toIdx + 1];

  // 개인 영역에서 파일 찾기
  let sourcePath: string | null = null;
  const solPath = path.join(ME_SOLUTIONS, fileName.endsWith('.md') ? fileName : `${fileName}.md`);
  const rulePath = path.join(ME_RULES, fileName.endsWith('.md') ? fileName : `${fileName}.md`);

  if (fs.existsSync(solPath)) {
    sourcePath = solPath;
  } else if (fs.existsSync(rulePath)) {
    sourcePath = rulePath;
  }

  if (!sourcePath) {
    console.log(`  ✗ 개인 영역에서 '${fileName}'을 찾을 수 없습니다.`);
    console.log('  ~/.compound/me/solutions/ 또는 ~/.compound/me/rules/ 에 파일이 있어야 합니다.\n');
    return;
  }

  // 팩 존재 확인
  const packDir = path.join(PACKS_DIR, packName);
  if (!fs.existsSync(packDir)) {
    console.log(`  ✗ 팩 '${packName}'이 설치되어 있지 않습니다.\n`);
    return;
  }

  // pending 디렉토리에 제안 저장
  const pendingDir = path.join(packDir, '.pending');
  fs.mkdirSync(pendingDir, { recursive: true });

  const destPath = path.join(pendingDir, path.basename(sourcePath));
  fs.copyFileSync(sourcePath, destPath);

  // 제안 메타 기록
  const proposalMeta = {
    file: path.basename(sourcePath),
    proposedAt: new Date().toISOString(),
    from: 'me',
    status: 'pending',
  };
  const proposalsPath = path.join(pendingDir, '_proposals.json');
  let proposals: unknown[] = [];
  if (fs.existsSync(proposalsPath)) {
    try { proposals = JSON.parse(fs.readFileSync(proposalsPath, 'utf-8')); } catch (e) { debugLog('crossover', '_proposals.json 파싱 실패', e); }
  }
  proposals.push(proposalMeta);
  fs.writeFileSync(proposalsPath, JSON.stringify(proposals, null, 2));

  console.log(`  ✓ 제안 완료: ${path.basename(sourcePath)} → ${packName}`);
  console.log(`  상태: pending (팩 관리자의 리뷰 필요)`);
  console.log(`  경로: ${destPath}\n`);
}
