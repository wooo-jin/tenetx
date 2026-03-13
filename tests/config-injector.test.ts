import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateClaudeRules, buildEnv } from '../src/core/config-injector.js';
import type { HarnessContext } from '../src/core/types.js';

const baseContext: HarnessContext = {
  philosophy: {
    name: 'test-philosophy',
    version: '1.2.3',
    author: 'tester',
    principles: {
      'be-precise': {
        belief: 'precision prevents mistakes',
        generates: ['always verify before acting'],
      },
    },
  },
  scope: {
    me: { philosophyPath: '/tmp/test', solutionCount: 2, ruleCount: 1 },
    project: { path: '/tmp/project', solutionCount: 0 },
    summary: 'me:2s/1r, project:0s',
  },
  cwd: '/tmp/project',
  inTmux: false,
  philosophySource: 'global',
};

const contextWithTeam: HarnessContext = {
  ...baseContext,
  scope: {
    ...baseContext.scope,
    team: {
      name: 'alpha-pack',
      version: '0.9.0',
      packPath: '/tmp/packs/alpha-pack',
      solutionCount: 5,
      ruleCount: 3,
      syncStatus: 'synced',
    },
    summary: 'me:2s/1r, team:alpha-pack, project:0s',
  },
};

const contextWithRouting: HarnessContext = {
  ...baseContext,
  modelRouting: {
    'claude-opus-4-6': ['핵심 구현', '아키텍처 설계'],
    'claude-sonnet-4-6': ['탐색', '분석'],
  },
};

describe('generateClaudeRules', () => {
  it('철학 이름과 버전을 포함한다', () => {
    const result = generateClaudeRules(baseContext);
    expect(result).toContain('test-philosophy');
    expect(result).toContain('1.2.3');
  });

  it('원칙의 belief를 포함한다', () => {
    const result = generateClaudeRules(baseContext);
    expect(result).toContain('precision prevents mistakes');
  });

  it('modelRouting이 있으면 모델 라우팅 섹션을 포함한다', () => {
    const result = generateClaudeRules(contextWithRouting);
    expect(result).toContain('에이전트 모델 라우팅');
    expect(result).toContain('claude-opus-4-6');
    expect(result).toContain('핵심 구현');
  });

  it('modelRouting이 없으면 라우팅 섹션이 없다', () => {
    const result = generateClaudeRules(baseContext);
    expect(result).not.toContain('에이전트 모델 라우팅');
  });

  it('team이 있으면 팩 섹션을 포함한다', () => {
    const result = generateClaudeRules(contextWithTeam);
    expect(result).toContain('Pack: alpha-pack');
    expect(result).toContain('5 solutions');
    expect(result).toContain('3 rules');
  });
});

describe('buildEnv', () => {
  it('COMPOUND_HARNESS가 1이다', () => {
    const env = buildEnv(baseContext);
    expect(env['COMPOUND_HARNESS']).toBe('1');
  });

  it('COMPOUND_PHILOSOPHY에 철학 이름이 설정된다', () => {
    const env = buildEnv(baseContext);
    expect(env['COMPOUND_PHILOSOPHY']).toBe('test-philosophy');
  });

  it('COMPOUND_SCOPE에 scope 요약이 설정된다', () => {
    const env = buildEnv(baseContext);
    expect(env['COMPOUND_SCOPE']).toBe('me:2s/1r, project:0s');
  });

  it('team이 있으면 COMPOUND_PACK에 팀 이름이 설정된다', () => {
    const env = buildEnv(contextWithTeam);
    expect(env['COMPOUND_PACK']).toBe('alpha-pack');
  });

  it('team이 없으면 COMPOUND_PACK이 없다', () => {
    const env = buildEnv(baseContext);
    expect(env['COMPOUND_PACK']).toBeUndefined();
  });

  it('modelRouting이 있으면 COMPOUND_MODEL_ROUTING에 JSON 직렬화된다', () => {
    const env = buildEnv(contextWithRouting);
    expect(env['COMPOUND_MODEL_ROUTING']).toBeDefined();
    const parsed = JSON.parse(env['COMPOUND_MODEL_ROUTING']!);
    expect(parsed['claude-opus-4-6']).toContain('핵심 구현');
  });

  it('프로젝트 맵이 있으면 COMPOUND_PROJECT_MAP 환경변수 설정', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenet-env-'));
    try {
      const compoundDir = path.join(tmpDir, '.compound');
      fs.mkdirSync(compoundDir, { recursive: true });
      fs.writeFileSync(path.join(compoundDir, 'project-map.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        summary: { name: 'test', totalFiles: 1, totalLines: 10, languages: {} },
      }));

      const ctx: HarnessContext = { ...baseContext, cwd: tmpDir };
      const env = buildEnv(ctx);
      expect(env['COMPOUND_PROJECT_MAP']).toContain('project-map.json');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('프로젝트 맵이 없으면 COMPOUND_PROJECT_MAP 미설정', () => {
    const env = buildEnv(baseContext);
    expect(env['COMPOUND_PROJECT_MAP']).toBeUndefined();
  });
});

describe('generateClaudeRules — 프로젝트 맵 주입', () => {
  it('프로젝트 맵이 있으면 구조 섹션을 포함한다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenet-rules-'));
    try {
      const compoundDir = path.join(tmpDir, '.compound');
      fs.mkdirSync(compoundDir, { recursive: true });
      fs.writeFileSync(path.join(compoundDir, 'project-map.json'), JSON.stringify({
        version: '1.0',
        generatedAt: new Date().toISOString(),
        projectRoot: tmpDir,
        summary: {
          name: 'my-app',
          totalFiles: 42,
          totalLines: 5000,
          languages: { typescript: 4000, json: 1000 },
          framework: 'React',
          packageManager: 'pnpm',
        },
        directories: [
          { path: 'src', type: 'directory', purpose: '소스 코드', fileCount: 30, children: [] },
          { path: 'tests', type: 'directory', purpose: '테스트', fileCount: 10, children: [] },
        ],
        files: [],
        entryPoints: ['src/index.ts'],
        dependencies: [],
      }));

      const ctx: HarnessContext = { ...baseContext, cwd: tmpDir };
      const rules = generateClaudeRules(ctx);
      expect(rules).toContain('프로젝트 구조');
      expect(rules).toContain('my-app');
      expect(rules).toContain('React');
      expect(rules).toContain('src/index.ts');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
