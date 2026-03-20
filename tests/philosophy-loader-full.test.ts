import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-philosophy-loader',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  loadPhilosophy,
  loadPhilosophyForProject,
  initDefaultPhilosophy,
  mergePhilosophies,
  syncPhilosophy,
  DEFAULT_PHILOSOPHY,
} from '../src/core/philosophy-loader.js';

const ME_DIR = path.join(TEST_HOME, '.compound', 'me');
const ME_PHILOSOPHY = path.join(ME_DIR, 'philosophy.json');

describe('philosophy-loader - extended', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── loadPhilosophy ──

  describe('loadPhilosophy', () => {
    it('파일이 없으면 기본 철학 반환', () => {
      const phil = loadPhilosophy('/nonexistent/path.json');
      expect(phil.name).toBe('default');
    });

    it('유효한 파일을 로드한다', () => {
      fs.mkdirSync(ME_DIR, { recursive: true });
      const custom = {
        name: 'custom',
        version: '2.0.0',
        author: 'test',
        principles: {
          'test-principle': {
            belief: 'Testing is important',
            generates: ['Write tests first'],
          },
        },
      };
      fs.writeFileSync(ME_PHILOSOPHY, JSON.stringify(custom));
      const phil = loadPhilosophy(ME_PHILOSOPHY);
      expect(phil.name).toBe('custom');
      expect(phil.version).toBe('2.0.0');
    });

    it('잘못된 JSON이면 기본 철학 반환', () => {
      fs.mkdirSync(ME_DIR, { recursive: true });
      fs.writeFileSync(ME_PHILOSOPHY, 'not json');
      const phil = loadPhilosophy(ME_PHILOSOPHY);
      expect(phil.name).toBe('default');
    });
  });

  // ── loadPhilosophyForProject ──

  describe('loadPhilosophyForProject', () => {
    it('프로젝트 철학이 없으면 글로벌 확인', () => {
      fs.mkdirSync(ME_DIR, { recursive: true });
      const global = {
        name: 'global-phil',
        version: '1.0.0',
        author: 'test',
        principles: {},
      };
      fs.writeFileSync(ME_PHILOSOPHY, JSON.stringify(global));
      const result = loadPhilosophyForProject('/tmp/no-project');
      expect(result.source).toBe('global');
      expect(result.philosophy.name).toBe('global-phil');
    });

    it('프로젝트와 글로벌 모두 없으면 default', () => {
      const result = loadPhilosophyForProject('/tmp/empty');
      expect(result.source).toBe('default');
      expect(result.philosophy.name).toBe('default');
    });

    it('프로젝트 철학을 우선 로드한다', () => {
      const projectDir = path.join(TEST_HOME, 'project');
      const projectCompound = path.join(projectDir, '.compound');
      fs.mkdirSync(projectCompound, { recursive: true });
      fs.writeFileSync(
        path.join(projectCompound, 'philosophy.json'),
        JSON.stringify({
          name: 'project-phil',
          version: '1.0.0',
          author: 'test',
          principles: {},
        }),
      );
      const result = loadPhilosophyForProject(projectDir);
      expect(result.source).toBe('project');
      expect(result.philosophy.name).toBe('project-phil');
    });
  });

  // ── initDefaultPhilosophy ──

  describe('initDefaultPhilosophy', () => {
    it('기본 철학 파일을 생성한다', () => {
      initDefaultPhilosophy();
      expect(fs.existsSync(ME_PHILOSOPHY)).toBe(true);
      const loaded = JSON.parse(fs.readFileSync(ME_PHILOSOPHY, 'utf-8'));
      expect(loaded.name).toBe('default');
    });

    it('이미 존재하면 덮어쓰지 않는다', () => {
      fs.mkdirSync(ME_DIR, { recursive: true });
      fs.writeFileSync(ME_PHILOSOPHY, JSON.stringify({ name: 'existing' }));
      initDefaultPhilosophy();
      const loaded = JSON.parse(fs.readFileSync(ME_PHILOSOPHY, 'utf-8'));
      expect(loaded.name).toBe('existing');
    });
  });

  // ── mergePhilosophies ──

  describe('mergePhilosophies', () => {
    it('오버라이드의 name/version을 사용한다', () => {
      const base = { ...DEFAULT_PHILOSOPHY, name: 'base', version: '1.0.0' };
      const override = { ...DEFAULT_PHILOSOPHY, name: 'override', version: '2.0.0' };
      const merged = mergePhilosophies(base, override);
      expect(merged.name).toBe('override');
      expect(merged.version).toBe('2.0.0');
    });

    it('베이스의 principles를 유지한다', () => {
      const base = {
        ...DEFAULT_PHILOSOPHY,
        principles: {
          'base-only': { belief: 'base belief', generates: ['base rule'] },
        },
      };
      const override = {
        ...DEFAULT_PHILOSOPHY,
        principles: {
          'override-only': { belief: 'override belief', generates: ['override rule'] },
        },
      };
      const merged = mergePhilosophies(base, override);
      expect(merged.principles['base-only']).toBeDefined();
      expect(merged.principles['override-only']).toBeDefined();
    });

    it('같은 키의 generates를 합친다', () => {
      const base = {
        ...DEFAULT_PHILOSOPHY,
        principles: {
          shared: { belief: 'base belief', generates: ['rule1'] },
        },
      };
      const override = {
        ...DEFAULT_PHILOSOPHY,
        principles: {
          shared: { belief: 'override belief', generates: ['rule2'] },
        },
      };
      const merged = mergePhilosophies(base, override);
      expect(merged.principles.shared.belief).toBe('override belief');
      expect(merged.principles.shared.generates).toContain('rule1');
      expect(merged.principles.shared.generates).toContain('rule2');
    });

    it('중복 generates를 제거한다', () => {
      const base = {
        ...DEFAULT_PHILOSOPHY,
        principles: {
          shared: { belief: 'belief', generates: ['same rule'] },
        },
      };
      const override = {
        ...DEFAULT_PHILOSOPHY,
        principles: {
          shared: { belief: 'belief', generates: ['same rule'] },
        },
      };
      const merged = mergePhilosophies(base, override);
      const sameRules = merged.principles.shared.generates.filter(g => g === 'same rule');
      expect(sameRules.length).toBe(1);
    });
  });

  // ── syncPhilosophy ──

  describe('syncPhilosophy', () => {
    it('프로젝트 철학 파일이 없으면 not updated', () => {
      const result = syncPhilosophy('/tmp/no-project');
      expect(result.updated).toBe(false);
      expect(result.message).toContain('프로젝트 철학 파일 없음');
    });

    it('extends가 없으면 not updated', () => {
      const projectDir = path.join(TEST_HOME, 'project');
      fs.mkdirSync(path.join(projectDir, '.compound'), { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, '.compound', 'philosophy.json'),
        JSON.stringify({ name: 'local', version: '1.0.0', author: 'test', principles: {} }),
      );
      const result = syncPhilosophy(projectDir);
      expect(result.updated).toBe(false);
      expect(result.message).toContain('extends 없음');
    });
  });

  // ── DEFAULT_PHILOSOPHY ──

  describe('DEFAULT_PHILOSOPHY', () => {
    it('필수 필드가 있다', () => {
      expect(DEFAULT_PHILOSOPHY.name).toBe('default');
      expect(DEFAULT_PHILOSOPHY.version).toBeTruthy();
      expect(DEFAULT_PHILOSOPHY.principles).toBeDefined();
    });

    it('핵심 원칙을 포함한다', () => {
      expect(DEFAULT_PHILOSOPHY.principles['understand-before-act']).toBeDefined();
      expect(DEFAULT_PHILOSOPHY.principles['decompose-to-control']).toBeDefined();
      expect(DEFAULT_PHILOSOPHY.principles['capitalize-on-failure']).toBeDefined();
    });
  });
});
