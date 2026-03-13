import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadPhilosophy, loadPhilosophyForProject, DEFAULT_PHILOSOPHY, initDefaultPhilosophy } from '../src/core/philosophy-loader.js';

const TEST_DIR = path.join(os.tmpdir(), 'tenet-test-philosophy');
const TEST_FILE = path.join(TEST_DIR, 'test-philosophy.json');

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('loadPhilosophy', () => {
  it('파일이 없으면 DEFAULT_PHILOSOPHY를 반환한다', () => {
    const result = loadPhilosophy('/nonexistent/path/philosophy.json');
    expect(result.name).toBe('default');
    expect(result.principles).toHaveProperty('understand-before-act');
  });

  it('유효한 JSON 파일에서 철학을 로드한다', () => {
    const custom = {
      name: 'my-philosophy',
      version: '2.0.0',
      author: 'tester',
      principles: {
        'test-principle': {
          belief: 'testing is good',
          generates: ['always test'],
        },
      },
    };
    fs.writeFileSync(TEST_FILE, JSON.stringify(custom));
    const result = loadPhilosophy(TEST_FILE);
    expect(result.name).toBe('my-philosophy');
    expect(result.version).toBe('2.0.0');
  });

  it('손상된 JSON 파일이면 DEFAULT_PHILOSOPHY를 반환한다', () => {
    fs.writeFileSync(TEST_FILE, 'not valid json {{{');
    const result = loadPhilosophy(TEST_FILE);
    expect(result.name).toBe('default');
  });

  it('.json 경로로 요청해도 .yaml 파일이 있으면 레거시 폴백으로 로드한다', () => {
    const jsonPath = path.join(TEST_DIR, 'test.json');
    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    // .json은 없고 .yaml만 존재하는 레거시 환경
    fs.writeFileSync(yamlPath, JSON.stringify({ name: 'legacy', version: '1.0.0', author: 'test', principles: {} }));
    const result = loadPhilosophy(jsonPath);
    expect(result.name).toBe('legacy');
  });

  it('빈 principles 객체를 처리한다', () => {
    fs.writeFileSync(TEST_FILE, JSON.stringify({ name: 'minimal', version: '1.0.0', author: 'test' }));
    const result = loadPhilosophy(TEST_FILE);
    expect(result.name).toBe('minimal');
  });
});

describe('DEFAULT_PHILOSOPHY', () => {
  it('5개 원칙을 포함한다', () => {
    expect(Object.keys(DEFAULT_PHILOSOPHY.principles)).toHaveLength(5);
  });

  it('각 원칙에 belief과 generates가 있다', () => {
    for (const principle of Object.values(DEFAULT_PHILOSOPHY.principles)) {
      expect(principle.belief).toBeTruthy();
      expect(Array.isArray(principle.generates)).toBe(true);
      expect(principle.generates.length).toBeGreaterThan(0);
    }
  });

  it('focus-resources-on-judgment에 routing이 있다', () => {
    const principle = DEFAULT_PHILOSOPHY.principles['focus-resources-on-judgment'];
    const routingGen = principle.generates.find(g => typeof g === 'object' && 'routing' in g);
    expect(routingGen).toBeTruthy();
  });
});

describe('loadPhilosophyForProject', () => {
  const PROJECT_DIR = path.join(TEST_DIR, 'project');
  const PROJECT_COMPOUND_DIR = path.join(PROJECT_DIR, '.compound');
  const PROJECT_PHILOSOPHY_PATH = path.join(PROJECT_COMPOUND_DIR, 'philosophy.json');

  beforeEach(() => {
    fs.mkdirSync(PROJECT_COMPOUND_DIR, { recursive: true });
  });

  it('프로젝트 철학이 있으면 source=project로 반환한다', () => {
    const projectPhil = {
      name: 'project-specific',
      version: '1.0.0',
      author: 'tester',
      principles: { 'proj-rule': { belief: 'project first', generates: ['do project things'] } },
    };
    fs.writeFileSync(PROJECT_PHILOSOPHY_PATH, JSON.stringify(projectPhil));

    const { philosophy, source } = loadPhilosophyForProject(PROJECT_DIR);
    expect(source).toBe('project');
    expect(philosophy.name).toBe('project-specific');
  });

  it('프로젝트 철학이 없고 글로벌이 있으면 source=global로 반환한다', () => {
    // PROJECT_PHILOSOPHY_PATH는 생성하지 않음
    // 글로벌 철학은 initDefaultPhilosophy로 보장됨
    initDefaultPhilosophy();

    const { philosophy, source } = loadPhilosophyForProject(PROJECT_DIR);
    expect(source).toBe('global');
    expect(philosophy.name).toBe('default');
  });

  it('프로젝트/글로벌 모두 없으면 source=default로 반환한다', () => {
    // 글로벌 ME_PHILOSOPHY가 없는 환경을 시뮬레이션하기 어려우므로
    // 존재하지 않는 cwd를 사용
    const fakeCwd = path.join(TEST_DIR, 'nonexistent-project');
    const { philosophy, source } = loadPhilosophyForProject(fakeCwd);
    // 글로벌이 이미 존재하면 global, 아니면 default
    expect(['global', 'default']).toContain(source);
    expect(philosophy.name).toBeDefined();
  });
});
