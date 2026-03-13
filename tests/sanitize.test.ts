import { describe, it, expect } from 'vitest';
import { sanitizeForDetection as sanitizeForKeywordDetection } from '../src/hooks/shared/sanitize.js';

describe('sanitizeForKeywordDetection', () => {
  it('코드 블록 내 키워드를 제거한다', () => {
    const input = '다음 코드를 봐줘\n```\nralph mode로 실행\n```';
    const result = sanitizeForKeywordDetection(input);
    expect(result).not.toContain('ralph');
  });

  it('인라인 코드 내 키워드를 제거한다', () => {
    const input = '`autopilot` 변수를 확인해줘';
    const result = sanitizeForKeywordDetection(input);
    expect(result).not.toContain('autopilot');
  });

  it('URL 내 키워드를 제거한다', () => {
    const input = 'https://example.com/ralph/test 페이지 확인';
    const result = sanitizeForKeywordDetection(input);
    expect(result).not.toContain('ralph');
  });

  it('XML 태그 내 키워드를 제거한다', () => {
    const input = '<compound-skill>ralph mode</compound-skill> 실행해줘';
    const result = sanitizeForKeywordDetection(input);
    expect(result).not.toContain('ralph');
  });

  it('자체 폐쇄 태그를 제거한다', () => {
    const input = '<input type="ralph" /> 확인';
    const result = sanitizeForKeywordDetection(input);
    expect(result).not.toContain('ralph');
  });

  it('파일 경로 내 키워드를 제거한다', () => {
    const input = '/src/ralph/index.ts 파일을 수정해줘';
    const result = sanitizeForKeywordDetection(input);
    expect(result).not.toContain('ralph');
  });

  it('multi-segment 경로를 제거한다', () => {
    const input = 'src/hooks/tdd-runner.ts 파일';
    const result = sanitizeForKeywordDetection(input);
    expect(result).not.toContain('tdd');
  });

  it('순수 텍스트의 키워드는 유지한다', () => {
    const input = 'ralph 이 기능 구현해줘';
    const result = sanitizeForKeywordDetection(input);
    expect(result).toContain('ralph');
  });

  it('혼합 입력에서 올바르게 처리한다', () => {
    const input = 'autopilot 모드로 `ralph` 변수를 수정해줘';
    const result = sanitizeForKeywordDetection(input);
    expect(result).toContain('autopilot');
    expect(result).not.toContain('ralph');
  });

  it('중첩 XML 태그를 처리한다', () => {
    const input = '<outer><inner>ultrawork</inner></outer> 시작';
    const result = sanitizeForKeywordDetection(input);
    // inner는 outer 안에 있으므로 outer 태그 매칭으로 제거됨
    expect(result).not.toContain('ultrawork');
  });

  it('빈 입력을 처리한다', () => {
    expect(sanitizeForKeywordDetection('')).toBe('');
  });
});
