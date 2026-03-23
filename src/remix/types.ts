/**
 * Tenetx — Remix Types
 *
 * Harness composition system for cherry-picking components
 * from published harnesses.
 */

/** Remixable component types */
export type ComponentType = 'agent' | 'skill' | 'hook' | 'rule' | 'principle' | 'routing';

/** A component that can be cherry-picked from a published harness */
export interface RemixableComponent {
  /** Component type */
  type: ComponentType;
  /** Component name (file basename without extension, or principle key) */
  name: string;
  /** Brief description */
  description: string;
  /** SHA-256 hash of the content */
  contentHash: string;
  /** Relative file path within the harness source */
  relativePath?: string;
  /** Raw content (populated when inspecting or picking) */
  content?: string;
}

/** A published harness available for remixing */
export interface PublishedHarness {
  /** Unique identifier */
  id: string;
  /** Display name (e.g., '@senior-backend') */
  name: string;
  /** Author name */
  author: string;
  /** Brief description */
  description: string;
  /** Source URL (GitHub repo) */
  source: string;
  /** Searchable tags */
  tags: string[];
  /** Available components (populated when inspected) */
  components?: RemixableComponent[];
}

/** Conflict detection result */
export type ConflictResolution = 'keep-existing' | 'use-incoming' | 'merge' | 'skip';

/** A conflict between a local component and an incoming remix component */
export interface RemixConflict {
  /** Component type */
  type: ComponentType;
  /** Component name */
  name: string;
  /** Local content hash */
  localHash: string;
  /** Incoming content hash */
  incomingHash: string;
  /** User-chosen resolution (undefined until resolved) */
  resolution?: ConflictResolution;
}

/** A plan for applying selected remix components */
export interface RemixPlan {
  /** Source harness ID */
  sourceHarnessId: string;
  /** Source harness name */
  sourceHarnessName: string;
  /** Components to add directly (no conflict) */
  additions: RemixableComponent[];
  /** Components skipped because identical already exists */
  skipped: RemixableComponent[];
  /** Components that conflict with existing local components */
  conflicts: RemixConflict[];
}

/** Provenance record for a single remixed component */
export interface RemixProvenance {
  /** Component type */
  componentType: ComponentType;
  /** Component name */
  componentName: string;
  /** Source harness name */
  sourceHarness: string;
  /** Source harness version (or commit hash) */
  sourceVersion: string;
  /** ISO timestamp of when the component was remixed */
  remixedAt: string;
  /** SHA-256 hash of the content at the time it was remixed */
  currentHash: string;
  /** SHA-256 hash of the original content from the source */
  originalHash: string;
  /** Whether the component has been locally modified since remixing */
  locallyModified: boolean;
}

/** Provenance file structure (~/.compound/remix/provenance.json) */
export interface ProvenanceFile {
  version: number;
  components: RemixProvenance[];
}

/** Registry cache file structure (~/.compound/remix/registry-cache.json) */
export interface RegistryCacheFile {
  version: number;
  cachedAt: string;
  ttlMs: number;
  harnesses: PublishedHarness[];
}
