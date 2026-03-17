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
import * as os from 'node:os';
import { debugLog } from '../core/logger.js';
import { readStdinJSON } from './shared/read-stdin.js';
import { sanitizeForDetection } from './shared/sanitize.js';
import { loadPackConfigs } from '../core/pack-config.js';
import { PACKS_DIR } from '../core/paths.js';

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

const COMPOUND_HOME = path.join(os.homedir(), '.compound');
const STATE_DIR = path.join(COMPOUND_HOME, 'state');
const MAX_SKILLS_PER_SESSION = 5;

/** 파일 기반 세션 캐시 (훅은 매번 새 프로세스로 실행되므로 in-memory 불가) */
function getSessionCachePath(sessionId: string): string {
  return path.join(STATE_DIR, `skill-cache-${sessionId}.json`);
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
  } catch (e) { debugLog('skill-injector', '세션 캐시 파일 읽기/파싱 실패', e); }
  return new Set();
}

function saveSessionCache(sessionId: string, injected: Set<string>): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(getSessionCachePath(sessionId), JSON.stringify({
    injected: [...injected],
    updatedAt: new Date().toISOString(),
  }))
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
    debugLog('skill-injector', `스킬 디렉토리 스캔 실패: ${dir}`, e);
    return [];
  }
}

/** 모든 스킬 소스에서 스킬 수집 */
function collectSkills(): SkillMeta[] {
  const skills: SkillMeta[] = [];
  const seen = new Set<string>();

  // 패키지 내장 스킬 경로 (dist/../skills/)
  const pkgSkillsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills');

  // 연결된 팩의 스킬 경로 수집
  const packSkillDirs: string[] = [];
  try {
    const connectedPacks = loadPackConfigs(process.cwd());
    for (const pack of connectedPacks) {
      // 프로젝트 네임스페이스 우선, 글로벌 팩 폴백
      const nsDir = path.join(process.cwd(), '.compound', 'packs', pack.name, 'skills');
      const globalDir = path.join(PACKS_DIR, pack.name, 'skills');
      packSkillDirs.push(fs.existsSync(nsDir) ? nsDir : globalDir);
    }
  } catch (e) {
    debugLog('skill-injector', '팩 스킬 경로 수집 실패', e);
  }

  // 우선순위: 프로젝트 > 연결된 팩 > 개인 > 글로벌 > 패키지 내장
  const dirs = [
    path.join(process.cwd(), '.compound', 'skills'),
    ...packSkillDirs,
    path.join(COMPOUND_HOME, 'me', 'skills'),
    path.join(COMPOUND_HOME, 'skills'),
    pkgSkillsDir,
  ];

  for (const dir of dirs) {
    for (const skill of scanSkills(dir)) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        skills.push(skill);
      }
    }
  }

  return skills;
}

/** 프롬프트와 스킬 트리거 매칭 (sanitized 텍스트에서만) */
export function matchSkills(prompt: string, skills: SkillMeta[]): SkillMeta[] {
  const sanitized = sanitizeForDetection(prompt);
  const lower = sanitized.toLowerCase();
  return skills.filter(skill => {
    if (skill.triggers.length === 0) return false;
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
  } catch (e) { debugLog('skill-injector', '오래된 캐시 파일 삭제 실패', e); }
}

// ── 메인 ──

async function main(): Promise<void> {
  const input = await readStdinJSON<HookInput>();
  if (!input?.prompt) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const sessionId = input.session_id ?? 'default';

  // 오래된 캐시 파일 정리 (가비지 컬렉션)
  cleanStaleSkillCaches();

  // 파일 기반 세션 캐시 로드
  const injected = loadSessionCache(sessionId);

  // 이미 최대치 주입했으면 통과
  if (injected.size >= MAX_SKILLS_PER_SESSION) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // 스킬 수집 및 매칭
  const allSkills = collectSkills();
  const matched = matchSkills(input.prompt, allSkills)
    .filter(s => !injected.has(s.name)); // 이미 주입된 것 제외

  if (matched.length === 0) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // 최대 제한 적용
  const toInject = matched.slice(0, MAX_SKILLS_PER_SESSION - injected.size);

  // 파일 기반 캐시 업데이트
  for (const skill of toInject) {
    injected.add(skill.name);
  }
  saveSessionCache(sessionId, injected);

  // 스킬 컨텍스트 주입
  const injections = toInject.map(skill =>
    `<compound-learned-skill name="${skill.name}" description="${skill.description}">\n${skill.content}\n</compound-learned-skill>`
  ).join('\n\n');

  console.log(JSON.stringify({
    result: 'approve',
    message: injections,
  }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
