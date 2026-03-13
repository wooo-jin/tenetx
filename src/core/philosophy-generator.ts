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
export function sampleUserHistory(maxMessages = 100): string[] {
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
        .slice(0, 5); // 프로젝트당 최근 5개 세션

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
    .map(m => m.text.length > 200 ? m.text.slice(0, 200) + '...' : m.text);
}

/** claude -p 를 사용하여 철학 생성 */
export function generatePhilosophy(messages: string[]): Philosophy | null {
  if (messages.length === 0) return null;

  const sampleText = messages
    .map((m, i) => `${i + 1}. ${m}`)
    .join('\n');

  const prompt = `아래는 한 개발자가 AI 코딩 에이전트에게 보낸 최근 요청들입니다.
이 패턴을 분석하여, 이 개발자의 개발 철학/스타일을 추론해주세요.

<요청 히스토리>
${sampleText}
</요청 히스토리>

분석 결과를 아래 JSON 형식으로만 출력하세요 (다른 텍스트 없이 순수 JSON만):

{
  "name": "이 철학의 이름 (2-4단어, 영문 kebab-case)",
  "version": "1.0.0",
  "author": "tenet",
  "description": "이 개발자의 스타일을 한 줄로 설명 (한글)",
  "principles": {
    "principle-key-1": {
      "belief": "이 개발자가 중요하게 여기는 신념 (한글)",
      "generates": ["이 신념에서 파생되는 구체적 행동 규칙"]
    },
    "principle-key-2": {
      "belief": "두 번째 신념",
      "generates": ["행동 규칙", {"routing": "explore → Sonnet, implement → Opus"}]
    }
  }
}

원칙은 3~5개가 적절합니다. 개발자의 실제 패턴에서 추론하세요.
routing, alert 같은 generates 객체는 패턴에서 명확히 보일 때만 포함하세요.`;

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
      author: parsed.author ?? 'tenet',
      description: parsed.description,
      principles: parsed.principles ?? {},
    };
  } catch (err) {
    console.error('  [!] Claude 분석 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** 철학을 사람이 읽기 좋게 포맷 */
export function formatPhilosophy(philosophy: Philosophy): string {
  const lines: string[] = [];
  lines.push(`  이름: ${philosophy.name}`);
  if (philosophy.description) {
    lines.push(`  설명: ${philosophy.description}`);
  }
  lines.push('');
  lines.push('  원칙:');

  for (const [key, principle] of Object.entries(philosophy.principles)) {
    lines.push(`    [${key}]`);
    lines.push(`      신념: ${principle.belief}`);
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
