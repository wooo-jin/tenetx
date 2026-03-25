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
    tags: ['format', 'table', 'markdown', 'preference', '표', '정리'],
  },
  {
    name: 'prefer-concise',
    description: '간결하고 짧게 응답합니다',
    patterns: [/간결하게/i, /짧게/i, /간단하게/i, /concise/i, /brief/i, /short/i],
    tags: ['style', 'concise', 'brief', 'preference', '간결', '짧게'],
  },
  {
    name: 'prefer-detailed',
    description: '상세하고 자세하게 설명합니다',
    patterns: [/자세하게/i, /상세하게/i, /detailed/i, /explain\s*(in\s*)?detail/i, /풀어서/i],
    tags: ['style', 'detailed', 'verbose', 'preference', '상세', '자세'],
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
    tags: ['style', 'step-by-step', 'preference', '단계별'],
  },
  {
    name: 'prefer-examples',
    description: '예시를 포함하여 설명합니다',
    patterns: [/예시\s*(포함|추가|들어|보여)/i, /with\s*examples?/i, /example/i, /예를\s*들/i],
    tags: ['style', 'examples', 'preference', '예시'],
  },

  // ── Document/Writing patterns ──
  {
    name: 'prefer-markdown',
    description: '마크다운 형식으로 문서를 작성합니다',
    patterns: [/마크다운/i, /markdown/i, /\.md\s/i],
    tags: ['format', 'markdown', 'document', 'preference'],
  },
  {
    name: 'prefer-bullet-points',
    description: '불릿 포인트로 정리합니다',
    patterns: [/불릿/i, /bullet/i, /리스트로/i, /목록으로/i, /나열/i],
    tags: ['format', 'bullet', 'list', 'preference', '목록', '리스트'],
  },
  {
    name: 'prefer-headers',
    description: '헤더/섹션으로 구조화합니다',
    patterns: [/섹션으로/i, /구조화/i, /헤더/i, /section/i, /structure/i],
    tags: ['format', 'headers', 'structure', 'preference'],
  },
  {
    name: 'prefer-summary-first',
    description: '요약을 먼저 보여주고 상세는 아래에',
    patterns: [/요약.*먼저/i, /summary\s*first/i, /TL;?DR/i, /핵심.*먼저/i],
    tags: ['style', 'summary', 'structure', 'preference', '요약'],
  },

  // ── Analysis/PM patterns ──
  {
    name: 'prefer-pros-cons',
    description: '장단점을 비교하여 분석합니다',
    patterns: [/장단점/i, /pros\s*(and|&)\s*cons/i, /장점.*단점/i, /비교.*분석/i],
    tags: ['analysis', 'comparison', 'pros-cons', 'preference', '장단점', '비교'],
  },
  {
    name: 'prefer-data-driven',
    description: '데이터/수치 기반으로 설명합니다',
    patterns: [/데이터.*기반/i, /수치/i, /통계/i, /data.driven/i, /numbers/i, /metrics/i],
    tags: ['analysis', 'data', 'metrics', 'preference', '데이터', '수치'],
  },
  {
    name: 'prefer-actionable',
    description: '실행 가능한 액션 아이템을 포함합니다',
    patterns: [/액션\s*아이템/i, /action\s*item/i, /실행.*방안/i, /next\s*step/i, /다음\s*단계/i, /할\s*일/i],
    tags: ['output', 'actionable', 'tasks', 'preference', '실행', '액션'],
  },
  {
    name: 'prefer-timeline',
    description: '타임라인/일정을 포함합니다',
    patterns: [/타임라인/i, /일정/i, /timeline/i, /schedule/i, /마일스톤/i, /milestone/i],
    tags: ['planning', 'timeline', 'schedule', 'preference', '일정', '타임라인'],
  },

  // ── Communication style patterns ──
  {
    name: 'prefer-formal',
    description: '격식체/공식적 톤으로 작성합니다',
    patterns: [/격식/i, /공식/i, /formal/i, /존댓말/i, /~습니다/i],
    tags: ['tone', 'formal', 'professional', 'preference', '격식', '공식'],
  },
  {
    name: 'prefer-casual',
    description: '편한 톤으로 작성합니다',
    patterns: [/편하게/i, /casual/i, /반말/i, /~해$/im, /친근/i],
    tags: ['tone', 'casual', 'informal', 'preference', '편하게'],
  },
  {
    name: 'prefer-emoji',
    description: '이모지를 포함합니다',
    patterns: [/이모지/i, /이모티콘/i, /emoji/i, /emoticon/i],
    tags: ['style', 'emoji', 'preference'],
  },
  {
    name: 'prefer-no-emoji',
    description: '이모지를 사용하지 않습니다',
    patterns: [/이모지\s*(빼|없이|제거|금지)/i, /no\s*emoji/i, /without\s*emoji/i],
    tags: ['style', 'no-emoji', 'preference'],
  },

  // ── Design/Visual patterns ──
  {
    name: 'prefer-visual-diagram',
    description: '다이어그램/시각화를 포함합니다',
    patterns: [/다이어그램/i, /시각화/i, /diagram/i, /flowchart/i, /mermaid/i, /그림으로/i],
    tags: ['visual', 'diagram', 'mermaid', 'preference', '다이어그램', '시각화'],
  },
  {
    name: 'prefer-mockup',
    description: 'UI 목업/와이어프레임을 포함합니다',
    patterns: [/목업/i, /와이어프레임/i, /mockup/i, /wireframe/i, /UI.*설계/i],
    tags: ['design', 'mockup', 'wireframe', 'preference'],
  },

  // ── Context/Scope patterns ──
  {
    name: 'prefer-context-aware',
    description: '이전 대화 맥락을 유지합니다',
    patterns: [/아까/i, /이전.*대화/i, /위에서/i, /방금/i, /앞에서/i, /earlier/i, /previously/i],
    tags: ['context', 'continuity', 'preference'],
  },
  {
    name: 'prefer-file-output',
    description: '결과를 파일로 저장합니다',
    patterns: [/파일로\s*(저장|만들|생성|출력)/i, /save\s*(to|as)\s*file/i, /write\s*(to|a)\s*file/i],
    tags: ['output', 'file', 'save', 'preference'],
  },

  // ── Workflow/Process patterns ──
  {
    name: 'workflow-plan-first',
    description: '작업 전 항상 계획을 먼저 세웁니다',
    patterns: [/계획.*먼저/i, /plan\s*first/i, /설계.*먼저/i, /ralplan/i, /계획.*세우/i],
    tags: ['workflow', 'planning', 'plan-first', 'preference'],
  },
  {
    name: 'workflow-tdd',
    description: '테스트를 먼저 작성하는 TDD 방식을 선호합니다',
    patterns: [/tdd/i, /test.*first/i, /테스트.*먼저/i, /red.*green/i],
    tags: ['workflow', 'tdd', 'testing', 'preference'],
  },
  {
    name: 'workflow-review-always',
    description: '작업 후 항상 리뷰를 요청합니다',
    patterns: [/리뷰.*해/i, /review/i, /검토.*해/i, /code.*review/i, /확인.*해/i],
    tags: ['workflow', 'review', 'quality', 'preference'],
  },
  {
    name: 'workflow-autopilot',
    description: '자율 실행(autopilot) 모드를 자주 사용합니다',
    patterns: [/autopilot/i, /자동으로.*해/i, /알아서.*해/i, /자율/i],
    tags: ['workflow', 'autopilot', 'autonomous', 'preference'],
  },
  {
    name: 'workflow-parallel',
    description: '병렬 실행(team/ultrawork)을 선호합니다',
    patterns: [/team\s*mode/i, /ultrawork/i, /병렬/i, /parallel/i, /동시에/i],
    tags: ['workflow', 'parallel', 'team', 'preference'],
  },
  {
    name: 'workflow-iterative',
    description: '반복 수정(ralph) 방식을 선호합니다',
    patterns: [/ralph/i, /반복.*수정/i, /계속.*고쳐/i, /완벽할.*때까지/i, /must\s*complete/i],
    tags: ['workflow', 'iterative', 'ralph', 'preference'],
  },
  {
    name: 'workflow-security-first',
    description: '보안 검토를 항상 포함합니다',
    patterns: [/보안.*검토/i, /security.*review/i, /보안.*확인/i, /취약점/i, /vulnerability/i],
    tags: ['workflow', 'security', 'review', 'preference'],
  },
  {
    name: 'workflow-document-after',
    description: '작업 후 문서화를 항상 합니다',
    patterns: [/문서화/i, /document/i, /README/i, /changelog/i, /기록.*남기/i],
    tags: ['workflow', 'documentation', 'preference'],
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
    fs.appendFileSync(PROMPT_HISTORY_PATH, `${JSON.stringify(entry)}\n`);

    // Rotate if too large
    try {
      const content = fs.readFileSync(PROMPT_HISTORY_PATH, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      if (lines.length > MAX_HISTORY_LINES) {
        const trimmed = `${lines.slice(-MAX_HISTORY_LINES).join('\n')}\n`;
        fs.writeFileSync(PROMPT_HISTORY_PATH, trimmed);
      }
    } catch (e) { debugLog('prompt-learner', 'prompt-history.jsonl rotation 실패 — 파일 계속 증가할 수 있음', e); }
  } catch (e) {
    debugLog('prompt-learner', 'prompt 기록 실패', e);
  }
}

