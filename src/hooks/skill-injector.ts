#!/usr/bin/env node
/**
 * Tenetx — Skill Injector Hook
 *
 * Claude Code UserPromptSubmit 훅으로 등록.
 * 프롬프트와 매칭되는 학습된 스킬을 자동으로 컨텍스트에 주입합니다.
 *
 * 스킬 파일 위치:
 *   1. {project}/.compound/skills/*.md  (프로젝트 스킬)
 *   2. ~/.compound/skills/*.md          (글로벌 스킬)
 *   3. ~/.compound/me/skills/*.md       (개인 학습 스킬)
 *
 * 스킬 포맷:
 *   ---
 *   name: my-skill
 *   description: What this skill does
 *   triggers:
 *     - "keyword1"
 *     - "keyword2"
 *   ---
 *   <Purpose>...</Purpose>
 *   <Steps>...</Steps>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../core/logger.js';

const log = createLogger('skill-injector');
import { readStdinJSON } from './shared/read-stdin.js';
import { sanitizeForDetection } from './shared/sanitize.js';
import { sanitizeId } from './shared/sanitize-id.js';
import { escapeAllXmlTags } from './prompt-injection-filter.js';

function escapeXmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
import { atomicWriteJSON } from './shared/atomic-write.js';
import { COMPOUND_HOME, STATE_DIR } from '../core/paths.js';
import { KEYWORD_PATTERNS } from './keyword-detector.js';
import { isHookEnabled } from './hook-config.js';
import { approve, approveWithContext, failOpen } from './shared/hook-response.js';

/** keyword-detector가 처리하는 키워드 이름 집합 (skill + inject 모두 포함, 이중 주입 방지) */
const KEYWORD_DETECTOR_SKILL_NAMES: Set<string> = new Set(
  KEYWORD_PATTERNS
    .filter(p => p.type === 'skill' || p.type === 'inject')
    .map(p => p.skill ?? p.keyword)
);

export interface SkillMeta {
  name: string;
  description: string;
  triggers: string[];
  filePath: string;
  content: string;
}

interface HookInput {
  prompt: string;
  session_id?: string;
}
const MAX_SKILLS_PER_SESSION = 5;

/** 파일 기반 세션 캐시 (훅은 매번 새 프로세스로 실행되므로 in-memory 불가) */
function getSessionCachePath(sessionId: string): string {
  return path.join(STATE_DIR, `skill-cache-${sanitizeId(sessionId)}.json`);
}

function loadSessionCache(sessionId: string): Set<string> {
  const cachePath = getSessionCachePath(sessionId);
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      // 24시간 초과 시 만료
      if (data.updatedAt && Date.now() - new Date(data.updatedAt).getTime() > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(cachePath);
        return new Set();
      }
      return new Set(data.injected ?? []);
    }
  } catch (e) { log.debug('세션 캐시 파일 읽기/파싱 실패', e); }
  return new Set();
}

function saveSessionCache(sessionId: string, injected: Set<string>): void {
  atomicWriteJSON(getSessionCachePath(sessionId), {
    injected: [...injected],
    updatedAt: new Date().toISOString(),
  });
}

/** YAML frontmatter 파싱 (간단한 구현) */
export function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta: Record<string, unknown> = {};
  const yamlLines = match[1].split('\n');

  let currentKey = '';
  let inArray = false;
  const arrayValues: string[] = [];

  for (const line of yamlLines) {
    const trimmed = line.trim();

    if (inArray) {
      if (trimmed.startsWith('- ')) {
        arrayValues.push(trimmed.slice(2).replace(/^["']|["']$/g, ''));
        continue;
      } else {
        meta[currentKey] = [...arrayValues];
        arrayValues.length = 0;
        inArray = false;
      }
    }

    const kvMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '' || val === '[]') {
        // 다음 줄이 배열일 수 있음
        inArray = true;
      } else {
        meta[currentKey] = val.replace(/^["']|["']$/g, '');
      }
    }
  }

  if (inArray && arrayValues.length > 0) {
    meta[currentKey] = arrayValues;
  }

  return { meta, body: match[2] };
}

/** 디렉토리에서 스킬 파일 스캔 */
function scanSkills(dir: string): SkillMeta[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .filter(f => {
        const filePath = path.join(dir, f);
        try { return !fs.lstatSync(filePath).isSymbolicLink(); } catch { return false; }
      })
      .map(f => {
        const filePath = path.join(dir, f);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { meta, body } = parseFrontmatter(raw);

        return {
          name: (meta.name as string) ?? f.replace('.md', ''),
          description: (meta.description as string) ?? '',
          triggers: (meta.triggers as string[]) ?? [],
          filePath,
          content: body.trim(),
        };
      });
  } catch (e) {
    log.debug(`스킬 디렉토리 스캔 실패: ${dir}`, e);
    return [];
  }
}

/** 모든 스킬 소스에서 스킬 수집 */
function collectSkills(): SkillMeta[] {
  const skills: SkillMeta[] = [];
  const seen = new Map<string, string>(); // name → source dir

  // 패키지 내장 스킬 경로 (dist/../skills/)
  const pkgSkillsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'commands');

  // v1: 팀 팩 스킬 제거. 프로젝트 > 개인 > 글로벌 > 패키지 내장
  const dirs = [
    path.join(process.cwd(), '.compound', 'skills'),
    path.join(COMPOUND_HOME, 'me', 'skills'),
    path.join(COMPOUND_HOME, 'skills'),
    pkgSkillsDir,
  ];

  const overrides: Array<{ name: string; winner: string; loser: string }> = [];

  for (const dir of dirs) {
    for (const skill of scanSkills(dir)) {
      if (!seen.has(skill.name)) {
        seen.set(skill.name, dir);
        skills.push(skill);
      } else {
        // 팩 스킬이 무시된 경우 기록
        const winnerDir = seen.get(skill.name) ?? '';
        if (dir.includes('/packs/') || winnerDir.includes('/packs/')) {
          overrides.push({ name: skill.name, winner: winnerDir, loser: dir });
        }
      }
    }
  }

  if (overrides.length > 0) {
    for (const o of overrides) {
      log.debug(`⚠ 스킬 '${o.name}' 오버라이드: ${path.basename(path.dirname(o.winner))} 우선, ${path.basename(path.dirname(o.loser))} 무시됨`);
    }
  }

  return skills;
}

