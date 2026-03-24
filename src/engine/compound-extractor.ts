import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { serializeSolutionV3, DEFAULT_EVIDENCE } from './solution-format.js';
import type { SolutionV3, SolutionType } from './solution-format.js';
import { track } from '../lab/tracker.js';
import { debugLog } from '../core/logger.js';
import { ME_SOLUTIONS, STATE_DIR } from '../core/paths.js';
import { atomicWriteJSON } from '../hooks/shared/atomic-write.js';

const LAST_EXTRACTION_PATH = path.join(STATE_DIR, 'last-extraction.json');
const MAX_EXTRACTIONS_PER_DAY = 5;
const MAX_DIFF_LENGTH = 3000;

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

/** Load last extraction state */
function loadLastExtraction(): LastExtraction {
  try {
    if (fs.existsSync(LAST_EXTRACTION_PATH)) {
      return JSON.parse(fs.readFileSync(LAST_EXTRACTION_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { lastCommitSha: '', lastExtractedAt: '', extractionsToday: 0, todayDate: '' };
}

/** Save last extraction state */
function saveLastExtraction(state: LastExtraction): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  atomicWriteJSON(LAST_EXTRACTION_PATH, state);
}

/** Get new commits since last extraction */
function getNewCommits(cwd: string, lastSha: string): string {
  try {
    if (!lastSha) {
      return execSync('git log --oneline -5', { cwd, encoding: 'utf-8', timeout: 5000 });
    }
    return execSync(`git log --oneline ${lastSha}..HEAD`, { cwd, encoding: 'utf-8', timeout: 5000 });
  } catch {
    return '';
  }
}

/** Get git diff for extraction */
function getGitDiff(cwd: string, lastSha: string): string {
  try {
    const diffCmd = lastSha ? `git diff ${lastSha}..HEAD` : 'git diff HEAD~1';
    const diff = execSync(diffCmd, { cwd, encoding: 'utf-8', timeout: 10000 });
    return diff.slice(0, MAX_DIFF_LENGTH);
  } catch {
    return '';
  }
}

/** Get diff stats for Gate 0 */
function getDiffStats(cwd: string, lastSha: string): { files: number; lines: number; hasCodeFiles: boolean } {
  try {
    const statCmd = lastSha ? `git diff --stat ${lastSha}..HEAD` : 'git diff --stat HEAD~1';
    const stat = execSync(statCmd, { cwd, encoding: 'utf-8', timeout: 5000 });
    const lines = stat.split('\n').filter(l => l.trim());
    const codeExts = /\.(ts|tsx|js|jsx|py|rs|go|java|rb|c|cpp|h|swift|kt)$/;
    const hasCodeFiles = lines.some(l => codeExts.test(l));
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

/** Gate 1: Structural validation */
function gate1(sol: ExtractedSolution): boolean {
  if (!sol.name || sol.name.length < 3) return false;
  if (!sol.tags || sol.tags.length === 0) return false;
  if (!sol.content || sol.content.length < 50) return false;
  if (!sol.context) return false;
  sol.identifiers = sol.identifiers.filter(id => id.length >= 4);
  return true;
}

/** Gate 2: Toxicity filter */
function gate2(sol: ExtractedSolution): boolean {
  const text = `${sol.context} ${sol.content}`;
  return !TOXICITY_PATTERNS.some(p => p.test(text));
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
  } catch { /* ignore */ }
  return 'new';
}

/** Build the extraction prompt */
function buildExtractionPrompt(gitLog: string, gitDiff: string): string {
  return `아래 git diff와 커밋 메시지를 분석하여 재사용 가능한 코딩 패턴을 추출하세요.

추출 기준:
- 다른 프로젝트에서도 적용 가능한 구조적 패턴만
- 프로젝트 고유 로직(비즈니스 로직, 특정 API 엔드포인트)은 제외
- 일회성 수정, 타이포 수정, 설정 변경은 제외
- 추출할 것이 없으면 반드시 빈 배열 [] 반환
- identifiers는 코드에 나타날 구체적 클래스/함수/API명 (4글자 이상)

JSON 배열로 반환 (최대 3개):
[{
  "name": "kebab-case-이름",
  "type": "pattern|decision|troubleshoot|anti-pattern",
  "tags": ["최대", "5개"],
  "identifiers": ["구체적식별자"],
  "context": "적용 상황 1줄",
  "content": "실행 가능한 내용 (최대 500자)"
}]

--- Git Log ---
${gitLog}

--- Git Diff (truncated) ---
${gitDiff}`;
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
export async function runExtraction(cwd: string, sessionId: string): Promise<{
  extracted: string[];
  skipped: string[];
  reason?: string;
}> {
  const result = { extracted: [] as string[], skipped: [] as string[] };

  const state = loadLastExtraction();
  const today = new Date().toISOString().split('T')[0];

  // Reset daily counter if new day
  if (state.todayDate !== today) {
    state.extractionsToday = 0;
    state.todayDate = today;
  }

  // Daily limit check
  if (state.extractionsToday >= MAX_EXTRACTIONS_PER_DAY) {
    return { ...result, reason: `일일 추출 한도 도달 (${MAX_EXTRACTIONS_PER_DAY}/일)` };
  }

  // Check for new commits
  const gitLog = getNewCommits(cwd, state.lastCommitSha);
  if (!gitLog.trim()) {
    return { ...result, reason: '새 커밋 없음' };
  }

  // Get current HEAD sha
  let headSha = '';
  try {
    headSha = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8', timeout: 3000 }).trim();
  } catch {
    return { ...result, reason: 'git HEAD 조회 실패' };
  }

  // Gate 0: Worth extracting?
  const stats = getDiffStats(cwd, state.lastCommitSha);
  if (!gate0(stats)) {
    saveLastExtraction({ ...state, lastCommitSha: headSha, lastExtractedAt: new Date().toISOString() });
    return { ...result, reason: `Gate 0: 추출 가치 부족 (${stats.files} files, ${stats.lines} lines)` };
  }

  // Get diff for extraction prompt
  const gitDiff = getGitDiff(cwd, state.lastCommitSha);

  // Build prompt — save for the SessionStart hook / CLI layer to pick up
  const promptPath = path.join(STATE_DIR, 'extraction-prompt.json');
  atomicWriteJSON(promptPath, {
    prompt: buildExtractionPrompt(gitLog, gitDiff),
    cwd,
    sessionId,
    headSha,
    createdAt: new Date().toISOString(),
  });

  // Update extraction state
  state.lastCommitSha = headSha;
  state.lastExtractedAt = new Date().toISOString();
  state.extractionsToday++;
  saveLastExtraction(state);

  debugLog('compound-extractor', `extraction-prompt 생성 완료 (${stats.files} files, ${stats.lines} lines)`);

  return { ...result, reason: 'extraction-prompt 생성 완료 (LLM 호출 대기)' };
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
    // Gate 1: Structure
    if (!gate1(sol)) {
      skipped.push(`${sol.name ?? 'unnamed'}: Gate 1 실패 (구조 검증)`);
      continue;
    }

    // Gate 2: Toxicity
    if (!gate2(sol)) {
      skipped.push(`${sol.name}: Gate 2 실패 (독성 필터)`);
      continue;
    }

    // Gate 3: Dedup
    const dupResult = gate3(sol);
    if (dupResult === 'duplicate') {
      skipped.push(`${sol.name}: Gate 3 중복`);
      continue;
    }
    if (dupResult === 're-extract') {
      // Increment reExtracted counter on existing solution
      try { updateReExtractedCounter(sol.tags); } catch { /* non-blocking */ }
      skipped.push(`${sol.name}: 재추출 (기존 솔루션 강화)`);
      continue;
    }

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
