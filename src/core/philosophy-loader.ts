import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ME_PHILOSOPHY, ME_DIR, PACKS_DIR, projectPhilosophyPath } from './paths.js';
import type { Philosophy } from './types.js';
import { debugLog } from './logger.js';

/** JSON 파싱 (손상된 파일은 에러 전파) */
function parsePhilosophyFile(content: string): Record<string, unknown> {
  return JSON.parse(content);
}

const DEFAULT_PHILOSOPHY: Philosophy = {
  name: 'default',
  version: '1.0.0',
  author: 'tenetx',
  description: 'Default philosophy',
  principles: {
    'understand-before-act': {
      belief: 'Acting without understanding causes exponentially greater cost',
      generates: [
        'All tasks follow explore → plan → implement order',
        'Before rollback, determine the scope of changes first',
      ],
    },
    'decompose-to-control': {
      belief: 'Large tasks must be decomposed to be controllable',
      generates: [
        'Break large tasks into PLANS/CONTEXT/CHECKLIST',
        { alert: 'Stop after editing the same file 5 times' },
      ],
    },
    'capitalize-on-failure': {
      belief: 'Making the same mistake twice is a system failure',
      generates: [
        'After every task, extract patterns with compound',
        'Auto-generate prevention rules from failures',
      ],
    },
    'focus-resources-on-judgment': {
      belief: 'Resources should be focused where judgment is needed',
      generates: [
        { routing: 'explore → Sonnet, implement → Opus' },
        { alert: 'Warn when session cost exceeds $10' },
      ],
    },
    'knowledge-comes-to-you': {
      belief: 'Needed knowledge should come to you',
      generates: [
        'Auto-match relevant solutions at session start',
        'Auto-pull pack updates',
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
      extends: data.extends as string | undefined,
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
    const project = loadPhilosophy(projectPath);
    // extends가 있으면 팩 철학과 병합
    if (project.extends) {
      const base = resolveBasePhilosophy(project.extends);
      if (base) {
        const merged = mergePhilosophies(base, project);
        return { philosophy: merged, source: 'project' };
      }
    }
    return { philosophy: project, source: 'project' };
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

/**
 * 팩에서 베이스 철학 로드 (extends 필드 해석)
 * "pack:emr-standard" → ~/.compound/packs/emr-standard/philosophy.json
 */
export function resolveBasePhilosophy(extendsValue: string): Philosophy | null {
  let normalized = extendsValue;
  if (!normalized.startsWith('pack:')) {
    // 자동 보정: "relentless-quality-forge" → "pack:relentless-quality-forge"
    normalized = `pack:${normalized}`;
    debugLog('philosophy-loader', `extends 자동 보정: "${extendsValue}" → "${normalized}"`);
  }
  const packName = normalized.slice(5);

  // 1. 설치된 팩에서 찾기
  const packPhilPath = path.join(PACKS_DIR, packName, 'philosophy.json');
  if (fs.existsSync(packPhilPath)) {
    return loadPhilosophy(packPhilPath);
  }

  // 2. 빌트인 팩에서 찾기 (패키지 내장)
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const builtinPath = path.join(pkgRoot, 'packs', `${packName}.json`);
  if (fs.existsSync(builtinPath)) {
    return loadPhilosophy(builtinPath);
  }

  debugLog('philosophy-loader', `extends 팩 "${packName}" 찾을 수 없음`);
  return null;
}

/**
 * 베이스 철학 + 프로젝트 오버라이드 병합
 * - 프로젝트의 principles가 베이스를 덮어씀 (같은 키)
 * - 프로젝트에만 있는 principles는 추가
 * - 베이스에만 있는 principles는 유지
 */
export function mergePhilosophies(base: Philosophy, override: Philosophy): Philosophy {
  const merged: Philosophy = {
    name: override.name || base.name,
    version: override.version || base.version,
    author: override.author || base.author,
    description: override.description || base.description,
    extends: override.extends,
    principles: { ...base.principles },
  };

  // 오버라이드 principles 병합
  for (const [key, principle] of Object.entries(override.principles)) {
    if (merged.principles[key]) {
      // 같은 키: 오버라이드의 belief 사용, generates는 합침 (중복 제거)
      const basePrinciple = merged.principles[key];
      const mergedGenerates = [...basePrinciple.generates];
      for (const gen of principle.generates) {
        const genStr = typeof gen === 'string' ? gen : JSON.stringify(gen);
        const isDuplicate = mergedGenerates.some(
          existing => (typeof existing === 'string' ? existing : JSON.stringify(existing)) === genStr
        );
        if (!isDuplicate) mergedGenerates.push(gen);
      }
      merged.principles[key] = {
        belief: principle.belief || basePrinciple.belief,
        generates: mergedGenerates,
      };
    } else {
      // 새 키: 추가
      merged.principles[key] = principle;
    }
  }

  return merged;
}

/**
 * 철학 동기화 — extends 팩의 최신 버전으로 베이스 갱신
 * 프로젝트 오버라이드는 유지하면서 베이스만 업데이트
 */
export function syncPhilosophy(cwd: string): { updated: boolean; philosophy: Philosophy; message: string } {
  const projectPath = projectPhilosophyPath(cwd);
  if (!fs.existsSync(projectPath)) {
    return { updated: false, philosophy: DEFAULT_PHILOSOPHY, message: 'No project philosophy file found' };
  }

  const project = loadPhilosophy(projectPath);
  if (!project.extends) {
    return { updated: false, philosophy: project, message: 'No extends (local only)' };
  }

  const base = resolveBasePhilosophy(project.extends);
  if (!base) {
    return { updated: false, philosophy: project, message: `Pack "${project.extends}" not found` };
  }

  const merged = mergePhilosophies(base, project);
  return { updated: true, philosophy: merged, message: `Synced based on "${project.extends}"` };
}

export { DEFAULT_PHILOSOPHY };
