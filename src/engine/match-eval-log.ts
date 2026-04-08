/**
 * Match eval log — JSONL ranking-decision writer (T3 of the Round 3 plan).
 *
 * Why this module exists:
 *   The bootstrap evaluator (`evaluateSolutionMatcher`) measures matcher
 *   quality against a labeled fixture, but production traffic is open-ended.
 *   T2 hoisted query normalization out of the per-solution loop, which is
 *   fast, but it also hid the "what did we actually rank, and why?" signal
 *   from offline review. This module appends a single JSONL line per matcher
 *   call capturing the normalized query, the top candidates with their
 *   matched terms, and which ones the caller ultimately surfaced.
 *
 *   The target consumer is offline analysis: a reviewer can tail or grep
 *   the file to spot systematic recall misses or spurious matches without
 *   instrumenting production.
 *
 * Privacy posture (T3 security review fix):
 *   The raw user prompt is NEVER written to disk. Instead, we store a
 *   short SHA-256 prefix (`rawQueryHash`) plus character length
 *   (`rawQueryLen`). This keeps dedup and "was the prompt substantial"
 *   signals available for offline analysis while eliminating the PII /
 *   API-key / credential leakage risk of persisting raw prompts in
 *   `~/.tenetx/state/match-eval-log.jsonl`. The `normalizedQuery` array
 *   already carries the matching-signal payload and is safe to persist
 *   because it only contains short tag tokens (never the full prompt).
 *
 * Operational principles:
 *   1. **Off the critical path.** Never throw; never block. A failed write
 *      is silently swallowed — the hook must continue to return its
 *      solutions even if the log is misconfigured, read-only, or full.
 *   2. **Bounded record size.** Candidates are capped at 5 (the matcher's
 *      own top-5 cap). `normalizedQuery` is capped at 64 terms. Each
 *      candidate's `matchedTerms` is capped at 16. Worst-case record ≈
 *      2KB, which stays under Linux PIPE_BUF=4096 for safe concurrent
 *      appends on local filesystems.
 *   3. **Symlink defense.** `fs.openSync` with `O_NOFOLLOW` refuses to
 *      follow a symlink at the log path. Without this guard, an attacker
 *      with write access to `~/.tenetx/state/` could redirect appends to
 *      `~/.ssh/authorized_keys`, `~/.bashrc`, or other sensitive files.
 *   4. **File-lock for concurrency.** Uses `withFileLockSync` to serialize
 *      concurrent writers. macOS PIPE_BUF=512 is smaller than the worst-
 *      case record size so POSIX atomic append alone isn't enough.
 *   5. **Opt-out via env, fail-closed on invalid config.**
 *      `TENETX_MATCH_EVAL_LOG=off|disabled|0|false|no` disables entirely.
 *      `TENETX_MATCH_EVAL_LOG_SAMPLE=<float 0..1>` samples. An invalid
 *      sample value (NaN, out of range, whitespace) falls back to 0
 *      (skip) rather than 1 (log everything) — fail-closed for privacy.
 *   6. **File size cap.** `readMatchEvalLog` refuses to parse files
 *      larger than 50 MB to prevent OOM in the offline analyzer. Callers
 *      are responsible for rotating the log externally.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { constants as fsc } from 'node:fs';
import { createHash } from 'node:crypto';
import { MATCH_EVAL_LOG_PATH } from '../core/paths.js';
import { createLogger } from '../core/logger.js';
import { withFileLockSync } from '../hooks/shared/file-lock.js';

const log = createLogger('match-eval-log');

/** Environment variable controlling log enable/disable. */
export const MATCH_EVAL_LOG_ENV = 'TENETX_MATCH_EVAL_LOG';

/** Environment variable controlling sample rate (0.0 – 1.0). */
export const MATCH_EVAL_LOG_SAMPLE_ENV = `${MATCH_EVAL_LOG_ENV}_SAMPLE`;

/** Max candidates to log per record (mirrors matcher top-5). */
const MAX_CANDIDATES_LOGGED = 5;

/** Max normalized-query terms to log — defends against large synonym families. */
const MAX_NORMALIZED_QUERY_LOGGED = 64;

/** Max matched-terms per candidate — prevents pathological spam. */
const MAX_MATCHED_TERMS_PER_CANDIDATE = 16;

