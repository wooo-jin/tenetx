import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractTags, parseFrontmatterOnly, parseSolutionV3, serializeSolutionV3 } from './solution-format.js';

import { ME_SOLUTIONS, ME_RULES } from '../core/paths.js';

interface CompoundEntrySummary {
  name: string;
  status: string;
  confidence: number;
  type: string;
  category: 'solution' | 'rule';
  tags: string[];
  evidence: { injected: number; reflected: number; negative: number; sessions: number; reExtracted: number };
  created: string;
  filePath: string;
}

/** Scan saved compound entries and return summaries */
function scanEntries(): CompoundEntrySummary[] {
  const summaries: CompoundEntrySummary[] = [];
  const dirs = [
    { dir: ME_SOLUTIONS, category: 'solution' as const },
    { dir: ME_RULES, category: 'rule' as const },
  ];

  for (const { dir, category } of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const fm = parseFrontmatterOnly(content);
        if (!fm) continue;
        summaries.push({
          name: fm.name,
          status: fm.status,
          confidence: fm.confidence,
          type: fm.type,
          category,
          tags: fm.tags,
          evidence: fm.evidence,
          created: fm.created,
          filePath,
        });
      }
    } catch { /* 개별 솔루션 파일 파싱 실패 무시 — 손상된 파일은 건너뛰기 */ }
  }

  return summaries;
}

/** Status icon */
function statusIcon(status: string): string {
  switch (status) {
    case 'mature': return 'M';
    case 'verified': return 'V';
    case 'candidate': return 'C';
    case 'experiment': return 'E';
    case 'retired': return 'R';
    default: return '?';
  }
}

/** List all solutions with status summary */
export function listSolutions(): void {
  const entries = scanEntries();

  if (entries.length === 0) {
    console.log('\n  No compound entries found.\n');
    return;
  }

  // Group by status
  const groups: Record<string, CompoundEntrySummary[]> = {};
  for (const entry of entries) {
    if (!groups[entry.status]) groups[entry.status] = [];
    groups[entry.status].push(entry);
  }

  const order = ['mature', 'verified', 'candidate', 'experiment', 'retired'];

  console.log('\n  Compound Entries\n');

  let total = 0;
  for (const status of order) {
    const group = groups[status];
    if (!group || group.length === 0) continue;
    total += group.length;
    console.log(`  [${statusIcon(status)}] ${status} (${group.length})`);
    for (const entry of group) {
      const ev = entry.evidence;
      const evStr = `inj:${ev.injected} ref:${ev.reflected} neg:${ev.negative}`;
      console.log(`      ${entry.name} [${entry.category}]  (${entry.confidence.toFixed(2)})  ${evStr}  [${entry.tags.slice(0, 3).join(', ')}]`);
    }
  }

  console.log(`\n  Total: ${total} entries\n`);
}

/** Inspect a single saved entry in detail */
export function inspectSolution(name: string): void {
  const entries = scanEntries();
  const entry = entries.find(s => s.name === name);

  if (!entry) {
    console.log(`\n  Entry "${name}" not found.\n`);
    return;
  }

  // Read full content
  const content = fs.readFileSync(entry.filePath, 'utf-8');
  const full = parseSolutionV3(content);

  console.log(`\n  Entry: ${entry.name}`);
  console.log(`  Category: ${entry.category}`);
  console.log(`  Status: ${entry.status} (confidence: ${entry.confidence.toFixed(2)})`);
  console.log(`  Type: ${entry.type}`);
  console.log(`  Tags: [${entry.tags.join(', ')}]`);
  console.log(`  Created: ${entry.created}`);
  console.log(`  Evidence:`);
  console.log(`    injected: ${entry.evidence.injected}`);
  console.log(`    reflected: ${entry.evidence.reflected}`);
  console.log(`    negative: ${entry.evidence.negative}`);
  console.log(`    sessions: ${entry.evidence.sessions}`);
  console.log(`    reExtracted: ${entry.evidence.reExtracted}`);

  if (full) {
    if (full.context) console.log(`\n  Context: ${full.context}`);
    if (full.content) console.log(`\n  Content:\n    ${full.content.split('\n').join('\n    ')}`);
  }

  console.log(`\n  File: ${entry.filePath}\n`);
}

/** Remove a saved entry by name */
export function removeSolution(name: string): void {
  const entries = scanEntries();
  const entry = entries.find(s => s.name === name);

  if (!entry) {
    console.log(`\n  Entry "${name}" not found.\n`);
    return;
  }

  try {
    fs.unlinkSync(entry.filePath);
    console.log(`\n  Removed: ${name} [${entry.category}] (${entry.filePath})\n`);
  } catch (e) {
    console.log(`\n  Failed to remove: ${(e as Error).message}\n`);
  }
}

/** Retag all solutions using improved extractTags */
export function retagSolutions(): void {
  const entries = scanEntries().filter(e => e.category === 'solution');

  if (entries.length === 0) {
    console.log('\n  No solutions to retag.\n');
    return;
  }

  let retagged = 0;
  for (const entry of entries) {
    try {
      const content = fs.readFileSync(entry.filePath, 'utf-8');
      const parsed = parseSolutionV3(content);
      if (!parsed) continue;

      const source = [parsed.context, parsed.content].filter(Boolean).join(' ');
      const newTags = extractTags(source);
      parsed.frontmatter.tags = newTags;

      const tmpPath = entry.filePath + '.tmp';
      fs.writeFileSync(tmpPath, serializeSolutionV3(parsed));
      fs.renameSync(tmpPath, entry.filePath);
      retagged++;
    } catch {
      console.log(`    Failed: ${entry.name}`);
    }
  }

  console.log(`\n  Retagged ${retagged}/${entries.length} solutions.\n`);
}

/** Rollback auto-extracted solutions since a given date */
export function rollbackSolutions(sinceDate: string): void {
  const since = new Date(sinceDate);
  if (Number.isNaN(since.getTime())) {
    console.log(`\n  Invalid date: ${sinceDate}\n`);
    return;
  }

  const solutions = scanEntries().filter((entry) => entry.category === 'solution');
  const toRemove = solutions.filter((solution) => {
    if (solution.evidence.reflected > 0 || solution.evidence.sessions > 0) return false; // keep used ones
    const created = new Date(solution.created);
    return created >= since;
  });

  if (toRemove.length === 0) {
    console.log(`\n  No solutions to rollback since ${sinceDate}.\n`);
    return;
  }

  console.log(`\n  Rolling back ${toRemove.length} solutions since ${sinceDate}:\n`);
  for (const sol of toRemove) {
    try {
      fs.unlinkSync(sol.filePath);
      console.log(`    Removed: ${sol.name}`);
    } catch {
      console.log(`    Failed: ${sol.name}`);
    }
  }
  console.log();
}
