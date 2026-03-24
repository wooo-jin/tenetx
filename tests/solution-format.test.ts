import { describe, it, expect } from 'vitest';
import {
  extractTags,
  parseFrontmatterOnly,
  parseSolutionV3,
  serializeSolutionV3,
  isV3Format,
  isV1Format,
  migrateV1toV3,
  validateFrontmatter,
  DEFAULT_EVIDENCE,
  type SolutionV3,
  type SolutionFrontmatter,
} from '../src/engine/solution-format.js';

// ── Helper: minimal valid frontmatter object ──

function validFrontmatter(overrides: Partial<SolutionFrontmatter> = {}): SolutionFrontmatter {
  return {
    name: 'test-solution',
    version: 1,
    status: 'experiment',
    confidence: 0.5,
    type: 'pattern',
    scope: 'me',
    tags: ['react', 'error'],
    identifiers: [],
    evidence: { ...DEFAULT_EVIDENCE },
    created: '2026-01-01',
    updated: '2026-01-01',
    supersedes: null,
    extractedBy: 'auto',
    ...overrides,
  };
}

function buildV3File(fm: SolutionFrontmatter, context: string, content: string): string {
  const solution: SolutionV3 = { frontmatter: fm, context, content };
  return serializeSolutionV3(solution);
}

// ── extractTags ──

describe('extractTags', () => {
  it('한글 2글자 단어는 유지한다 (에러, 배포, 인증)', () => {
    const tags = extractTags('에러 배포 인증');
    expect(tags).toContain('에러');
    expect(tags).toContain('배포');
    expect(tags).toContain('인증');
  });

  it('한글 1글자 단어는 제거한다', () => {
    const tags = extractTags('가 나 에러');
    expect(tags).not.toContain('가');
    expect(tags).not.toContain('나');
    expect(tags).toContain('에러');
  });

  it('영어 3글자 이상 단어는 유지한다', () => {
    const tags = extractTags('react error');
    expect(tags).toContain('react');
    expect(tags).toContain('error');
  });

  it('영어 2글자 이하 단어는 제거한다', () => {
    const tags = extractTags('is an ok react');
    expect(tags).not.toContain('is');
    expect(tags).not.toContain('an');
    expect(tags).not.toContain('ok');
    expect(tags).toContain('react');
  });

  it('중복 단어는 제거한다', () => {
    const tags = extractTags('react react react');
    const reactCount = tags.filter((t) => t === 'react').length;
    expect(reactCount).toBe(1);
  });

  it('특수문자를 제거한다', () => {
    const tags = extractTags('react! @error# $deploy%');
    expect(tags).toContain('react');
    expect(tags).toContain('error');
    expect(tags).toContain('deploy');
  });

  it('대문자를 소문자로 변환한다', () => {
    const tags = extractTags('React ERROR Deploy');
    expect(tags).toContain('react');
    expect(tags).toContain('error');
    expect(tags).toContain('deploy');
  });
});

// ── parseFrontmatterOnly ──

describe('parseFrontmatterOnly', () => {
  it('유효한 v3 YAML을 SolutionFrontmatter로 파싱한다', () => {
    const fm = validFrontmatter();
    const file = buildV3File(fm, 'ctx', 'body');
    const result = parseFrontmatterOnly(file);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('test-solution');
    expect(result!.status).toBe('experiment');
    expect(result!.confidence).toBe(0.5);
  });

  it('필수 필드 누락 시 null을 반환한다', () => {
    // name 누락
    const raw = `---\nversion: 1\nstatus: "experiment"\n---\n`;
    expect(parseFrontmatterOnly(raw)).toBeNull();
  });

  it('유효하지 않은 YAML 구문이면 null을 반환한다', () => {
    const raw = `---\n: invalid: yaml: {{{\n---\n`;
    expect(parseFrontmatterOnly(raw)).toBeNull();
  });

  it('빈 문자열이면 null을 반환한다', () => {
    expect(parseFrontmatterOnly('')).toBeNull();
  });

  it('--- 구분자가 없으면 null을 반환한다', () => {
    expect(parseFrontmatterOnly('no frontmatter here')).toBeNull();
  });

  it('프론트매터가 5000자 초과이면 null을 반환한다 (YAML bomb 방어)', () => {
    const bigYaml = `---\n${'a: ' + 'x'.repeat(5100)}\n---\n`;
    expect(parseFrontmatterOnly(bigYaml)).toBeNull();
  });

  it('YAML 앵커가 3개 초과이면 null을 반환한다', () => {
    const anchors = Array.from({ length: 4 }, (_, i) => `key${i}: &anchor${i} value${i}`).join('\n');
    const raw = `---\n${anchors}\n---\n`;
    expect(parseFrontmatterOnly(raw)).toBeNull();
  });
});

