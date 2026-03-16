/**
 * worktree — Git 멀티 워크트리 관리 유틸리티
 *
 * Git worktree를 자동으로 생성·조회·제거하고, 이슈/PR 번호로
 * 해당 워크트리 경로를 빠르게 탐색(teleport)할 수 있도록 합니다.
 *
 * 주요 함수:
 * - isGitRepo       : 현재 디렉토리가 Git 저장소인지 확인
 * - getWorktrees    : `git worktree list --porcelain` 파싱
 * - createWorktree  : 옵션 기반 워크트리 생성
 * - removeWorktree  : 경로 또는 이름으로 워크트리 제거
 * - teleport        : 이슈/PR 번호 또는 브랜치명으로 워크트리 경로 반환
 * - handleWorktree  : CLI 핸들러 (`tenet worktree <create|list|remove|teleport>`)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// ─── 인터페이스 ────────────────────────────────────────────────

/** 단일 워크트리 정보 */
export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  bare?: boolean;
}

/** createWorktree 옵션 */
export interface CreateWorktreeOptions {
  /** 워크트리 디렉토리 이름 (없으면 branch에서 자동 생성) */
  name?: string;
  /** 체크아웃할 브랜치명 (없으면 issueNumber로 자동 생성) */
  branch?: string;
  /** 이슈 번호 → feature/<issueNumber> 브랜치 자동 생성 */
  issueNumber?: string;
  /** 새 브랜치를 만들 때 기준이 되는 베이스 브랜치 (기본: HEAD) */
  baseBranch?: string;
}

/** createWorktree / removeWorktree 실행 결과 */
export interface WorktreeResult {
  success: boolean;
  path?: string;
  branch?: string;
  message: string;
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────

/**
 * git 명령어를 실행하고 stdout 문자열을 반환합니다.
 * 실패 시 null을 반환합니다.
 */
function runGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
  } catch {
    return null;
  }
}

/**
 * git 명령어를 실행하고 성공/실패와 stderr 메시지를 반환합니다.
 */
function runGitWithError(args: string[], cwd: string): { success: boolean; output: string } {
  try {
    const output = execFileSync('git', args, {
      cwd,
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    return { success: true, output: output ?? '' };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const output = (e.stderr ?? e.stdout ?? e.message ?? '').trim();
    return { success: false, output };
  }
}

// ─── 공개 함수 ────────────────────────────────────────────────

/**
 * 지정 디렉토리가 Git 저장소인지 확인합니다.
 * .git 파일/디렉토리 존재 여부 및 `git rev-parse` 명령으로 이중 확인합니다.
 */
export function isGitRepo(cwd: string): boolean {
  // .git 디렉토리 또는 파일(서브모듈/워크트리) 존재 확인
  const gitPath = path.join(cwd, '.git');
  if (fs.existsSync(gitPath)) return true;

  // git rev-parse로 최종 확인 (워크트리에서는 .git 파일일 수 있음)
  const result = runGit(['rev-parse', '--git-dir'], cwd);
  return result !== null;
}

/**
 * `git worktree list --porcelain` 출력을 파싱하여 WorktreeInfo 배열을 반환합니다.
 * git이 없거나 저장소가 아니면 빈 배열을 반환합니다.
 */
export function getWorktrees(cwd: string): WorktreeInfo[] {
  const output = runGit(['worktree', 'list', '--porcelain'], cwd);
  if (!output) return [];

  const worktrees: WorktreeInfo[] = [];
  // 각 워크트리 블록은 빈 줄로 구분됨
  const blocks = output.trim().split(/\n\n+/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.trim().split('\n');
    const info: Partial<WorktreeInfo> = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        info.path = line.slice('worktree '.length).trim();
      } else if (line.startsWith('HEAD ')) {
        info.head = line.slice('HEAD '.length).trim();
      } else if (line.startsWith('branch ')) {
        // "refs/heads/main" → "main"
        const ref = line.slice('branch '.length).trim();
        info.branch = ref.replace(/^refs\/heads\//, '');
      } else if (line === 'bare') {
        info.bare = true;
      } else if (line === 'detached') {
        info.branch = info.branch ?? '(detached)';
      }
    }

    if (info.path) {
      worktrees.push({
        path: info.path,
        branch: info.branch ?? '(unknown)',
        head: info.head ?? '',
        ...(info.bare !== undefined ? { bare: info.bare } : {}),
      });
    }
  }

  return worktrees;
}

/**
 * .gitignore에 `.worktrees/` 항목이 없으면 추가합니다.
 * .gitignore 파일이 없으면 새로 생성합니다.
 */
function ensureGitignoreEntry(repoRoot: string): void {
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const entry = '.worktrees/';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (content.includes(entry)) return;
    fs.appendFileSync(gitignorePath, `\n# Tenet worktrees\n${entry}\n`);
  } else {
    fs.writeFileSync(gitignorePath, `# Tenet worktrees\n${entry}\n`);
  }
}

