import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-rule-loading-contract',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const baseContext = {
  philosophy: {
    name: 'test-philosophy',
    version: '1.0.0',
    author: 'tester',
    principles: {},
  },
  scope: {
    me: { philosophyPath: '/tmp/test', solutionCount: 0, ruleCount: 0 },
    project: { path: '/tmp/project', solutionCount: 0 },
    summary: 'me:0s/0r, project:0s',
  },
  cwd: '/tmp/project',
  inTmux: false,
  philosophySource: 'global' as const,
};

describe('rule loading contract', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('loads manual rule files from the content section instead of YAML frontmatter keys', async () => {
    const rulesDir = path.join(TEST_HOME, '.compound', 'me', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'test-rule.md'), `---
name: "test-rule"
version: 1
status: "candidate"
confidence: 0.5
type: "decision"
scope: "me"
tags: ["rule"]
identifiers: []
evidence:
  injected: 0
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
created: "2026-03-31"
updated: "2026-03-31"
supersedes: null
extractedBy: "manual"
---

## Context
Manual rule entry

## Content
Always run focused tests before editing shared code.
`);

    const { generateCompoundRules } = await import('../src/core/config-injector.js');
    const rules = generateCompoundRules(baseContext);

    expect(rules).toContain('Always run focused tests before editing shared code.');
    expect(rules).not.toContain('name: "test-rule"');
  });

  it('loads team pack rule files with the same content-first contract', async () => {
    const packRulesDir = path.join(TEST_HOME, '.compound', 'packs', 'alpha-pack', 'rules');
    fs.mkdirSync(packRulesDir, { recursive: true });
    fs.writeFileSync(path.join(packRulesDir, 'review-rule.md'), `---
name: "review-rule"
version: 1
status: "candidate"
confidence: 0.5
type: "decision"
scope: "team"
tags: ["review"]
identifiers: []
evidence:
  injected: 0
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
created: "2026-03-31"
updated: "2026-03-31"
supersedes: null
extractedBy: "manual"
---

## Context
Team review convention

## Content
Require one reviewer who did not author the touched module.
`);

    const { generateCompoundRules } = await import('../src/core/config-injector.js');
    const rules = generateCompoundRules({
      ...baseContext,
      scope: {
        ...baseContext.scope,
        team: {
          name: 'alpha-pack',
          version: '1.0.0',
          packPath: '/tmp/packs/alpha-pack',
          solutionCount: 0,
          ruleCount: 1,
          syncStatus: 'synced' as const,
        },
        summary: 'me:0s/0r, team:alpha-pack, project:0s',
      },
    });

    expect(rules).toContain('Require one reviewer who did not author the touched module.');
    expect(rules).not.toContain('name: "review-rule"');
  });
});
