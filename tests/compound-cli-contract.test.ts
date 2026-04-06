import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-compound-cli-contract',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

function makeEntry(params: {
  name: string;
  scope: 'me' | 'team' | 'project';
  type: 'pattern' | 'decision' | 'troubleshoot' | 'anti-pattern';
  created?: string;
}): string {
  return `---
name: "${params.name}"
version: 1
status: "candidate"
confidence: 0.5
type: "${params.type}"
scope: "${params.scope}"
tags: ["test"]
identifiers: []
evidence:
  injected: 0
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
created: "${params.created ?? '2026-03-31'}"
updated: "${params.created ?? '2026-03-31'}"
supersedes: null
extractedBy: "manual"
---

## Context
test entry

## Content
${params.name} content
`;
}

describe('compound CLI contract', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('lists saved entries with their category labels', async () => {
    const solutionsDir = path.join(TEST_HOME, '.tenetx', 'me', 'solutions');
    const rulesDir = path.join(TEST_HOME, '.tenetx', 'me', 'rules');
    fs.mkdirSync(solutionsDir, { recursive: true });
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(solutionsDir, 'solution.md'), makeEntry({
      name: 'solution-entry',
      scope: 'me',
      type: 'pattern',
    }));
    fs.writeFileSync(path.join(rulesDir, 'rule.md'), makeEntry({
      name: 'rule-entry',
      scope: 'me',
      type: 'decision',
    }));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { listSolutions } = await import('../src/engine/compound-cli.js');
    listSolutions();

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Compound Entries');
    expect(output).toContain('solution-entry [solution]');
    expect(output).toContain('rule-entry [rule]');
    expect(output).toContain('Total: 2 entries');
  });

  it('rollback only removes solution entries and leaves rule entries intact', async () => {
    const solutionsDir = path.join(TEST_HOME, '.tenetx', 'me', 'solutions');
    const rulesDir = path.join(TEST_HOME, '.tenetx', 'me', 'rules');
    fs.mkdirSync(solutionsDir, { recursive: true });
    fs.mkdirSync(rulesDir, { recursive: true });

    const solutionPath = path.join(solutionsDir, 'rollback-me.md');
    const rulePath = path.join(rulesDir, 'keep-rule.md');
    fs.writeFileSync(solutionPath, makeEntry({
      name: 'rollback-me',
      scope: 'me',
      type: 'pattern',
      created: '2026-03-31',
    }));
    fs.writeFileSync(rulePath, makeEntry({
      name: 'keep-rule',
      scope: 'me',
      type: 'decision',
      created: '2026-03-31',
    }));

    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rollbackSolutions } = await import('../src/engine/compound-cli.js');
    rollbackSolutions('2026-03-01');

    expect(fs.existsSync(solutionPath)).toBe(false);
    expect(fs.existsSync(rulePath)).toBe(true);
  });
});