/** Read-side DoS guard: refuse to load if the JSONL file is larger than this. */
const MAX_LOG_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Single ranking decision captured at matcher call time.
 *
 * Rationale for each field:
 *   - `source`: distinguishes the hook path (`solution-injector`) from the
 *     MCP path (`solution-reader.searchSolutions`). They have different
 *     query shapes and the log should support filtering by origin.
 *   - `rawQueryHash`: first 16 hex chars of SHA-256 over the user prompt.
 *     Enables dedup ("this query shape recurred") without persisting the
 *     prompt text. NOT cryptographically reversible — only useful for
 *     grouping identical queries in offline analysis.
 *   - `rawQueryLen`: character count of the original prompt. A rough
 *     "was this a substantial query?" signal that helps triage.
 *   - `normalizedQuery`: the output of `defaultNormalizer.normalizeTerms`
 *     over `extractTags(rawQuery)`. This is what actually drove matching,
 *     so it's the most important piece for debugging ranking surprises.
 *     Only short tag tokens — safe to persist.
 *   - `candidates`: top-N ranked solutions with relevance and matched
 *     terms. Bounded by `MAX_CANDIDATES_LOGGED`.
 *   - `rankedTopN`: the names of the top-N solutions the CALLER RECEIVED
 *     from the matcher at the time of logging. This is the pre-filter top
 *     (hook path) or post-`limit` top (MCP path). Caller-side budget /
 *     experiment / disjoint filtering happens AFTER logging and is not
 *     captured here — by design, this field records what the matcher
 *     returned, not what the hook ultimately injected.
 *   - `ts`: ISO 8601 timestamp. Always set by the logger, never by the
 *     caller — prevents clock injection from polluting the log.
 */
export interface MatchEvalLogRecord {
  source: 'hook' | 'mcp';
  rawQueryHash: string;
  rawQueryLen: number;
  normalizedQuery: string[];
  candidates: Array<{
    name: string;
    relevance: number;
    matchedTerms: string[];
  }>;
  rankedTopN: string[];
  ts: string;
}

/**
 * Caller payload. `ts` and `rawQueryHash`/`rawQueryLen` are derived by
 * the logger from the caller-supplied `rawQuery`. `rawQuery` itself is
 * consumed in-process only and never written to disk.
 */
export interface MatchEvalLogInput {
  source: 'hook' | 'mcp';
  /** Raw user prompt. Hashed + length-captured, never persisted. */
  rawQuery: string;
  normalizedQuery: string[];
  candidates: Array<{
    name: string;
    relevance: number;
    matchedTerms: string[];
  }>;
  /**
   * Top-N by relevance that the matcher returned to the caller at log
   * time. See `MatchEvalLogRecord.rankedTopN` for semantics — this is
   * NOT the post-filter "actually injected" set.
   */
  rankedTopN: string[];
}

/**
 * Check whether logging is disabled via environment variable.
 * Accepts `off`, `disabled`, `0`, `false`, `no` (case-insensitive).
 */
function isDisabled(): boolean {
  const raw = process.env[MATCH_EVAL_LOG_ENV];
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === 'off' || v === 'disabled' || v === '0' || v === 'false' || v === 'no';
}

/**
 * Read the sample rate from environment. Defaults to 1.0 (log everything).
 * Invalid values (non-numeric, out of range, whitespace-only) fall back to
 * 0 — fail-closed for privacy. Rationale: if an operator mistypes
 * `SAMPLE=01` (intended 0.1) and we default to 1.0, they get 10× more
 * records than they expected. Fail-closed is safer.
 */
function getSampleRate(): number {
  const raw = process.env[MATCH_EVAL_LOG_SAMPLE_ENV];
  if (raw === undefined) return 1.0;
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 1) return 0;
  return n;
}

/** Compute a privacy-safe hash + length pair from the raw prompt. */
function hashRawQuery(rawQuery: string): { hash: string; len: number } {
  const hash = createHash('sha256').update(rawQuery).digest('hex').slice(0, 16);
  // Use [...rawQuery].length to get code-point count rather than UTF-16
  // unit count — a more honest "characters" metric for mixed-script text.
  const len = [...rawQuery].length;
  return { hash, len };
}

/**
 * Append a single ranking decision to the match-eval-log JSONL file.
 *
 * Fail-open: any error is caught and debug-logged. Callers can invoke
 * this without guarding — the logger will never bubble an exception into
 * the hook critical path.
 */
