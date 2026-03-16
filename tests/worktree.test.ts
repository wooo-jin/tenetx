/**
 * worktree.test.ts — Git 멀티 워크트리 관리 유틸리티 테스트
 *
 * 테스트 전략:
 * - isGitRepo, getWorktrees, teleport: 임시 git repo 생성 또는 파싱 로직 직접 테스트
 * - createWorktree, removeWorktree: 실제 git 명령 호출 (임시 git repo)
 * - execSync 모킹이 필요한 파싱 로직은 getWorktrees 내부 포맷 직접 검증
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

import {
  isGitRepo,
  getWorktrees,
  createWorktree,
  removeWorktree,
  teleport,
} from '../src/core/worktree.js';

// ─── 헬퍼: 임시 git 저장소 생성 ──────────────────────────────

function makeTempGitRepo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-worktree-'));
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
  // 최초 커밋 없으면 worktree add 불가 → 더미 커밋 생성
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# test');
  execSync('git add .', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
  return tmpDir;
}

function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ─── isGitRepo ────────────────────────────────────────────────

describe('isGitRepo', () => {
  it('일반 git 저장소에서 true를 반환한다', () => {
    const tmpDir = makeTempGitRepo();
    try {
      expect(isGitRepo(tmpDir)).toBe(true);
    } finally {
      removeTempDir(tmpDir);
    }
  });

  it('git 저장소가 아닌 디렉토리에서 false를 반환한다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-non-git-'));
    try {
      expect(isGitRepo(tmpDir)).toBe(false);
    } finally {
      removeTempDir(tmpDir);
    }
  });

  it('존재하지 않는 경로에서 false를 반환한다 (에러 없이 처리)', () => {
    expect(isGitRepo('/tmp/definitely-not-exist-tenetx-xyz')).toBe(false);
  });
});

// ─── getWorktrees ─────────────────────────────────────────────

describe('getWorktrees', () => {
  it('git 저장소에서 최소 1개(메인 워크트리)를 반환한다', () => {
    const tmpDir = makeTempGitRepo();
    try {
      const trees = getWorktrees(tmpDir);
      expect(trees.length).toBeGreaterThanOrEqual(1);
      expect(trees[0].path).toBeTruthy();
      expect(trees[0].head).toBeTruthy();
    } finally {
      removeTempDir(tmpDir);
    }
  });

  it('git 저장소가 아니면 빈 배열을 반환한다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-non-git-'));
    try {
      const trees = getWorktrees(tmpDir);
      expect(trees).toEqual([]);
    } finally {
      removeTempDir(tmpDir);
    }
  });

  it('branch 필드가 refs/heads/ 접두사 없이 반환된다', () => {
    const tmpDir = makeTempGitRepo();
    try {
      const trees = getWorktrees(tmpDir);
      for (const t of trees) {
        if (t.branch !== '(unknown)' && t.branch !== '(detached)') {
          expect(t.branch).not.toContain('refs/heads/');
        }
      }
    } finally {
      removeTempDir(tmpDir);
    }
  });

  it('WorktreeInfo 구조를 올바르게 반환한다', () => {
    const tmpDir = makeTempGitRepo();
    try {
      const trees = getWorktrees(tmpDir);
      expect(trees.length).toBeGreaterThan(0);
      const first = trees[0];
      expect(typeof first.path).toBe('string');
      expect(typeof first.branch).toBe('string');
      expect(typeof first.head).toBe('string');
    } finally {
      removeTempDir(tmpDir);
    }
  });
});

// ─── createWorktree ───────────────────────────────────────────

describe('createWorktree', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(repoDir);
  });

  it('issueNumber 옵션으로 feature/<n> 브랜치 워크트리를 생성한다', () => {
    const result = createWorktree(repoDir, { issueNumber: '99' });
    try {
      expect(result.success).toBe(true);
      expect(result.branch).toBe('feature/99');
      expect(result.path).toBeTruthy();
      if (result.path) expect(fs.existsSync(result.path)).toBe(true);
    } finally {
      if (result.path) removeTempDir(result.path);
    }
  });

  it('워크트리 경로가 .worktrees/ 하위에 생성된다', () => {
    const result = createWorktree(repoDir, { issueNumber: '77' });
    try {
      expect(result.success).toBe(true);
      if (result.path) {
        // basename이 .worktrees 디렉토리의 직접 부모인지 확인 (symlink 해소 고려)
        expect(path.basename(path.dirname(result.path))).toBe('.worktrees');
        expect(path.basename(result.path)).toBe('feature-77');
      }
    } finally {
      if (result.path) removeTempDir(result.path);
    }
  });

  it('워크트리 생성 시 .gitignore에 .worktrees/ 항목이 추가된다', () => {
    const result = createWorktree(repoDir, { issueNumber: '88' });
    try {
      expect(result.success).toBe(true);
      const gitignorePath = path.join(repoDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('.worktrees/');
    } finally {
      if (result.path) removeTempDir(result.path);
    }
  });

  it('.gitignore가 이미 존재해도 .worktrees/ 항목이 중복 추가되지 않는다', () => {
    // 기존 .gitignore 생성
    const gitignorePath = path.join(repoDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules/\n.worktrees/\n');

    const result = createWorktree(repoDir, { issueNumber: '89' });
    try {
      expect(result.success).toBe(true);
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      // .worktrees/ 항목이 정확히 1번만 나타나야 함
      const occurrences = (content.match(/\.worktrees\//g) ?? []).length;
      expect(occurrences).toBe(1);
    } finally {
      if (result.path) removeTempDir(result.path);
    }
  });

  it('branch 옵션으로 직접 지정한 브랜치 워크트리를 생성한다', () => {
    const result = createWorktree(repoDir, { branch: 'hotfix/login' });
    try {
      expect(result.success).toBe(true);
      expect(result.branch).toBe('hotfix/login');
    } finally {
      if (result.path) removeTempDir(result.path);
    }
  });

  it('branch도 issueNumber도 없으면 실패를 반환한다', () => {
    const result = createWorktree(repoDir, {});
    expect(result.success).toBe(false);
    expect(result.message).toContain('branch 또는 issueNumber');
  });

  it('이미 존재하는 경로에 생성하면 실패를 반환한다', () => {
    // 첫 번째 생성
    const r1 = createWorktree(repoDir, { issueNumber: '100' });
    expect(r1.success).toBe(true);
    // 동일 issueNumber로 재시도
    const r2 = createWorktree(repoDir, { issueNumber: '100' });
    expect(r2.success).toBe(false);
    if (r1.path) removeTempDir(r1.path);
  });

  it('name 옵션으로 워크트리 디렉토리명을 지정할 수 있다', () => {
    const result = createWorktree(repoDir, { branch: 'feat/custom', name: 'my-custom-worktree' });
    try {
      expect(result.success).toBe(true);
      if (result.path) {
        expect(path.basename(result.path)).toBe('my-custom-worktree');
      }
    } finally {
      if (result.path) removeTempDir(result.path);
    }
  });
});

// ─── removeWorktree ───────────────────────────────────────────

describe('removeWorktree', () => {
  it('생성된 워크트리를 경로로 제거할 수 있다', () => {
    const repoDir = makeTempGitRepo();
    try {
      const created = createWorktree(repoDir, { issueNumber: '200' });
      expect(created.success).toBe(true);

      const removed = removeWorktree(repoDir, created.path!);
      expect(removed.success).toBe(true);
      expect(removed.message).toContain('완료');
    } finally {
      removeTempDir(repoDir);
    }
  });

  it('git 저장소가 아니면 실패를 반환한다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-non-git-'));
    try {
      const result = removeWorktree(tmpDir, '/some/path');
      expect(result.success).toBe(false);
    } finally {
      removeTempDir(tmpDir);
    }
  });
});

// ─── teleport ─────────────────────────────────────────────────

describe('teleport', () => {
  it('이슈 번호로 해당 워크트리 경로를 반환한다', () => {
    const repoDir = makeTempGitRepo();
    const created = createWorktree(repoDir, { issueNumber: '42' });
    try {
      expect(created.success).toBe(true);
      const result = teleport(repoDir, '42');
      expect(result).toBe(created.path);
    } finally {
      if (created.path) removeTempDir(created.path);
      removeTempDir(repoDir);
    }
  });

  it('브랜치명으로 해당 워크트리 경로를 반환한다', () => {
    const repoDir = makeTempGitRepo();
    const created = createWorktree(repoDir, { branch: 'hotfix/nav' });
    try {
      expect(created.success).toBe(true);
      const result = teleport(repoDir, 'hotfix/nav');
      expect(result).toBe(created.path);
    } finally {
      if (created.path) removeTempDir(created.path);
      removeTempDir(repoDir);
    }
  });

  it('존재하지 않는 식별자에 대해 null을 반환한다', () => {
    const repoDir = makeTempGitRepo();
    try {
      const result = teleport(repoDir, 'nonexistent-9999');
      expect(result).toBeNull();
    } finally {
      removeTempDir(repoDir);
    }
  });

  it('git 저장소가 아니면 null을 반환한다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-non-git-'));
    try {
      const result = teleport(tmpDir, '123');
      expect(result).toBeNull();
    } finally {
      removeTempDir(tmpDir);
    }
  });

  it('브랜치명 부분 매칭으로도 경로를 찾는다', () => {
    const repoDir = makeTempGitRepo();
    const created = createWorktree(repoDir, { branch: 'feature/partial-match' });
    try {
      expect(created.success).toBe(true);
      // 브랜치명 일부인 "partial"로 탐색
      const result = teleport(repoDir, 'partial');
      expect(result).toBe(created.path);
    } finally {
      if (created.path) removeTempDir(created.path);
      removeTempDir(repoDir);
    }
  });
});