// ── parseSolutionV3 ──

describe('parseSolutionV3', () => {
  it('Context와 Content 섹션이 모두 있는 v3 파일을 파싱한다', () => {
    const fm = validFrontmatter();
    const file = buildV3File(fm, 'some context', 'some content');
    const result = parseSolutionV3(file);
    expect(result).not.toBeNull();
    expect(result!.context).toBe('some context');
    expect(result!.content).toBe('some content');
    expect(result!.frontmatter.name).toBe('test-solution');
  });

  it('Context 섹션이 없으면 context가 빈 문자열이다', () => {
    const fm = validFrontmatter();
    const raw = buildV3File(fm, '', '');
    // Manually build without Context header
    const yamlPart = raw.split('## Context')[0];
    const file = yamlPart + '\n## Content\nonly content here\n';
    const result = parseSolutionV3(file);
    expect(result).not.toBeNull();
    expect(result!.context).toBe('');
    expect(result!.content).toBe('only content here');
  });

  it('Content 섹션이 없으면 content가 빈 문자열이다', () => {
    const fm = validFrontmatter();
    const raw = buildV3File(fm, '', '');
    const yamlPart = raw.split('## Context')[0];
    const file = yamlPart + '\n## Context\nonly context here\n';
    const result = parseSolutionV3(file);
    expect(result).not.toBeNull();
    expect(result!.context).toBe('only context here');
    expect(result!.content).toBe('');
  });

  it('섹션 헤더가 없으면 body 전체를 content로 취급한다', () => {
    const fm = validFrontmatter();
    const raw = buildV3File(fm, '', '');
    const yamlPart = raw.split('## Context')[0];
    const file = yamlPart + '\njust some plain body text\n';
    const result = parseSolutionV3(file);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('just some plain body text');
    expect(result!.context).toBe('');
  });
});

// ── serializeSolutionV3 (roundtrip) ──

describe('serializeSolutionV3', () => {
  it('직렬화 후 파싱하면 원본과 일치한다 (roundtrip)', () => {
    const original: SolutionV3 = {
      frontmatter: validFrontmatter({ name: 'roundtrip-test', tags: ['react', '배포'] }),
      context: 'When deploying to production',
      content: 'Always check the CI pipeline first',
    };

    const serialized = serializeSolutionV3(original);
    const parsed = parseSolutionV3(serialized);

    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.name).toBe(original.frontmatter.name);
    expect(parsed!.frontmatter.tags).toEqual(original.frontmatter.tags);
    expect(parsed!.frontmatter.status).toBe(original.frontmatter.status);
    expect(parsed!.frontmatter.confidence).toBe(original.frontmatter.confidence);
    expect(parsed!.context).toBe(original.context);
    expect(parsed!.content).toBe(original.content);
  });
});

// ── isV3Format / isV1Format ──

describe('isV3Format', () => {
  it('---로 시작하면 v3으로 감지한다', () => {
    expect(isV3Format('---\nname: test\n---\n')).toBe(true);
  });

  it('---로 시작하지 않으면 v3가 아니다', () => {
    expect(isV3Format('# Title\n> Type: solution')).toBe(false);
  });

  it('앞에 공백이 있어도 ---로 시작하면 v3이다', () => {
    expect(isV3Format('  \n---\nname: test\n---\n')).toBe(true);
  });
});

describe('isV1Format', () => {
  it('# Title과 > Type: 이 있으면 v1으로 감지한다', () => {
    expect(isV1Format('# My Solution\n> Type: solution\n')).toBe(true);
  });

  it('# Title만 있으면 v1이 아니다', () => {
    expect(isV1Format('# My Solution\nsome body')).toBe(false);
  });

  it('> Type: 만 있으면 v1이 아니다', () => {
    expect(isV1Format('> Type: solution\nsome body')).toBe(false);
  });

  it('v3 형식이면 v1이 아니다', () => {
    expect(isV1Format('---\nname: test\n---\n')).toBe(false);
  });
});

