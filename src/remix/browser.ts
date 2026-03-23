/**
 * Tenetx — Remix Browser
 *
 * Browse and search published harnesses, display details.
 */

import type { PublishedHarness, RemixableComponent } from './types.js';
import { searchRegistry, findHarness, getHarnessComponents } from './registry.js';

/**
 * Browse/search published harnesses.
 * Returns matching harnesses or all if no query.
 */
export function browseHarnesses(query?: string): PublishedHarness[] {
  return searchRegistry(query ?? '');
}

/**
 * Inspect a harness and return its component list.
 */
export function inspectHarness(harnessId: string): {
  harness: PublishedHarness;
  components: RemixableComponent[];
} | null {
  const harness = findHarness(harnessId);
  if (!harness) return null;

  const components = getHarnessComponents(harness);
  return { harness, components };
}

/**
 * Format a harness list for CLI display.
 */
export function formatHarnessList(harnesses: PublishedHarness[]): string {
  if (harnesses.length === 0) return '  No harnesses found.';

  const lines: string[] = [];
  for (const h of harnesses) {
    lines.push(`  ${h.name} [${h.id}]`);
    lines.push(`    ${h.description}`);
    lines.push(`    by ${h.author} | tags: ${h.tags.join(', ')}`);
    const components = getHarnessComponents(h);
    if (components.length > 0) {
      const typeCounts = new Map<string, number>();
      for (const c of components) {
        typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
      }
      const parts = Array.from(typeCounts.entries()).map(([t, n]) => `${t}: ${n}`);
      lines.push(`    components: ${parts.join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Format a component list for CLI display.
 */
export function formatComponentList(components: RemixableComponent[]): string {
  if (components.length === 0) return '  No components available.';

  const lines: string[] = [];

  // Group by type
  const grouped = new Map<string, RemixableComponent[]>();
  for (const c of components) {
    const list = grouped.get(c.type) ?? [];
    list.push(c);
    grouped.set(c.type, list);
  }

  for (const [type, comps] of grouped) {
    lines.push(`  [${type}]`);
    for (const c of comps) {
      lines.push(`    ${c.name} — ${c.description}`);
      lines.push(`      hash: ${c.contentHash}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
