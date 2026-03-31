import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-compound-cli-preview',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

describe('compound CLI preview-first contract', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_HOME, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('no-arg compound previews extraction instead of entering interactive mode', async () => {
    vi.doMock('../src/engine/compound-extractor.js', () => ({
      previewExtraction: vi.fn().mockResolvedValue({
        preview: [{
          name: 'error-handling-pattern',
          type: 'pattern',
          tags: ['error', 'handling'],
          identifiers: ['handleError'],
          context: 'Detected from git diff',
          content: 'Consistent try/catch handling appears in recent changes.',
        }],
        skipped: [],
      }),
      runExtraction: vi.fn().mockResolvedValue({ extracted: [], skipped: [] }),
      pauseExtraction: vi.fn(),
      resumeExtraction: vi.fn(),
    }));

    const { handleCompound } = await import('../src/engine/compound-loop.js');
    vi.spyOn(process, 'cwd').mockReturnValue(TEST_HOME);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleCompound([]);

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('Compound Preview');
    expect(output).toContain('error-handling-pattern');
    expect(output).toContain('--save');
    expect(output).not.toContain('Interactive mode');
  });

  it('--save persists extracted insights instead of only previewing', async () => {
    const runExtraction = vi.fn().mockResolvedValue({
      extracted: ['error-handling-pattern'],
      skipped: [],
    });

    vi.doMock('../src/engine/compound-extractor.js', () => ({
      previewExtraction: vi.fn().mockResolvedValue({ preview: [], skipped: [] }),
      runExtraction,
      pauseExtraction: vi.fn(),
      resumeExtraction: vi.fn(),
    }));

    const { handleCompound } = await import('../src/engine/compound-loop.js');
    vi.spyOn(process, 'cwd').mockReturnValue(TEST_HOME);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleCompound(['--save']);

    expect(runExtraction).toHaveBeenCalledWith(TEST_HOME, expect.any(String));
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Saved');
  });
});
