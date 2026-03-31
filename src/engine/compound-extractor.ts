/**
 * Tenetx — Compound Knowledge Extractor
 *
 * Extracts reusable patterns and decisions from git history and session context.
 * Runs quality gates (structure, toxicity, trivial, dedup) before persisting solutions.
 *
 * Module Structure:
 * - Lines 1-50: Imports, constants, SHA validation, LastExtraction/ExtractedSolution interfaces
 * - Lines 50-115: Git helpers — getNewCommits, getCommitMessages, getGitDiff, getDiffStats
 * - Lines 115-190: Quality Gates — gate0 (worth extracting), gate1 (structure), gate2 (toxicity),
 *     gateTrivial (trivial rejection), gate3 (dedup)
 * - Lines 190-275: extractFromDiff — pattern extraction from git diff (modules, errors, imports, commits)
 * - Lines 275-395: extractFromSessionContext — prompt/write history analysis (actions, hotspots, tech)
 * - Lines 396-475: saveExtractedSolution, updateReExtractedCounter — solution persistence
 * - Lines 477-555: runExtraction — main entry point orchestrating gates + extraction + state
 * - Lines 557-634: processExtractionResults, isExtractionPaused, pauseExtraction, resumeExtraction
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serializeSolutionV3, DEFAULT_EVIDENCE, extractTags } from './solution-format.js';
import type { SolutionV3, SolutionType } from './solution-format.js';
import { track } from '../lab/tracker.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('compound-extractor');
import { CLAUDE_DIR, ME_SOLUTIONS, STATE_DIR } from '../core/paths.js';
import { atomicWriteJSON } from '../hooks/shared/atomic-write.js';

const LAST_EXTRACTION_PATH = path.join(STATE_DIR, 'last-extraction.json');
const MAX_EXTRACTIONS_PER_DAY = 5;
const MAX_DIFF_LENGTH = 3000;

/** Validate that a string is a valid git SHA (7-64 hex chars) */
function isValidSha(sha: string): boolean {
  return /^[a-f0-9]{7,64}$/.test(sha);
}

interface LastExtraction {
  lastCommitSha: string;
  lastExtractedAt: string;
  extractionsToday: number;
  todayDate: string;
}

interface ExtractedSolution {
  name: string;
  type: SolutionType;
  tags: string[];
  identifiers: string[];
  context: string;
  content: string;
}

interface WriteContextEntry {
  filePath: string;
  contentSnippet: string;
  fileExtension: string;
}

interface ExtractionAnalysis {
  state: LastExtraction;
  today: string;
  headSha: string;
  extracted: ExtractedSolution[];
  reason?: string;
  stats?: { files: number; lines: number; hasCodeFiles: boolean };
  persistStateWithoutSaving: boolean;
}

/** Load last extraction state */
function loadLastExtraction(): LastExtraction {
  try {
    if (fs.existsSync(LAST_EXTRACTION_PATH)) {
      return JSON.parse(fs.readFileSync(LAST_EXTRACTION_PATH, 'utf-8'));
    }
  } catch (e) { log.debug('last extraction state read failed — may cause duplicate extractions', e); }
  return { lastCommitSha: '', lastExtractedAt: '', extractionsToday: 0, todayDate: '' };
}

/** Save last extraction state */
function saveLastExtraction(state: LastExtraction): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  atomicWriteJSON(LAST_EXTRACTION_PATH, state);
}

