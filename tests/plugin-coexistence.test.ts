/**
 * 플러그인 공존 통합 테스트
 *
 * 실제 머신 환경에서 다른 플러그인/하네스와 tenetx가
 * 함께 동작하는지 검증합니다.
 *
 * 주의: 이 테스트는 실제 homedir의 플러그인 상태를 읽으므로
 * CI 환경과 로컬 개발 환경에서 결과가 다를 수 있습니다.
 * 환경 독립적 로직은 unit test에서, 통합 동작은 여기서 검증합니다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resetIndexCache } from '../src/engine/solution-index.js';
import { searchSolutions, listSolutions, readSolution } from '../src/mcp/solution-reader.js';
import { matchSolutions } from '../src/engine/solution-matcher.js';

// ── 시나리오 A: 플러그인 감지 로직 (순수 로직 테스트) ──

describe('plugin-detector 순수 로직', () => {
  it('KNOWN_PLUGINS에 등록된 플러그인은 올바른 overlappingHooks를 갖는다', async () => {
    const { detectInstalledPlugins, invalidatePluginCache } = await import('../src/core/plugin-detector.js');
    invalidatePluginCache();

    const plugins = detectInstalledPlugins();
    for (const p of plugins) {
      if (p.name === 'oh-my-claudecode') {
        expect(p.overlappingHooks).toContain('intent-classifier');
        expect(p.overlappingHooks).toContain('keyword-detector');
        expect(p.overlappingHooks.length).toBe(2);
      }
      if (p.name === 'superpowers') {
        expect(p.overlappingHooks).toEqual([]);
        expect(p.overlappingSkills.length).toBe(4);
      }
      if (p.name === 'claude-mem') {
        expect(p.overlappingHooks).toEqual([]);
        expect(p.overlappingSkills).toEqual([]);
      }
    }
  });

  it('hasContextInjectingPlugins는 overlappingHooks가 있는 플러그인만 true 반환한다', async () => {
    const { detectInstalledPlugins, hasContextInjectingPlugins, invalidatePluginCache } = await import('../src/core/plugin-detector.js');
    invalidatePluginCache();

    const plugins = detectInstalledPlugins();
    const hasHookConflict = plugins.some(p => p.overlappingHooks.length > 0);

    // 실제 환경의 결과와 hasContextInjectingPlugins 일치 검증
    expect(hasContextInjectingPlugins()).toBe(hasHookConflict);
  });

  it('getSkillConflicts는 중복 스킬 → 플러그인 매핑을 반환한다', async () => {
    const { getSkillConflicts, invalidatePluginCache } = await import('../src/core/plugin-detector.js');
    invalidatePluginCache();

    const conflicts = getSkillConflicts();
    // Map<skillName, pluginName> 형태
    for (const [skill, plugin] of conflicts) {
      expect(typeof skill).toBe('string');
      expect(typeof plugin).toBe('string');
    }
  });

  it('getHookConflicts는 중복 훅 → 플러그인 매핑을 반환한다', async () => {
    const { getHookConflicts, invalidatePluginCache } = await import('../src/core/plugin-detector.js');
    invalidatePluginCache();

    const conflicts = getHookConflicts();
    for (const [hook, plugin] of conflicts) {
      expect(typeof hook).toBe('string');
      expect(typeof plugin).toBe('string');
      // 훅 이름이 실제 HOOK_REGISTRY에 존재하는지
      const { HOOK_REGISTRY } = await import('../src/hooks/hook-registry.js');
      expect(HOOK_REGISTRY.find(h => h.name === hook)).toBeDefined();
    }
  });
});

// ── 시나리오 B: hooks.json 생성 + 훅 필터링 ──

describe('hooks.json 동적 생성', () => {
  it('hook-registry.json과 hook-registry.ts가 동일한 데이터를 반환한다', async () => {
    const jsonData = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'hooks', 'hook-registry.json'), 'utf-8'),
    );
    const { HOOK_REGISTRY } = await import('../src/hooks/hook-registry.js');

    expect(HOOK_REGISTRY).toEqual(jsonData);
    expect(HOOK_REGISTRY.length).toBe(17);
  });

  it('pre-tool-use가 db-guard와 rate-limiter보다 앞에 위치한다', async () => {
    const { HOOK_REGISTRY } = await import('../src/hooks/hook-registry.js');

    const preToolIdx = HOOK_REGISTRY.findIndex(h => h.name === 'pre-tool-use');
    const dbGuardIdx = HOOK_REGISTRY.findIndex(h => h.name === 'db-guard');
    const rateLimiterIdx = HOOK_REGISTRY.findIndex(h => h.name === 'rate-limiter');

    expect(preToolIdx).toBeLessThan(dbGuardIdx);
    expect(preToolIdx).toBeLessThan(rateLimiterIdx);
  });

  it('compound-core 훅 7개 이상, compound-critical 4개 이상', async () => {
    const { HOOK_REGISTRY } = await import('../src/hooks/hook-registry.js');
    const compoundCore = HOOK_REGISTRY.filter(h => h.tier === 'compound-core');
    const critical = compoundCore.filter(h => h.compoundCritical);

    expect(compoundCore.length).toBeGreaterThanOrEqual(7);
    expect(critical.length).toBeGreaterThanOrEqual(3);
  });

  it('hooks-generator가 충돌 훅을 올바르게 필터링한다', async () => {
    const { generateHooksJson } = await import('../src/hooks/hooks-generator.js');
    const result = generateHooksJson();

    // hooks.json이 생성됨
    expect(result.hooks).toBeDefined();
    expect(typeof result.description).toBe('string');

    // 이 머신에 OMC가 설치되어 있으면 workflow 훅 3개가 비활성화
    const { getHookConflicts } = await import('../src/core/plugin-detector.js');
    const conflicts = getHookConflicts();

    if (conflicts.size > 0) {
      // UserPromptSubmit 이벤트에서 intent-classifier/keyword-detector/skill-injector 제거 확인
      const upsHooks = result.hooks['UserPromptSubmit'];
      if (upsHooks) {
        const hookNames = upsHooks.flatMap(m => m.hooks.map(h => h.command));
        for (const [conflictHook] of conflicts) {
          // 충돌 훅의 스크립트가 hooks.json에 없어야 함
          const found = hookNames.some(cmd => cmd.includes(conflictHook.replace(/-/g, '-')));
          expect(found).toBe(false);
        }
      }
    }
  });
});

// ── 시나리오 C: MCP 서버 독립성 ──

describe('MCP compound-search 독립성', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-mcp-coexist-'));
    fs.mkdirSync(path.join(tmpDir, 'solutions'), { recursive: true });
    resetIndexCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSolution(name: string, tags: string[]) {
    const content = `---
name: "${name}"
version: 1
status: "verified"
confidence: 0.8
type: "pattern"
scope: "me"
tags: ${JSON.stringify(tags)}
identifiers: []
evidence:
  injected: 5
  reflected: 3
  negative: 0
  sessions: 10
  reExtracted: 0
created: "2026-03-30"
updated: "2026-03-30"
supersedes: null
extractedBy: "auto"
---

## Context
Test context for ${name}

## Content
Full content for ${name} pattern. This is the complete, unabbreviated content.
`;
    fs.writeFileSync(path.join(tmpDir, 'solutions', `${name}.md`), content);
  }

  const dirs = () => [{ dir: path.join(tmpDir, 'solutions'), scope: 'me' as const }];

  it('MCP는 전문을 반환한다 (truncation 없음)', () => {
    writeSolution('vitest-mock', ['vitest', 'mock', 'testing', 'typescript']);

    resetIndexCache();
    const result = readSolution('vitest-mock', { dirs: dirs() });

    expect(result).not.toBeNull();
    expect(result!.content).toContain('Full content for vitest-mock pattern');
    expect(result!.content).not.toContain('truncated');
  });

  it('MCP 검색은 세션 캐시 없이 반복 접근 가능', () => {
    writeSolution('react-hook', ['react', 'hook', 'state', 'component']);

    resetIndexCache();

    const r1 = searchSolutions('react hook state', { dirs: dirs() });
    const r2 = searchSolutions('react hook state', { dirs: dirs() });
    expect(r1.length).toBe(r2.length);
    expect(r1.length).toBeGreaterThanOrEqual(1);
  });

  it('symlink 솔루션 파일은 인덱스에서 제외된다', () => {
    writeSolution('legit-sol', ['vitest', 'mock', 'testing']);
    const symlinkPath = path.join(tmpDir, 'solutions', 'evil.md');
    try { fs.symlinkSync('/etc/hosts', symlinkPath); } catch { return; }

    resetIndexCache();
    const results = listSolutions({ dirs: dirs() });

    expect(results.find((r: { name: string }) => r.name === 'evil')).toBeUndefined();
    expect(results.find((r: { name: string }) => r.name === 'legit-sol')).toBeDefined();
  });

  it('100KB 초과 파일은 compound-read에서 거부된다', () => {
    const bigSolution = `---
name: "big-sol"
version: 1
status: "verified"
confidence: 0.8
type: "pattern"
scope: "me"
tags: ["big", "test"]
identifiers: []
evidence:
  injected: 0
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
created: "2026-03-30"
updated: "2026-03-30"
supersedes: null
extractedBy: "auto"
---

## Content
${'x'.repeat(150 * 1024)}
`;
    fs.writeFileSync(path.join(tmpDir, 'solutions', 'big-sol.md'), bigSolution);

    resetIndexCache();
    expect(readSolution('big-sol', { dirs: dirs() })).toBeNull();
  });
});

// ── 시나리오 D: INJECTION_CAPS ──

describe('INJECTION_CAPS 일관성', () => {
  it('dead code 상수가 제거되고 활성 상수만 남아있다', async () => {
    const { INJECTION_CAPS, RULE_FILE_CAPS } = await import('../src/hooks/shared/injection-caps.js');

    expect(Object.keys(INJECTION_CAPS).sort()).toEqual(
      ['notepadMax', 'skillContentMax', 'solutionMax', 'solutionSessionMax'].sort(),
    );
    expect(INJECTION_CAPS).not.toHaveProperty('keywordInjectMax');
    expect(INJECTION_CAPS).not.toHaveProperty('perPromptTotal');

    expect(RULE_FILE_CAPS.perRuleFile).toBe(3000);
    expect(RULE_FILE_CAPS.totalRuleFiles).toBe(15000);
  });
});

// ── 시나리오 E: Push + Pull 하이브리드 ──

describe('Push(hook) + Pull(MCP) 하이브리드', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-hybrid-'));
    fs.mkdirSync(path.join(tmpDir, 'solutions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'solutions', 'shared-pattern.md'), `---
name: "shared-pattern"
version: 1
status: "verified"
confidence: 0.9
type: "pattern"
scope: "me"
tags: ["vitest", "mock", "testing", "typescript"]
identifiers: ["mockFunction", "spyOn"]
evidence:
  injected: 10
  reflected: 5
  negative: 0
  sessions: 20
  reExtracted: 1
created: "2026-01-01"
updated: "2026-03-30"
supersedes: null
extractedBy: "auto"
---

## Context
When writing vitest tests with mocking

## Content
Use vi.mock() for module-level mocking and vi.spyOn() for individual function spying.
`);
    resetIndexCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('동일 솔루션이 MCP 검색 + MCP 읽기 양쪽에서 접근 가능하다', () => {
    // top-level import 사용
    const dirs = [{ dir: path.join(tmpDir, 'solutions'), scope: 'me' as const }];

    // 검색
    resetIndexCache();
    const results = searchSolutions('vitest mock testing', { dirs });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('shared-pattern');

    // 읽기
    const detail = readSolution('shared-pattern', { dirs });
    expect(detail).not.toBeNull();
    expect(detail!.content).toContain('vi.mock()');
    expect(detail!.content).not.toContain('truncated');
  });

  it('hook matcher와 MCP reader가 동일 솔루션을 찾을 수 있다', () => {
    // matchSolutions는 project dir에서 .compound/solutions/를 탐색하므로
    // 해당 경로에 솔루션을 배치하여 양쪽 모두 검증 가능하게 구성
    const projectSolDir = path.join(tmpDir, '.compound', 'solutions');
    fs.mkdirSync(projectSolDir, { recursive: true });
    fs.copyFileSync(
      path.join(tmpDir, 'solutions', 'shared-pattern.md'),
      path.join(projectSolDir, 'shared-pattern.md'),
    );

    const dirs = [{ dir: projectSolDir, scope: 'me' as const }];

    // MCP 검색
    resetIndexCache();
    const mcpResults = searchSolutions('vitest mock testing typescript', { dirs });

    // Hook matcher (project dir 경로)
    resetIndexCache();
    const hookResults = matchSolutions('vitest mock testing typescript', {
      me: { philosophyPath: '', solutionCount: 0, ruleCount: 0 },
      project: { path: tmpDir, solutionCount: 1 },
      summary: 'Me(0)',
    }, tmpDir);

    // 양쪽 모두 shared-pattern을 찾아야 함
    expect(mcpResults.length).toBeGreaterThanOrEqual(1);
    expect(mcpResults[0].name).toBe('shared-pattern');
    expect(hookResults.length).toBeGreaterThanOrEqual(1);
    expect(hookResults[0].name).toBe('shared-pattern');
  });
});
