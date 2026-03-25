import yaml from 'js-yaml';

// ── Types ──

export type SolutionStatus = 'experiment' | 'candidate' | 'verified' | 'mature' | 'retired';
export type SolutionType = 'pattern' | 'decision' | 'troubleshoot' | 'anti-pattern';

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
const VALID_TYPES: SolutionType[] = ['pattern', 'decision', 'troubleshoot', 'anti-pattern'];

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

/**
 * Extract tags from text. Korean 2-char words are preserved (e.g. "에러", "배포").
 * English words require 3+ chars.
 */
export function extractTags(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^가-힣a-z0-9\s]/g, ' ');

  const words = cleaned.split(/\s+/).filter(Boolean);
  const tags = new Set<string>();

  for (const w of words) {
    // Check if the word contains Korean characters
    const isKorean = /[가-힣]/.test(w);
    if (isKorean && w.length > 1) {
      tags.add(w);
    } else if (!isKorean && w.length > 2) {
      tags.add(w);
    }
  }

  return [...tags];
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
