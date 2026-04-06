import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-behavioral-rules',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

describe('generateClaudeRuleFiles behavioral loading', () => {
  const behaviorDir = path.join(TEST_HOME, '.compound', 'me', 'behavior');
  const solutionDir = path.join(TEST_HOME, '.compound', 'me', 'solutions');

  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(behaviorDir, { recursive: true });
    fs.mkdirSync(solutionDir, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('reads behavioral rules from me/behavior and ignores me/solutions', async () => {
    fs.writeFileSync(path.join(behaviorDir, 'prefer-korean.md'), `---
name: "prefer-korean"
version: 1
kind: "preference"
observedCount: 4
confidence: 0.8
tags:
  - "language"
  - "korean"
created: "2026-03-31"
updated: "2026-03-31"
source: "prompt-pattern"
---

## Context
Detected from prompt history

## Content
항상 한글로 응답합니다
`);

    fs.writeFileSync(path.join(solutionDir, 'prefer-korean.md'), `---
name: "prefer-korean"
version: 1
status: "candidate"
confidence: 0.6
type: "decision"
scope: "me"
tags: ["legacy"]
identifiers: []
evidence:
  injected: 0
  reflected: 9
  negative: 0
  sessions: 1
  reExtracted: 0
created: "2026-03-31"
updated: "2026-03-31"
supersedes: null
extractedBy: "auto"
---

## Context
legacy mixed storage

## Content
This old solution file should not be used as a behavioral rule source.
`);

    const { generateClaudeRuleFiles } = await import('../src/core/config-injector.js');
    const files = generateClaudeRuleFiles('/tmp/project');

    expect(files['forge-behavioral.md']).toContain('항상 한글로 응답합니다');
    expect(files['forge-behavioral.md']).toContain('4회 관찰');
    expect(files['forge-behavioral.md']).not.toContain('legacy mixed storage');
  });
});
