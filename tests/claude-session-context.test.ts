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

    const { previewExtraction } = await import('../src/engine/compound-extractor.js');
    const result = await previewExtraction(repoPath);

    expect(result.preview.some((item) =>
      item.name === 'recurring-task-pattern' &&
      item.content.includes('deploy') &&
      !item.content.includes('review'),
    )).toBe(true);
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

    const { previewExtraction } = await import('../src/engine/compound-extractor.js');
    const result = await previewExtraction(linkedRepoPath);

    expect(result.preview.some((item) =>
      item.name === 'recurring-task-pattern' &&
      item.content.includes('deploy'),
    )).toBe(true);
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

    const { previewExtraction } = await import('../src/engine/compound-extractor.js');
    const result = await previewExtraction(realRepoPath);

    expect(result.preview.some((item) =>
      item.name === 'recurring-task-pattern' &&
      item.content.includes('deploy'),
    )).toBe(true);
  });
});
