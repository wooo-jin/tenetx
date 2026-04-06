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
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { containsPromptInjection, filterSolutionContent } from '../hooks/prompt-injection-filter.js';

/** Auto-compound에 사용할 모델 — background 추출이므로 haiku로 충분 */
const COMPOUND_MODEL = 'haiku';

/** execFileSync wrapper: transient 에러(ETIMEDOUT 등) 시 1회 재시도 */
function execClaudeRetry(args: string[], opts: ExecFileSyncOptions): string {
  const TRANSIENT = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE/;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return execFileSync('claude', args, opts) as unknown as string;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && TRANSIENT.test(msg)) {
        process.stderr.write(`[tenetx-auto-compound] transient error, retrying in 3s...\n`);
        execFileSync('sleep', ['3']);
        continue;
      }
      throw e;
    }
  }
  throw new Error('unreachable');
}

const [,, cwd, transcriptPath, sessionId] = process.argv;

if (!cwd || !transcriptPath || !sessionId) {
  process.exit(1);
}

const TENETX_HOME = path.join(os.homedir(), '.tenetx');
const SOLUTIONS_DIR = path.join(TENETX_HOME, 'me', 'solutions');
const BEHAVIOR_DIR = path.join(TENETX_HOME, 'me', 'behavior');

/** Lightweight quality gate for auto-extracted solution files */
/** Toxicity patterns — code-context only to avoid false positives on prose */
const SOLUTION_TOXICITY_PATTERNS = [/@ts-ignore/i, /:\s*any\b/, /\/\/\s*TODO\b/];

