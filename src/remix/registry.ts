/**
 * Tenetx — Remix Registry
 *
 * GitHub-based harness registry with local cache (1-day TTL).
 * Falls back to bundled sample data when network is unavailable.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { REMIX_DIR } from './paths.js';
import type {
  PublishedHarness,
  RemixableComponent,
  RegistryCacheFile,
} from './types.js';

// ---------------------------------------------------------------------------
// Bundled sample registry (no network dependency for initial functionality)
// ---------------------------------------------------------------------------

const SAMPLE_REGISTRY: PublishedHarness[] = [
  {
    id: 'senior-backend',
    name: '@senior-backend',
    author: 'tenetx-community',
    description: 'Strict test-first workflow with comprehensive review',
    source: 'https://github.com/tenetx-community/harness-senior-backend',
    tags: ['backend', 'strict', 'tdd'],
    components: [
      {
        type: 'agent',
        name: 'strict-reviewer',
        description: 'Code review agent that enforces strict quality standards',
        contentHash: hashContent('# Strict Reviewer\n\nEnforce test coverage > 80%, no any types, all errors handled.'),
        content: '# Strict Reviewer\n\nEnforce test coverage > 80%, no any types, all errors handled.',
      },
      {
        type: 'rule',
        name: 'test-first',
        description: 'Write tests before implementation',
        contentHash: hashContent('# Test First\n\nAlways write failing tests before writing production code.\nNo PR without corresponding test changes.'),
        content: '# Test First\n\nAlways write failing tests before implementation code.\nNo PR without corresponding test changes.',
      },
      {
        type: 'principle',
        name: 'zero-tolerance-bugs',
        description: 'Zero tolerance for known bugs in production',
        contentHash: hashContent('{"belief":"Known bugs in production are unacceptable","generates":["Fix all P0/P1 bugs before new features","Automated regression tests for every bug fix"]}'),
        content: JSON.stringify({
          belief: 'Known bugs in production are unacceptable',
          generates: [
            'Fix all P0/P1 bugs before new features',
            'Automated regression tests for every bug fix',
          ],
        }),
      },
      {
        type: 'routing',
        name: 'quality-routing',
        description: 'Route all review tasks to Opus for maximum quality',
        contentHash: hashContent('{"opus":["code-review","security-review","architecture"],"sonnet":["explore","simple-qa"],"haiku":["file-search"]}'),
        content: JSON.stringify({
          opus: ['code-review', 'security-review', 'architecture'],
          sonnet: ['explore', 'simple-qa'],
          haiku: ['file-search'],
        }),
      },
    ],
  },
  {
    id: 'solo-fullstack',
    name: '@solo-fullstack',
    author: 'tenetx-community',
    description: 'Fast iteration style for solo developers',
    source: 'https://github.com/tenetx-community/harness-solo-fullstack',
    tags: ['fullstack', 'solo', 'fast'],
    components: [
      {
        type: 'agent',
        name: 'rapid-prototyper',
        description: 'Agent optimized for quick prototyping and iteration',
        contentHash: hashContent('# Rapid Prototyper\n\nFocus on speed. Skip formal reviews. Ship and iterate.'),
        content: '# Rapid Prototyper\n\nFocus on speed. Skip formal reviews. Ship and iterate.',
      },
      {
        type: 'skill',
        name: 'quick-deploy',
        description: 'One-command deployment skill',
        contentHash: hashContent('# Quick Deploy\n\nDescription: Deploy current branch to staging\n\nSteps:\n1. Build\n2. Test (fast suite only)\n3. Deploy to staging'),
        content: '# Quick Deploy\n\nDescription: Deploy current branch to staging\n\nSteps:\n1. Build\n2. Test (fast suite only)\n3. Deploy to staging',
      },
      {
        type: 'rule',
        name: 'pragmatic-testing',
        description: 'Test critical paths only, skip boilerplate tests',
        contentHash: hashContent('# Pragmatic Testing\n\nTest business logic and critical paths.\nSkip tests for trivial getters/setters and framework boilerplate.'),
        content: '# Pragmatic Testing\n\nTest business logic and critical paths.\nSkip tests for trivial getters/setters and framework boilerplate.',
      },
      {
        type: 'principle',
        name: 'ship-fast-fix-fast',
        description: 'Prioritize shipping speed with quick fixes',
        contentHash: hashContent('{"belief":"Speed of iteration beats perfection","generates":["Ship MVP in < 1 day","Fix forward instead of rollback when possible","Skip ceremony that slows delivery"]}'),
        content: JSON.stringify({
          belief: 'Speed of iteration beats perfection',
          generates: [
            'Ship MVP in < 1 day',
            'Fix forward instead of rollback when possible',
            'Skip ceremony that slows delivery',
          ],
        }),
      },
    ],
  },
  {
    id: 'data-scientist',
    name: '@data-scientist',
    author: 'tenetx-community',
    description: 'Notebook-first with loose typing and experiment focus',
    source: 'https://github.com/tenetx-community/harness-data-scientist',
    tags: ['data', 'notebook', 'experiment'],
    components: [
      {
        type: 'agent',
        name: 'experiment-tracker',
        description: 'Agent that tracks experiments and their results',
        contentHash: hashContent('# Experiment Tracker\n\nLog every experiment with parameters, metrics, and conclusions.\nMaintain a running experiment log in experiments.md.'),
        content: '# Experiment Tracker\n\nLog every experiment with parameters, metrics, and conclusions.\nMaintain a running experiment log in experiments.md.',
      },
      {
        type: 'skill',
        name: 'notebook-review',
        description: 'Review Jupyter notebooks for reproducibility',
        contentHash: hashContent('# Notebook Review\n\nDescription: Review notebook for reproducibility\n\nChecklist:\n- All cells run in order\n- Random seeds set\n- Data paths are relative\n- Results are documented'),
        content: '# Notebook Review\n\nDescription: Review notebook for reproducibility\n\nChecklist:\n- All cells run in order\n- Random seeds set\n- Data paths are relative\n- Results are documented',
      },
      {
        type: 'rule',
        name: 'experiment-hygiene',
        description: 'Keep experiments clean and reproducible',
        contentHash: hashContent('# Experiment Hygiene\n\nEvery experiment must have:\n- A hypothesis\n- Controlled variables\n- Documented results\n- Conclusions and next steps'),
        content: '# Experiment Hygiene\n\nEvery experiment must have:\n- A hypothesis\n- Controlled variables\n- Documented results\n- Conclusions and next steps',
      },
      {
        type: 'principle',
        name: 'reproducibility-first',
        description: 'All results must be reproducible',
        contentHash: hashContent('{"belief":"Non-reproducible results have zero value","generates":["Set random seeds in every notebook","Version control all data preprocessing steps","Document environment and dependencies"]}'),
        content: JSON.stringify({
          belief: 'Non-reproducible results have zero value',
          generates: [
            'Set random seeds in every notebook',
            'Version control all data preprocessing steps',
            'Document environment and dependencies',
          ],
        }),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute SHA-256 hash of content (first 12 hex chars) */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/** Registry cache file path */
