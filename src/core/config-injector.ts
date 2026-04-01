import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_BEHAVIOR, ME_RULES, PACKS_DIR, projectDir } from './paths.js';
import { loadPackConfigs } from './pack-config.js';
import type { HarnessContext } from './types.js';
import { createLogger } from './logger.js';
import { parseSolutionV3 } from '../engine/solution-format.js';

const log = createLogger('config-injector');
/** 프로젝트 맵 타입 (engine/knowledge/types.ts 삭제 후 인라인) */
interface ProjectMap {
  summary: {
    name: string;
    totalFiles: number;
    totalLines: number;
    framework?: string;
    packageManager?: string;
    languages: Record<string, number>;
  };
  entryPoints: string[];
  directories: Array<{ path: string; purpose?: string }>;
}

/** 디렉토리의 .md 파일에서 규칙 첫 줄(요약)을 추출 */
function loadRulesFromDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(dir, f);
        if (fs.lstatSync(filePath).isSymbolicLink()) return null;

        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseSolutionV3(content);
        const body = parsed ? parsed.content : stripFrontmatter(content);
        const firstLine = firstMeaningfulLine(body);
        return firstLine ?? f.replace('.md', '');
      })
      .filter((rule): rule is string => Boolean(rule));
  } catch (e) {
    log.debug(`규칙 디렉토리 읽기 실패: ${dir}`, e);
    return [];
  }
}

function stripFrontmatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) return content;

  const endIdx = trimmed.indexOf('---', 3);
  if (endIdx === -1) return content;
  return trimmed.slice(endIdx + 3);
}

function firstMeaningfulLine(content: string): string | null {
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '## Context' || line === '## Content') continue;
    return line.replace(/^#+\s*/, '').trim();
  }
  return null;
}

/** 프로젝트 맵에서 에이전트용 요약 생성 */
function loadProjectMapSummary(cwd: string): string | null {
  const mapPath = path.join(projectDir(cwd), 'project-map.json');
  if (!fs.existsSync(mapPath)) return null;

  try {
    const map: ProjectMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    const { summary } = map;
    const lines: string[] = [];

    lines.push(`- Project: ${summary.name} (${summary.totalFiles} files, ${summary.totalLines.toLocaleString()} lines)`);
    if (summary.framework) lines.push(`- Framework: ${summary.framework}`);
    if (summary.packageManager) lines.push(`- Package manager: ${summary.packageManager}`);

    // 언어 분포 상위 3개
    const topLangs = Object.entries(summary.languages)
      .sort((a, b) => b[1] - a[1])
      .filter(([l]) => l !== 'other')
      .slice(0, 3);
    if (topLangs.length > 0) {
      lines.push(`- Languages: ${topLangs.map(([l, n]) => `${l}(${n} lines)`).join(', ')}`);
    }

    // 진입점
    if (map.entryPoints.length > 0) {
      lines.push(`- Entry points: ${map.entryPoints.slice(0, 5).join(', ')}`);
    }

    // 주요 디렉토리
    const topDirs = map.directories
      .filter(d => d.purpose && !d.path.includes('/'))
      .slice(0, 8);
    if (topDirs.length > 0) {
      lines.push('- Directories:');
      for (const dir of topDirs) {
        lines.push(`  - \`${dir.path}/\` — ${dir.purpose}`);
      }
    }

    return lines.join('\n');
  } catch {
    return null;
  }
}

