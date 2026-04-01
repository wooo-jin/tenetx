import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFrontmatterOnly, parseSolutionV3, serializeSolutionV3 } from './solution-format.js';
import type { SolutionFrontmatter, SolutionStatus } from './solution-format.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('compound-lifecycle');
import { ME_SOLUTIONS, ME_RULES } from '../core/paths.js';

/** Circuit breaker negative thresholds by status */
const CIRCUIT_BREAKER_THRESHOLDS: Record<string, number> = {
  experiment: 2,
  candidate: 3,
  verified: 4,
};

/** Minimum age (ms) before promotion is allowed */
const MIN_AGE_FOR_PROMOTION: Record<string, number> = {
  experiment: 7 * 24 * 60 * 60 * 1000,   // 7 days
  candidate: 14 * 24 * 60 * 60 * 1000,    // 14 days
  verified: 7 * 24 * 60 * 60 * 1000,      // 7 days (prevents instant mature)
};

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

/** Get confidence for a status level.
 * Spacing: 0.25 between levels for meaningful differentiation in matching scores.
 * Previous: 0.3/0.6/0.8/0.85 had only 0.05 gap between verified and mature. */
export function statusConfidence(status: SolutionStatus): number {
  switch (status) {
    case 'experiment': return 0.3;
    case 'candidate': return 0.55;
    case 'verified': return 0.75;
    case 'mature': return 0.90;
    case 'retired': return 0;
  }
}

/** Check promotion eligibility */
export function checkPromotion(fm: SolutionFrontmatter): boolean {
  const ev = fm.evidence;

  switch (fm.status) {
    case 'experiment':
      // A: reflected >= 3 AND negative == 0 AND sessions >= 3 (Beta(4,1) → P(rate>0.5)=0.94)
      // B: reExtracted >= 2 AND negative == 0 AND reflected >= 1 (prevents trivial re-extraction)
      return (ev.negative === 0) && (
        (ev.reflected >= 3 && ev.sessions >= 3) ||
        (ev.reExtracted >= 2 && ev.reflected >= 1)
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
    const validIds = fm.identifiers.slice(0, 5).filter(id => id.length >= 6);
    // All identifiers were too short — nothing to grep, treat as stale (matches original behavior)
    if (validIds.length === 0) return true;
    // Escape regex metacharacters and join with OR for a single grep call
    // (previously: one execFileSync per identifier — up to 15s worst case)
    const pattern = validIds.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    execFileSync('grep', [
      '-r', '-E',
      '--include=*.ts', '--include=*.tsx',
      '--include=*.js', '--include=*.jsx',
      '--exclude-dir=node_modules',
      '--exclude-dir=dist',
      '--exclude-dir=.git',
      '-l', '-m', '1', pattern, '.',
    ], { cwd, encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    return false; // grep exit 0 = at least one identifier found = not stale
  } catch (e: unknown) {
    // grep exit 1 = no matches found = stale
    // Other errors (timeout, ENOENT) = don't penalize — same as original outer catch behavior
    const status = (e as NodeJS.ErrnoException & { status?: number }).status;
    return status === 1;
  }
}

/** Status-specific staleness thresholds (days).
 * experiment decays faster, mature gets longer grace period. */
const STALENESS_DAYS: Record<string, number> = {
  experiment: 60,
  candidate: 90,
  verified: 120,
  mature: 120,
};

/** Check if solution is stale (status-specific inactivity threshold) */
export function isStale(fm: SolutionFrontmatter): boolean {
  if (fm.status === 'retired') return false;
  const staleDays = STALENESS_DAYS[fm.status] ?? 90;
  const ninetyDaysMs = staleDays * 24 * 60 * 60 * 1000;

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

    // Atomic write: tmp → rename. 크래시 시 파일 corruption 방지.
    // 다른 상태 파일은 atomicWriteJSON 사용, Markdown은 텍스트이므로 인라인 구현.
    const tmpFile = `${filePath}.tmp.${process.pid}`;
    fs.writeFileSync(tmpFile, serializeSolutionV3(solution), 'utf-8');
    fs.renameSync(tmpFile, filePath);
    return true;
  } catch (e) {
    // tmp 파일 정리 시도
    try { fs.unlinkSync(`${filePath}.tmp.${process.pid}`); } catch { /* ignore */ }
    log.debug(`Failed to update solution file: ${filePath}`, e);
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
          }
          continue;
        }

        // 2. Check confidence-status consistency
        const demoteTo = checkConfidenceDemotion(fm);
        if (demoteTo) {
          if (updateSolutionFile(filePath, { status: demoteTo, confidence: statusConfidence(demoteTo) })) {
            result.demoted.push(`${fm.name}: ${fm.status} → ${demoteTo}`);
          }
          continue;
        }

        // 3. Circuit breaker BEFORE promotion — negative evidence takes priority
        const cbThreshold = CIRCUIT_BREAKER_THRESHOLDS[fm.status];
        if (cbThreshold !== undefined && fm.evidence.negative >= cbThreshold) {
          if (updateSolutionFile(filePath, { status: 'retired', confidence: 0 })) {
            result.retired.push(`${fm.name} (circuit-breaker:${fm.status})`);
          }
          continue;
        }

        // 4. Check promotion FIRST (with minimum age gate based on updated timestamp)
        //    Promotion must run before identifier staleness to give solutions a chance
        //    to be promoted before being penalized for stale identifiers.
        if (checkPromotion(fm)) {
          const minAgeMs = MIN_AGE_FOR_PROMOTION[fm.status] ?? 0;
          const ageMs = Date.now() - new Date(fm.updated || fm.created).getTime();
          if (ageMs >= minAgeMs) {
            const next = nextStatus(fm.status);
            if (next) {
              if (updateSolutionFile(filePath, { status: next, confidence: statusConfidence(next) })) {
                result.promoted.push(`${fm.name}: ${fm.status} → ${next}`);
              }
            }
            continue;
          }
        }

        // 5. Identifier staleness — code references no longer exist
        if (fm.identifiers.length > 0) {
          const effectiveCwd = process.env.COMPOUND_CWD ?? process.cwd();
          if (checkIdentifierStaleness(fm, effectiveCwd)) {
            const newConf = Math.max(0, fm.confidence - 0.20);
            if (updateSolutionFile(filePath, { confidence: newConf })) {
              result.demoted.push(`${fm.name}: identifier-stale (confidence → ${newConf})`);
            }
          }
        }
      } catch (e) {
        log.debug(`lifecycle check failed: ${file}`, e);
      }
    }
  }

  // 5. Contradiction detection
  result.contradictions = detectContradictions(dirs);

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

  // Pre-build tag Sets for O(1) lookup — avoids O(m²) per pair
  const tagSets = solutions.map(s => new Set(s.tags));

  // Pairwise comparison
  for (let i = 0; i < solutions.length; i++) {
    for (let j = i + 1; j < solutions.length; j++) {
      const a = solutions[i];
      const b = solutions[j];

      // Tags overlap > 70%
      const overlap = a.tags.filter(t => tagSets[j].has(t));
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
