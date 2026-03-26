import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseFrontmatterOnly, parseSolutionV3, serializeSolutionV3 } from './solution-format.js';
import type { SolutionFrontmatter, SolutionStatus } from './solution-format.js';
import { track } from '../lab/tracker.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('compound-lifecycle');
import { ME_SOLUTIONS, ME_RULES } from '../core/paths.js';

export interface LifecycleResult {
  promoted: string[];
  demoted: string[];
  retired: string[];
  contradictions: string[];
}

/** Confidence-status consistency thresholds */
const STATUS_CONFIDENCE_MIN: Record<SolutionStatus, number> = {
  mature: 0.75,
  verified: 0.5,
  candidate: 0.2,
  experiment: 0.05,
  retired: 0,
};

/** Get the next promotion status */
export function nextStatus(current: SolutionStatus): SolutionStatus | null {
  switch (current) {
    case 'experiment': return 'candidate';
    case 'candidate': return 'verified';
    case 'verified': return 'mature';
    default: return null;
  }
}

/** Get confidence for a status level */
export function statusConfidence(status: SolutionStatus): number {
  switch (status) {
    case 'experiment': return 0.3;
    case 'candidate': return 0.6;
    case 'verified': return 0.8;
    case 'mature': return 0.85;
    case 'retired': return 0;
  }
}

/** Check promotion eligibility */
export function checkPromotion(fm: SolutionFrontmatter): boolean {
  const ev = fm.evidence;

  switch (fm.status) {
    case 'experiment':
      // A: reflected >= 2 AND negative == 0 AND sessions >= 2
      // B: reExtracted >= 1 AND negative == 0
      return (ev.negative === 0) && (
        (ev.reflected >= 2 && ev.sessions >= 2) ||
        (ev.reExtracted >= 1)
      );

    case 'candidate':
      // A: reflected >= 4 AND negative == 0 AND sessions >= 3
      // B: reExtracted >= 2 AND negative == 0
      return (ev.negative === 0) && (
        (ev.reflected >= 4 && ev.sessions >= 3) ||
        (ev.reExtracted >= 2)
      );

    case 'verified':
      // reflected >= 8, negative <= 1, sessions >= 5
      return ev.reflected >= 8 && ev.negative <= 1 && ev.sessions >= 5;

    default:
      return false;
  }
}

/** Check if solution should be demoted due to confidence-status mismatch */
export function checkConfidenceDemotion(fm: SolutionFrontmatter): SolutionStatus | null {
  if (fm.status === 'retired') return null;

  // Check from highest to lowest
  if (fm.status === 'mature' && fm.confidence < STATUS_CONFIDENCE_MIN.mature) return 'verified';
  if (fm.status === 'verified' && fm.confidence < STATUS_CONFIDENCE_MIN.verified) return 'candidate';
  if (fm.status === 'candidate' && fm.confidence < STATUS_CONFIDENCE_MIN.candidate) return 'experiment';
  if (fm.status === 'experiment' && fm.confidence < STATUS_CONFIDENCE_MIN.experiment) return 'retired';

  return null;
}

/** Check if solution identifiers still exist in codebase (staleness detection) */
export function checkIdentifierStaleness(fm: SolutionFrontmatter, cwd: string): boolean {
  if (fm.identifiers.length === 0) return false; // no identifiers to check
  try {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    let found = 0;
    for (const id of fm.identifiers.slice(0, 5)) { // check max 5 to limit I/O
      if (id.length < 4) continue;
      try {
        execSync(`grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' -l '${id.replace(/'/g, "\\'")}' . 2>/dev/null | head -1`, { cwd, encoding: 'utf-8', timeout: 3000 });
        found++;
      } catch { /* grep found nothing */ }
    }
    return found === 0; // stale if NO identifiers found in codebase
  } catch { return false; } // don't mark stale on error
}

/** Check if solution is stale (90 days no injection) */
export function isStale(fm: SolutionFrontmatter): boolean {
  if (fm.status === 'retired') return false;
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  if (fm.evidence.injected === 0) {
    // Never injected — check age
    const created = new Date(fm.created).getTime();
    const age = Date.now() - created;
    return age > ninetyDaysMs;
  }
  // Has been injected — check last update
  const updated = new Date(fm.updated).getTime();
  const age = Date.now() - updated;
  return age > ninetyDaysMs;
}

