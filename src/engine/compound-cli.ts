import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseFrontmatterOnly, parseSolutionV3 } from './solution-format.js';

import { ME_SOLUTIONS, ME_RULES } from '../core/paths.js';

interface SolutionSummary {
  name: string;
  status: string;
  confidence: number;
  type: string;
  tags: string[];
  evidence: { injected: number; reflected: number; negative: number; sessions: number; reExtracted: number };
  created: string;
  filePath: string;
}

/** Scan all solution directories and return summaries */
function scanSolutions(): SolutionSummary[] {
  const summaries: SolutionSummary[] = [];
  const dirs = [
    { dir: ME_SOLUTIONS, label: 'solutions' },
    { dir: ME_RULES, label: 'rules' },
  ];

  for (const { dir } of dirs) {
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
  const solutions = scanSolutions();

  if (solutions.length === 0) {
    console.log('\n  No solutions found.\n');
    return;
  }

  // Group by status
  const groups: Record<string, SolutionSummary[]> = {};
  for (const sol of solutions) {
    if (!groups[sol.status]) groups[sol.status] = [];
    groups[sol.status].push(sol);
  }

  const order = ['mature', 'verified', 'candidate', 'experiment', 'retired'];

  console.log('\n  Compound Solutions\n');

  let total = 0;
  for (const status of order) {
    const group = groups[status];
    if (!group || group.length === 0) continue;
    total += group.length;
    console.log(`  [${statusIcon(status)}] ${status} (${group.length})`);
    for (const sol of group) {
      const ev = sol.evidence;
      const evStr = `inj:${ev.injected} ref:${ev.reflected} neg:${ev.negative}`;
      console.log(`      ${sol.name}  (${sol.confidence.toFixed(2)})  ${evStr}  [${sol.tags.slice(0, 3).join(', ')}]`);
    }
  }

  console.log(`\n  Total: ${total} solutions\n`);
}

/** Inspect a single solution in detail */
export function inspectSolution(name: string): void {
  const solutions = scanSolutions();
  const sol = solutions.find(s => s.name === name);

  if (!sol) {
    console.log(`\n  Solution "${name}" not found.\n`);
    return;
  }

  // Read full content
  const content = fs.readFileSync(sol.filePath, 'utf-8');
  const full = parseSolutionV3(content);

  console.log(`\n  Solution: ${sol.name}`);
  console.log(`  Status: ${sol.status} (confidence: ${sol.confidence.toFixed(2)})`);
  console.log(`  Type: ${sol.type}`);
  console.log(`  Tags: [${sol.tags.join(', ')}]`);
  console.log(`  Created: ${sol.created}`);
  console.log(`  Evidence:`);
  console.log(`    injected: ${sol.evidence.injected}`);
  console.log(`    reflected: ${sol.evidence.reflected}`);
  console.log(`    negative: ${sol.evidence.negative}`);
  console.log(`    sessions: ${sol.evidence.sessions}`);
  console.log(`    reExtracted: ${sol.evidence.reExtracted}`);

  if (full) {
    if (full.context) console.log(`\n  Context: ${full.context}`);
    if (full.content) console.log(`\n  Content:\n    ${full.content.split('\n').join('\n    ')}`);
  }

  console.log(`\n  File: ${sol.filePath}\n`);
}

/** Remove a solution by name */
export function removeSolution(name: string): void {
  const solutions = scanSolutions();
  const sol = solutions.find(s => s.name === name);

  if (!sol) {
    console.log(`\n  Solution "${name}" not found.\n`);
    return;
  }

  try {
    fs.unlinkSync(sol.filePath);
    console.log(`\n  Removed: ${name} (${sol.filePath})\n`);
  } catch (e) {
    console.log(`\n  Failed to remove: ${(e as Error).message}\n`);
  }
}

/** Rollback auto-extracted solutions since a given date */
export function rollbackSolutions(sinceDate: string): void {
  const since = new Date(sinceDate);
  if (Number.isNaN(since.getTime())) {
    console.log(`\n  Invalid date: ${sinceDate}\n`);
    return;
  }

  const solutions = scanSolutions();
  const toRemove = solutions.filter(sol => {
    if (sol.evidence.reflected > 0 || sol.evidence.sessions > 0) return false; // keep used ones
    const created = new Date(sol.created);
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
