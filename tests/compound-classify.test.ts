import { describe, it, expect } from 'vitest';
import { classifyInsight } from '../src/engine/compound-loop.js';

describe('classifyInsight', () => {
  it('팀 키워드가 있으면 team으로 분류', () => {
    const result = classifyInsight('API 에러 처리 패턴', 'REST API 호출 시 에러 처리 convention');
    expect(result.classification).toBe('team');
    expect(result.reason).toContain('team pattern');
  });

  it('개인 키워드가 있으면 personal로 분류', () => {
    const result = classifyInsight('내 스타일 단축키', 'vscode에서 편의를 위한 snippet 설정');
    expect(result.classification).toBe('personal');
    expect(result.reason).toContain('personal style');
  });

  it('키워드 없으면 personal (기본값)', () => {
    const result = classifyInsight('메모', '오늘 날씨 좋다');
    expect(result.classification).toBe('personal');
    expect(result.reason).toBe('default (personal)');
  });

  it('혼합 키워드일 때 높은 점수가 이김', () => {
    // team keywords: API, security, auth, convention, naming = 5
    // personal keywords: vscode = 1
    const result = classifyInsight(
      'API security auth convention',
      'naming guideline in vscode',
    );
    expect(result.classification).toBe('team');
  });

  it('한글 팀 키워드도 인식', () => {
    const result = classifyInsight('배포 규칙', '마이그레이션 시 보안 점검 필수');
    expect(result.classification).toBe('team');
  });

  it('한글 개인 키워드도 인식', () => {
    const result = classifyInsight('내 스타일 습관', '단축키 모음');
    expect(result.classification).toBe('personal');
  });

  it('대소문자를 구분하지 않음', () => {
    const result = classifyInsight('DATABASE Migration', 'SCHEMA deploy');
    expect(result.classification).toBe('team');
  });

  it('동점이면 personal 기본값', () => {
    // 1 team keyword (API) vs 1 personal keyword (vscode)
    const result = classifyInsight('API', 'vscode');
    expect(result.classification).toBe('personal');
    expect(result.reason).toBe('default (personal)');
  });
});