// ── migrateV1toV3 ──

describe('migrateV1toV3', () => {
  const v1Content = [
    '# Error Handling Pattern',
    '> Type: solution',
    '> Scope: me',
    '',
    'Always use try-catch for async operations.',
  ].join('\n');

  it('v1을 v3로 변환하면 유효한 v3 파일이 생성된다', () => {
    const result = migrateV1toV3(v1Content, 'test.md');
    const parsed = parseSolutionV3(result);
    expect(parsed).not.toBeNull();
  });

  it('제목을 name 필드로 추출한다 (slugified)', () => {
    const result = migrateV1toV3(v1Content, 'test.md');
    const parsed = parseSolutionV3(result);
    expect(parsed!.frontmatter.name).toContain('error');
    expect(parsed!.frontmatter.name).toContain('handling');
    expect(parsed!.frontmatter.name).toContain('pattern');
  });

  it('타입 매핑: solution은 pattern으로 변환한다', () => {
    const result = migrateV1toV3(v1Content, 'test.md');
    const parsed = parseSolutionV3(result);
    expect(parsed!.frontmatter.type).toBe('pattern');
  });

  it('타입 매핑: rule은 decision으로 변환한다', () => {
    const ruleContent = '# My Rule\n> Type: rule\n> Scope: project\n\nRule body.';
    const result = migrateV1toV3(ruleContent, 'test.md');
    const parsed = parseSolutionV3(result);
    expect(parsed!.frontmatter.type).toBe('decision');
  });

  it('제목과 본문에서 태그를 추출한다', () => {
    const result = migrateV1toV3(v1Content, 'test.md');
    const parsed = parseSolutionV3(result);
    expect(parsed!.frontmatter.tags.length).toBeGreaterThan(0);
    // "error", "handling", "pattern" 등이 포함되어야 함
    expect(parsed!.frontmatter.tags).toContain('error');
  });

  it('evidence 값은 모두 0이다', () => {
    const result = migrateV1toV3(v1Content, 'test.md');
    const parsed = parseSolutionV3(result);
    const ev = parsed!.frontmatter.evidence;
    expect(ev.injected).toBe(0);
    expect(ev.reflected).toBe(0);
    expect(ev.negative).toBe(0);
    expect(ev.sessions).toBe(0);
    expect(ev.reExtracted).toBe(0);
  });

  it('변환 후 재파싱하면 유효한 v3이다 (roundtrip)', () => {
    const result = migrateV1toV3(v1Content, 'test.md');
    expect(isV3Format(result)).toBe(true);
    const parsed = parseSolutionV3(result);
    expect(parsed).not.toBeNull();
    expect(validateFrontmatter(parsed!.frontmatter)).toBe(true);
  });
});

// ── validateFrontmatter ──

describe('validateFrontmatter', () => {
  it('유효한 프론트매터는 true를 반환한다', () => {
    expect(validateFrontmatter(validFrontmatter())).toBe(true);
  });

  it('name이 없으면 false를 반환한다', () => {
    const fm = validFrontmatter();
    delete (fm as unknown as Record<string, unknown>).name;
    expect(validateFrontmatter(fm)).toBe(false);
  });

  it('유효하지 않은 status이면 false를 반환한다', () => {
    const fm = validFrontmatter({ status: 'invalid' as never });
    expect(validateFrontmatter(fm)).toBe(false);
  });

  it('confidence가 0-1 범위를 벗어나면 false를 반환한다', () => {
    expect(validateFrontmatter(validFrontmatter({ confidence: -0.1 }))).toBe(false);
    expect(validateFrontmatter(validFrontmatter({ confidence: 1.5 }))).toBe(false);
  });

  it('tags가 배열이 아니면 false를 반환한다', () => {
    const fm = validFrontmatter();
    (fm as unknown as Record<string, unknown>).tags = 'not-an-array';
    expect(validateFrontmatter(fm)).toBe(false);
  });

  it('null 입력이면 false를 반환한다', () => {
    expect(validateFrontmatter(null)).toBe(false);
  });

  it('빈 객체이면 false를 반환한다', () => {
    expect(validateFrontmatter({})).toBe(false);
  });
});