/** Get new commits since last extraction — uses execFileSync to prevent injection */
function getNewCommits(cwd: string, lastSha: string): string {
  try {
    if (!lastSha || !isValidSha(lastSha)) {
      return execFileSync('git', ['log', '--oneline', '-5'], { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    }
    return execFileSync('git', ['log', '--oneline', `${lastSha}..HEAD`], { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

/** Get commit messages for "why" context enrichment */
function getCommitMessages(cwd: string, lastSha: string): string {
  try {
    const args = lastSha && isValidSha(lastSha)
      ? ['log', '--format=%B', `${lastSha}..HEAD`]
      : ['log', '--format=%B', '-5'];
    const msgs = execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 5000 });
    return msgs.slice(0, 1000).trim();
  } catch {
    return '';
  }
}

/** Get git diff for extraction */
function getGitDiff(cwd: string, lastSha: string): string {
  try {
    const args = lastSha && isValidSha(lastSha)
      ? ['diff', `${lastSha}..HEAD`]
      : ['diff', 'HEAD~1'];
    const diff = execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 10000 });
    return diff.slice(0, MAX_DIFF_LENGTH);
  } catch {
    return '';
  }
}

/** Get diff stats for Gate 0 */
function getDiffStats(cwd: string, lastSha: string): { files: number; lines: number; hasCodeFiles: boolean } {
  try {
    const args = lastSha && isValidSha(lastSha)
      ? ['diff', '--stat', `${lastSha}..HEAD`]
      : ['diff', '--stat', 'HEAD~1'];
    const stat = execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 5000 });
    const lines = stat.split('\n').filter(l => l.trim());
    const codeExts = /\.(ts|tsx|js|jsx|py|rs|go|java|rb|c|cpp|h|swift|kt)$/;
    const hasCodeFiles = lines.some(line => {
      const filePath = line.split('|')[0]?.trim() ?? '';
      return codeExts.test(filePath);
    });
    const lastLine = lines[lines.length - 1] ?? '';
    const changedMatch = lastLine.match(/(\d+)\s+files?\s+changed/);
    const insertMatch = lastLine.match(/(\d+)\s+insertion/);
    const deleteMatch = lastLine.match(/(\d+)\s+deletion/);
    const fileCount = parseInt(changedMatch?.[1] ?? '0', 10);
    const lineCount = parseInt(insertMatch?.[1] ?? '0', 10) + parseInt(deleteMatch?.[1] ?? '0', 10);
    return { files: fileCount, lines: lineCount, hasCodeFiles };
  } catch {
    return { files: 0, lines: 0, hasCodeFiles: false };
  }
}

// --- Blocklist for Gate 2 (Toxicity Filter) ---
const TOXICITY_PATTERNS = [
  /@ts-ignore/i, /@ts-nocheck/i, /as\s+any\b/i,
  /--force\b/i, /--no-verify\b/i, /--skip-ci\b/i,
  /eslint-disable/i, /prettier-ignore/i, /noqa/i,
  /\bTODO:/i, /\bFIXME:/i, /\bHACK:/i, /\bXXX:/i,
  /\/Users\//i, /\/home\//i, /C:\\\\Users/i,
];

// --- Quality Gates ---

/** Gate 0: Is this extraction worth doing? */
function gate0(stats: { files: number; lines: number; hasCodeFiles: boolean }): boolean {
  if (stats.files < 1) return false;
  if (stats.lines < 30) return false;
  if (!stats.hasCodeFiles) return false;
  return true;
}

/** Gate 1: Structural validation (pure — does not mutate input) */
function gate1(sol: ExtractedSolution): boolean {
  if (!sol.name || sol.name.length < 3) return false;
  if (!sol.tags || sol.tags.length === 0) return false;
  if (!sol.content || sol.content.length < 50) return false;
  if (!sol.context) return false;
  return true;
}

/** Gate 2: Toxicity filter */
function gate2(sol: ExtractedSolution): boolean {
  const text = `${sol.context} ${sol.content}`;
  return !TOXICITY_PATTERNS.some(p => p.test(text));
}

/**
 * Gate 2.5: Trivial pattern rejection — 자명한 패턴은 축적할 가치 없음.
 * "주로 TypeScript를 작성합니다" 수준의 솔루션은 Claude가 코드를 보면 알 수 있으므로
 * compound에 저장하면 컨텍스트만 낭비됨.
 */
function gateTrivial(sol: ExtractedSolution): boolean {
  const content = sol.content.trim();
  // 내용이 너무 짧으면 자명함 (한 줄짜리)
  if (content.length < 80) return false;
  // "주로 X를 Y합니다" 패턴
  if (/^주로\s/.test(content) && content.split('\n').length < 3) return false;
  // 식별자가 하나도 없으면 구체적인 기술 패턴이 아님
  if (sol.identifiers.length === 0 && sol.tags.length < 3) return false;
  return true;
}