// ── Mode Usage Tracking ──

const MODE_HISTORY_PATH = path.join(STATE_DIR, 'mode-history.jsonl');
const MAX_MODE_HISTORY = 200;

interface ModeEntry {
  mode: string;
  timestamp: string;
  sessionId: string;
}

/** Record an execution mode activation */
export function recordModeUsage(mode: string, sessionId: string): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const entry: ModeEntry = {
      mode,
      timestamp: new Date().toISOString(),
      sessionId,
    };
    fs.appendFileSync(MODE_HISTORY_PATH, `${JSON.stringify(entry)}\n`);

    // Rotate
    try {
      const lines = fs.readFileSync(MODE_HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
      if (lines.length > MAX_MODE_HISTORY) {
        fs.writeFileSync(MODE_HISTORY_PATH, `${lines.slice(-MAX_MODE_HISTORY).join('\n')}\n`);
      }
    } catch (e) { debugLog('prompt-learner', 'mode-history.jsonl rotation 실패 — 파일 계속 증가할 수 있음', e); }
  } catch (e) {
    debugLog('prompt-learner', 'mode usage 기록 실패', e);
  }
}

/** Detect workflow patterns from mode usage history */
export function detectWorkflowPatterns(sessionId: string = 'system'): {
  detected: string[];
  created: string[];
} {
  const detected: string[] = [];
  const created: string[] = [];

  try {
    if (!fs.existsSync(MODE_HISTORY_PATH)) return { detected, created };
    const lines = fs.readFileSync(MODE_HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
    const entries: ModeEntry[] = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as ModeEntry[];

    if (entries.length < 3) return { detected, created };

    // Count mode usage
    const modeCounts: Record<string, number> = {};
    for (const e of entries) {
      modeCounts[e.mode] = (modeCounts[e.mode] ?? 0) + 1;
    }

    // Detect dominant modes
    const total = entries.length;
    const modePatterns: Array<{ name: string; mode: string; minRatio: number; description: string; tags: string[] }> = [
      { name: 'mode-autopilot-heavy', mode: 'autopilot', minRatio: 0.3, description: 'autopilot 모드를 자주 사용합니다 — 자율 실행 선호', tags: ['workflow', 'autopilot', 'mode'] },
      { name: 'mode-ralph-heavy', mode: 'ralph', minRatio: 0.3, description: 'ralph 모드를 자주 사용합니다 — 완벽할 때까지 반복', tags: ['workflow', 'ralph', 'iterative', 'mode'] },
      { name: 'mode-team-heavy', mode: 'team', minRatio: 0.3, description: 'team 모드를 자주 사용합니다 — 병렬 에이전트 선호', tags: ['workflow', 'team', 'parallel', 'mode'] },
      { name: 'mode-tdd-heavy', mode: 'tdd', minRatio: 0.2, description: 'TDD 모드를 자주 사용합니다 — 테스트 우선 개발', tags: ['workflow', 'tdd', 'testing', 'mode'] },
      { name: 'mode-ultrawork-heavy', mode: 'ultrawork', minRatio: 0.2, description: 'ultrawork 모드를 자주 사용합니다 — 최대 병렬 실행', tags: ['workflow', 'ultrawork', 'burst', 'mode'] },
    ];

    for (const pattern of modePatterns) {
      const count = modeCounts[pattern.mode] ?? 0;
      if (count / total < pattern.minRatio) continue;
      detected.push(`${pattern.name} (${count}/${total})`);

      const solutionPath = path.join(ME_SOLUTIONS, `${pattern.name}.md`);
      if (fs.existsSync(solutionPath)) continue;

      const today = new Date().toISOString().split('T')[0];
      const solution: SolutionV3 = {
        frontmatter: {
          name: pattern.name,
          version: 1,
          status: 'candidate',
          confidence: 0.6,
          type: 'decision',
          scope: 'me',
          tags: pattern.tags,
          identifiers: [],
          evidence: { ...DEFAULT_EVIDENCE, reflected: count },
          created: today,
          updated: today,
          supersedes: null,
          extractedBy: 'auto',
        },
        context: `Detected from ${count}/${total} mode activations`,
        content: pattern.description,
      };

      fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
      fs.writeFileSync(solutionPath, serializeSolutionV3(solution));
      created.push(pattern.name);

      track('compound-extracted', sessionId, {
        solutionName: pattern.name,
        type: 'decision',
        source: 'mode-usage-pattern',
        modeCount: count,
      });
    }
  } catch (e) {
    debugLog('prompt-learner', 'workflow pattern 감지 실패', e);
  }

  return { detected, created };
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

// ── Write Content Tracking ──

const WRITE_HISTORY_PATH = path.join(STATE_DIR, 'write-history.jsonl');
const MAX_WRITE_HISTORY = 200;

interface WriteEntry {
  filePath: string;
  contentSnippet: string;   // first 200 chars
  contentLength: number;
  fileExtension: string;
  timestamp: string;
  sessionId: string;
}

/** Record a Write/Edit tool call for content analysis */
export function recordWriteContent(filePath: string, content: string, sessionId: string): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const ext = path.extname(filePath).toLowerCase();
    const entry: WriteEntry = {
      filePath: filePath.slice(-100),  // last 100 chars of path
      contentSnippet: content.slice(0, 200),
      contentLength: content.length,
      fileExtension: ext,
      timestamp: new Date().toISOString(),
      sessionId,
    };
    fs.appendFileSync(WRITE_HISTORY_PATH, `${JSON.stringify(entry)}\n`);

    // Rotate
    try {
      const lines = fs.readFileSync(WRITE_HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
      if (lines.length > MAX_WRITE_HISTORY) {
        fs.writeFileSync(WRITE_HISTORY_PATH, `${lines.slice(-MAX_WRITE_HISTORY).join('\n')}\n`);
      }
    } catch (e) { debugLog('prompt-learner', 'write-history.jsonl rotation 실패 — 파일 계속 증가할 수 있음', e); }
  } catch (e) {
    debugLog('prompt-learner', 'write content 기록 실패', e);
  }
}

/** Detect content type patterns from write history */
export function detectContentPatterns(sessionId: string = 'system'): {
  detected: string[];
  created: string[];
} {
  const detected: string[] = [];
  const created: string[] = [];

  try {
    if (!fs.existsSync(WRITE_HISTORY_PATH)) return { detected, created };
    const lines = fs.readFileSync(WRITE_HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
    const entries: WriteEntry[] = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

    if (entries.length < 5) return { detected, created };

    // Analyze file extension distribution
    const extCounts: Record<string, number> = {};
    for (const e of entries) {
      extCounts[e.fileExtension] = (extCounts[e.fileExtension] ?? 0) + 1;
    }

    // Detect dominant content types
    const total = entries.length;
    const contentPatterns: Array<{ name: string; description: string; condition: boolean; tags: string[] }> = [
      {
        name: 'works-with-markdown',
        description: '주로 마크다운 문서를 작성합니다',
        condition: ((extCounts['.md'] ?? 0) / total) > 0.3,
        tags: ['content', 'markdown', 'document', 'workflow'],
      },
      {
        name: 'works-with-json-config',
        description: '주로 JSON 설정 파일을 다룹니다',
        condition: ((extCounts['.json'] ?? 0) / total) > 0.3,
        tags: ['content', 'json', 'config', 'workflow'],
      },
      {
        name: 'works-with-typescript',
        description: '주로 TypeScript 코드를 작성합니다',
        condition: (((extCounts['.ts'] ?? 0) + (extCounts['.tsx'] ?? 0)) / total) > 0.3,
        tags: ['content', 'typescript', 'code', 'workflow'],
      },
      {
        name: 'works-with-python',
        description: '주로 Python 코드를 작성합니다',
        condition: ((extCounts['.py'] ?? 0) / total) > 0.3,
        tags: ['content', 'python', 'code', 'workflow'],
      },
      {
        name: 'works-with-styles',
        description: '주로 CSS/스타일 파일을 다룹니다',
        condition: (((extCounts['.css'] ?? 0) + (extCounts['.scss'] ?? 0) + (extCounts['.less'] ?? 0)) / total) > 0.2,
        tags: ['content', 'css', 'design', 'workflow'],
      },
      {
        name: 'writes-long-content',
        description: '긴 문서/파일을 자주 작성합니다 (평균 1000자 이상)',
        condition: entries.reduce((sum, e) => sum + e.contentLength, 0) / total > 1000,
        tags: ['style', 'long-form', 'detailed', 'workflow'],
      },
      {
        name: 'writes-short-content',
        description: '짧은 수정을 자주 합니다 (평균 200자 이하)',
        condition: entries.reduce((sum, e) => sum + e.contentLength, 0) / total < 200,
        tags: ['style', 'short-form', 'quick-edit', 'workflow'],
      },
    ];

    for (const pattern of contentPatterns) {
      if (!pattern.condition) continue;
      detected.push(pattern.name);

      const solutionPath = path.join(ME_SOLUTIONS, `${pattern.name}.md`);
      if (fs.existsSync(solutionPath)) continue;

      const today = new Date().toISOString().split('T')[0];
      const solution: SolutionV3 = {
        frontmatter: {
          name: pattern.name,
          version: 1,
          status: 'candidate',
          confidence: 0.6,
          type: 'decision',
          scope: 'me',
          tags: pattern.tags,
          identifiers: [],
          evidence: { ...DEFAULT_EVIDENCE, reflected: entries.length },
          created: today,
          updated: today,
          supersedes: null,
          extractedBy: 'auto',
        },
        context: `Detected from ${entries.length} write operations`,
        content: pattern.description,
      };

      fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
      fs.writeFileSync(solutionPath, serializeSolutionV3(solution));
      created.push(pattern.name);

      track('compound-extracted', sessionId, {
        solutionName: pattern.name,
        type: 'decision',
        source: 'write-content-pattern',
      });
    }
  } catch (e) {
    debugLog('prompt-learner', 'content pattern 감지 실패', e);
  }

  return { detected, created };
}
