import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_RULES, PACKS_DIR } from './paths.js';
import { projectDir } from './paths.js';
import { loadPackConfigs } from './pack-config.js';
import type { HarnessContext } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('config-injector');
import type { ProjectMap } from '../engine/knowledge/types.js';

/** 디렉토리의 .md 파일에서 규칙 첫 줄(요약)을 추출 */
function loadRulesFromDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const content = fs.readFileSync(path.join(dir, f), 'utf-8').trim();
        // 첫 번째 의미있는 줄 추출 (# 헤더 또는 본문)
        const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('---'));
        return firstLine?.replace(/^#+\s*/, '').trim() ?? f.replace('.md', '');
      });
  } catch (e) {
    log.debug(`규칙 디렉토리 읽기 실패: ${dir}`, e);
    return [];
  }
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

/** 모든 규칙 파일을 생성하여 반환 */
export function generateClaudeRuleFiles(context: HarnessContext): Record<string, string> {
  return {
    'security.md': generateSecurityRules(context),
    'golden-principles.md': generateGoldenPrinciples(context),
    'anti-pattern.md': generateAntiPatternRules(),
    'routing.md': generateRoutingRules(context),
    'compound.md': generateCompoundRules(context),
  };
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
    execFileSync('tmux', ['bind-key', 'T', 'run-shell', 'tenetx toggle-dashboard'], { stdio: 'ignore' });
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