/** Update a solution file with new frontmatter */
export function updateSolutionFile(filePath: string, updates: Partial<SolutionFrontmatter>): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const solution = parseSolutionV3(content);
    if (!solution) return false;

    const today = new Date().toISOString().split('T')[0];
    solution.frontmatter = {
      ...solution.frontmatter,
      ...updates,
      updated: today,
    };

    fs.writeFileSync(filePath, serializeSolutionV3(solution), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** Run lifecycle check on all solutions */
export function runLifecycleCheck(sessionId: string = 'system'): LifecycleResult {
  const result: LifecycleResult = { promoted: [], demoted: [], retired: [], contradictions: [] };

  const dirs = [ME_SOLUTIONS, ME_RULES];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    let files: string[];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { continue; }

    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const fm = parseFrontmatterOnly(content);
        if (!fm || fm.status === 'retired') continue;

        // 1. Check stale
        if (isStale(fm)) {
          if (updateSolutionFile(filePath, { status: 'retired', confidence: 0 })) {
            result.retired.push(fm.name);
            track('compound-demoted', sessionId, { solutionName: fm.name, reason: 'stale-90d' });
          }
          continue;
        }

        // 2. Check confidence-status consistency
        const demoteTo = checkConfidenceDemotion(fm);
        if (demoteTo) {
          if (updateSolutionFile(filePath, { status: demoteTo, confidence: statusConfidence(demoteTo) })) {
            result.demoted.push(`${fm.name}: ${fm.status} → ${demoteTo}`);
            track('compound-demoted', sessionId, { solutionName: fm.name, from: fm.status, to: demoteTo, reason: 'confidence-mismatch' });
          }
          continue;
        }

        // 3. Check promotion
        if (checkPromotion(fm)) {
          const next = nextStatus(fm.status);
          if (next) {
            if (updateSolutionFile(filePath, { status: next, confidence: statusConfidence(next) })) {
              result.promoted.push(`${fm.name}: ${fm.status} → ${next}`);
              track('compound-promoted', sessionId, { solutionName: fm.name, from: fm.status, to: next });
            }
          }
          continue;
        }

        // 4. Circuit breaker: experiment with negative >= 2 → retired
        if (fm.status === 'experiment' && fm.evidence.negative >= 2) {
          if (updateSolutionFile(filePath, { status: 'retired', confidence: 0 })) {
            result.retired.push(`${fm.name} (circuit-breaker)`);
            track('compound-demoted', sessionId, { solutionName: fm.name, reason: 'circuit-breaker' });
          }
        }
      } catch (e) {
        log.debug(`lifecycle check failed: ${file}`, e);
      }
    }
  }

  // 5. Contradiction detection
  result.contradictions = detectContradictions(dirs);

  // 6. Emit precision metrics
  const total = result.promoted.length + result.demoted.length + result.retired.length;
  if (total > 0) {
    track('compound-precision', sessionId, {
      promoted: result.promoted.length,
      demoted: result.demoted.length,
      retired: result.retired.length,
      contradictions: result.contradictions.length,
    });
  }

  return result;
}

/** Detect contradictions between solutions */
export function detectContradictions(dirs: string[]): string[] {
  const contradictions: string[] = [];
  const solutions: Array<{ name: string; tags: string[]; identifiers: string[] }> = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const fm = parseFrontmatterOnly(content);
        if (!fm || fm.status === 'retired') continue;
        solutions.push({ name: fm.name, tags: fm.tags, identifiers: fm.identifiers });
      }
    } catch { /* 솔루션 파일 파싱 실패 무시 — 중복 감지는 best-effort */ }
  }

  // Pairwise comparison
  for (let i = 0; i < solutions.length; i++) {
    for (let j = i + 1; j < solutions.length; j++) {
      const a = solutions[i];
      const b = solutions[j];

      // Tags overlap > 70%
      const overlap = a.tags.filter(t => b.tags.includes(t));
      const overlapRatio = overlap.length / Math.max(a.tags.length, b.tags.length, 1);
      if (overlapRatio < 0.7) continue;

      // Identifiers completely different
      const idOverlap = a.identifiers.filter(id => b.identifiers.includes(id));
      if (idOverlap.length === 0 && a.identifiers.length > 0 && b.identifiers.length > 0) {
        contradictions.push(`${a.name} vs ${b.name} (tags ${(overlapRatio * 100).toFixed(0)}% overlap, identifiers disjoint)`);
      }
    }
  }

  return contradictions;
}

/** Manual verify command: immediately promote to verified */
export function verifySolution(solutionName: string): boolean {
  const dirs = [ME_SOLUTIONS, ME_RULES];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const fm = parseFrontmatterOnly(content);
        if (!fm || fm.name !== solutionName) continue;
        if (fm.status === 'verified' || fm.status === 'mature') return true; // already verified
        return updateSolutionFile(filePath, { status: 'verified', confidence: 0.8 });
      }
    } catch { /* 솔루션 파일 읽기/업데이트 실패 무시 — false 반환으로 재시도 가능 */ }
  }
  return false;
}
