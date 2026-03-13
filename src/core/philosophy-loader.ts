import * as fs from 'node:fs';
import { ME_PHILOSOPHY, ME_DIR, projectPhilosophyPath } from './paths.js';
import type { Philosophy } from './types.js';
import { debugLog } from './logger.js';

/** JSON 파싱 (손상된 파일은 에러 전파) */
function parsePhilosophyFile(content: string): Record<string, unknown> {
  return JSON.parse(content);
}

const DEFAULT_PHILOSOPHY: Philosophy = {
  name: 'default',
  version: '1.0.0',
  author: 'tenet',
  description: 'Default philosophy',
  principles: {
    'understand-before-act': {
      belief: '이해 없이 행동하면 비용이 기하급수적으로 증가한다',
      generates: [
        '모든 작업은 탐색 → 계획 → 구현 순서',
        '롤백 시 변경 범위 먼저 파악',
      ],
    },
    'decompose-to-control': {
      belief: '큰 작업은 분해해야 제어 가능하다',
      generates: [
        '큰 작업은 PLANS/CONTEXT/CHECKLIST로 분해',
        { alert: '같은 파일 5회 편집 시 중단 권고' },
      ],
    },
    'capitalize-on-failure': {
      belief: '같은 실수를 두 번 하는 건 시스템의 실패다',
      generates: [
        '모든 작업 후 compound로 패턴 추출',
        '실패에서 예방 규칙 자동 생성',
      ],
    },
    'focus-resources-on-judgment': {
      belief: '자원은 판단이 필요한 곳에 집중해야 한다',
      generates: [
        { routing: 'explore → Sonnet, implement → Opus' },
        { alert: '세션 비용 $10+ 시 경고' },
      ],
    },
    'knowledge-comes-to-you': {
      belief: '필요한 지식은 찾아와야 한다',
      generates: [
        '세션 시작 시 관련 솔루션 자동 매칭',
        '팩 업데이트 자동 pull',
      ],
    },
  },
};

export function loadPhilosophy(philosophyPath?: string): Philosophy {
  let filePath = philosophyPath ?? ME_PHILOSOPHY;

  // 레거시 호환: v0.1 이전에 .yaml로 저장된 사용자가 있을 수 있음 (향후 제거 예정)
  if (!fs.existsSync(filePath) && filePath.endsWith('.json')) {
    const yamlPath = filePath.replace('.json', '.yaml');
    if (fs.existsSync(yamlPath)) filePath = yamlPath;
  }

  if (!fs.existsSync(filePath)) {
    return DEFAULT_PHILOSOPHY;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = parsePhilosophyFile(content);
    return {
      name: (data.name as string) ?? 'unknown',
      version: (data.version as string) ?? '1.0.0',
      author: (data.author as string) ?? 'unknown',
      description: data.description as string | undefined,
      principles: (data.principles as Record<string, unknown> ?? {}) as Philosophy['principles'],
    };
  } catch (e) {
    debugLog('philosophy-loader', '철학 파일 로드 실패, 기본값 사용', e);
    return DEFAULT_PHILOSOPHY;
  }
}

/**
 * 프로젝트별 철학 우선 로드.
 * {cwd}/.compound/philosophy.json → ~/.compound/me/philosophy.json → 기본값
 */
export function loadPhilosophyForProject(cwd: string): { philosophy: Philosophy; source: 'project' | 'global' | 'default' } {
  const projectPath = projectPhilosophyPath(cwd);
  if (fs.existsSync(projectPath)) {
    const philosophy = loadPhilosophy(projectPath);
    return { philosophy, source: 'project' };
  }

  if (fs.existsSync(ME_PHILOSOPHY)) {
    const philosophy = loadPhilosophy(ME_PHILOSOPHY);
    return { philosophy, source: 'global' };
  }

  return { philosophy: DEFAULT_PHILOSOPHY, source: 'default' };
}

/** 기본 철학을 ~/.compound/me/philosophy.json으로 저장 */
export function initDefaultPhilosophy(): void {
  if (fs.existsSync(ME_PHILOSOPHY)) return;

  fs.mkdirSync(ME_DIR, { recursive: true });
  fs.writeFileSync(ME_PHILOSOPHY, JSON.stringify(DEFAULT_PHILOSOPHY, null, 2));
}

export { DEFAULT_PHILOSOPHY };