/**
 * 새 워크트리를 생성합니다.
 *
 * 우선순위:
 * 1. issueNumber 있음 → 브랜치명: `feature/<issueNumber>`
 * 2. branch 직접 지정
 * 3. 둘 다 없으면 에러 반환
 *
 * 워크트리 경로는 `<저장소 루트>/.worktrees/<name>` 위치에 생성됩니다.
 * name이 없으면 브랜치명에서 슬래시를 대시로 치환하여 사용합니다.
 */
export function createWorktree(cwd: string, options: CreateWorktreeOptions): WorktreeResult {
  const { issueNumber, baseBranch } = options;
  let { branch, name } = options;

  // 브랜치명 결정
  if (!branch) {
    if (issueNumber) {
      branch = `feature/${issueNumber}`;
    } else {
      return { success: false, message: 'branch 또는 issueNumber 중 하나는 반드시 지정해야 합니다.' };
    }
  }

  // 워크트리 디렉토리명 결정
  if (!name) {
    name = branch.replace(/\//g, '-');
  }

  // 저장소 루트 찾기
  const repoRoot = runGit(['rev-parse', '--show-toplevel'], cwd);
  if (!repoRoot) {
    return { success: false, message: 'Git 저장소를 찾을 수 없습니다.' };
  }

  const worktreesDir = path.join(repoRoot.trim(), '.worktrees');
  fs.mkdirSync(worktreesDir, { recursive: true });
  const worktreePath = path.join(worktreesDir, name);

  // .gitignore에 .worktrees/ 항목 보장
  ensureGitignoreEntry(repoRoot.trim());

  // 이미 존재하는지 확인
  if (fs.existsSync(worktreePath)) {
    return {
      success: false,
      message: `워크트리 경로가 이미 존재합니다: ${worktreePath}`,
    };
  }

  // 브랜치 존재 여부 확인
  const branchExists = runGit(['rev-parse', '--verify', branch], cwd) !== null;

  let gitArgs: string[];
  if (branchExists) {
    // 기존 브랜치 체크아웃
    gitArgs = ['worktree', 'add', worktreePath, branch];
  } else {
    // 새 브랜치 생성
    const base = baseBranch ?? 'HEAD';
    gitArgs = ['worktree', 'add', '-b', branch, worktreePath, base];
  }

  const result = runGitWithError(gitArgs, cwd);
  if (!result.success) {
    return {
      success: false,
      message: `워크트리 생성 실패: ${result.output}`,
    };
  }

  return {
    success: true,
    path: worktreePath,
    branch,
    message: `워크트리 생성 완료: ${worktreePath} (브랜치: ${branch})`,
  };
}

/**
 * 워크트리를 제거합니다.
 * pathOrName은 절대 경로 또는 워크트리 이름(브랜치명 기반)을 받습니다.
 * options.force가 true일 때만 --force 플래그를 사용합니다.
 * force 없이는 커밋되지 않은 변경사항이 있으면 제거에 실패합니다.
 */
export function removeWorktree(
  cwd: string,
  pathOrName: string,
  options?: { force?: boolean },
): { success: boolean; message: string } {
  // 절대 경로가 아니면 현재 저장소 기준으로 해석
  let targetPath = pathOrName;
  if (!path.isAbsolute(pathOrName)) {
    const repoRoot = runGit(['rev-parse', '--show-toplevel'], cwd);
    if (!repoRoot) {
      return { success: false, message: 'Git 저장소를 찾을 수 없습니다.' };
    }
    targetPath = path.join(repoRoot.trim(), '.worktrees', pathOrName);
  }

  const args = ['worktree', 'remove', targetPath];
  if (options?.force) args.push('--force');

  const result = runGitWithError(args, cwd);
  if (!result.success) {
    return {
      success: false,
      message: `워크트리 제거 실패: ${result.output}`,
    };
  }

  return { success: true, message: `워크트리 제거 완료: ${targetPath}` };
}

/**
 * 이슈/PR 번호 또는 브랜치명 일부로 워크트리 경로를 반환합니다.
 * 매칭되는 워크트리가 없으면 null을 반환합니다.
 *
 * 매칭 우선순위:
 * 1. `feature/<identifier>` 브랜치 정확 매칭
 * 2. 브랜치명에 identifier가 포함된 경우
 * 3. 경로에 identifier가 포함된 경우
 */
export function teleport(cwd: string, identifier: string): string | null {
  const worktrees = getWorktrees(cwd);
  if (worktrees.length === 0) return null;

  // 정확히 feature/<identifier> 형태로 매칭
  const exactMatch = worktrees.find(
    (w) => w.branch === `feature/${identifier}` || w.branch === identifier
  );
  if (exactMatch) return exactMatch.path;

  // 브랜치명 부분 매칭
  const branchMatch = worktrees.find((w) => w.branch.includes(identifier));
  if (branchMatch) return branchMatch.path;

  // 경로 부분 매칭
  const pathMatch = worktrees.find((w) => w.path.includes(identifier));
  if (pathMatch) return pathMatch.path;

  return null;
}

// ─── CLI 핸들러 ──────────────────────────────────────────────

/**
 * `tenet worktree <subcommand> [args]` CLI 핸들러
 *
 * 서브커맨드:
 * - list                        : 현재 워크트리 목록 출력
 * - create [--branch <b>] [--issue <n>] [--base <b>] [--name <n>]
 * - remove <path-or-name>       : 워크트리 제거
 * - teleport <identifier>       : 이슈/브랜치로 경로 출력
 */
export async function handleWorktree(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    printHelp();
    return;
  }

  switch (subcommand) {
    case 'list': {
      if (!isGitRepo(cwd)) {
        console.log('  현재 디렉토리가 Git 저장소가 아닙니다.');
        return;
      }
      const trees = getWorktrees(cwd);
      if (trees.length === 0) {
        console.log('  워크트리가 없습니다.');
        return;
      }
      console.log('\n  워크트리 목록:\n');
      for (const t of trees) {
        const bare = t.bare ? ' [bare]' : '';
        console.log(`  ${t.branch}${bare}`);
        console.log(`    경로: ${t.path}`);
        console.log(`    HEAD: ${t.head}`);
        console.log('');
      }
      break;
    }

    case 'create': {
      if (!isGitRepo(cwd)) {
        console.log('  현재 디렉토리가 Git 저장소가 아닙니다.');
        return;
      }

      const options: CreateWorktreeOptions = {};
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--branch' || args[i] === '-b') {
          options.branch = args[++i];
        } else if (args[i] === '--issue' || args[i] === '-i') {
          options.issueNumber = args[++i];
        } else if (args[i] === '--base') {
          options.baseBranch = args[++i];
        } else if (args[i] === '--name' || args[i] === '-n') {
          options.name = args[++i];
        }
      }

      const result = createWorktree(cwd, options);
      if (result.success) {
        console.log(`  ✓ ${result.message}`);
      } else {
        console.error(`  ✗ ${result.message}`);
        process.exitCode = 1;
      }
      break;
    }

    case 'remove': {
      if (!isGitRepo(cwd)) {
        console.log('  현재 디렉토리가 Git 저장소가 아닙니다.');
        return;
      }
      const force = args.includes('--force') || args.includes('-f');
      const target = args.filter((a) => !a.startsWith('-'))[1];
      if (!target) {
        console.error('  사용법: tenet worktree remove <경로-또는-이름> [--force|-f]');
        process.exitCode = 1;
        return;
      }
      const result = removeWorktree(cwd, target, { force });
      if (result.success) {
        console.log(`  ✓ ${result.message}`);
      } else {
        console.error(`  ✗ ${result.message}`);
        process.exitCode = 1;
      }
      break;
    }

    case 'teleport': {
      if (!isGitRepo(cwd)) {
        console.log('  현재 디렉토리가 Git 저장소가 아닙니다.');
        return;
      }
      const identifier = args[1];
      if (!identifier) {
        console.error('  사용법: tenet worktree teleport <이슈번호-또는-브랜치명>');
        process.exitCode = 1;
        return;
      }
      const worktreePath = teleport(cwd, identifier);
      if (worktreePath) {
        // cd 가능하도록 경로만 출력 (shell alias에서 활용)
        console.log(worktreePath);
      } else {
        console.error(`  해당하는 워크트리를 찾을 수 없습니다: ${identifier}`);
        process.exitCode = 1;
      }
      break;
    }

    default:
      console.error(`  알 수 없는 서브커맨드: ${subcommand}`);
      printHelp();
      process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`
  tenet worktree — Git 멀티 워크트리 관리

  사용법:
    tenet worktree list
    tenet worktree create [--branch <브랜치>] [--issue <번호>] [--base <기준브랜치>] [--name <이름>]
    tenet worktree remove <경로-또는-이름>
    tenet worktree teleport <이슈번호-또는-브랜치명>

  예시:
    tenet worktree create --issue 42
    tenet worktree create --branch hotfix/login --base main
    tenet worktree teleport 42
    tenet worktree remove feature-42
  `);
}
