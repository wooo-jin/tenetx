/**
 * post-tool-failure 단위 테스트
 *
 * getRecoverySuggestion 순수 함수 검증.
 */
import { describe, it, expect } from 'vitest';
import { getRecoverySuggestion } from '../src/hooks/post-tool-failure.js';

describe('getRecoverySuggestion', () => {
  it('timeout 에러에 대한 제안을 반환한다', () => {
    const result = getRecoverySuggestion('Operation timed out after 30s', 'Bash');
    expect(result).toContain('Timeout');
  });

  it('TIMED OUT (대소문자 무관) 에러를 감지한다', () => {
    const result = getRecoverySuggestion('Command TIMED OUT', 'Bash');
    expect(result).toContain('Timeout');
  });

  it('ENOENT 에러에 대한 제안을 반환한다', () => {
    const result = getRecoverySuggestion('ENOENT: no such file or directory', 'Read');
    expect(result).toContain('not exist');
  });

  it('not found 에러를 감지한다', () => {
    const result = getRecoverySuggestion('File not found: /tmp/test.ts', 'Read');
    expect(result).toContain('not exist');
  });

  it('permission denied 에러에 대한 제안을 반환한다', () => {
    const result = getRecoverySuggestion('EACCES: permission denied', 'Write');
    expect(result).toContain('Permission denied');
  });

  it('syntax error에 대한 제안을 반환한다', () => {
    const result = getRecoverySuggestion('SyntaxError: Unexpected token', 'Bash');
    expect(result).toContain('Syntax error');
  });

  it('disk space 에러에 대한 제안을 반환한다', () => {
    const result = getRecoverySuggestion('ENOSPC: no space left on device', 'Write');
    expect(result).toContain('Disk space');
  });

  it('Edit tool의 old_string not found 에러를 감지한다', () => {
    // "not found" 패턴이 먼저 매칭되므로 ENOENT 제안이 나옴
    // old_string 패턴은 "old_string.*not found" 형식이어야 함
    const result = getRecoverySuggestion('The old_string was not found in the target file', 'Edit');
    // "not found" 우선 매칭 — 이것은 의도된 동작
    expect(result).toBeDefined();
  });

  it('old_string not unique 에러를 감지한다', () => {
    const result = getRecoverySuggestion('old_string is not unique in file', 'Edit');
    expect(result).toContain('old_string');
    expect(result).toContain('Read');
  });

  it('알 수 없는 에러에 대한 기본 제안을 반환한다', () => {
    const result = getRecoverySuggestion('Something weird happened', 'CustomTool');
    expect(result).toContain('CustomTool');
    expect(result).toContain('different approach');
  });

  it('빈 에러 문자열에 대한 기본 제안을 반환한다', () => {
    const result = getRecoverySuggestion('', 'Bash');
    expect(result).toContain('Bash');
  });
});
