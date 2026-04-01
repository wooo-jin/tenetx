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

describe('prompt-learner pattern detection', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('preference patterns are detected from prompt history', async () => {
    const { recordPrompt, detectPreferencePatterns } = await import('../src/engine/prompt-learner.js');

    recordPrompt('한글로 답변해줘', 's1');
    recordPrompt('한국어로 설명해줘', 's1');
    recordPrompt('한글로 정리해줘', 's1');

    const result = detectPreferencePatterns('s1');

    expect(result.created).toContain('prefer-korean');
    expect(result.detected.some(d => d.includes('prefer-korean'))).toBe(true);
  });

  it('mode patterns are detected from mode usage history', async () => {
    const { recordModeUsage, detectWorkflowPatterns } = await import('../src/engine/prompt-learner.js');

    recordModeUsage('autopilot', 's1');
    recordModeUsage('autopilot', 's1');
    recordModeUsage('autopilot', 's1');

    const result = detectWorkflowPatterns('s1');

    expect(result.created).toContain('mode-autopilot-heavy');
    expect(result.detected.some(d => d.includes('mode-autopilot-heavy'))).toBe(true);
  });

  it('write-content patterns are detected from write history', async () => {
    const { recordWriteContent, detectContentPatterns } = await import('../src/engine/prompt-learner.js');

    for (let i = 0; i < 5; i++) {
      recordWriteContent(`/tmp/doc-${i}.md`, '# heading\n'.repeat(30), 's1');
    }

    const result = detectContentPatterns('s1');

    expect(result.created).toContain('works-with-markdown');
    expect(result.detected).toContain('works-with-markdown');
  });
});