/** Gate 3: Dedup check against existing solutions */
function gate3(sol: ExtractedSolution): 'new' | 're-extract' | 'duplicate' {
  if (!fs.existsSync(ME_SOLUTIONS)) return 'new';
  try {
    const files = fs.readdirSync(ME_SOLUTIONS).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(ME_SOLUTIONS, file), 'utf-8');
      const tagMatch = content.match(/tags:\s*\[([^\]]*)\]/);
      if (!tagMatch) continue;
      const existingTags = tagMatch[1].split(',').map(t => t.trim().replace(/"/g, ''));
      const overlap = sol.tags.filter(t => existingTags.includes(t));
      const overlapRatio = overlap.length / Math.max(sol.tags.length, existingTags.length, 1);
      if (overlapRatio >= 0.7) {
        if (content.includes('status: "experiment"') || content.includes("status: 'experiment'") || content.includes('status: experiment')) {
          return 're-extract';
        }
        return 'duplicate';
      }
    }
  } catch (e) { log.debug('gate3 기존 솔루션 파일 읽기 실패 — new로 간주', e); }
  return 'new';
}

/** Simple local extraction from git diff (no LLM needed) */
function extractFromDiff(gitLog: string, gitDiff: string): ExtractedSolution[] {
  const solutions: ExtractedSolution[] = [];

  // 1. Detect new files/modules created
  const newFiles = gitDiff.match(/^\+\+\+ b\/(.+)$/gm);
  if (newFiles && newFiles.length >= 2) {
    const fileNames = newFiles.map(f => f.replace('+++ b/', ''));
    const ext = path.extname(fileNames[0]);
    const dir = path.dirname(fileNames[0]).split('/').pop() ?? '';
    if (ext && dir) {
      const basenames = fileNames.map(f => path.basename(f, ext));
      const commonPrefix = findCommonPrefix(basenames);
      if (commonPrefix.length >= 3) {
        solutions.push({
          name: `module-${commonPrefix}-pattern`,
          type: 'pattern',
          tags: extractTags(`${fileNames.join(' ')} ${dir}`),
          identifiers: basenames.filter(b => b.length >= 4).slice(0, 5),
          context: `File organization pattern in ${dir}/`,
          content: `Files follow the naming pattern: ${commonPrefix}*${ext} in ${dir}/`,
        });
      }
    }
  }

  // 2. Detect error handling patterns from diff
  const errorPatterns = gitDiff.match(/^\+.*(?:try\s*\{|catch\s*[({]|\.catch\(|throw new|Error\()/gm);
  if (errorPatterns && errorPatterns.length >= 3) {
    const sample = errorPatterns.slice(0, 3).map(l => l.replace(/^\+\s*/, '').trim());
    solutions.push({
      name: 'error-handling-pattern',
      type: 'pattern',
      tags: ['error', 'handling', 'try-catch', 'pattern'],
      identifiers: sample.filter(s => s.length >= 4).slice(0, 3),
      context: 'Error handling approach used in this codebase',
      content: `Consistent error handling: ${sample.join('; ')}`.slice(0, 500),
    });
  }

  // 3. Detect import/dependency patterns
  const imports = gitDiff.match(/^\+\s*import\s+.+from\s+['"]([^'"]+)['"]/gm);
  if (imports && imports.length >= 3) {
    const packages = imports
      .map(i => i.match(/from\s+['"]([^'"]+)['"]/)?.[1])
      .filter((p): p is string => !!p && !p.startsWith('.'))
      .filter((v, i, a) => a.indexOf(v) === i);

    if (packages.length >= 2) {
      solutions.push({
        name: 'dependency-stack',
        type: 'decision',
        tags: ['dependency', 'stack', ...packages.slice(0, 3)],
        identifiers: packages.filter(p => p.length >= 4).slice(0, 5),
        context: 'Technology stack and dependency choices',
        content: `Project uses: ${packages.join(', ')}`,
      });
    }
  }

  // 4. Detect from commit messages
  const commitKeywords: Record<string, { type: ExtractedSolution['type']; tags: string[] }> = {
    'fix': { type: 'troubleshoot', tags: ['bugfix', 'troubleshoot'] },
    'refactor': { type: 'pattern', tags: ['refactor', 'cleanup'] },
    'test': { type: 'pattern', tags: ['testing', 'tdd'] },
    'security': { type: 'pattern', tags: ['security', 'hardening'] },
  };

  for (const [keyword, meta] of Object.entries(commitKeywords)) {
    const re = new RegExp(`^[a-f0-9]+\\s+${keyword}[:\\s](.+)$`, 'gim');
    const matches = [...gitLog.matchAll(re)];
    if (matches.length >= 2) {
      const descriptions = matches.map(m => m[1].trim()).slice(0, 3);
      solutions.push({
        name: `${keyword}-pattern`,
        type: meta.type,
        tags: [...meta.tags, keyword],
        identifiers: [],
        context: `Recurring ${keyword} pattern from commit history`,
        content: descriptions.join('. ').slice(0, 500),
      });
    }
  }

  return solutions.slice(0, 3); // max 3
}

/** Extract patterns from accumulated session context (prompts + writes + diff) */
function extractFromSessionContext(
  gitDiff: string,
  cwd: string,
  lastExtractedAt: string,
): ExtractedSolution[] {
  const solutions: ExtractedSolution[] = [];

  const claudeContext = loadClaudeProjectSessionContext(cwd, lastExtractedAt);

  // Load recent prompts
  let prompts = claudeContext.prompts;
  if (prompts.length === 0) {
    prompts = loadPromptHistoryFallback();
  }

  // Load recent writes
  let writes = claudeContext.writes;
  if (writes.length === 0) {
    writes = loadWriteHistoryFallback();
  }

  // 1. Detect recurring request patterns from prompts
  // Group similar prompts by extracting key action words
  const actionPatterns: Record<string, number> = {};
  for (const p of prompts) {
    // Extract "verb + object" patterns
    const verbPatterns = p.match(/(?:만들|작성|수정|추가|삭제|리팩|테스트|검토|분석|설계|배포|fix|create|add|remove|refactor|test|review|analyze|design|deploy)\w*/gi);
    if (verbPatterns) {
      for (const vp of verbPatterns) {
        const key = vp.toLowerCase().slice(0, 20);
        actionPatterns[key] = (actionPatterns[key] ?? 0) + 1;
      }
    }
  }

  // Find dominant action patterns (appear 3+ times)
  const dominantActions = Object.entries(actionPatterns)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (dominantActions.length > 0) {
    const actionList = dominantActions.map(([action, count]) => `${action}(${count}회)`).join(', ');
    solutions.push({
      name: 'recurring-task-pattern',
      type: 'decision',
      tags: ['workflow', 'recurring', ...dominantActions.map(([a]) => a)],
      identifiers: [],
      context: 'Frequently requested actions across sessions',
      content: `User frequently requests: ${actionList}. Consider automating or templating these recurring tasks.`,
    });
  }

  // 2. Detect file co-modification patterns from writes
  // Which files are always modified together?
  const sessionFiles: Record<string, Set<string>> = {};
  for (const w of writes) {
    const dir = w.filePath.split('/').slice(-2, -1)[0] ?? '';
    const ext = w.fileExtension;
    const key = `${dir}/${ext}`;
    if (!sessionFiles[key]) sessionFiles[key] = new Set();
    sessionFiles[key].add(w.filePath);
  }

  // Find directories with many modifications
  const fileGroups: Record<string, string[]> = {};
  for (const [key, files] of Object.entries(sessionFiles)) {
    if (files.size >= 3) {
      fileGroups[key] = [...files].slice(0, 5);
    }
  }

  if (Object.keys(fileGroups).length > 0) {
    const hotspots = Object.entries(fileGroups)
      .map(([dir, files]) => `${dir}: ${files.length} files`)
      .join(', ');
    solutions.push({
      name: 'modification-hotspot',
      type: 'pattern',
      tags: ['workflow', 'hotspot', 'files', ...Object.keys(fileGroups).slice(0, 3)],
      identifiers: Object.values(fileGroups).flat().map(f => f.split('/').pop() ?? '').filter(n => n.length >= 4).slice(0, 5),
      context: 'Frequently modified file areas',
      content: `Active development areas: ${hotspots}. These areas may benefit from better abstractions or tooling.`,
    });
  }

  // 3. Detect decision patterns from prompt + diff correlation
  // When user asks about X and diff shows Y, the decision is "for X, use Y"
  const techDecisions: string[] = [];
  const techTerms = ['react', 'vue', 'next', 'express', 'fastify', 'prisma', 'drizzle', 'zustand', 'redux', 'tailwind', 'styled', 'vitest', 'jest', 'playwright', 'cypress'];
  for (const term of techTerms) {
    const inPrompts = prompts.some(p => p.toLowerCase().includes(term));
    const inDiff = gitDiff.toLowerCase().includes(term);
    if (inPrompts && inDiff) {
      techDecisions.push(term);
    }
  }

  if (techDecisions.length >= 2) {
    solutions.push({
      name: 'tech-stack-decision',
      type: 'decision',
      tags: ['stack', 'technology', ...techDecisions.slice(0, 5)],
      identifiers: techDecisions.filter(t => t.length >= 4).slice(0, 5),
      context: 'Technology choices confirmed by both discussion and implementation',
      content: `Active technology stack: ${techDecisions.join(', ')}. Both discussed in prompts and present in code changes.`,
    });
  }

  return solutions;
}

function normalizeProjectPath(cwd: string): string {
  const resolved = path.resolve(cwd);
  try {
    return typeof fs.realpathSync.native === 'function'
      ? fs.realpathSync.native(resolved)
      : fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function getProjectPathCandidates(cwd: string): string[] {
  const resolved = path.resolve(cwd);
  const candidates = new Set<string>([resolved, normalizeProjectPath(cwd)]);

  try {
    if (fs.lstatSync(resolved).isSymbolicLink()) {
      candidates.add(path.resolve(path.dirname(resolved), fs.readlinkSync(resolved)));
    }
  } catch {
    // Ignore lstat/readlink failures; raw + realpath candidates are enough.
  }

  for (const candidate of [...candidates]) {
    candidates.add(normalizeProjectPath(candidate));
  }

  return [...candidates];
}

function getClaudeProjectDirs(cwd: string): string[] {
  return getProjectPathCandidates(cwd)
    .map(candidate => path.join(CLAUDE_DIR, 'projects', candidate.replace(/[:\\/]/g, '-')));
}

function listClaudeSessionFiles(projectDirs: string[], maxFiles: number): Array<{ filePath: string; mtimeMs: number }> {
  return projectDirs
    .flatMap(projectDir =>
      fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(file => {
          const filePath = path.join(projectDir, file);
          return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
        }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, maxFiles);
}

function getAllClaudeProjectDirs(): string[] {
  const projectsRoot = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsRoot)) return [];

  return fs.readdirSync(projectsRoot)
    .map(name => path.join(projectsRoot, name))
    .filter(dir => {
      try {
        return fs.statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });
}

function collectClaudeProjectSessionContext(
  files: Array<{ filePath: string; mtimeMs: number }>,
  cwdCandidates: Set<string>,
  cutoffMs: number,
): { prompts: string[]; writes: WriteContextEntry[] } {
  const prompts: string[] = [];
  const writes: WriteContextEntry[] = [];

  for (const file of files) {
    const lines = fs.readFileSync(file.filePath, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const entryCandidates = typeof entry.cwd === 'string' ? getProjectPathCandidates(entry.cwd) : [];
      if (!entryCandidates.some(candidate => cwdCandidates.has(candidate))) continue;

      const timestamp = typeof entry.timestamp === 'string' ? new Date(entry.timestamp).getTime() : Number.NaN;
      if (cutoffMs && Number.isFinite(timestamp) && timestamp <= cutoffMs) continue;

      if (entry.type === 'user') {
        const message = entry.message as { role?: string; content?: unknown } | undefined;
        if (message?.role === 'user' && typeof message.content === 'string') {
          prompts.push(message.content);
        }
        continue;
      }

      if (entry.type !== 'assistant') continue;
      const message = entry.message as { role?: string; content?: unknown } | undefined;
      if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;

      for (const item of message.content) {
        if (typeof item !== 'object' || item === null) continue;
        const toolUse = item as {
          type?: string;
          name?: string;
          input?: Record<string, unknown>;
        };
        if (toolUse.type !== 'tool_use') continue;
        if (toolUse.name !== 'Write' && toolUse.name !== 'Edit') continue;
        const filePath = String(toolUse.input?.file_path ?? toolUse.input?.filePath ?? '');
        const content = String(toolUse.input?.content ?? toolUse.input?.new_string ?? '');
        if (!filePath || !content) continue;
        writes.push({
          filePath: filePath.slice(-100),
          contentSnippet: content.slice(0, 200),
          fileExtension: path.extname(filePath).toLowerCase(),
        });
      }
    }
  }

  return {
    prompts: prompts.slice(-50),
    writes: writes.slice(-30),
  };
}

function loadPromptHistoryFallback(): string[] {
  const promptHistoryPath = path.join(STATE_DIR, 'prompt-history.jsonl');
  try {
    if (!fs.existsSync(promptHistoryPath)) return [];
    const lines = fs.readFileSync(promptHistoryPath, 'utf-8').split('\n').filter(Boolean);
    return lines.slice(-50).map(l => {
      try { return JSON.parse(l).prompt as string; } catch { return ''; }
    }).filter(Boolean);
  } catch (e) {
    log.debug('prompt-history.jsonl 읽기 실패 — session context fallback 건너뜀', e);
    return [];
  }
}

function loadWriteHistoryFallback(): WriteContextEntry[] {
  const writeHistoryPath = path.join(STATE_DIR, 'write-history.jsonl');
  try {
    if (!fs.existsSync(writeHistoryPath)) return [];
    const lines = fs.readFileSync(writeHistoryPath, 'utf-8').split('\n').filter(Boolean);
    return lines.slice(-30).map(l => {
      try { return JSON.parse(l) as WriteContextEntry; } catch { return null; }
    }).filter((entry): entry is WriteContextEntry => entry !== null);
  } catch (e) {
    log.debug('write-history.jsonl 읽기 실패 — session context fallback 건너뜀', e);
    return [];
  }
}

function loadClaudeProjectSessionContext(
  cwd: string,
  lastExtractedAt: string,
): { prompts: string[]; writes: WriteContextEntry[] } {
  const cwdCandidates = new Set(getProjectPathCandidates(cwd));
  const projectDirs = getClaudeProjectDirs(cwd).filter(dir => fs.existsSync(dir));
  const cutoffMs = lastExtractedAt ? new Date(lastExtractedAt).getTime() : 0;

  try {
    if (projectDirs.length > 0) {
      const primary = collectClaudeProjectSessionContext(listClaudeSessionFiles(projectDirs, 5), cwdCandidates, cutoffMs);
      if (primary.prompts.length > 0 || primary.writes.length > 0) return primary;
    }

    const fallbackDirs = getAllClaudeProjectDirs().filter(dir => !projectDirs.includes(dir));
    if (fallbackDirs.length === 0) return { prompts: [], writes: [] };

    return collectClaudeProjectSessionContext(listClaudeSessionFiles(fallbackDirs, 20), cwdCandidates, cutoffMs);
  } catch (e) {
    log.debug('Claude project session context 로드 실패 — fallback 사용', e);
    return { prompts: [], writes: [] };
  }
}

function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  let prefix = strings[0];
  for (const s of strings.slice(1)) {
    while (!s.startsWith(prefix) && prefix.length > 0) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix.replace(/-$/, '');
}

/** Save an extracted solution as experiment */
function saveExtractedSolution(sol: ExtractedSolution, sessionId: string): string | null {
  const today = new Date().toISOString().split('T')[0];
  const slugName = sol.name.toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || `untitled-${Date.now()}`;

  const solution: SolutionV3 = {
    frontmatter: {
      name: slugName,
      version: 1,
      status: 'experiment',
      confidence: 0.3,
      type: sol.type,
      scope: 'me',
      tags: sol.tags.slice(0, 5),
      identifiers: sol.identifiers.filter(id => id.length >= 4),
      evidence: { ...DEFAULT_EVIDENCE },
      created: today,
      updated: today,
      supersedes: null,
      extractedBy: 'auto',
    },
    context: sol.context,
    content: sol.content,
  };

  const filePath = path.join(ME_SOLUTIONS, `${slugName}.md`);
  if (fs.existsSync(filePath)) return null;

  fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
  fs.writeFileSync(filePath, serializeSolutionV3(solution));

  track('compound-extracted', sessionId, {
    solutionName: slugName,
    type: sol.type,
    tags: sol.tags,
  });

  return slugName;
}

/** Increment reExtracted counter on existing solution that matches given tags */
function updateReExtractedCounter(tags: string[]): void {
  if (!fs.existsSync(ME_SOLUTIONS)) return;
  const files = fs.readdirSync(ME_SOLUTIONS).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const filePath = path.join(ME_SOLUTIONS, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const tagMatch = content.match(/tags:\s*\[([^\]]*)\]/);
    if (!tagMatch) continue;
    const existingTags = tagMatch[1].split(',').map(t => t.trim().replace(/"/g, ''));
    const overlap = tags.filter(t => existingTags.includes(t));
    if (overlap.length / Math.max(tags.length, existingTags.length, 1) >= 0.7) {
      const regex = /reExtracted:\s*(\d+)/;
      const match = content.match(regex);
      if (match) {
        const updated = content.replace(regex, `reExtracted: ${parseInt(match[1], 10) + 1}`);
        const today = new Date().toISOString().split('T')[0];
        const final = updated.replace(/updated:\s*"?\d{4}-\d{2}-\d{2}"?/, `updated: "${today}"`);
        fs.writeFileSync(filePath, final, 'utf-8');
      }
      return;
    }
  }
}

/** Main extraction function — called from SessionStart or CLI */
function analyzeExtraction(cwd: string, options?: { enforceDailyLimit?: boolean }): ExtractionAnalysis {
  const state = loadLastExtraction();
  const today = new Date().toISOString().split('T')[0];

  // Reset daily counter if new day
  if (state.todayDate !== today) {
    state.extractionsToday = 0;
    state.todayDate = today;
  }

  // Daily limit check
  if (options?.enforceDailyLimit !== false && state.extractionsToday >= MAX_EXTRACTIONS_PER_DAY) {
    return {
      state,
      today,
      headSha: '',
      extracted: [],
      reason: `일일 추출 한도 도달 (${MAX_EXTRACTIONS_PER_DAY}/일)`,
      persistStateWithoutSaving: false,
    };
  }

  // Check for new commits
  const gitLog = getNewCommits(cwd, state.lastCommitSha);
  if (!gitLog.trim()) {
    return {
      state,
      today,
      headSha: '',
      extracted: [],
      reason: '새 커밋 없음',
      persistStateWithoutSaving: false,
    };
  }

  // Get current HEAD sha
  let headSha = '';
  try {
    headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return {
      state,
      today,
      headSha: '',
      extracted: [],
      reason: 'git HEAD 조회 실패',
      persistStateWithoutSaving: false,
    };
  }

  // Gate 0: Worth extracting?
  const stats = getDiffStats(cwd, state.lastCommitSha);
  if (!gate0(stats)) {
    return {
      state,
      today,
      headSha,
      extracted: [],
      reason: `Gate 0: 추출 가치 부족 (${stats.files} files, ${stats.lines} lines)`,
      stats,
      persistStateWithoutSaving: true,
    };
  }

  // Get diff for extraction prompt
  const gitDiff = getGitDiff(cwd, state.lastCommitSha);

  // Get commit messages for "why" context (addresses feedback: auto-extraction loses reasoning)
  const commitMessages = getCommitMessages(cwd, state.lastCommitSha);

  // Combine git diff analysis + session context analysis
  const diffPatterns = extractFromDiff(gitLog, gitDiff);
  const contextPatterns = extractFromSessionContext(gitDiff, cwd, state.lastExtractedAt);
  const extracted = [...diffPatterns, ...contextPatterns].slice(0, 3); // max 3 total

  // Enrich extracted solutions with commit message context
  if (commitMessages) {
    for (const sol of extracted) {
      sol.context = sol.context
        ? `${sol.context}\n\nCommit context:\n${commitMessages.slice(0, 300)}`
        : `Commit context:\n${commitMessages.slice(0, 300)}`;
    }
  }

  return {
    state,
    today,
    headSha,
    extracted,
    stats,
    persistStateWithoutSaving: false,
  };
}

function evaluateExtractedSolution(sol: ExtractedSolution): { action: 'accept' | 'skip' | 'duplicate' | 're-extract'; message?: string } {
  if (!gate1(sol)) return { action: 'skip', message: `${sol.name ?? 'unnamed'}: Gate 1 실패 (구조 검증)` };
  if (!gate2(sol)) return { action: 'skip', message: `${sol.name}: Gate 2 실패 (독성 필터)` };
  if (!gateTrivial(sol)) return { action: 'skip', message: `${sol.name}: Gate 2.5 실패 (자명한 패턴)` };

  const dupResult = gate3(sol);
  if (dupResult === 'duplicate') return { action: 'duplicate', message: `${sol.name}: Gate 3 중복` };
  if (dupResult === 're-extract') return { action: 're-extract', message: `${sol.name}: 재추출 (기존 솔루션 강화)` };

  return { action: 'accept' };
}

export async function previewExtraction(cwd: string): Promise<{
  preview: ExtractedSolution[];
  skipped: string[];
  reason?: string;
}> {
  const analysis = analyzeExtraction(cwd, { enforceDailyLimit: false });
  if (analysis.reason) {
    return { preview: [], skipped: [], reason: analysis.reason };
  }

  const preview: ExtractedSolution[] = [];
  const skipped: string[] = [];

  for (const sol of analysis.extracted.slice(0, 3)) {
    const evaluation = evaluateExtractedSolution(sol);
    if (evaluation.action === 'accept') {
      preview.push(sol);
      continue;
    }
    if (evaluation.action === 're-extract') {
      skipped.push(evaluation.message ?? `${sol.name}: 재추출`);
      continue;
    }
    skipped.push(evaluation.message ?? `${sol.name}: skipped`);
  }

  return { preview, skipped };
}

/** Main extraction function — called from SessionStart or CLI */
export async function runExtraction(cwd: string, sessionId: string): Promise<{
  extracted: string[];
  skipped: string[];
  reason?: string;
}> {
  const result = { extracted: [] as string[], skipped: [] as string[] };
  const analysis = analyzeExtraction(cwd);

  if (analysis.reason) {
    if (analysis.persistStateWithoutSaving && analysis.headSha) {
      saveLastExtraction({
        ...analysis.state,
        lastCommitSha: analysis.headSha,
        lastExtractedAt: new Date().toISOString(),
      });
    }
    return { ...result, reason: analysis.reason };
  }

  if (analysis.extracted.length > 0) {
    const { saved, skipped } = processExtractionResults(JSON.stringify(analysis.extracted), sessionId);
    result.extracted = saved;
    result.skipped = skipped;
  }

  // Update extraction state
  analysis.state.lastCommitSha = analysis.headSha;
  analysis.state.lastExtractedAt = new Date().toISOString();
  analysis.state.extractionsToday++;
  saveLastExtraction(analysis.state);

  if (analysis.stats) {
    log.debug(`로컬 추출 완료: ${result.extracted.length} saved, ${result.skipped.length} skipped (${analysis.stats.files} files, ${analysis.stats.lines} lines)`);
  }

  return result;
}

/** Process LLM extraction results (called after LLM returns) */
export function processExtractionResults(
  rawJson: string,
  sessionId: string,
): { saved: string[]; skipped: string[] } {
  const saved: string[] = [];
  const skipped: string[] = [];

  let solutions: ExtractedSolution[];
  try {
    solutions = JSON.parse(rawJson);
    if (!Array.isArray(solutions)) return { saved, skipped };
  } catch {
    return { saved, skipped };
  }

  // Max 3 per extraction
  for (const sol of solutions.slice(0, 3)) {
    const evaluation = evaluateExtractedSolution(sol);
    if (evaluation.action === 'skip' || evaluation.action === 'duplicate') {
      skipped.push(evaluation.message ?? `${sol.name}: skipped`);
      continue;
    }
    if (evaluation.action === 're-extract') {
      // Increment reExtracted counter on existing solution
      try { updateReExtractedCounter(sol.tags); } catch (e) { log.debug('re-extract 카운터 업데이트 실패', e); }
      skipped.push(evaluation.message ?? `${sol.name}: 재추출`);
      continue;
    }

    // Clean identifiers before saving (short identifiers are noise)
    sol.identifiers = sol.identifiers.filter(id => id.length >= 4);

    // Save as experiment
    const savedName = saveExtractedSolution(sol, sessionId);
    if (savedName) {
      saved.push(savedName);
    } else {
      skipped.push(`${sol.name}: 파일 이미 존재`);
    }
  }

  return { saved, skipped };
}

/** Check if extraction is paused */
export function isExtractionPaused(): boolean {
  const pausePath = path.join(STATE_DIR, 'extraction-paused');
  return fs.existsSync(pausePath);
}

/** Pause auto-extraction */
export function pauseExtraction(): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, 'extraction-paused'), new Date().toISOString());
}

/** Resume auto-extraction */
export function resumeExtraction(): void {
  const pausePath = path.join(STATE_DIR, 'extraction-paused');
  if (fs.existsSync(pausePath)) fs.unlinkSync(pausePath);
}
