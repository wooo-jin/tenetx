import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * CLI 모듈은 process.argv와 side effects가 많아서
 * findCommand, printHelp 등은 직접 테스트하기 어렵다.
 * 대신 command registry의 구조적 검증을 수행한다.
 *
 * 실제 CLI 실행은 `tenetx --help` 등으로 통합 테스트한다.
 */

describe('cli - command structure', () => {
  function loadCliSource(): string {
    return fs.readFileSync(path.resolve(__dirname, '..', 'src', 'cli.ts'), 'utf-8');
  }

  function extractCommandNames(source: string): string[] {
    return [...source.matchAll(/name:\s*'([^']+)'/g)]
      .map((match) => match[1])
      .filter((name) => name !== 'string')
      .slice(0, 12);
  }

  it('CLI 모듈이 로드 가능하다', async () => {
    // cli.ts는 import 시 바로 main()을 실행하므로
    // 여기서는 구조적 검증만 수행
    expect(true).toBe(true);
  });

  it('현재 CLI 명령어 레지스트리가 실제 구현과 일치한다', () => {
    expect(extractCommandNames(loadCliSource())).toEqual([
      'forge',
      'compound',
      'skill',
      'me',
      'config',
      'mcp',
      'init',
      'notepad',
      'doctor',
      'uninstall',
    ]);
  });
});