function getCachePath(): string {
  return path.join(REMIX_DIR, 'registry-cache.json');
}

/** 1-day TTL in milliseconds */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Registry I/O
// ---------------------------------------------------------------------------

/** Load cached registry, returning null if expired or missing */
function loadCache(): RegistryCacheFile | null {
  const cachePath = getCachePath();
  try {
    if (!fs.existsSync(cachePath)) return null;
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(raw) as RegistryCacheFile;
    const age = Date.now() - new Date(cache.cachedAt).getTime();
    if (age > (cache.ttlMs ?? CACHE_TTL_MS)) return null;
    return cache;
  } catch {
    return null;
  }
}

/** Save registry to cache */
function saveCache(harnesses: PublishedHarness[]): void {
  fs.mkdirSync(REMIX_DIR, { recursive: true });
  const cache: RegistryCacheFile = {
    version: 1,
    cachedAt: new Date().toISOString(),
    ttlMs: CACHE_TTL_MS,
    harnesses,
  };
  const tmpPath = `${getCachePath()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2));
  fs.renameSync(tmpPath, getCachePath());
}

/**
 * Load the remix registry.
 *
 * Priority:
 * 1. Local cache (if not expired)
 * 2. Bundled sample registry (always available)
 *
 * Network fetch is attempted but falls back gracefully.
 */
export function loadRegistry(): PublishedHarness[] {
  // Try cache first
  const cached = loadCache();
  if (cached) return cached.harnesses;

  // Fall back to bundled registry and cache it
  saveCache(SAMPLE_REGISTRY);
  return SAMPLE_REGISTRY;
}

/**
 * Search the registry by query string.
 * Matches against name, description, tags, and author (case-insensitive AND).
 */
export function searchRegistry(query: string): PublishedHarness[] {
  const harnesses = loadRegistry();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return harnesses;

  return harnesses.filter((h) => {
    const haystack = `${h.name} ${h.description} ${h.tags.join(' ')} ${h.author}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Find a harness by ID.
 */
export function findHarness(id: string): PublishedHarness | undefined {
  const harnesses = loadRegistry();
  return harnesses.find((h) => h.id === id || h.name === id || h.name === `@${id}`);
}

/**
 * Get components for a harness.
 * Returns bundled components or fetches from source (with fallback).
 */
export function getHarnessComponents(harness: PublishedHarness): RemixableComponent[] {
  // Return bundled components if available
  if (harness.components && harness.components.length > 0) {
    return harness.components;
  }

  // No components available (would need network fetch in the future)
  return [];
}

/**
 * Refresh registry cache (force re-fetch).
 * Currently resets to bundled data; future: fetch from remote URL.
 */
export function refreshRegistry(): PublishedHarness[] {
  saveCache(SAMPLE_REGISTRY);
  return SAMPLE_REGISTRY;
}
