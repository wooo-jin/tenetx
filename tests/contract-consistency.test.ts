import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { KEYWORD_PATTERNS } from '../src/hooks/keyword-detector.js';

const ROOT = path.resolve(__dirname, '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function extractCliCommands(): string[] {
  const source = read('src/cli.ts');
  return [...source.matchAll(/name:\s*'([^']+)'/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'string')
    .slice(0, 11);
}

function extractSlashSkills(): string[] {
  const commandsDir = path.join(ROOT, 'commands');
  return fs.readdirSync(commandsDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => read(path.join('commands', file)).match(/^name:\s*([^\n]+)$/m)?.[1]?.trim())
    .filter((name): name is string => Boolean(name));
}

describe('contract consistency', () => {
  it('CLI and slash skill name overlap stays explicit and reviewed', () => {
    const cliCommands = extractCliCommands();
    const slashSkills = extractSlashSkills();
    const overlap = cliCommands.filter((name) => slashSkills.includes(name));
    expect(overlap).toEqual(['compound']);
  });

  it('compound skill documents that CLI behavior is preview-first', () => {
    const content = read('commands/compound.md');
    expect(content).toContain('CLI `tenetx compound`');
    expect(content).toContain('`--save`');
  });

  it('shared keyword names route through actual skills instead of ad-hoc inject messages', () => {
    const routedAsSkills = new Map(
      KEYWORD_PATTERNS
        .filter((entry) => entry.type === 'skill' && entry.skill)
        .map((entry) => [entry.keyword, entry.skill]),
    );

    expect(routedAsSkills.get('tdd')).toBe('tdd');
    expect(routedAsSkills.get('code-review')).toBe('code-review');
    expect(routedAsSkills.get('security-review')).toBe('security-review');
    expect(routedAsSkills.get('git-master')).toBe('git-master');
    expect(routedAsSkills.get('migrate')).toBe('migrate');
    expect(routedAsSkills.get('debug-detective')).toBe('debug-detective');
    expect(routedAsSkills.get('refactor')).toBe('refactor');
    expect(routedAsSkills.get('ecomode')).toBe('ecomode');
  });

  it('compound preview/save flow is documented in the primary entry docs', () => {
    for (const relPath of ['README.md', 'README.ko.md']) {
      expect(read(relPath)).toContain('tenetx compound --save');
    }
  });

  it('primary docs do not advertise stale hook or pattern counts', () => {
    for (const relPath of ['README.md', 'README.ko.md']) {
      const content = read(relPath);
      expect(content).not.toContain('16 hooks');
      expect(content).not.toContain('16개 훅');
      expect(content).not.toContain('35 patterns');
      expect(content).not.toContain('35개 감지 패턴');
    }
  });

  it('CLI help text reflects compound management', () => {
    const cliSource = read('src/cli.ts');
    expect(cliSource).toContain('Manage accumulated knowledge');
  });

  it('compound command help keeps entry-management wording aligned with rules support', () => {
    const source = read('src/engine/compound-loop.ts');
    expect(source).toContain('List saved entries (solutions and rules)');
    expect(source).toContain('Remove a saved entry');
    expect(source).toContain('Rollback unused auto-extracted solutions since date');
  });
});