/** 프롬프트와 스킬 트리거 매칭 (sanitized 텍스트에서만)
 *  keyword-detector가 이미 처리하는 스킬은 제외하여 이중 주입을 방지합니다. */
export function matchSkills(prompt: string, skills: SkillMeta[]): SkillMeta[] {
  const sanitized = sanitizeForDetection(prompt);
  const lower = sanitized.toLowerCase();
  return skills.filter(skill => {
    if (skill.triggers.length === 0) return false;
    // keyword-detector가 처리하는 스킬은 skill-injector에서 주입하지 않음
    if (KEYWORD_DETECTOR_SKILL_NAMES.has(skill.name)) return false;
    return skill.triggers.some(trigger =>
      lower.includes(trigger.toLowerCase())
    );
  });
}

/** 오래된 skill-cache 파일 가비지 컬렉션 */
function cleanStaleSkillCaches(): void {
  if (!fs.existsSync(STATE_DIR)) return;
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(STATE_DIR)) {
      if (!f.startsWith('skill-cache-')) continue;
      const p = path.join(STATE_DIR, f);
      const stat = fs.statSync(p);
      // 24시간 초과 파일 삭제
      if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(p);
      }
    }
  } catch (e) { log.debug('오래된 캐시 파일 삭제 실패', e); }
}

// ── 메인 ──

async function main(): Promise<void> {
  const input = await readStdinJSON<HookInput>();
  if (!isHookEnabled('skill-injector')) {
    console.log(approve());
    return;
  }
  if (!input?.prompt) {
    console.log(approve());
    return;
  }

  const sessionId = input.session_id ?? 'default';

  // 오래된 캐시 파일 정리 (가비지 컬렉션)
  cleanStaleSkillCaches();

  // 파일 기반 세션 캐시 로드
  const injected = loadSessionCache(sessionId);

  // 이미 최대치 주입했으면 통과
  if (injected.size >= MAX_SKILLS_PER_SESSION) {
    console.log(approve());
    return;
  }

  // 스킬 수집 및 매칭
  const allSkills = collectSkills();
  const matched = matchSkills(input.prompt, allSkills)
    .filter(s => !injected.has(s.name)); // 이미 주입된 것 제외

  if (matched.length === 0) {
    console.log(approve());
    return;
  }

  // 최대 제한 적용
  const toInject = matched.slice(0, MAX_SKILLS_PER_SESSION - injected.size);

  // 파일 기반 캐시 업데이트
  for (const skill of toInject) {
    injected.add(skill.name);
  }
  saveSessionCache(sessionId, injected);

  // Adaptive budget: 다른 플러그인 감지 시 스킬 주입량 축소
  let skillCap = 3000; // INJECTION_CAPS.skillContentMax 기본값
  try {
    const { calculateBudget } = await import('./shared/context-budget.js');
    skillCap = calculateBudget().skillContentMax;
  } catch { /* budget 로드 실패 시 기본값 사용 */ }

  // 스킬 컨텍스트 주입 (adaptive cap 적용)
  const injections = toInject.map(skill => {
    const capped = skill.content.length > skillCap
      ? `${skill.content.slice(0, skillCap)}\n... (capped)`
      : skill.content;
    return `<compound-learned-skill name="${escapeXmlAttr(skill.name)}" description="${escapeXmlAttr(skill.description)}">\n${escapeAllXmlTags(capped)}\n</compound-learned-skill>`;
  }).join('\n\n');

  console.log(approveWithContext(injections, 'UserPromptSubmit'));
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(failOpen());
});