/** Parse tags from solution frontmatter */
function parseTags(content: string): string[] {
  const match = content.match(/tags:\s*\[([^\]]*)\]/);
  if (!match) return [];
  return match[1].split(',').map(t => t.trim().replace(/"/g, '').replace(/'/g, '')).filter(Boolean);
}

/** Gate 3 (dedup): check tag overlap with existing solutions */
function isDuplicate(newContent: string, existingFiles: Map<string, string>): boolean {
  const newTags = parseTags(newContent);
  if (newTags.length === 0) return false;
  for (const [, existingContent] of existingFiles) {
    const existingTags = parseTags(existingContent);
    if (existingTags.length === 0) continue;
    const overlap = newTags.filter(t => existingTags.includes(t));
    const overlapRatio = overlap.length / Math.max(newTags.length, existingTags.length, 1);
    if (overlapRatio >= 0.7) return true;
  }
  return false;
}

function validateSolutionFiles(dirBefore: Set<string>): number {
  let removed = 0;
  if (!fs.existsSync(SOLUTIONS_DIR)) return removed;
  try {
    // Load existing solutions for dedup (gate 3)
    const existingSolutions = new Map<string, string>();
    for (const file of dirBefore) {
      try {
        existingSolutions.set(file, fs.readFileSync(path.join(SOLUTIONS_DIR, file), 'utf-8'));
      } catch { /* skip unreadable */ }
    }

    const currentFiles = fs.readdirSync(SOLUTIONS_DIR).filter(f => f.endsWith('.md'));
    for (const file of currentFiles) {
      if (dirBefore.has(file)) continue; // existed before extraction — skip
      const filePath = path.join(SOLUTIONS_DIR, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Gate 1: file must be > 100 chars (not too short)
        if (content.length <= 100) {
          fs.unlinkSync(filePath);
          removed++;
          continue;
        }
        // Gate 2: first 500 chars must not contain toxicity patterns
        const head = content.slice(0, 500);
        if (SOLUTION_TOXICITY_PATTERNS.some(p => p.test(head))) {
          fs.unlinkSync(filePath);
          removed++;
          continue;
        }
        // Gate 3: dedup — reject if 70%+ tag overlap with existing solutions
        if (isDuplicate(content, existingSolutions)) {
          fs.unlinkSync(filePath);
          removed++;
          continue;
        }
        // Accepted — add to existing pool so subsequent new files dedup against it too
        existingSolutions.set(file, content);
      } catch (e) {
        process.stderr.write(`[tenetx-auto-compound] file validation failed: ${(e as Error).message}\n`);
      }
    }
  } catch (e) {
    process.stderr.write(`[tenetx-auto-compound] solution dir scan failed: ${(e as Error).message}\n`);
  }
  return removed;
}

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

/**
 * 기존 behavior 파일에 유사 패턴이 있으면 observedCount를 +1 증가.
 * 유사도는 같은 kind + 내용 키워드 50%+ 겹침으로 판단.
 * 누적했으면 true, 새 파일 필요하면 false 반환.
 */
function mergeOrCreateBehavior(dir: string, newContent: string, kind: string, today: string): boolean {
  if (!fs.existsSync(dir)) return false;

  const newWords = new Set(newContent.toLowerCase().split(/\s+/).filter(w => w.length >= 3));
  if (newWords.size === 0) return false;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      // kind 매칭
      const kindMatch = raw.match(/^kind:\s*["']?(\w+)["']?/m);
      if (!kindMatch || kindMatch[1] !== kind) continue;

      // 내용 유사도 체크
      const existingWords = new Set(raw.toLowerCase().split(/\s+/).filter(w => w.length >= 3));
      let overlap = 0;
      for (const w of newWords) {
        if (existingWords.has(w)) overlap++;
      }
      const similarity = overlap / newWords.size;
      if (similarity < 0.5) continue;

      // 유사 패턴 발견 — observedCount 증가
      const countMatch = raw.match(/^observedCount:\s*(\d+)/m);
      const currentCount = countMatch ? parseInt(countMatch[1], 10) : 1;
      const updated = raw
        .replace(/^observedCount:\s*\d+/m, `observedCount: ${currentCount + 1}`)
        .replace(/^updated:\s*"[^"]*"/m, `updated: "${today}"`)
        .replace(/^confidence:\s*[\d.]+/m, `confidence: ${Math.min(0.95, 0.6 + (currentCount * 0.1)).toFixed(2)}`);
      fs.writeFileSync(filePath, updated);
      return true;
    } catch { continue; }
  }
  return false;
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
  const solDir = path.join(TENETX_HOME, 'me', 'solutions');
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
  // 보안: transcript 요약에 filterSolutionContent 적용하여 프롬프트 인젝션 방어
  const scanResult = filterSolutionContent(summary);
  if (scanResult.verdict === 'block') {
    process.stderr.write('[tenetx-auto-compound] transcript blocked by injection filter\n');
    process.exit(0);
  }
  if (scanResult.verdict === 'warn') {
    process.stderr.write(`[tenetx-auto-compound] injection warning: ${scanResult.findings.map(f => f.patternId).join(', ')}\n`);
  }
  const sanitizedSummary = scanResult.sanitized;

  // Snapshot solution files before extraction (for post-extraction validation)
  const solutionsBefore = new Set<string>();
  try {
    if (fs.existsSync(SOLUTIONS_DIR)) {
      for (const f of fs.readdirSync(SOLUTIONS_DIR)) {
        if (f.endsWith('.md')) solutionsBefore.add(f);
      }
    }
  } catch { /* ignore */ }

  const solutionPrompt = `다음은 이전 Claude Code 세션의 대화 요약입니다.
미래 세션에서 재사용할 수 있는 패턴, 해결책, 의사결정을 추출해주세요.

각 항목은 반드시 다음을 포함해야 합니다:
- **제목**: 구체적이고 검색 가능한 이름 (예: "vitest-mock-esm-pattern", "react-state-lifting-decision")
- **설명**: (1) 무엇을 했는지 (2) 왜 그렇게 했는지 (3) 어떻게 적용하는지

형식: tenetx compound --solution "제목" "설명 (why + how to apply)"
추출할 것이 없으면 "추출할 패턴 없음"이라고만 답하세요.
최대 3개. 피상적인 관찰(예: "TypeScript를 사용함")은 제외. 기존 솔루션과 중복 금지.${existingList}

---
${sanitizedSummary.slice(0, 6000)}
---`;

  try {
    execClaudeRetry(['-p', solutionPrompt, '--allowedTools', 'Bash', '--model', COMPOUND_MODEL], {
      cwd, timeout: 90_000, stdio: ['pipe', 'ignore', 'pipe'],
    });
  } catch (e) {
    process.stderr.write(`[tenetx-auto-compound] solution extraction: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // Post-extraction quality validation: remove files that fail lightweight gates
  const removedCount = validateSolutionFiles(solutionsBefore);
  if (removedCount > 0) {
    process.stderr.write(`[tenetx-auto-compound] quality gate removed ${removedCount} low-quality solution(s)\n`);
  }

  // 2단계: 사용자 패턴 추출 → USER.md 업데이트
  const userPrompt = `다음 대화에서 사용자의 작업 습관, 커뮤니케이션 스타일, 기술 선호도를 분석해주세요.

관찰된 패턴을 다음 형식으로 1~3개만 출력해주세요 (없으면 "관찰된 패턴 없음"):
- [카테고리] 패턴 설명 (관찰 근거)

카테고리: 커뮤니케이션/작업습관/기술선호/의사결정/워크플로우

특히 "워크플로우" 카테고리에 주목하세요:
- 사용자가 반복하는 작업 순서 패턴 (예: "항상 테스트 먼저 작성 → 구현 → 리팩토링 순서로 진행")
- 특정 상황에서의 판단 규칙 (예: "PR 리뷰 시 보안 → 테스트 → 코드 품질 순서로 확인")
- 조건부 접근법 (예: "버그 수정 시 재현 테스트부터 작성, 성능 이슈면 프로파일링부터")

워크플로우 패턴이 감지되면 반드시 구체적인 순서를 포함하세요.

기존 패턴과 중복이면 건너뛰세요.${existingBehaviorPatterns}

---
${sanitizedSummary.slice(0, 4000)}
---`;

  try {
    const userResult = execClaudeRetry(['-p', userPrompt, '--model', COMPOUND_MODEL], {
      cwd, timeout: 60_000, encoding: 'utf-8',
    });

    // 결과가 의미 있으면 behavior/ 파일로 저장
    if (userResult && !userResult.includes('관찰된 패턴 없음') && userResult.trim().length > 10) {
      fs.mkdirSync(BEHAVIOR_DIR, { recursive: true });
      const today = new Date().toISOString().split('T')[0];
      const trimmed = userResult.trim();

      // 카테고리에 따라 kind 분류
      const kind = trimmed.includes('[워크플로우]') || trimmed.includes('순서') || trimmed.includes('→')
        ? 'workflow'
        : trimmed.includes('[의사결정]') ? 'thinking'
        : 'preference';

      // 기존 유사 패턴이 있으면 observedCount 누적
      const merged = mergeOrCreateBehavior(BEHAVIOR_DIR, trimmed, kind, today);
      if (!merged) {
        const slug = `auto-${today}-${kind}`;
        const behaviorPath = path.join(BEHAVIOR_DIR, `${slug}.md`);
        if (!fs.existsSync(behaviorPath)) {
          const content = `---\nname: "${slug}"\nversion: 1\nkind: "${kind}"\nobservedCount: 1\nconfidence: 0.6\ntags: ["auto-observed", "${kind}"]\ncreated: "${today}"\nupdated: "${today}"\nsource: "auto-compound"\n---\n\n## Content\n${trimmed}\n`;
          fs.writeFileSync(behaviorPath, content);
        }
      }
    }
  } catch (e) {
    process.stderr.write(`[tenetx-auto-compound] behavior update: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // 3단계: 세션 학습 요약 (SessionLearningSummary) 생성
  try {
    const TENETX_HOME = path.join(os.homedir(), '.tenetx');
    const V1_ME_DIR = path.join(TENETX_HOME, 'me');
    const V1_PROFILE = path.join(V1_ME_DIR, 'forge-profile.json');
    const V1_EVIDENCE_DIR = path.join(V1_ME_DIR, 'behavior');

    if (fs.existsSync(V1_PROFILE)) {
      const learningSummaryPrompt = `다음 Claude Code 세션 대화를 분석하여 사용자의 개인화 학습 요약을 JSON으로 출력해주세요.

출력 형식 (JSON만, 설명 없이):
{
  "corrections": ["사용자가 명시적으로 교정한 내용 목록"],
  "observations": ["사용자의 반복 행동 패턴 목록"],
  "pack_direction": null 또는 "opposite_quality" 또는 "opposite_autonomy",
  "profile_delta": {
    "quality_safety": { "verification_depth": 0.0, "stop_threshold": 0.0, "change_conservatism": 0.0 },
    "autonomy": { "confirmation_independence": 0.0, "assumption_tolerance": 0.0, "scope_expansion_tolerance": 0.0, "approval_threshold": 0.0 }
  }
}

규칙:
- corrections: "하지마", "그렇게 말고", "앞으로는" 같은 명시 교정만. 없으면 빈 배열.
- observations: 3회 이상 반복된 행동만. 없으면 빈 배열.
- pack_direction: 사용자가 현재 pack과 반대 방향으로 일관되게 행동했으면 opposite_quality 또는 opposite_autonomy. 아니면 null.
- profile_delta: facet 조정 제안. -0.1~+0.1 범위. 변화 없으면 0.0.
- 학습할 것이 없으면 모든 값을 빈 배열/null/0.0으로.

---
${sanitizedSummary.slice(0, 4000)}
---`;

      const learningResult = execClaudeRetry(['-p', learningSummaryPrompt, '--model', COMPOUND_MODEL], {
        cwd, timeout: 60_000, encoding: 'utf-8',
      });

      // JSON 파싱 시도
      const jsonMatch = learningResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // session_summary evidence 저장 (mismatch detector용)
        if (parsed.pack_direction || parsed.corrections?.length > 0 || parsed.observations?.length > 0) {
          const evidenceId = `sess-summary-${sessionId.slice(0, 8)}`;
          const evidence = {
            evidence_id: evidenceId,
            type: 'session_summary',
            session_id: sessionId,
            timestamp: new Date().toISOString(),
            source_component: 'auto-compound-runner',
            summary: `corrections: ${parsed.corrections?.length ?? 0}, observations: ${parsed.observations?.length ?? 0}`,
            axis_refs: parsed.pack_direction ? [parsed.pack_direction.includes('quality') ? 'quality_safety' : 'autonomy'] : [],
            candidate_rule_refs: [],
            confidence: 0.7,
            raw_payload: {
              pack_direction: parsed.pack_direction,
              corrections: parsed.corrections,
              observations: parsed.observations,
            },
          };
          fs.mkdirSync(V1_EVIDENCE_DIR, { recursive: true });
          fs.writeFileSync(path.join(V1_EVIDENCE_DIR, `${evidenceId}.json`), JSON.stringify(evidence, null, 2));
        }

        // facet delta 적용
        if (parsed.profile_delta) {
          const profile = JSON.parse(fs.readFileSync(V1_PROFILE, 'utf-8'));
          const clamp = (v: number) => Math.max(0.0, Math.min(1.0, v));
          let changed = false;

          if (parsed.profile_delta.quality_safety) {
            const d = parsed.profile_delta.quality_safety;
            const f = profile.axes.quality_safety.facets;
            for (const [k, v] of Object.entries(d)) {
              if (typeof v === 'number' && Math.abs(v) > 0.001 && k in f) {
                f[k] = clamp(f[k] + v);
                changed = true;
              }
            }
          }
          if (parsed.profile_delta.autonomy) {
            const d = parsed.profile_delta.autonomy;
            const f = profile.axes.autonomy.facets;
            for (const [k, v] of Object.entries(d)) {
              if (typeof v === 'number' && Math.abs(v) > 0.001 && k in f) {
                f[k] = clamp(f[k] + v);
                changed = true;
              }
            }
          }

          if (changed) {
            profile.metadata.updated_at = new Date().toISOString();
            fs.writeFileSync(V1_PROFILE, JSON.stringify(profile, null, 2));
            process.stderr.write('[tenetx-auto-compound] profile facets updated from session learning\n');
          }
        }
      }
    }
  } catch (e) {
    process.stderr.write(`[tenetx-auto-compound] session learning: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // 완료 기록
  const statePath = path.join(TENETX_HOME, 'state', 'last-auto-compound.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ sessionId, completedAt: new Date().toISOString() }));
} catch (e) {
  process.stderr.write(`[tenetx-auto-compound] ${e instanceof Error ? e.message : String(e)}\n`);
}
