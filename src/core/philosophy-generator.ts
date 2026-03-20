import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { Philosophy } from './types.js';

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

/** 대화 히스토리에서 user 메시지 추출 */
function extractUserMessages(jsonlPath: string): string[] {
  const messages: string[] = [];
  try {
    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.type !== 'user') continue;
        const content = data.message?.content;
        if (typeof content === 'string') {
          messages.push(content);
        } else if (Array.isArray(content)) {
          for (const c of content) {
            if (c?.type === 'text' && typeof c.text === 'string') {
              messages.push(c.text);
            }
          }
        }
      } catch { /* 라인 파싱 실패 무시 */ }
    }
  } catch { /* 파일 읽기 실패 무시 */ }
  return messages;
}

/** 모든 프로젝트의 대화에서 user 메시지 샘플링 */
export function sampleUserHistory(maxMessages = 500): string[] {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];

  const allMessages: Array<{ text: string; mtime: number }> = [];

  try {
    const projects = fs.readdirSync(CLAUDE_PROJECTS_DIR);
    for (const project of projects) {
      const projectDir = path.join(CLAUDE_PROJECTS_DIR, project);
      if (!fs.statSync(projectDir).isDirectory()) continue;

      const sessions = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
          path: path.join(projectDir, f),
          mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime)
        ; // 모든 세션을 분석 — 철학 생성에는 충분한 데이터가 필요

      for (const session of sessions) {
        const msgs = extractUserMessages(session.path);
        for (const msg of msgs) {
          // 너무 짧은 메시지(인사, 단답)는 제외
          if (msg.length < 10) continue;
          allMessages.push({ text: msg, mtime: session.mtime });
        }
      }
    }
  } catch { /* 디렉토리 순회 실패 무시 */ }

  // 최신순 정렬 후 샘플링
  allMessages.sort((a, b) => b.mtime - a.mtime);

  // 메시지가 너무 길면 잘라내기 (각 200자)
  return allMessages
    .slice(0, maxMessages)
    .map(m => m.text.length > 200 ? `${m.text.slice(0, 200)}...` : m.text);
}

/** claude -p 를 사용하여 철학 생성 */
export function generatePhilosophy(messages: string[]): Philosophy | null {
  if (messages.length === 0) return null;

  const sampleText = messages
    .map((m, i) => `${i + 1}. ${m}`)
    .join('\n');

  const prompt = `Below are recent requests a developer sent to an AI coding agent.
Analyze these patterns and infer the developer's engineering philosophy and style.

<request history>
${sampleText}
</request history>

Output the analysis result ONLY in the following JSON format (pure JSON, no other text):

{
  "name": "name of this philosophy (2-4 words, English kebab-case)",
  "version": "1.0.0",
  "author": "tenetx",
  "description": "one-line description of this developer's style (English)",
  "principles": {
    "principle-key-1": {
      "belief": "a core belief this developer values (English)",
      "generates": ["specific behavioral rules derived from this belief"]
    },
    "principle-key-2": {
      "belief": "a second belief",
      "generates": ["behavioral rule", {"routing": "explore → Sonnet, implement → Opus"}]
    }
  }
}

3 to 5 principles is appropriate. Infer from the developer's actual patterns.
Include generates objects like routing or alert only when clearly visible in the patterns.`;

  try {
    const result = execFileSync('claude', ['-p', '--output-format', 'text', prompt], {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });

    // JSON 추출 (마크다운 코드블록 안에 있을 수 있음)
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      name: parsed.name ?? 'generated',
      version: parsed.version ?? '1.0.0',
      author: parsed.author ?? 'tenetx',
      description: parsed.description,
      principles: parsed.principles ?? {},
    };
  } catch (err) {
    console.error('  [!] Claude analysis failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** 철학을 사람이 읽기 좋게 포맷 */
export function formatPhilosophy(philosophy: Philosophy): string {
  const lines: string[] = [];
  lines.push(`  Name: ${philosophy.name}`);
  if (philosophy.description) {
    lines.push(`  Description: ${philosophy.description}`);
  }
  lines.push('');
  lines.push('  Principles:');

  for (const [key, principle] of Object.entries(philosophy.principles)) {
    lines.push(`    [${key}]`);
    lines.push(`      Belief: ${principle.belief}`);
    for (const gen of principle.generates) {
      if (typeof gen === 'string') {
        lines.push(`      → ${gen}`);
      } else {
        const entries = Object.entries(gen);
        for (const [k, v] of entries) {
          lines.push(`      → (${k}) ${v}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
