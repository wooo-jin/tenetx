import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-claude-session-context',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

function initRepo(repoPath: string): void {
  fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });

  execFileSync('git', ['init'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });
  execFileSync('git', ['config', 'user.name', 'Tenetx Test'], { cwd: repoPath });

  fs.writeFileSync(path.join(repoPath, 'src', 'feature.ts'), 'export const version = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: repoPath });
  execFileSync('git', ['commit', '-m', 'chore: seed repo'], { cwd: repoPath });

  const expanded = Array.from({ length: 40 }, (_, index) => `export const line${index} = ${index};`).join('\n');
  fs.writeFileSync(path.join(repoPath, 'src', 'feature.ts'), `${expanded}\n`);
  execFileSync('git', ['add', '.'], { cwd: repoPath });
  execFileSync('git', ['commit', '-m', 'chore: expand feature file'], { cwd: repoPath });
}

function writeClaudeSession(cwd: string, sessionId: string, prompts: string[]): void {
  const projectDir = path.join(TEST_HOME, '.claude', 'projects', cwd.replace(/[\\/]/g, '-'));
  fs.mkdirSync(projectDir, { recursive: true });

  const lines = prompts.map((prompt, index) => JSON.stringify({
    type: 'user',
    message: { role: 'user', content: prompt },
    timestamp: new Date(Date.UTC(2026, 2, 31, 0, index, 0)).toISOString(),
    cwd,
    sessionId,
  }));

  fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`);
}

describe('compound extractor Claude session context', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // Pre-C4 these tests observed session correlation via the
  // `recurring-task-pattern` extractor as a side-effect signal. C4
  // removed that extractor (it was producing word-frequency noise in
  // production). The tests now call `loadClaudeProjectSessionContext`
  // directly — same correlation mechanism, but the assertion is on
  // the loader's output (which project's prompts were selected)
  // instead of on a downstream extractor that may be further reworked.
  it('prefers the current project Claude sessions over unrelated project sessions', async () => {
    const repoPath = path.join(TEST_HOME, 'repo');
    initRepo(repoPath);

    writeClaudeSession(repoPath, 'target-session', [
      'deploy the release candidate',
      'deploy staging after tests pass',
      'deploy production carefully',
    ]);

    writeClaudeSession(path.join(TEST_HOME, 'other-project'), 'other-session', [
      'review the API surface',
      'review the migration plan',
      'review the rollout checklist',
      'review the alert thresholds',
      'review the dashboards',
      'review the release notes',
    ]);

    const { loadClaudeProjectSessionContext } = await import('../src/engine/compound-extractor.js');
    const ctx = loadClaudeProjectSessionContext(repoPath, '');

    // Correlation must prefer target-session's "deploy" prompts and
    // must not include unrelated other-project's "review" prompts.
    expect(ctx.prompts.some(p => p.includes('deploy'))).toBe(true);
    expect(ctx.prompts.every(p => !p.includes('review'))).toBe(true);
  });

  it('matches Claude session context across symlinked project paths', async () => {
    const realRepoPath = path.join(TEST_HOME, 'real-repo');
    const linkedRepoPath = path.join(TEST_HOME, 'linked-repo');
    initRepo(realRepoPath);
    fs.symlinkSync(realRepoPath, linkedRepoPath, 'dir');

    writeClaudeSession(realRepoPath, 'real-session', [
      'deploy the candidate build',
      'deploy staging after verification',
      'deploy production once approved',
    ]);

    const { loadClaudeProjectSessionContext } = await import('../src/engine/compound-extractor.js');
    const ctx = loadClaudeProjectSessionContext(linkedRepoPath, '');

    expect(ctx.prompts.some(p => p.includes('deploy'))).toBe(true);
  });

  it('matches Claude sessions when the saved project path uses an ancestor alias', async () => {
    const realRoot = path.join(TEST_HOME, 'real-root');
    const aliasRoot = path.join(TEST_HOME, 'alias-root');
    const realRepoPath = path.join(realRoot, 'repo');
    const aliasedRepoPath = path.join(aliasRoot, 'repo');

    fs.mkdirSync(realRoot, { recursive: true });
    fs.symlinkSync(realRoot, aliasRoot, 'dir');
    initRepo(realRepoPath);

    writeClaudeSession(aliasedRepoPath, 'alias-session', [
      'deploy the canary release',
      'deploy staging after smoke tests',
      'deploy production after approval',
    ]);

    const { loadClaudeProjectSessionContext } = await import('../src/engine/compound-extractor.js');
    const ctx = loadClaudeProjectSessionContext(realRepoPath, '');

    expect(ctx.prompts.some(p => p.includes('deploy'))).toBe(true);
  });
});
