import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateProjectMap, formatMapAsMarkdown } from '../src/engine/knowledge/map-generator.js';

describe('map-generator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-map-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('빈 프로젝트 맵 생성', () => {
    const map = generateProjectMap({ cwd: tmpDir });
    expect(map.version).toBe('1.0');
    expect(map.summary.totalFiles).toBe(0);
    expect(map.files).toEqual([]);
    expect(map.directories).toEqual([]);
  });

  it('TypeScript 파일 분석', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'index.ts'), `
export function hello(): string {
  return 'hello';
}
export const VERSION = '1.0';
`);

    const map = generateProjectMap({ cwd: tmpDir });
    expect(map.summary.totalFiles).toBe(1);
    expect(map.summary.languages['typescript']).toBeGreaterThan(0);

    const file = map.files[0];
    expect(file.language).toBe('typescript');
    expect(file.exports).toContain('hello');
    expect(file.exports).toContain('VERSION');
  });

  it('디렉토리 목적 추론', () => {
    for (const dir of ['src', 'tests', 'components', 'utils']) {
      fs.mkdirSync(path.join(tmpDir, dir));
      fs.writeFileSync(path.join(tmpDir, dir, 'dummy.ts'), '// dummy');
    }

    const map = generateProjectMap({ cwd: tmpDir });
    const srcDir = map.directories.find(d => d.path === 'src');
    expect(srcDir?.purpose).toBe('소스 코드');

    const testsDir = map.directories.find(d => d.path === 'tests');
    expect(testsDir?.purpose).toBe('테스트');
  });

  it('package.json 기반 프로젝트명 + 의존성', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      main: 'dist/index.js',
      dependencies: { react: '^18.0.0' },
      devDependencies: { vitest: '^1.0.0' },
    }));

    const map = generateProjectMap({ cwd: tmpDir });
    expect(map.summary.name).toBe('test-project');
    expect(map.summary.framework).toBe('React');
    expect(map.dependencies).toHaveLength(2);
    expect(map.dependencies.find(d => d.name === 'react')?.type).toBe('production');
    expect(map.entryPoints).toContain('dist/index.js');
  });

  it('node_modules 제외', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'some-pkg'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'some-pkg', 'index.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'const x = 1;');

    const map = generateProjectMap({ cwd: tmpDir });
    expect(map.files.every(f => !f.path.includes('node_modules'))).toBe(true);
  });

  it('maxFiles 제한', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(path.join(srcDir, `file${i}.ts`), `const x = ${i};`);
    }

    const map = generateProjectMap({ cwd: tmpDir, maxFiles: 5 });
    expect(map.files.length).toBeLessThanOrEqual(5);
  });

  it('패키지 매니저 감지', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    const map = generateProjectMap({ cwd: tmpDir });
    expect(map.summary.packageManager).toBe('pnpm');
  });

  it('import 소스 추출', () => {
    fs.writeFileSync(path.join(tmpDir, 'app.ts'), `
import { useState } from 'react';
import { helper } from './utils.js';
const fs = require('node:fs');
`);

    const map = generateProjectMap({ cwd: tmpDir });
    const file = map.files[0];
    expect(file.imports).toContain('react');
    expect(file.imports).toContain('./utils.js');
    expect(file.imports).toContain('node:fs');
  });
});

describe('formatMapAsMarkdown', () => {
  it('Markdown 출력 포맷', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-md-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'src'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const x = 1;\n'.repeat(50));
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        name: 'md-test',
        dependencies: { express: '^4.0.0' },
      }));

      const map = generateProjectMap({ cwd: tmpDir });
      const md = formatMapAsMarkdown(map);

      expect(md).toContain('md-test');
      expect(md).toContain('프로젝트 요약');
      expect(md).toContain('언어 분포');
      expect(md).toContain('주요 의존성');
      expect(md).toContain('express');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
