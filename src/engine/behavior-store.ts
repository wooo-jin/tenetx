import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../core/logger.js';
import { ME_BEHAVIOR, ME_SOLUTIONS } from '../core/paths.js';
import { parseSolutionV3 } from './solution-format.js';
import {
  inferBehaviorKind,
  parseBehaviorPattern,
  serializeBehaviorPattern,
  type BehaviorPattern,
} from './behavior-format.js';

const log = createLogger('behavior-store');

export function behaviorFilePath(name: string): string {
  return path.join(ME_BEHAVIOR, `${name}.md`);
}

export function saveBehaviorPattern(
  pattern: BehaviorPattern,
  options?: { mergeObservedCount?: boolean },
): { status: 'created' | 'updated' | 'skipped'; filePath: string } {
  const filePath = behaviorFilePath(pattern.frontmatter.name);
  fs.mkdirSync(ME_BEHAVIOR, { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, serializeBehaviorPattern(pattern));
    return { status: 'created', filePath };
  }

  if (!options?.mergeObservedCount) {
    return { status: 'skipped', filePath };
  }

  const existing = parseBehaviorPattern(fs.readFileSync(filePath, 'utf-8'));
  if (!existing) return { status: 'skipped', filePath };

  existing.frontmatter.observedCount += pattern.frontmatter.observedCount;
  existing.frontmatter.confidence = Math.max(existing.frontmatter.confidence, pattern.frontmatter.confidence);
  existing.frontmatter.updated = pattern.frontmatter.updated;
  existing.frontmatter.tags = [...new Set([...existing.frontmatter.tags, ...pattern.frontmatter.tags])];
  existing.context = pattern.context;
  existing.content = pattern.content;
  existing.frontmatter.source = pattern.frontmatter.source;

  fs.writeFileSync(filePath, serializeBehaviorPattern(existing));
  return { status: 'updated', filePath };
}

export function migrateLegacyBehaviorSolutions(): string[] {
  const migrated: string[] = [];
  if (!fs.existsSync(ME_SOLUTIONS)) return migrated;

  for (const file of fs.readdirSync(ME_SOLUTIONS).filter((entry) => entry.endsWith('.md'))) {
    const filePath = path.join(ME_SOLUTIONS, file);

    try {
      if (fs.lstatSync(filePath).isSymbolicLink()) continue;
      const parsed = parseSolutionV3(fs.readFileSync(filePath, 'utf-8'));
      if (!parsed) continue;

      const kind = inferBehaviorKind(parsed.frontmatter.name, parsed.frontmatter.tags);
      if (!kind) continue;

      const today = new Date().toISOString().split('T')[0];
      const observedCount = Math.max(
        1,
        parsed.frontmatter.evidence.reflected,
        parsed.frontmatter.evidence.sessions,
      );

      const result = saveBehaviorPattern({
        frontmatter: {
          name: parsed.frontmatter.name,
          version: 1,
          kind,
          observedCount,
          confidence: parsed.frontmatter.confidence,
          tags: parsed.frontmatter.tags,
          created: parsed.frontmatter.created,
          updated: today,
          source: `legacy-${parsed.frontmatter.extractedBy}`,
        },
        context: parsed.context,
        content: parsed.content,
      }, { mergeObservedCount: true });

      if (result.status !== 'skipped') {
        fs.unlinkSync(filePath);
        migrated.push(parsed.frontmatter.name);
      }
    } catch (e) {
      log.debug(`legacy behavioral solution migration 실패: ${file}`, e);
    }
  }

  return migrated;
}
