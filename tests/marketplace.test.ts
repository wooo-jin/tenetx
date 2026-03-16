import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// 임시 디렉토리 기반 경로 모킹
// ---------------------------------------------------------------------------

let TMP: string;
let PLUGINS_DIR: string;
let COMPOUND_HOME_TMP: string;
let PACKS_DIR_TMP: string;

vi.mock('../src/core/paths.js', async () => {
  return {
    get COMPOUND_HOME() { return COMPOUND_HOME_TMP; },
    get PACKS_DIR() { return PACKS_DIR_TMP; },
  };
});

beforeEach(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-marketplace-test-'));
  COMPOUND_HOME_TMP = path.join(TMP, '.compound');
  PACKS_DIR_TMP = path.join(COMPOUND_HOME_TMP, 'packs');
  PLUGINS_DIR = path.join(COMPOUND_HOME_TMP, 'plugins');
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function makeManifest(overrides: Partial<import('../src/core/marketplace.js').PluginManifest> = {}) {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    description: '테스트 플러그인입니다',
    author: 'tester',
    type: 'skill' as const,
    repository: 'https://github.com/test/test-plugin',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe('getPluginsDir / getRegistryPath', () => {
  it('getPluginsDir는 COMPOUND_HOME/plugins/ 를 반환한다', async () => {
    const { getPluginsDir } = await import('../src/core/marketplace.js');
    expect(getPluginsDir()).toBe(PLUGINS_DIR);
  });

  it('getRegistryPath는 COMPOUND_HOME/plugins/registry.json 을 반환한다', async () => {
    const { getRegistryPath } = await import('../src/core/marketplace.js');
    expect(getRegistryPath()).toBe(path.join(PLUGINS_DIR, 'registry.json'));
  });
});

describe('loadRegistry', () => {
  it('registry.json이 없으면 기본 내장 레지스트리를 반환한다', async () => {
    const { loadRegistry } = await import('../src/core/marketplace.js');
    const reg = loadRegistry();
    expect(reg.plugins.length).toBeGreaterThan(0);
    expect(reg.updatedAt).toBeDefined();
    // 기본 레지스트리 플러그인 중 하나가 포함되어 있어야 함
    const names = reg.plugins.map((p) => p.name);
    expect(names).toContain('tenetx-skill-tdd');
  });

  it('registry.json이 있으면 로컬 플러그인과 기본 레지스트리를 병합한다', async () => {
    const registry = {
      plugins: [makeManifest()],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fs.writeFileSync(path.join(PLUGINS_DIR, 'registry.json'), JSON.stringify(registry));

    const { loadRegistry } = await import('../src/core/marketplace.js');
    const reg = loadRegistry();
    // 로컬 플러그인 포함
    expect(reg.plugins.some((p) => p.name === 'test-plugin')).toBe(true);
    // 기본 레지스트리 플러그인도 포함
    expect(reg.plugins.some((p) => p.name === 'tenetx-skill-tdd')).toBe(true);
  });

  it('로컬 플러그인이 기본 레지스트리 동일 이름보다 우선한다', async () => {
    const registry = {
      plugins: [makeManifest({ name: 'tenetx-skill-tdd', version: '9.9.9', description: '로컬 오버라이드' })],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fs.writeFileSync(path.join(PLUGINS_DIR, 'registry.json'), JSON.stringify(registry));

    const { loadRegistry } = await import('../src/core/marketplace.js');
    const reg = loadRegistry();
    const tdd = reg.plugins.find((p) => p.name === 'tenetx-skill-tdd');
    expect(tdd).toBeDefined();
    expect(tdd?.version).toBe('9.9.9');
    // 중복 없이 1개만
    expect(reg.plugins.filter((p) => p.name === 'tenetx-skill-tdd')).toHaveLength(1);
  });

  it('registry.json이 깨진 JSON이면 기본 레지스트리만 반환한다', async () => {
    fs.writeFileSync(path.join(PLUGINS_DIR, 'registry.json'), '{ invalid json ~~~ ');

    const { loadRegistry } = await import('../src/core/marketplace.js');
    const reg = loadRegistry();
    expect(reg.plugins.length).toBeGreaterThan(0);
    expect(reg.plugins.some((p) => p.name === 'tenetx-skill-tdd')).toBe(true);
  });
});

describe('saveRegistry', () => {
  it('레지스트리를 파일에 저장하고 다시 로드할 수 있다', async () => {
    const { saveRegistry, loadRegistry } = await import('../src/core/marketplace.js');
    const registry = {
      plugins: [makeManifest({ name: 'saved-plugin' })],
      updatedAt: new Date().toISOString(),
    };
    saveRegistry(registry);

    const loaded = loadRegistry();
    // 저장된 로컬 플러그인 포함 확인
    expect(loaded.plugins.some((p) => p.name === 'saved-plugin')).toBe(true);
  });

  it('디렉토리가 없어도 자동 생성 후 저장한다', async () => {
    // plugins 디렉토리를 미리 삭제
    fs.rmSync(PLUGINS_DIR, { recursive: true, force: true });

    const { saveRegistry, loadRegistry } = await import('../src/core/marketplace.js');
    const registry = {
      plugins: [],
      updatedAt: new Date().toISOString(),
    };
    saveRegistry(registry);

    expect(fs.existsSync(path.join(PLUGINS_DIR, 'registry.json'))).toBe(true);
    // 로컬이 비어도 기본 레지스트리가 병합되어 반환됨
    expect(loadRegistry().plugins.length).toBeGreaterThan(0);
  });
});

describe('searchPlugins', () => {
  it('쿼리와 이름이 일치하는 플러그인을 반환한다', async () => {
    const { searchPlugins } = await import('../src/core/marketplace.js');
    const registry = {
      plugins: [
        makeManifest({ name: 'alpha-skill', description: '알파 기능' }),
        makeManifest({ name: 'beta-agent', description: '베타 에이전트', type: 'agent' as const }),
      ],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const results = searchPlugins('alpha', registry);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('alpha-skill');
  });

  it('쿼리와 설명이 일치하는 플러그인을 반환한다', async () => {
    const { searchPlugins } = await import('../src/core/marketplace.js');
    const registry = {
      plugins: [
        makeManifest({ name: 'x-plugin', description: '코드 리뷰 자동화 도구' }),
        makeManifest({ name: 'y-plugin', description: '빌드 최적화 툴' }),
      ],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const results = searchPlugins('코드 리뷰', registry);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('x-plugin');
  });

  it('매칭되지 않는 쿼리는 빈 배열을 반환한다', async () => {
    const { searchPlugins } = await import('../src/core/marketplace.js');
    const registry = {
      plugins: [makeManifest({ name: 'hello', description: 'world' })],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const results = searchPlugins('존재하지않는키워드xyz', registry);
    expect(results).toHaveLength(0);
  });

  it('빈 쿼리는 전체 플러그인을 반환한다', async () => {
    const { searchPlugins } = await import('../src/core/marketplace.js');
    const registry = {
      plugins: [makeManifest(), makeManifest({ name: 'other' })],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const results = searchPlugins('', registry);
    expect(results).toHaveLength(2);
  });

  it('대소문자를 무시하고 검색한다', async () => {
    const { searchPlugins } = await import('../src/core/marketplace.js');
    const registry = {
      plugins: [makeManifest({ name: 'MyPlugin', description: 'MyPlugin Desc' })],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const results = searchPlugins('myplugin', registry);
    expect(results).toHaveLength(1);
  });

  it('registry 인자 없이 호출하면 기본 레지스트리에서도 검색된다', async () => {
    const { searchPlugins } = await import('../src/core/marketplace.js');
    // 기본 레지스트리에 'tenetx-skill-tdd' 가 있으므로 'tdd' 로 검색 가능
    const results = searchPlugins('tdd');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.name === 'tenetx-skill-tdd')).toBe(true);
  });
});

describe('listInstalledPlugins', () => {
  it('설치된 플러그인이 없으면 빈 배열을 반환한다', async () => {
    const { listInstalledPlugins } = await import('../src/core/marketplace.js');
    expect(listInstalledPlugins()).toEqual([]);
  });

  it('localPath가 실제로 존재하는 플러그인만 반환한다', async () => {
    const installedPath = path.join(PLUGINS_DIR, 'installed.json');
    const existingDir = path.join(TMP, 'real-plugin');
    fs.mkdirSync(existingDir, { recursive: true });

    const installed = [
      { ...makeManifest({ name: 'real' }), installedAt: '2026-01-01T00:00:00.000Z', localPath: existingDir },
      { ...makeManifest({ name: 'ghost' }), installedAt: '2026-01-01T00:00:00.000Z', localPath: '/nonexistent/path/xyz' },
    ];
    fs.writeFileSync(installedPath, JSON.stringify(installed));

    const { listInstalledPlugins } = await import('../src/core/marketplace.js');
    const result = listInstalledPlugins();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('real');
  });
});

describe('removePlugin', () => {
  it('설치되지 않은 플러그인 제거 시 success: false를 반환한다', async () => {
    const { removePlugin } = await import('../src/core/marketplace.js');
    const result = removePlugin('nonexistent-plugin');
    expect(result.success).toBe(false);
    expect(result.message).toContain('nonexistent-plugin');
  });

  it('설치된 플러그인을 성공적으로 제거한다', async () => {
    const installedPath = path.join(PLUGINS_DIR, 'installed.json');
    const pluginDir = path.join(TMP, 'my-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });

    const installed = [
      { ...makeManifest({ name: 'my-plugin' }), installedAt: '2026-01-01T00:00:00.000Z', localPath: pluginDir },
    ];
    fs.writeFileSync(installedPath, JSON.stringify(installed));

    const { removePlugin, listInstalledPlugins } = await import('../src/core/marketplace.js');
    const result = removePlugin('my-plugin');
    expect(result.success).toBe(true);
    expect(result.message).toContain('my-plugin');

    // 디렉토리도 삭제됐는지 확인
    expect(fs.existsSync(pluginDir)).toBe(false);

    // installed.json에서도 제거됐는지 확인
    expect(listInstalledPlugins()).toHaveLength(0);
  });

  it('제거 후 나머지 플러그인은 유지된다', async () => {
    const installedPath = path.join(PLUGINS_DIR, 'installed.json');
    const dir1 = path.join(TMP, 'plugin-a');
    const dir2 = path.join(TMP, 'plugin-b');
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    const installed = [
      { ...makeManifest({ name: 'plugin-a' }), installedAt: '2026-01-01T00:00:00.000Z', localPath: dir1 },
      { ...makeManifest({ name: 'plugin-b' }), installedAt: '2026-01-01T00:00:00.000Z', localPath: dir2 },
    ];
    fs.writeFileSync(installedPath, JSON.stringify(installed));

    const { removePlugin, listInstalledPlugins } = await import('../src/core/marketplace.js');
    const result = removePlugin('plugin-a');
    expect(result.success).toBe(true);

    const remaining = listInstalledPlugins();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('plugin-b');
  });
});
