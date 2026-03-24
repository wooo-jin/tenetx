/**
 * Tenetx — Prompt & Content Pattern Learner
 *
 * Analyzes accumulated user prompts and Claude's Write outputs
 * to detect recurring preferences, styles, and patterns.
 * Works for ALL users — not just developers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { serializeSolutionV3, DEFAULT_EVIDENCE } from './solution-format.js';
import type { SolutionV3 } from './solution-format.js';
import { track } from '../lab/tracker.js';
import { debugLog } from '../core/logger.js';
import { ME_SOLUTIONS } from '../core/paths.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');
const PROMPT_HISTORY_PATH = path.join(STATE_DIR, 'prompt-history.jsonl');
const MAX_HISTORY_LINES = 500;  // Keep last 500 prompts
const MIN_PATTERN_COUNT = 3;    // Pattern must appear 3+ times to be extracted

interface PromptEntry {
  prompt: string;
  timestamp: string;
  sessionId: string;
}

// -- Predefined pattern detectors --

interface PatternRule {
  name: string;
  description: string;
  /** Regex patterns to match in prompts */
  patterns: RegExp[];
  /** Tags for the generated solution */
  tags: string[];
}

const PREFERENCE_PATTERNS: PatternRule[] = [
  {
    name: 'prefer-korean',
    description: '항상 한글로 응답합니다',
    patterns: [/한글로/i, /한국어로/i, /korean/i, /한글\s*응답/i, /한글\s*작성/i],
    tags: ['language', 'korean', '한글', 'preference'],
  },
  {
    name: 'prefer-english',
    description: 'Always respond in English',
    patterns: [/english/i, /영어로/i, /in english/i],
    tags: ['language', 'english', 'preference'],
  },
  {
    name: 'prefer-table-format',
    description: '정보를 표 형식으로 정리합니다',
    patterns: [/표로\s*(정리|만들|작성)/i, /table\s*format/i, /마크다운\s*표/i, /테이블로/i],
    tags: ['format', 'table', 'markdown', 'preference'],
  },
  {
    name: 'prefer-concise',
    description: '간결하고 짧게 응답합니다',
    patterns: [/간결하게/i, /짧게/i, /간단하게/i, /concise/i, /brief/i, /short/i],
    tags: ['style', 'concise', 'brief', 'preference'],
  },
  {
    name: 'prefer-detailed',
    description: '상세하고 자세하게 설명합니다',
    patterns: [/자세하게/i, /상세하게/i, /detailed/i, /explain\s*(in\s*)?detail/i, /풀어서/i],
    tags: ['style', 'detailed', 'verbose', 'preference'],
  },
  {
    name: 'prefer-code-comments',
    description: '코드에 주석을 포함합니다',
    patterns: [/주석\s*(포함|추가|넣어|달아)/i, /add\s*comments/i, /with\s*comments/i],
    tags: ['code', 'comments', 'preference'],
  },
  {
    name: 'prefer-step-by-step',
    description: '단계별로 설명합니다',
    patterns: [/단계별/i, /step\s*by\s*step/i, /하나씩/i, /차근차근/i],
    tags: ['style', 'step-by-step', 'preference'],
  },
  {
    name: 'prefer-examples',
    description: '예시를 포함하여 설명합니다',
    patterns: [/예시\s*(포함|추가|들어|보여)/i, /with\s*examples?/i, /example/i, /예를\s*들/i],
    tags: ['style', 'examples', 'preference'],
  },
];

/** Append a prompt to history */
export function recordPrompt(prompt: string, sessionId: string): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const entry: PromptEntry = {
      prompt: prompt.slice(0, 500), // truncate long prompts
      timestamp: new Date().toISOString(),
      sessionId,
    };
    fs.appendFileSync(PROMPT_HISTORY_PATH, JSON.stringify(entry) + '\n');

    // Rotate if too large
    try {
      const content = fs.readFileSync(PROMPT_HISTORY_PATH, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      if (lines.length > MAX_HISTORY_LINES) {
        const trimmed = lines.slice(-MAX_HISTORY_LINES).join('\n') + '\n';
        fs.writeFileSync(PROMPT_HISTORY_PATH, trimmed);
      }
    } catch { /* ignore rotation errors */ }
  } catch (e) {
    debugLog('prompt-learner', 'prompt 기록 실패', e);
  }
}

/** Load prompt history */
function loadPromptHistory(): PromptEntry[] {
  try {
    if (!fs.existsSync(PROMPT_HISTORY_PATH)) return [];
    const content = fs.readFileSync(PROMPT_HISTORY_PATH, 'utf-8');
    return content.split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter((e): e is PromptEntry => e !== null);
  } catch {
    return [];
  }
}

/** Detect recurring preference patterns from prompt history */
export function detectPreferencePatterns(sessionId: string = 'system'): {
  detected: string[];
  created: string[];
} {
  const history = loadPromptHistory();
  if (history.length < MIN_PATTERN_COUNT) return { detected: [], created: [] };

  const detected: string[] = [];
  const created: string[] = [];

  for (const rule of PREFERENCE_PATTERNS) {
    // Count how many prompts match this pattern
    const matchCount = history.filter(entry =>
      rule.patterns.some(p => p.test(entry.prompt))
    ).length;

    if (matchCount >= MIN_PATTERN_COUNT) {
      detected.push(`${rule.name} (${matchCount}회)`);

      // Check if solution already exists
      const solutionPath = path.join(ME_SOLUTIONS, `${rule.name}.md`);
      if (fs.existsSync(solutionPath)) continue;

      // Create new preference solution
      const today = new Date().toISOString().split('T')[0];
      const solution: SolutionV3 = {
        frontmatter: {
          name: rule.name,
          version: 1,
          status: 'candidate',  // preferences start at candidate (user clearly wants this)
          confidence: 0.6,
          type: 'decision',
          scope: 'me',
          tags: rule.tags,
          identifiers: [],
          evidence: { ...DEFAULT_EVIDENCE, reflected: matchCount },
          created: today,
          updated: today,
          supersedes: null,
          extractedBy: 'auto',
        },
        context: `Detected from ${matchCount} prompts across sessions`,
        content: rule.description,
      };

      fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
      fs.writeFileSync(solutionPath, serializeSolutionV3(solution));
      created.push(rule.name);

      track('compound-extracted', sessionId, {
        solutionName: rule.name,
        type: 'decision',
        source: 'prompt-pattern',
        matchCount,
      });
    }
  }

  return { detected, created };
}