export function logMatchDecision(input: MatchEvalLogInput): void {
  try {
    if (isDisabled()) return;

    const sampleRate = getSampleRate();
    if (sampleRate <= 0) return;
    if (sampleRate < 1 && Math.random() >= sampleRate) return;

    // Derive privacy-safe hash from rawQuery; never persist the prompt.
    const { hash, len } = hashRawQuery(input.rawQuery);

    // Bound record size before serialization.
    const record: MatchEvalLogRecord = {
      source: input.source,
      rawQueryHash: hash,
      rawQueryLen: len,
      normalizedQuery: input.normalizedQuery.slice(0, MAX_NORMALIZED_QUERY_LOGGED),
      candidates: input.candidates.slice(0, MAX_CANDIDATES_LOGGED).map(c => ({
        name: c.name,
        relevance: c.relevance,
        matchedTerms: c.matchedTerms.slice(0, MAX_MATCHED_TERMS_PER_CANDIDATE),
      })),
      rankedTopN: input.rankedTopN.slice(0, MAX_CANDIDATES_LOGGED),
      ts: new Date().toISOString(),
    };

    // Serialize FIRST so any toJSON throw is caught before we touch disk.
    const line = `${JSON.stringify(record)}\n`;

    // Ensure STATE_DIR exists (idempotent). mode 0o700 matches other
    // sensitive state under ~/.tenetx/state/.
    const dir = path.dirname(MATCH_EVAL_LOG_PATH);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    // Use a file lock — POSIX atomic append only guarantees atomicity
    // under PIPE_BUF (512 on macOS). Records can approach 2KB worst-case
    // so concurrent writers could interleave without this lock. The lock
    // is taken on the log file itself, and cleaned up by withFileLockSync.
    withFileLockSync(MATCH_EVAL_LOG_PATH, () => {
      // O_NOFOLLOW: refuse to follow a symlink at the target path. This
      // blocks a local-attacker symlink swap attack where the log file
      // is replaced with a link to e.g. ~/.ssh/authorized_keys.
      // O_APPEND: POSIX atomic append within the lock (defense in depth).
      // O_CREAT with 0o600: create with owner-only mode if absent.
      const fd = fs.openSync(
        MATCH_EVAL_LOG_PATH,
        fsc.O_WRONLY | fsc.O_CREAT | fsc.O_APPEND | fsc.O_NOFOLLOW,
        0o600,
      );
      try {
        // Enforce mode on pre-existing files (0o600 in openSync only
        // applies on creation; an existing file with different permissions
        // keeps them unless we fchmod).
        try {
          fs.fchmodSync(fd, 0o600);
        } catch { /* best-effort: fchmod may fail on non-owned files */ }
        fs.writeSync(fd, line);
      } finally {
        fs.closeSync(fd);
      }
    });
  } catch (e) {
    // Fail-open: never rethrow. Debug-log so the failure is discoverable
    // via the standard logger if it turns out to be persistent.
    log.debug(`logMatchDecision failed (swallowed): ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Read all records from the match-eval-log file. Intended for tests and
 * offline analysis tools; NOT for hot-path use.
 *
 * Malformed lines (non-JSON, missing required fields, wrong shape) are
 * silently skipped — preserves the debug value of the rest of the file
 * if one entry gets corrupted by a partial write or tool error.
 *
 * DoS guard: refuses to read files larger than `MAX_LOG_FILE_SIZE_BYTES`
 * to prevent OOM when a long-running log grows unbounded. Returns [] in
 * that case and debug-logs the skip.
 */
export function readMatchEvalLog(): MatchEvalLogRecord[] {
  try {
    if (!fs.existsSync(MATCH_EVAL_LOG_PATH)) return [];

    // Symlink check on read too — don't exfiltrate arbitrary files if the
    // path has been swapped.
    const lst = fs.lstatSync(MATCH_EVAL_LOG_PATH);
    if (lst.isSymbolicLink()) {
      log.debug('readMatchEvalLog: refusing to read a symlinked log path');
      return [];
    }
    if (lst.size > MAX_LOG_FILE_SIZE_BYTES) {
      log.debug(`readMatchEvalLog: file exceeds ${MAX_LOG_FILE_SIZE_BYTES} bytes, skipping`);
      return [];
    }

    const content = fs.readFileSync(MATCH_EVAL_LOG_PATH, 'utf-8');
    const out: MatchEvalLogRecord[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (isValidRecord(parsed)) {
          out.push(parsed);
        }
      } catch {
        // Skip malformed lines
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Runtime shape check for a parsed record. Strict validation of every
 * field including per-candidate shape — a downstream consumer that calls
 * `rec.candidates[0].matchedTerms.slice(0, 3)` must not crash on a
 * malformed entry.
 */
function isValidRecord(v: unknown): v is MatchEvalLogRecord {
  if (v == null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (r.source !== 'hook' && r.source !== 'mcp') return false;
  if (typeof r.rawQueryHash !== 'string') return false;
  if (typeof r.rawQueryLen !== 'number') return false;
  if (!Array.isArray(r.normalizedQuery)) return false;
  if (!r.normalizedQuery.every(t => typeof t === 'string')) return false;
  if (!Array.isArray(r.candidates)) return false;
  for (const c of r.candidates) {
    if (c == null || typeof c !== 'object') return false;
    const cc = c as Record<string, unknown>;
    if (typeof cc.name !== 'string') return false;
    if (typeof cc.relevance !== 'number') return false;
    if (!Array.isArray(cc.matchedTerms)) return false;
    if (!cc.matchedTerms.every(t => typeof t === 'string')) return false;
  }
  if (!Array.isArray(r.rankedTopN)) return false;
  if (!r.rankedTopN.every(t => typeof t === 'string')) return false;
  if (typeof r.ts !== 'string') return false;
  return true;
}
