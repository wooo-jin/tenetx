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


describe('rule loading contract', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('loads manual rule files from the content section instead of YAML frontmatter keys', async () => {
    const rulesDir = path.join(TEST_HOME, '.tenetx', 'me', 'rules');
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
    const rules = generateCompoundRules('/tmp/project');

    expect(rules).toContain('Always run focused tests before editing shared code.');
    expect(rules).not.toContain('name: "test-rule"');
  });

  it('loads team pack rule files with the same content-first contract', async () => {
    // v1: team scope 제거됨. me/rules만 로드되는 것을 확인.
    const meRulesDir = path.join(TEST_HOME, '.tenetx', 'me', 'rules');
    fs.mkdirSync(meRulesDir, { recursive: true });
    fs.writeFileSync(path.join(meRulesDir, 'review-rule.md'), `---
name: "review-rule"
version: 1
status: "candidate"
confidence: 0.5
type: "decision"
scope: "me"
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
Review convention

## Content
Require one reviewer who did not author the touched module.
`);

    const { generateCompoundRules } = await import('../src/core/config-injector.js');
    const rules = generateCompoundRules('/tmp/project');

    expect(rules).toContain('Require one reviewer who did not author the touched module.');
    expect(rules).not.toContain('name: "review-rule"');
  });
});
