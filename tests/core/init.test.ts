import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TEST_CWD = '/tmp/tenetx-test-init-project';

// handleInit()는 내부에서 process.cwd()를 호출하므로 전역 process.cwd를 스파이로 교체
// vi.mock은 정적 모듈 모킹이고 process는 전역이므로 vi.spyOn 사용
vi.spyOn(process, 'cwd').mockReturnValue(TEST_CWD);

import { detectProjectType, handleInit } from '../../src/core/init.js';

// ────────────────────────────────────────────────────────────────────────────
// detectProjectType()
// ────────────────────────────────────────────────────────────────────────────
describe('detectProjectType()', () => {
  beforeEach(() => {
    fs.rmSync(TEST_CWD, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_CWD, { recursive: true, force: true });
  });

  it('패키지가 없는 빈 디렉토리는 unknown을 반환한다', () => {
    const result = detectProjectType(TEST_CWD);
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('react 의존성이 있으면 frontend로 감지한다', () => {
    fs.writeFileSync(
      path.join(TEST_CWD, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } })
    );
    const result = detectProjectType(TEST_CWD);
    expect(result.type).toBe('frontend');
    expect(result.pack).toBe('frontend');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('express 의존성이 있으면 backend로 감지한다', () => {
    fs.writeFileSync(
      path.join(TEST_CWD, 'package.json'),
      JSON.stringify({ dependencies: { express: '^4.0.0' } })
    );
    const result = detectProjectType(TEST_CWD);
    expect(result.type).toBe('backend');
    expect(result.pack).toBe('backend');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('terraform 파일이 있으면 devops로 감지한다', () => {
    fs.writeFileSync(path.join(TEST_CWD, 'main.tf'), '# terraform');
    const result = detectProjectType(TEST_CWD);
    expect(result.type).toBe('devops');
    expect(result.pack).toBe('devops');
  });

  it('go.mod 파일이 있으면 backend로 감지한다', () => {
    fs.writeFileSync(path.join(TEST_CWD, 'go.mod'), 'module example.com/app\n\ngo 1.21');
    const result = detectProjectType(TEST_CWD);
    expect(result.type).toBe('backend');
  });

  it('react + express가 모두 있으면 fullstack으로 감지한다', () => {
    fs.writeFileSync(
      path.join(TEST_CWD, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0', express: '^4.0.0' } })
    );
    const result = detectProjectType(TEST_CWD);
    expect(result.type).toBe('fullstack');
  });

  it('ink + react 조합은 frontend가 아닌 backend(cli)로 분류한다', () => {
    fs.writeFileSync(
      path.join(TEST_CWD, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0', ink: '^4.0.0' } })
    );
    const result = detectProjectType(TEST_CWD);
    // ink는 CLI 터미널 UI이므로 frontend 점수를 받지 않음
    expect(result.type).not.toBe('frontend');
  });

  it('Dockerfile이 있으면 backend 신호가 signals에 포함된다', () => {
    fs.writeFileSync(path.join(TEST_CWD, 'Dockerfile'), 'FROM node:18');
    const result = detectProjectType(TEST_CWD);
    expect(result.signals.some(s => s.includes('Dockerfile'))).toBe(true);
  });

  it('package.json이 없어도 에러 없이 동작한다', () => {
    expect(() => detectProjectType(TEST_CWD)).not.toThrow();
  });

  it('깨진 package.json은 에러 없이 빈 deps로 처리한다', () => {
    fs.writeFileSync(path.join(TEST_CWD, 'package.json'), 'not-valid-json{{{');
    expect(() => detectProjectType(TEST_CWD)).not.toThrow();
  });

  it('감지 결과에 signals 배열이 포함된다', () => {
    fs.writeFileSync(
      path.join(TEST_CWD, 'package.json'),
      JSON.stringify({ dependencies: { express: '^4.0.0' } })
    );
    const result = detectProjectType(TEST_CWD);
    expect(Array.isArray(result.signals)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleInit() — non-interactive (--yes flag, process.cwd() = TEST_CWD)
// ────────────────────────────────────────────────────────────────────────────
describe('handleInit() non-interactive', () => {
  beforeEach(() => {
    fs.rmSync(TEST_CWD, { recursive: true, force: true });
    fs.mkdirSync(TEST_CWD, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_CWD, { recursive: true, force: true });
  });

  it('--yes 플래그로 호출 시 철학 파일이 생성된다', async () => {
    const philosophyPath = path.join(TEST_CWD, '.compound', 'philosophy.json');
    await handleInit(['--yes']);
    expect(fs.existsSync(philosophyPath)).toBe(true);
  });

  it('생성된 철학 파일이 유효한 JSON이며 name과 principles 필드를 포함한다', async () => {
    const philosophyPath = path.join(TEST_CWD, '.compound', 'philosophy.json');
    await handleInit(['--yes']);
    const content = fs.readFileSync(philosophyPath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('name');
    expect(parsed).toHaveProperty('principles');
  });

  it('이미 철학 파일이 있으면 덮어쓰지 않고 종료한다', async () => {
    const philosophyPath = path.join(TEST_CWD, '.compound', 'philosophy.json');
    fs.mkdirSync(path.join(TEST_CWD, '.compound'), { recursive: true });
    const original = JSON.stringify({ name: 'existing-sentinel', version: '1.0.0', principles: {} });
    fs.writeFileSync(philosophyPath, original);

    await handleInit(['--yes']);

    const content = fs.readFileSync(philosophyPath, 'utf-8');
    expect(JSON.parse(content).name).toBe('existing-sentinel');
  });

  it('--extends 플래그로 호출 시 extends 필드가 pack: 접두사로 포함된다', async () => {
    const philosophyPath = path.join(TEST_CWD, '.compound', 'philosophy.json');
    await handleInit(['--extends', '--yes']);
    const parsed = JSON.parse(fs.readFileSync(philosophyPath, 'utf-8'));
    expect(parsed).toHaveProperty('extends');
    expect(typeof parsed.extends).toBe('string');
    expect(parsed.extends).toMatch(/^pack:/);
  });

  it('--team 플래그로 호출 시 .compound/rules, .compound/solutions 디렉토리가 생성된다', async () => {
    await handleInit(['--yes', '--team']);
    expect(fs.existsSync(path.join(TEST_CWD, '.compound', 'rules'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_CWD, '.compound', 'solutions'))).toBe(true);
  });

  it('--team --pack-repo 플래그로 호출 시 pack.json에 github 타입이 저장된다', async () => {
    await handleInit(['--yes', '--team', '--pack-repo', 'https://github.com/org/packs']);
    const packConfigPath = path.join(TEST_CWD, '.compound', 'pack.json');
    expect(fs.existsSync(packConfigPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(packConfigPath, 'utf-8'));
    // savePackConfig는 { packs: [...] } 형태로 저장
    const packs = config.packs ?? [config];
    const githubEntry = packs.find((p: { type: string }) => p.type === 'github');
    expect(githubEntry).toBeDefined();
    expect(githubEntry.repo).toBe('https://github.com/org/packs');
  });
});
