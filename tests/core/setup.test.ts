import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── 테스트용 홈 디렉토리 격리 ──
// setup.ts는 paths.ts의 모듈-레벨 상수(COMPOUND_HOME 등)를 사용하므로
// harness.test.ts와 동일한 패턴: vi.hoisted + vi.mock('node:os')
const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-setup-home',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

// ── setup.ts 내부 의존성 모킹 ──
// interactive readline을 사용하지 않도록 side-effect 없는 모듈들도 모킹
vi.mock('../../src/core/global-config.js', () => ({
  loadGlobalConfig: vi.fn(() => ({})),
  saveGlobalConfig: vi.fn(),
}));

vi.mock('../../src/core/notify.js', () => ({
  validateWebhookUrl: vi.fn(() => true),
  loadNotifyConfig: vi.fn(() => ({ enabled: false })),
  saveNotifyConfig: vi.fn(),
}));

vi.mock('../../src/core/philosophy-loader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/philosophy-loader.js')>();
  return {
    ...actual,
    initDefaultPhilosophy: vi.fn(),
    loadPhilosophy: vi.fn(() => ({
      name: 'test-philosophy',
      version: '1.0.0',
      author: 'test',
      principles: { 'test-principle': { belief: 'test', generates: [] } },
    })),
  };
});

vi.mock('../../src/core/philosophy-generator.js', () => ({
  sampleUserHistory: vi.fn(() => []),
  generatePhilosophy: vi.fn(() => null),
  formatPhilosophy: vi.fn(() => ''),
}));

vi.mock('../../src/core/i18n.js', () => ({
  t: vi.fn((key: string, ...args: string[]) => `[${key}${args.length ? ':' + args.join(',') : ''}]`),
  setLocale: vi.fn(),
  getLocale: vi.fn(() => 'en'),
}));

import { runSetup, runProjectSetup } from '../../src/core/setup.js';
import { loadGlobalConfig, saveGlobalConfig } from '../../src/core/global-config.js';
import { initDefaultPhilosophy } from '../../src/core/philosophy-loader.js';

const TEST_COMPOUND_HOME = path.join(TEST_HOME, '.compound');
const TEST_CWD_PROJECT = path.join(TEST_HOME, 'test-project');

// ────────────────────────────────────────────────────────────────────────────
// runSetup() — non-interactive (options.yes = true)
// ────────────────────────────────────────────────────────────────────────────
describe('runSetup() non-interactive', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
    fs.mkdirSync(TEST_HOME, { recursive: true });
    vi.clearAllMocks();
    vi.mocked(loadGlobalConfig).mockReturnValue({});
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('options.yes=true 시 COMPOUND_HOME 디렉토리가 생성된다', async () => {
    await runSetup({ yes: true });
    expect(fs.existsSync(TEST_COMPOUND_HOME)).toBe(true);
  });

  it('options.yes=true 시 saveGlobalConfig가 호출된다', async () => {
    await runSetup({ yes: true });
    expect(saveGlobalConfig).toHaveBeenCalledOnce();
  });

  it('options.yes=true 시 initDefaultPhilosophy가 호출된다', async () => {
    await runSetup({ yes: true });
    expect(initDefaultPhilosophy).toHaveBeenCalledOnce();
  });

  it('options.yes=true 시 modelRouting이 기본값 "default"로 설정된다', async () => {
    vi.mocked(loadGlobalConfig).mockReturnValue({});
    await runSetup({ yes: true });
    const savedConfig = vi.mocked(saveGlobalConfig).mock.calls[0][0];
    expect(savedConfig.modelRouting).toBe('default');
  });

  it('modelRouting이 이미 설정된 경우 기존 값을 유지한다', async () => {
    vi.mocked(loadGlobalConfig).mockReturnValue({ modelRouting: 'max-quality' } as { modelRouting: string });
    await runSetup({ yes: true });
    const savedConfig = vi.mocked(saveGlobalConfig).mock.calls[0][0];
    expect(savedConfig.modelRouting).toBe('max-quality');
  });

  it('options.yes=true 시 me, solutions, rules, packs, sessions 디렉토리가 모두 생성된다', async () => {
    await runSetup({ yes: true });
    const expectedSubdirs = ['me', path.join('me', 'solutions'), path.join('me', 'rules'), 'packs', 'sessions'];
    for (const sub of expectedSubdirs) {
      expect(fs.existsSync(path.join(TEST_COMPOUND_HOME, sub))).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// runProjectSetup() — non-interactive (options.yes, options.pack, options.extends)
// ────────────────────────────────────────────────────────────────────────────
describe('runProjectSetup() non-interactive', () => {
  beforeEach(() => {
    fs.rmSync(TEST_CWD_PROJECT, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD_PROJECT, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(TEST_CWD_PROJECT, { recursive: true, force: true });
  });

  it('options.yes=true 시 DEFAULT_PHILOSOPHY 기반으로 philosophy.json이 생성된다', async () => {
    const philosophyPath = path.join(TEST_CWD_PROJECT, '.compound', 'philosophy.json');
    await runProjectSetup(TEST_CWD_PROJECT, { yes: true });
    expect(fs.existsSync(philosophyPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(philosophyPath, 'utf-8'));
    // 프로젝트 이름이 cwd basename으로 설정됨
    expect(parsed.name).toBe(path.basename(TEST_CWD_PROJECT));
  });

  it('options.extends로 호출 시 extends 필드가 pack: 접두사로 설정된다', async () => {
    const philosophyPath = path.join(TEST_CWD_PROJECT, '.compound', 'philosophy.json');
    await runProjectSetup(TEST_CWD_PROJECT, { extends: 'backend' });
    const parsed = JSON.parse(fs.readFileSync(philosophyPath, 'utf-8'));
    expect(parsed.extends).toBe('pack:backend');
  });

  it('options.extends로 호출 시 pack: 접두사가 중복되지 않는다', async () => {
    const philosophyPath = path.join(TEST_CWD_PROJECT, '.compound', 'philosophy.json');
    await runProjectSetup(TEST_CWD_PROJECT, { extends: 'pack:frontend' });
    const parsed = JSON.parse(fs.readFileSync(philosophyPath, 'utf-8'));
    // pack: 접두사는 한 번만 붙어야 함
    expect(parsed.extends).toBe('pack:frontend');
  });

  it('options.pack으로 존재하지 않는 팩을 지정하면 process.exit(1)이 호출된다', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
    await runProjectSetup(TEST_CWD_PROJECT, { pack: 'nonexistent-pack-xyz' });
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('생성된 philosophy.json은 유효한 JSON이다', async () => {
    const philosophyPath = path.join(TEST_CWD_PROJECT, '.compound', 'philosophy.json');
    await runProjectSetup(TEST_CWD_PROJECT, { yes: true });
    const content = fs.readFileSync(philosophyPath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('.compound 디렉토리가 자동 생성된다', async () => {
    const compoundDir = path.join(TEST_CWD_PROJECT, '.compound');
    expect(fs.existsSync(compoundDir)).toBe(false);
    await runProjectSetup(TEST_CWD_PROJECT, { yes: true });
    expect(fs.existsSync(compoundDir)).toBe(true);
  });
});