/** 보안 관련 규칙 생성 */
export function generateSecurityRules(context: HarnessContext): string {
  const lines: string[] = [
    '# Tenetx — Security Rules',
    `# Philosophy: ${context.philosophy.name} v${context.philosophy.version}`,
    '',
    '## Dangerous Command Warning',
    '- Always confirm before executing destructive commands like `rm -rf`, `git push --force`, `DROP TABLE`',
    '- Double confirmation required for production environment access',
    '',
    '## Secret Key Protection',
    '- Do not commit sensitive information such as `.env`, `credentials.json`, API keys',
    '- Manage through environment variables or a secrets manager',
    '- Detect hardcoded secrets during code review',
    '',
  ];

  // 철학에서 보안 관련 alert 추출
  for (const [name, principle] of Object.entries(context.philosophy.principles)) {
    const alerts = principle.generates.filter(
      g => typeof g !== 'string' && g.alert
    );
    if (alerts.length > 0) {
      lines.push(`## ${name} — Security Alert`);
      for (const gen of alerts) {
        if (typeof gen !== 'string' && gen.alert) {
          lines.push(`- ⚠ ${gen.alert}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/** 핵심 원칙 규칙 생성 (philosophy.generates에서 추출) */
export function generateGoldenPrinciples(context: HarnessContext): string {
  const lines: string[] = [
    '# Tenetx — Core Principles',
    `# Philosophy: ${context.philosophy.name} v${context.philosophy.version}`,
    `# Scope: ${context.scope.summary}`,
    '',
  ];

  for (const [name, principle] of Object.entries(context.philosophy.principles)) {
    lines.push(`## ${name}`);
    lines.push(`> ${principle.belief}`);
    lines.push('');

    for (const gen of principle.generates) {
      if (typeof gen === 'string') {
        lines.push(`- ${gen}`);
      } else if (gen.step) {
        lines.push(`- 📋 ${gen.step}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** 안티패턴 감지 규칙 생성 */
export function generateAntiPatternRules(): string {
  const lines: string[] = [
    '# Tenetx — Anti-Pattern Detection',
    '',
    '## Repeated Edit Warning',
    '- Stop immediately when editing the same file 3+ times → full structure redesign required',
    '- For 5+ edits, always check current state with Read before replacing with a single Write',
    '',
    '## Error Suppression Warning',
    '- No empty catch blocks — at minimum log or re-throw',
    '- Minimize suppression comments like eslint-disable, @ts-ignore',
    '',
    '## Excessive Complexity Warning',
    '- Consider splitting single functions exceeding 50 lines',
    '- Apply early return pattern when nesting depth exceeds 4',
    '- No unnecessary abstraction — implement only what is currently needed',
    '',
  ];

  return lines.join('\n');
}

/** 모델 라우팅 테이블 규칙 생성 */
export function generateRoutingRules(context: HarnessContext): string {
  const lines: string[] = [
    '# Tenetx — Model Routing',
    '',
  ];

  if (context.modelRouting) {
    lines.push('## Agent Model Routing');
    lines.push('Recommended model by task type (focus-resources-on-judgment principle):');
    for (const [model, tasks] of Object.entries(context.modelRouting)) {
      if ((tasks as string[]).length > 0) {
        lines.push(`- **${model}**: ${(tasks as string[]).join(', ')}`);
      }
    }
    lines.push('');

    if (context.signalRoutingEnabled) {
      lines.push('### Dynamic Model Escalation');
      lines.push('The above table is the default routing and escalates automatically based on prompt complexity:');
      lines.push('- Architecture/security/cross-file keywords → escalate to Opus');
      lines.push('- Repeated previous failures → escalate to a higher tier');
      lines.push('- Simple questions/exploration → de-escalate to Haiku');
      lines.push('When calling agents (Agent tool), specify the `model` parameter according to this routing.');
      lines.push('');
    }
  } else {
    lines.push('Model routing not configured. Using default routing.');
    lines.push('');
  }

  return lines.join('\n');
}

/** compound loop 규칙 생성 (축소) */
export function generateCompoundRules(context: HarnessContext): string {
  const lines: string[] = [
    '# Tenetx — Compound Loop',
    `# Philosophy: ${context.philosophy.name} v${context.philosophy.version}`,
    '',
  ];

  // 프로젝트 맵 요약 주입
  const mapSummary = loadProjectMapSummary(context.cwd);
  if (mapSummary) {
    lines.push('## Project Structure (auto-generated)');
    lines.push(mapSummary);
    lines.push('');
  }

  // 개인 규칙 로드
  const meRules = loadRulesFromDir(ME_RULES);
  if (meRules.length > 0) {
    lines.push('## Personal Rules (Me)');
    for (const rule of meRules) {
      lines.push(`- ${rule}`);
    }
    lines.push('');
  }

  // 팩 규칙 로드 (복수 팩 지원)
  const connectedPacks = loadPackConfigs(context.cwd);
  if (connectedPacks.length > 0) {
    for (const pack of connectedPacks) {
      // 팩별 네임스페이스 디렉토리 → 레거시 디렉토리 폴백
      const nsRulesDir = path.join(context.cwd, '.compound', 'packs', pack.name, 'rules');
      const legacyRulesDir = path.join(PACKS_DIR, pack.name, 'rules');
      const rulesDir = fs.existsSync(nsRulesDir) ? nsRulesDir : legacyRulesDir;
      const packRules = loadRulesFromDir(rulesDir);

      lines.push(`## Pack: ${pack.name}`);
      if (packRules.length > 0) {
        for (const rule of packRules) {
          lines.push(`- ${rule}`);
        }
      } else {
        lines.push('- (no rules)');
      }
      lines.push('');
    }
  } else if (context.scope.team) {
    // 하위 호환: 구 방식 scope.team 사용
    const packRulesDir = path.join(PACKS_DIR, context.scope.team.name, 'rules');
    const packRules = loadRulesFromDir(packRulesDir);
    lines.push(`## Pack: ${context.scope.team.name}`);
    lines.push(`- ${context.scope.team.solutionCount} solutions, ${context.scope.team.ruleCount} rules`);
    if (packRules.length > 0) {
      lines.push('');
      for (const rule of packRules) {
        lines.push(`- ${rule}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * paths frontmatter 래퍼 — 조건부 로딩용.
 * paths가 있으면 해당 파일 패턴을 작업할 때만 로드됨.
 * Claude Code 공식 기능 (https://code.claude.com/docs/en/memory)
 */
function withPaths(content: string, paths: string[]): string {
  return `---\npaths:\n${paths.map(p => `  - "${p}"`).join('\n')}\n---\n\n${content}`;
}

/**
 * 학습된 선호/사고 패턴을 .claude/rules/ 규칙으로 변환.
 * prompt-learner가 생성한 behavioral 파일을 읽어
 * 사람이 읽을 수 있는 규칙 파일로 포맷합니다.
 */
function generateBehavioralRules(): string {
  const lines: string[] = ['# Tenetx — Learned Patterns', '# auto-generated from observed interactions', ''];

  try {
    if (!fs.existsSync(ME_BEHAVIOR)) return lines.join('\n');

    const files = fs.readdirSync(ME_BEHAVIOR).filter(f => f.endsWith('.md'));
    const categories: Record<string, string[]> = {
      'Thinking Style': [],
      'Response Preferences': [],
      'Workflow': [],
    };

    for (const file of files) {
      const filePath = path.join(ME_BEHAVIOR, file);
      if (fs.lstatSync(filePath).isSymbolicLink()) continue;
      const raw = fs.readFileSync(filePath, 'utf-8');

      // 간단한 frontmatter 파싱 (behavior-format.ts 제거 후 인라인 대체)
      const trimmed = raw.trimStart();
      if (!trimmed.startsWith('---')) continue;
      const endIdx = trimmed.indexOf('---', 3);
      if (endIdx === -1) continue;
      const fm = trimmed.slice(3, endIdx);
      const body = trimmed.slice(endIdx + 3).trim();

      const kindMatch = fm.match(/^kind:\s*(.+)$/m);
      const countMatch = fm.match(/^observedCount:\s*(\d+)/m);
      const kind = kindMatch?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
      const observedCount = countMatch ? parseInt(countMatch[1], 10) : 0;

      const countStr = observedCount > 0
        ? ` (${observedCount}회 관찰)`
        : '';
      // ## Content 섹션 이후의 첫 번째 의미 있는 줄을 설명으로 사용
      const contentIdx = body.indexOf('## Content');
      const contentBody = contentIdx >= 0 ? body.slice(contentIdx + '## Content'.length) : body;
      const desc = contentBody.split('\n').find(l => {
        const t = l.trim();
        return t.length >= 5 && !t.startsWith('##');
      })?.trim();
      if (!desc) continue;

      if (kind === 'thinking') {
        categories['Thinking Style'].push(`- ${desc}${countStr}`);
      } else if (kind === 'workflow') {
        categories.Workflow.push(`- ${desc}${countStr}`);
      } else if (kind === 'preference') {
        categories['Response Preferences'].push(`- ${desc}${countStr}`);
      }
    }

    for (const [cat, items] of Object.entries(categories)) {
      if (items.length === 0) continue;
      lines.push(`## ${cat}`);
      lines.push(...items);
      lines.push('');
    }
  } catch {
    // 솔루션 디렉토리 접근 실패 시 빈 규칙
  }

  return lines.length <= 3 ? '' : lines.join('\n');
}

/** 모든 규칙 파일을 생성하여 반환 */
export function generateClaudeRuleFiles(context: HarnessContext): Record<string, string> {
  const rules: Record<string, string> = {
    // 항상 로드 (핵심 원칙 — 짧으므로 캐시 효율적)
    'golden-principles.md': generateGoldenPrinciples(context),
    'compound.md': generateCompoundRules(context),

    // 조건부 로딩 — 관련 파일 작업 시에만 활성화
    'security.md': withPaths(generateSecurityRules(context), [
      '*.config.*', 'package.json', 'Dockerfile', 'docker-compose*',
      '*.env*', '.github/**', 'scripts/**',
    ]),
    'anti-pattern.md': withPaths(generateAntiPatternRules(), [
      'src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js',
    ]),
    'routing.md': withPaths(generateRoutingRules(context), [
      'src/**/*.ts', 'agents/**',
    ]),
  };

  // 학습된 행동 패턴 → 규칙 파일 (항상 로드 — 사고 패턴은 모든 작업에 적용)
  const behavioral = generateBehavioralRules();
  if (behavioral) {
    rules['forge-behavioral.md'] = behavioral;
  }

  return rules;
}

/** 하위 호환: 단일 규칙 문자열 생성 (기존 테스트 호환) */
export function generateClaudeRules(context: HarnessContext): string {
  const files = generateClaudeRuleFiles(context);
  return Object.values(files).join('\n');
}

/** tmux 키바인딩 등록 */
export async function registerTmuxBindings(): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  try {
    // prefix + T = 대시보드 토글 (Ctrl+B → Shift+T)
    // D는 detach와 혼동될 수 있으므로 T(enet) 사용
    execFileSync('tmux', ['bind-key', 'T', 'run-shell', 'tenetx me'], { stdio: 'ignore' });
  } catch (e) {
    log.debug('tmux 키바인딩 등록 실패', e);
  }
}

/** 환경변수로 하네스 컨텍스트 전달 */
export function buildEnv(context: HarnessContext): Record<string, string> {
  return {
    COMPOUND_HARNESS: '1',
    COMPOUND_CWD: context.cwd,
    COMPOUND_PHILOSOPHY: context.philosophy.name,
    COMPOUND_PHILOSOPHY_SOURCE: context.philosophySource,
    COMPOUND_SCOPE: context.scope.summary,
    ...(context.scope.team ? { COMPOUND_PACK: context.scope.team.name } : {}),
    ...(context.modelRouting ? { COMPOUND_MODEL_ROUTING: JSON.stringify(context.modelRouting) } : {}),
    ...(context.routingPreset ? { COMPOUND_ROUTING_PRESET: context.routingPreset } : {}),
    ...(fs.existsSync(path.join(projectDir(context.cwd), 'project-map.json'))
      ? { COMPOUND_PROJECT_MAP: path.join(projectDir(context.cwd), 'project-map.json') } : {}),
  };
}
