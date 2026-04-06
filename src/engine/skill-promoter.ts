/**
 * Tenetx — Skill Promoter
 *
 * verified/mature 솔루션을 .tenetx/me/skills/ 스킬로 승격.
 * 솔루션(선언적 지식) → 스킬(절차적 지식) 변환.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseSolutionV3 } from './solution-format.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('skill-promoter');

const TENETX_HOME = path.join(os.homedir(), '.tenetx');
const ME_SOLUTIONS = path.join(TENETX_HOME, 'me', 'solutions');
const ME_SKILLS = path.join(TENETX_HOME, 'me', 'skills');
// Claude Code가 자동 인식하는 글로벌 스킬 경로
const CLAUDE_SKILLS = path.join(os.homedir(), '.claude', 'skills');

// 일반적인 태그 제외 (트리거로 부적합)
const GENERIC_TAGS = new Set([
  'typescript', 'javascript', 'react', 'node', 'error', 'fix', 'code',
  'pattern', 'solution', 'decision', 'troubleshoot', 'project', 'file',
]);

export interface PromoteResult {
  success: boolean;
  skillPath?: string;
  reason?: string;
}

/** 솔루션을 스킬로 승격 */
export function promoteSolution(
  solutionName: string,
  triggers?: string[],
): PromoteResult {
  // 1. 솔루션 찾기
  const solPath = path.join(ME_SOLUTIONS, `${solutionName}.md`);
  if (!fs.existsSync(solPath)) {
    return { success: false, reason: `Solution not found: ${solutionName}` };
  }

  const content = fs.readFileSync(solPath, 'utf-8');
  const parsed = parseSolutionV3(content);
  if (!parsed) {
    return { success: false, reason: `Failed to parse solution: ${solutionName}` };
  }

  // 2. 자격 검증: verified 이상만
  if (!['verified', 'mature'].includes(parsed.frontmatter.status)) {
    return {
      success: false,
      reason: `Only verified/mature solutions can be promoted. Current: ${parsed.frontmatter.status}. Use 'tenetx compound --verify ${solutionName}' first.`,
    };
  }

  // 3. 중복 체크
  const skillPath = path.join(ME_SKILLS, `${solutionName}.md`);
  if (fs.existsSync(skillPath)) {
    return { success: false, reason: `Skill already exists: ${solutionName}` };
  }

  // 4. 트리거 결정
  const effectiveTriggers = triggers ?? deriveTriggersFromTags(parsed.frontmatter.tags);
  if (effectiveTriggers.length === 0) {
    return { success: false, reason: 'No triggers could be derived. Provide --trigger manually.' };
  }

  // 5. 스킬 파일 생성
  const description = parsed.context
    ? parsed.context.split('\n')[0].slice(0, 100)
    : `${solutionName} 패턴 적용`;

  const skillContent = [
    '---',
    `name: ${solutionName}`,
    `description: ${description}`,
    'triggers:',
    ...effectiveTriggers.map(t => `  - "${t}"`),
    `promoted_from: solution/${solutionName}`,
    `promoted_at: "${new Date().toISOString().split('T')[0]}"`,
    'status: candidate',
    'usage_count: 0',
    '---',
    '',
    '<Purpose>',
    parsed.context || `${solutionName} 패턴을 적용합니다.`,
    '</Purpose>',
    '',
    '<Steps>',
    parsed.content,
    '</Steps>',
  ].join('\n');

  fs.mkdirSync(ME_SKILLS, { recursive: true });
  fs.writeFileSync(skillPath, skillContent);

  // Claude Code 네이티브 스킬로도 등록 (~/.claude/skills/{name}/SKILL.md)
  const claudeSkillDir = path.join(CLAUDE_SKILLS, solutionName);
  fs.mkdirSync(claudeSkillDir, { recursive: true });
  fs.writeFileSync(path.join(claudeSkillDir, 'SKILL.md'), skillContent);

  log.debug(`스킬 승격 완료: ${solutionName} → ${skillPath} + ${claudeSkillDir}`);
  return { success: true, skillPath };
}

/** 태그에서 트리거 키워드 자동 추출 */
function deriveTriggersFromTags(tags: string[]): string[] {
  return tags
    .filter(t => t.length >= 3 && !GENERIC_TAGS.has(t.toLowerCase()))
    .slice(0, 3);
}

/** 스킬 목록 조회 */
export function listSkills(): Array<{
  name: string;
  status: string;
  promotedFrom?: string;
  triggers: string[];
}> {
  if (!fs.existsSync(ME_SKILLS)) return [];

  return fs.readdirSync(ME_SKILLS)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      try {
        const content = fs.readFileSync(path.join(ME_SKILLS, f), 'utf-8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!fmMatch) return null;

        const fm = fmMatch[1];
        const name = fm.match(/name:\s*(.+)/)?.[1]?.trim() ?? f.replace('.md', '');
        const status = fm.match(/status:\s*(.+)/)?.[1]?.trim() ?? 'unknown';
        const promotedFrom = fm.match(/promoted_from:\s*(.+)/)?.[1]?.trim();
        const triggers = [...fm.matchAll(/- "(.+)"/g)].map(m => m[1]);

        return { name, status, promotedFrom, triggers };
      } catch {
        return null;
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
}
