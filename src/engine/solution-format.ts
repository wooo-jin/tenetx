import yaml from 'js-yaml';

// ── Types ──

export type SolutionStatus = 'experiment' | 'candidate' | 'verified' | 'mature' | 'retired';
export type SolutionType = 'pattern' | 'solution' | 'decision' | 'troubleshoot' | 'anti-pattern' | 'convention';

export interface SolutionEvidence {
  injected: number;
  reflected: number;
  negative: number;
  sessions: number;
  reExtracted: number;
}

export interface SolutionFrontmatter {
  name: string;
  version: number;
  status: SolutionStatus;
  confidence: number;
  type: SolutionType;
  scope: 'me' | 'team' | 'project';
  tags: string[];
  identifiers: string[];
  evidence: SolutionEvidence;
  created: string;
  updated: string;
  supersedes: string | null;
  extractedBy: 'auto' | 'manual';
}

export interface SolutionV3 {
  frontmatter: SolutionFrontmatter;
  context: string;
  content: string;
  filePath?: string;
}

export interface SolutionIndexEntry {
  name: string;
  status: SolutionStatus;
  confidence: number;
  type: SolutionType;
  scope: 'me' | 'team' | 'project';
  tags: string[];
  identifiers: string[];
  filePath: string;
}

export const DEFAULT_EVIDENCE: SolutionEvidence = {
  injected: 0, reflected: 0, negative: 0, sessions: 0, reExtracted: 0,
};

const VALID_STATUSES: SolutionStatus[] = ['experiment', 'candidate', 'verified', 'mature', 'retired'];
const VALID_TYPES: SolutionType[] = ['pattern', 'solution', 'decision', 'troubleshoot', 'anti-pattern', 'convention'];

// ── Helpers ──

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || `untitled-${Date.now()}`;
}

// ── Validation ──

/** Runtime type guard for SolutionFrontmatter */
export function validateFrontmatter(fm: unknown): fm is SolutionFrontmatter {
  if (fm == null || typeof fm !== 'object') return false;
  const o = fm as Record<string, unknown>;

  if (typeof o.name !== 'string') return false;
  if (typeof o.version !== 'number' || o.version <= 0) return false;
  if (typeof o.status !== 'string' || !VALID_STATUSES.includes(o.status as SolutionStatus)) return false;
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) return false;
  if (typeof o.type !== 'string' || !VALID_TYPES.includes(o.type as SolutionType)) return false;
  if (o.scope !== 'me' && o.scope !== 'team' && o.scope !== 'project') return false;
  if (!Array.isArray(o.tags) || !o.tags.every((t: unknown) => typeof t === 'string')) return false;
  if (!Array.isArray(o.identifiers) || !o.identifiers.every((t: unknown) => typeof t === 'string')) return false;
  if (typeof o.created !== 'string') return false;
  if (typeof o.updated !== 'string') return false;
  if (o.supersedes !== null && typeof o.supersedes !== 'string') return false;
  if (o.extractedBy !== 'auto' && o.extractedBy !== 'manual') return false;

  // evidence
  if (o.evidence == null || typeof o.evidence !== 'object') return false;
  const ev = o.evidence as Record<string, unknown>;
  const evFields = ['injected', 'reflected', 'negative', 'sessions', 'reExtracted'] as const;
  for (const f of evFields) {
    if (typeof ev[f] !== 'number') return false;
  }

  return true;
}

// ── Parsing ──

/** Parse YAML frontmatter from solution file content */
export function parseFrontmatterOnly(content: string): SolutionFrontmatter | null {
  try {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith('---')) return null;

    const endIdx = trimmed.indexOf('---', 3);
    if (endIdx === -1) return null;

    const raw = trimmed.slice(3, endIdx);

    // YAML bomb protection: reject oversized frontmatter
    if (raw.length > 5000) return null;

    // YAML anchor abuse protection
    const anchorCount = (raw.match(/(?<=\s|^)&\w+/g) ?? []).length;
    if (anchorCount > 3) return null;

    const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    if (!validateFrontmatter(parsed)) return null;

    return parsed;
  } catch {
    return null;
  }
}

