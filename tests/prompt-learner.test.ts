import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-prompt-learner',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

describe('prompt-learner behavioral storage', () => {
  const behaviorDir = path.join(TEST_HOME, '.compound', 'me', 'behavior');
  const solutionDir = path.join(TEST_HOME, '.compound', 'me', 'solutions');

  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('preference patterns are stored in me/behavior instead of me/solutions', async () => {
    const { recordPrompt, detectPreferencePatterns } = await import('../src/engine/prompt-learner.js');

    recordPrompt('한글로 답변해줘', 's1');
    recordPrompt('한국어로 설명해줘', 's1');
    recordPrompt('한글로 정리해줘', 's1');

    const result = detectPreferencePatterns('s1');

    expect(result.created).toContain('prefer-korean');
    expect(fs.existsSync(path.join(behaviorDir, 'prefer-korean.md'))).toBe(true);
    expect(fs.existsSync(path.join(solutionDir, 'prefer-korean.md'))).toBe(false);

    const content = fs.readFileSync(path.join(behaviorDir, 'prefer-korean.md'), 'utf-8');
    expect(content).toContain('kind: preference');
    expect(content).toContain('observedCount: 3');
    expect(content).not.toContain('evidence:');
  });

  it('mode patterns are stored as workflow behavior files', async () => {
    const { recordModeUsage, detectWorkflowPatterns } = await import('../src/engine/prompt-learner.js');

    recordModeUsage('autopilot', 's1');
    recordModeUsage('autopilot', 's1');
    recordModeUsage('autopilot', 's1');

    const result = detectWorkflowPatterns('s1');

    expect(result.created).toContain('mode-autopilot-heavy');
    const filePath = path.join(behaviorDir, 'mode-autopilot-heavy.md');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(path.join(solutionDir, 'mode-autopilot-heavy.md'))).toBe(false);
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('kind: workflow');
  });

  it('write-content patterns are stored as preference behavior files', async () => {
    const { recordWriteContent, detectContentPatterns } = await import('../src/engine/prompt-learner.js');

    for (let i = 0; i < 5; i++) {
      recordWriteContent(`/tmp/doc-${i}.md`, '# heading\n'.repeat(30), 's1');
    }

    const result = detectContentPatterns('s1');

    expect(result.created).toContain('works-with-markdown');
    const filePath = path.join(behaviorDir, 'works-with-markdown.md');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(path.join(solutionDir, 'works-with-markdown.md'))).toBe(false);
    expect(fs.readFileSync(filePath, 'utf-8')).toContain('kind: preference');
  });
});
