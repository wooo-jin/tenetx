import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_RULES, PACKS_DIR } from './paths.js';
import { projectDir } from './paths.js';
import type { HarnessContext } from './types.js';
import { debugLog } from './logger.js';
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
    debugLog('config-injector', `규칙 디렉토리 읽기 실패: ${dir}`, e);
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

    lines.push(`- 프로젝트: ${summary.name} (${summary.totalFiles}파일, ${summary.totalLines.toLocaleString()}줄)`);
    if (summary.framework) lines.push(`- 프레임워크: ${summary.framework}`);
    if (summary.packageManager) lines.push(`- 패키지 매니저: ${summary.packageManager}`);

    // 언어 분포 상위 3개
    const topLangs = Object.entries(summary.languages)
      .sort((a, b) => b[1] - a[1])
      .filter(([l]) => l !== 'other')
      .slice(0, 3);
    if (topLangs.length > 0) {
      lines.push(`- 언어: ${topLangs.map(([l, n]) => `${l}(${n}줄)`).join(', ')}`);
    }

    // 진입점
    if (map.entryPoints.length > 0) {
      lines.push(`- 진입점: ${map.entryPoints.slice(0, 5).join(', ')}`);
    }

    // 주요 디렉토리
    const topDirs = map.directories
      .filter(d => d.purpose && !d.path.includes('/'))
      .slice(0, 8);
    if (topDirs.length > 0) {
      lines.push('- 디렉토리:');
      for (const dir of topDirs) {
        lines.push(`  - \`${dir.path}/\` — ${dir.purpose}`);
      }
    }

    return lines.join('\n');
  } catch {
    return null;
  }
}

/** 철학에서 CLAUDE.md에 주입할 규칙 생성 */
export function generateClaudeRules(context: HarnessContext): string {
  const lines: string[] = [
    '# Tenet — 자동 생성 규칙',
    `# Philosophy: ${context.philosophy.name} v${context.philosophy.version}`,
    `# Scope: ${context.scope.summary}`,
    '',
  ];

  // 철학 원칙에서 규칙 추출
  for (const [name, principle] of Object.entries(context.philosophy.principles)) {
    lines.push(`## ${name}`);
    lines.push(`> ${principle.belief}`);
    lines.push('');

    for (const gen of principle.generates) {
      if (typeof gen === 'string') {
        lines.push(`- ${gen}`);
      } else if (gen.alert) {
        lines.push(`- ⚠ ${gen.alert}`);
      } else if (gen.routing) {
        lines.push(`- 🔀 ${gen.routing}`);
      }
    }
    lines.push('');
  }

  // 모델 라우팅 테이블
  if (context.modelRouting) {
    lines.push('## 에이전트 모델 라우팅');
    lines.push('작업 유형별 권장 모델 (focus-resources-on-judgment 원칙):');
    for (const [model, tasks] of Object.entries(context.modelRouting)) {
      if ((tasks as string[]).length > 0) {
        lines.push(`- **${model}**: ${(tasks as string[]).join(', ')}`);
      }
    }
    lines.push('');

    // 신호 기반 동적 라우팅 안내
    if (context.signalRoutingEnabled) {
      lines.push('### 동적 모델 에스컬레이션');
      lines.push('위 테이블은 기본 라우팅이며, 프롬프트 복잡도에 따라 자동 에스컬레이션됩니다:');
      lines.push('- 아키텍처/보안/교차파일 키워드 → Opus로 에스컬레이션');
      lines.push('- 이전 실패 반복 시 → 더 높은 티어로 에스컬레이션');
      lines.push('- 단순 질문/탐색 → Haiku로 디에스컬레이션');
      lines.push('에이전트(Agent 도구) 호출 시 `model` 파라미터를 이 라우팅에 맞춰 지정하세요.');
      lines.push('');
    }
  }

  // 프로젝트 맵 요약 주입 (Phase D: 에이전트 감각 확장)
  const mapSummary = loadProjectMapSummary(context.cwd);
  if (mapSummary) {
    lines.push('## 프로젝트 구조 (자동 생성)');
    lines.push(mapSummary);
    lines.push('');
  }

  // 개인 규칙 로드
  const meRules = loadRulesFromDir(ME_RULES);
  if (meRules.length > 0) {
    lines.push('## 개인 규칙 (Me)');
    for (const rule of meRules) {
      lines.push(`- ${rule}`);
    }
    lines.push('');
  }

  // 팩 규칙 로드
  if (context.scope.team) {
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

/** tmux 키바인딩 등록 */
export async function registerTmuxBindings(): Promise<void> {
  const { execSync } = await import('node:child_process');
  try {
    // prefix + D = 대시보드 토글 (Ctrl+B → D)
    // Ctrl+D는 EOF 신호와 충돌하므로 대문자 D 사용
    execSync('tmux bind-key D run-shell "tenet toggle-dashboard"', { stdio: 'ignore' });
  } catch (e) {
    debugLog('config-injector', 'tmux 키바인딩 등록 실패', e);
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