/** Parse a full V3 solution file into its components */
export function parseSolutionV3(content: string): SolutionV3 | null {
  try {
    const frontmatter = parseFrontmatterOnly(content);
    if (!frontmatter) return null;

    // Extract body after the closing ---
    const trimmed = content.trimStart();
    const endIdx = trimmed.indexOf('---', 3);
    const body = trimmed.slice(endIdx + 3).trim();

    const contextHeader = '## Context';
    const contentHeader = '## Content';
    const ctxIdx = body.indexOf(contextHeader);
    const cntIdx = body.indexOf(contentHeader);

    let context = '';
    let solutionContent = '';

    if (ctxIdx !== -1 && cntIdx !== -1) {
      context = body.slice(ctxIdx + contextHeader.length, cntIdx).trim();
      solutionContent = body.slice(cntIdx + contentHeader.length).trim();
    } else if (ctxIdx !== -1) {
      context = body.slice(ctxIdx + contextHeader.length).trim();
    } else if (cntIdx !== -1) {
      solutionContent = body.slice(cntIdx + contentHeader.length).trim();
    } else {
      // No headers — treat entire body as content
      solutionContent = body;
    }

    return { frontmatter, context, content: solutionContent };
  } catch {
    return null;
  }
}

// ── Serialization ──

/** Serialize a SolutionV3 to a markdown string with YAML frontmatter */
export function serializeSolutionV3(solution: SolutionV3): string {
  const yamlStr = yaml.dump(solution.frontmatter, { lineWidth: -1, quotingType: '"', schema: yaml.JSON_SCHEMA });
  return `---\n${yamlStr}---\n\n## Context\n${solution.context}\n\n## Content\n${solution.content}\n`;
}

// ── Format Detection ──

/** Check if content is in V3 format (YAML frontmatter) */
export function isV3Format(content: string): boolean {
  return content.trimStart().startsWith('---');
}

/** Check if content is in V1 format (# Title + > Type: pattern) */
export function isV1Format(content: string): boolean {
  const lines = content.split('\n');
  let hasTitle = false;
  let hasType = false;
  for (const line of lines) {
    if (line.startsWith('# ')) hasTitle = true;
    if (line.startsWith('> Type:')) hasType = true;
    if (hasTitle && hasType) return true;
  }
  return false;
}

// ── Tag Extraction ──

/** 한국어 불용어 — 태그로 의미 없는 일반 단어 */
const KO_STOPWORDS = new Set([
  // 일반 불용어
  '적용', '패턴', '모든', '같은', '발견', '다른', '사용', '경우', '위해',
  '통해', '대한', '이후', '때문', '하는', '있는', '없는', '되는', '관련',
  '해야', '하고', '있다', '없다', '한다', '이런', '그런', '저런', '매우',
  '항상', '모두', '각각', '대해', '여러', '시작', '그것', '이것', '저것',
  '아주', '정말', '너무', '많이', '자주', '가장', '먼저', '이미', '아직',
  '그냥', '바로', '다시', '함께', '위한', '따라', '부분', '전체', '방법',
  '내용', '결과', '문제', '시점', '설정', '작업', '확인', '수행', '처리',
  '기본', '추가', '변경', '제거', '포함', '생성', '실행', '완료', '필요',
  // 조사/어미/접속사 — Jaccard 분모 희석 방지
  '에서', '으로', '에게', '에는', '에도', '까지', '부터', '보다', '처럼',
  '만큼', '대로', '밖에', '뿐만', '이나', '이고', '이면', '이라', '인데',
  '했는데', '됐는데', '있으면', '없으면', '하면', '되면', '하지', '되지',
  '하며', '되며', '에서의', '으로의', '라는', '라고', '이라고', '때문에',
  '아니라', '하지만', '그러나', '그래서', '따라서', '그리고', '그러면',
  '만약', '비록', '하여', '않고', '않은', '않는', '해서', '해도', '해야',
  // 일반 동사/형용사 어간 — 의미 없는 고빈도 단어
  '가능', '상태', '이유', '방지', '의존', '의존성', '즉시', '원칙', '근거',
  '수정', '제안', '기능', '구현', '구조', '단계', '목적', '상황', '조건',
  '규칙', '동작', '활성', '비활성', '원래', '현재', '이전', '다음', '최종',
]);

/** 영어 불용어 */
const EN_STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
  'were', 'been', 'have', 'has', 'had', 'not', 'but', 'all', 'can',
  'will', 'use', 'used', 'using', 'when', 'each', 'which', 'their',
  'also', 'into', 'more', 'some', 'than', 'other', 'should', 'would',
  'could', 'about', 'after', 'before', 'between', 'does', 'only',
  'across', 'just', 'detected', 'based', 'sessions', 'prompts',
]);

