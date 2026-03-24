import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-lifecycle',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import { runLifecycleCheck, verifySolution } from '../src/engine/compound-lifecycle.js';
import { serializeSolutionV3, DEFAULT_EVIDENCE } from '../src/engine/solution-format.js';
import type { SolutionV3, SolutionStatus } from '../src/engine/solution-format.js';

function createSolution(dir: string, name: string, status: SolutionStatus, evidence: Partial<typeof DEFAULT_EVIDENCE> = {}, confidence?: number): string {
  fs.mkdirSync(dir, { recursive: true });
  const sol: SolutionV3 = {
    frontmatter: {
      name, version: 1, status,
      confidence: confidence ?? (status === 'experiment' ? 0.3 : status === 'candidate' ? 0.6 : 0.8),
      type: 'pattern', scope: 'me',
      tags: ['test', name], identifiers: ['TestIdent'],
      evidence: { ...DEFAULT_EVIDENCE, ...evidence },
      created: '2026-01-01', updated: '2026-03-24',
      supersedes: null, extractedBy: 'manual',
    },
    context: 'test', content: 'test',
  };
  const filePath = path.join(dir, `${name}.md`);
  fs.writeFileSync(filePath, serializeSolutionV3(sol));
  return filePath;
}

const SOLUTIONS_DIR = path.join(TEST_HOME, '.compound', 'me', 'solutions');

describe('compound-lifecycle', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });
  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('promotes experiment to candidate when reflected >= 2 and sessions >= 2', () => {
    createSolution(SOLUTIONS_DIR, 'promote-test', 'experiment', { reflected: 3, sessions: 2, negative: 0 });
    const result = runLifecycleCheck();
    expect(result.promoted.length).toBe(1);
    expect(result.promoted[0]).toContain('candidate');
  });

  it('promotes experiment to candidate via reExtracted >= 1', () => {
    createSolution(SOLUTIONS_DIR, 'reextract-test', 'experiment', { reExtracted: 1, negative: 0 });
    const result = runLifecycleCheck();
    expect(result.promoted.length).toBe(1);
  });

  it('does not promote when negative > 0', () => {
    createSolution(SOLUTIONS_DIR, 'neg-test', 'experiment', { reflected: 5, sessions: 3, negative: 1 });
    const result = runLifecycleCheck();
    expect(result.promoted.length).toBe(0);
  });

  it('retires experiment with negative >= 2 (circuit breaker)', () => {
    createSolution(SOLUTIONS_DIR, 'circuit-test', 'experiment', { negative: 2 });
    const result = runLifecycleCheck();
    expect(result.retired.length).toBeGreaterThan(0);
    expect(result.retired.some(r => r.includes('circuit-breaker'))).toBe(true);
  });

  it('demotes when confidence < status threshold', () => {
    createSolution(SOLUTIONS_DIR, 'demote-test', 'verified', {}, 0.3); // verified needs >= 0.5
    const result = runLifecycleCheck();
    expect(result.demoted.length).toBe(1);
  });

  it('verifySolution promotes to verified', () => {
    createSolution(SOLUTIONS_DIR, 'verify-me', 'experiment');
    const success = verifySolution('verify-me');
    expect(success).toBe(true);
    const content = fs.readFileSync(path.join(SOLUTIONS_DIR, 'verify-me.md'), 'utf-8');
    expect(content).toContain('status: verified');
  });

  it('skips retired solutions', () => {
    createSolution(SOLUTIONS_DIR, 'retired-one', 'retired');
    const result = runLifecycleCheck();
    expect(result.promoted.length).toBe(0);
    expect(result.demoted.length).toBe(0);
  });
});
