#!/usr/bin/env node
/**
 * Tenetx — Auto Compound Runner
 *
 * Detached process로 실행. 이전 세션의 transcript를 분석하여:
 * 1. 재사용 가능한 솔루션 추출 (compound --solution)
 * 2. 사용자 패턴을 USER.md에 축적
 *
 * 호출: session-recovery hook 또는 spawn.ts에서 detached spawn
 * 인자: [cwd] [transcriptPath] [sessionId]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { containsPromptInjection } from '../hooks/prompt-injection-filter.js';

const [,, cwd, transcriptPath, sessionId] = process.argv;

if (!cwd || !transcriptPath || !sessionId) {
  process.exit(1);
}

const COMPOUND_HOME = path.join(os.homedir(), '.compound');
const BEHAVIOR_DIR = path.join(COMPOUND_HOME, 'me', 'behavior');

function extractText(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((x: any) => x?.type === 'text').map((x: any) => x.text ?? '').join('\n');
  return '';
}

function extractSummary(filePath: string, maxChars = 8000): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const messages: string[] = [];
  let totalChars = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' || entry.type === 'queue-operation') {
        const text = extractText(entry.content);
        if (text) { messages.push(`[User] ${text.slice(0, 500)}`); totalChars += text.length; }
      } else if (entry.type === 'assistant') {
        const text = extractText(entry.content);
        if (text) { messages.push(`[Assistant] ${text.slice(0, 500)}`); totalChars += text.length; }
      }
    } catch { /* skip */ }
    if (totalChars > maxChars) break;
  }

  return messages.join('\n\n');
}

try {
  const summary = extractSummary(transcriptPath);
  if (summary.length < 200) process.exit(0);

  // 보안: 프롬프트 인젝션이 포함된 transcript는 분석하지 않음
  if (containsPromptInjection(summary)) {
    process.exit(0);
  }

  // 기존 솔루션 목록 (중복 방지)
  let existingList = '';
  const solDir = path.join(COMPOUND_HOME, 'me', 'solutions');
  if (fs.existsSync(solDir)) {
    const names = fs.readdirSync(solDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')).slice(-30);
    if (names.length > 0) existingList = `\n\n이미 축적된 솔루션 (중복 추출 금지):\n${names.join(', ')}`;
  }

  // 기존 behavior 파일 목록 (중복 패턴 방지)
  let existingBehaviorPatterns = '';
  if (fs.existsSync(BEHAVIOR_DIR)) {
    const behaviorFiles = fs.readdirSync(BEHAVIOR_DIR).filter(f => f.endsWith('.md')).slice(-10);
    if (behaviorFiles.length > 0) {
      const snippets = behaviorFiles.map(f => {
        try { return fs.readFileSync(path.join(BEHAVIOR_DIR, f), 'utf-8').slice(0, 200); } catch { return ''; }
      }).filter(Boolean);
      existingBehaviorPatterns = `\n\n기존 behavior 패턴 (중복 추가 금지):\n${snippets.join('\n---\n')}`;
    }
  }

  // 1단계: 솔루션 추출
  const solutionPrompt = `다음은 이전 Claude Code 세션의 대화 요약입니다. 재사용 가능한 패턴을 추출해주세요.

각 항목: tenetx compound --solution "제목" "설명"
추출할 것이 없으면 "추출할 패턴 없음"이라고만 답하세요.
최대 3개. 기존 솔루션과 중복 금지.${existingList}

---
${summary.slice(0, 6000)}
---`;

  try {
    execFileSync('claude', ['-p', solutionPrompt, '--allowedTools', 'Bash'], {
      cwd, timeout: 60_000, stdio: ['pipe', 'ignore', 'pipe'],
    });
  } catch (e) {
    process.stderr.write(`[tenetx-auto-compound] solution extraction: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // 2단계: 사용자 패턴 추출 → USER.md 업데이트
  const userPrompt = `다음 대화에서 사용자의 작업 습관, 커뮤니케이션 스타일, 기술 선호도를 분석해주세요.

관찰된 패턴을 다음 형식으로 1~3개만 출력해주세요 (없으면 "관찰된 패턴 없음"):
- [카테고리] 패턴 설명 (관찰 근거)

카테고리: 커뮤니케이션/작업습관/기술선호/의사결정

기존 패턴과 중복이면 건너뛰세요.${existingBehaviorPatterns}

---
${summary.slice(0, 4000)}
---`;

  try {
    const userResult = execFileSync('claude', ['-p', userPrompt], {
      cwd, timeout: 30_000, encoding: 'utf-8',
    });

    // 결과가 의미 있으면 behavior/ 파일로 저장
    if (userResult && !userResult.includes('관찰된 패턴 없음') && userResult.trim().length > 10) {
      const slug = `auto-${new Date().toISOString().split('T')[0]}`;
      const behaviorPath = path.join(BEHAVIOR_DIR, `${slug}.md`);
      fs.mkdirSync(BEHAVIOR_DIR, { recursive: true });
      if (!fs.existsSync(behaviorPath)) {
        const today = new Date().toISOString().split('T')[0];
        const content = `---\nname: "${slug}"\nversion: 1\nkind: "preference"\nobservedCount: 1\nconfidence: 0.6\ntags: ["auto-observed"]\ncreated: "${today}"\nupdated: "${today}"\nsource: "auto-compound"\n---\n\n${userResult.trim()}\n`;
        fs.writeFileSync(behaviorPath, content);
      }
    }
  } catch (e) {
    process.stderr.write(`[tenetx-auto-compound] behavior update: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // 완료 기록
  const statePath = path.join(COMPOUND_HOME, 'state', 'last-auto-compound.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ sessionId, completedAt: new Date().toISOString() }));
} catch (e) {
  process.stderr.write(`[tenetx-auto-compound] ${e instanceof Error ? e.message : String(e)}\n`);
}