/** 한국어 일반 조사/어미 — strip 대상 (긴 것부터 매칭)
 *
 * term-matcher에서 재사용 가능하도록 export — 매칭 시점과 추출 시점의 stripping
 * 규칙을 단일 source of truth로 유지해 한국어 stem 비교 정합성 보장.
 *
 * 주의: 이 리스트는 **추출 시점에도 적용**되므로 1글자 suffix를 추가할 때
 * `집중`→`집`, `시도`→`시` 같은 한자어 명사가 깨지지 않도록 극도로 보수적으로
 * 유지한다. 동사 활용형(`리팩토링중`, `배포시`)처럼 매칭 전용 suffix가 필요하면
 * term-matcher의 `KO_VERBAL_SUFFIXES`에 따로 둔다.
 */
export const KO_SUFFIXES = [
  '했습니다', '있습니다', '합니다', '입니다', '됩니다',
  '에서', '까지', '으로', '하는', '하고', '했다', '된다', '한다',
  '을', '를', '이', '가', '은', '는', '의', '에', '와', '과', '도', '만', '로',
];

export function stripKoSuffix(word: string): string {
  for (const suffix of KO_SUFFIXES) {
    if (word.endsWith(suffix) && word.length > suffix.length) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** 최대 태그 수 — Jaccard 분모 희석 방지 */
const MAX_TAGS = 8;

/**
 * Extract tags from text.
 * Korean 2-char words preserved (e.g. "에러", "배포"), stopwords filtered.
 * English words require 3+ chars, stopwords filtered.
 * Tags capped at MAX_TAGS, ranked by frequency.
 */
export function extractTags(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^가-힣a-z0-9\s]/g, ' ');

  const words = cleaned.split(/\s+/).filter(Boolean);
  const freq = new Map<string, number>();

  for (const w of words) {
    const isKorean = /[가-힣]/.test(w);
    if (isKorean && w.length >= 2) {
      const stem = stripKoSuffix(w);
      if (stem.length >= 2 && !KO_STOPWORDS.has(stem)) {
        freq.set(stem, (freq.get(stem) ?? 0) + 1);
      }
    } else if (!isKorean && w.length > 2 && !EN_STOPWORDS.has(w)) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  // 빈도 높은 순으로 MAX_TAGS개만 반환
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TAGS)
    .map(([tag]) => tag);
}

// ── Migration ──

const V1_TYPE_MAP: Record<string, SolutionType> = {
  solution: 'pattern',
  rule: 'decision',
  convention: 'decision',
  pattern: 'pattern',
};

/** Migrate a V1-format solution file to V3 format */
export function migrateV1toV3(content: string, filePath: string): string {
  const lines = content.split('\n');

  let title = '';
  let v1Type = '';
  let scope: 'me' | 'project' = 'me';
  let bodyStartIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!title && line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '').trim();
      bodyStartIdx = i + 1;
    }
    if (line.startsWith('> Type:')) {
      v1Type = line.replace('> Type:', '').trim().toLowerCase();
      bodyStartIdx = Math.max(bodyStartIdx, i + 1);
    }
    if (line.startsWith('> Scope:')) {
      const rawScope = line.replace('> Scope:', '').trim().toLowerCase();
      scope = rawScope === 'project' ? 'project' : 'me';
      bodyStartIdx = Math.max(bodyStartIdx, i + 1);
    }
  }

  // Skip remaining metadata lines (> Classification:, > Created:, blank lines right after)
  while (bodyStartIdx < lines.length) {
    const l = lines[bodyStartIdx].trim();
    if (l.startsWith('>') || l === '') {
      bodyStartIdx++;
    } else {
      break;
    }
  }

  const body = lines.slice(bodyStartIdx).join('\n').trim();
  const today = new Date().toISOString().split('T')[0];
  const name = slugify(title || filePath);
  const type = V1_TYPE_MAP[v1Type] ?? 'pattern';
  const tags = extractTags(`${title} ${body}`);

  const solution: SolutionV3 = {
    frontmatter: {
      name,
      version: 1,
      status: 'candidate',
      confidence: 0.5,
      type,
      scope,
      tags,
      identifiers: [],
      evidence: { ...DEFAULT_EVIDENCE },
      created: today,
      updated: today,
      supersedes: null,
      extractedBy: 'auto',
    },
    context: '',
    content: body,
  };

  return serializeSolutionV3(solution);
}
