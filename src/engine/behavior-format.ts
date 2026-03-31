import yaml from 'js-yaml';

export type BehaviorKind = 'thinking' | 'preference' | 'workflow';

export interface BehaviorFrontmatter {
  name: string;
  version: number;
  kind: BehaviorKind;
  observedCount: number;
  confidence: number;
  tags: string[];
  created: string;
  updated: string;
  source: string;
}

export interface BehaviorPattern {
  frontmatter: BehaviorFrontmatter;
  context: string;
  content: string;
  filePath?: string;
}

const VALID_KINDS: BehaviorKind[] = ['thinking', 'preference', 'workflow'];

export function inferBehaviorKind(name: string, tags: string[] = []): BehaviorKind | null {
  if (name.startsWith('think-') || tags.includes('thinking')) return 'thinking';
  if (name.startsWith('workflow-') || name.startsWith('mode-')) return 'workflow';
  if (name.startsWith('prefer-') || name.startsWith('works-') || name.startsWith('writes-')) return 'preference';
  if (tags.includes('workflow')) return 'workflow';
  if (tags.includes('preference')) return 'preference';
  return null;
}

function validateFrontmatter(frontmatter: unknown): frontmatter is BehaviorFrontmatter {
  if (frontmatter == null || typeof frontmatter !== 'object') return false;
  const o = frontmatter as Record<string, unknown>;

  if (typeof o.name !== 'string') return false;
  if (typeof o.version !== 'number' || o.version <= 0) return false;
  if (typeof o.kind !== 'string' || !VALID_KINDS.includes(o.kind as BehaviorKind)) return false;
  if (typeof o.observedCount !== 'number' || o.observedCount < 0) return false;
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) return false;
  if (!Array.isArray(o.tags) || !o.tags.every((tag) => typeof tag === 'string')) return false;
  if (typeof o.created !== 'string') return false;
  if (typeof o.updated !== 'string') return false;
  if (typeof o.source !== 'string') return false;

  return true;
}

export function parseBehaviorPattern(content: string): BehaviorPattern | null {
  try {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith('---')) return null;

    const endIdx = trimmed.indexOf('---', 3);
    if (endIdx === -1) return null;

    const raw = trimmed.slice(3, endIdx);
    if (raw.length > 5000) return null;

    const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    if (!validateFrontmatter(parsed)) return null;

    const body = trimmed.slice(endIdx + 3).trim();
    const contextHeader = '## Context';
    const contentHeader = '## Content';
    const ctxIdx = body.indexOf(contextHeader);
    const cntIdx = body.indexOf(contentHeader);

    let context = '';
    let patternContent = '';

    if (ctxIdx !== -1 && cntIdx !== -1) {
      context = body.slice(ctxIdx + contextHeader.length, cntIdx).trim();
      patternContent = body.slice(cntIdx + contentHeader.length).trim();
    } else if (cntIdx !== -1) {
      patternContent = body.slice(cntIdx + contentHeader.length).trim();
    } else {
      patternContent = body;
    }

    return {
      frontmatter: parsed,
      context,
      content: patternContent,
    };
  } catch {
    return null;
  }
}

export function serializeBehaviorPattern(pattern: BehaviorPattern): string {
  const yamlStr = yaml.dump(pattern.frontmatter, {
    lineWidth: -1,
    quotingType: '"',
    schema: yaml.JSON_SCHEMA,
  });

  return `---\n${yamlStr}---\n\n## Context\n${pattern.context}\n\n## Content\n${pattern.content}\n`;
}
