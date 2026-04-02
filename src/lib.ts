/**
 * Tenetx public library API.
 * Import via `import { ... } from 'tenetx'` or `import { ... } from 'tenetx/lib'`
 *
 * Separates library exports from CLI entrypoint (cli.ts)
 * so tenetx can be used programmatically.
 */

// ── Core types ──
export type {
  Philosophy,
  Principle,
  HarnessContext,
  ScopeInfo,
} from './core/types.js';

// ── Forge (profiling) ──
export { DIMENSION_META, CORE_DIMENSIONS, defaultDimensionVector, clampDimension, applyDeltas, dimensionDistance, dimensionLabel } from './forge/dimensions.js';
export type { CoreDimension, DimensionVector, DimensionMeta, ForgeProfile, DerivedConfig, AgentOverlay, SkillOverlay, HookTuning } from './forge/types.js';

// ── Hooks (utilities) ──
export {
  SECURITY_PATTERNS,
  PROMPT_INJECTION_PATTERNS,
  normalizeForInjectionCheck,
  containsPromptInjection,
  filterSolutionContent,
} from './hooks/prompt-injection-filter.js';
export type {
  ScanFinding,
  ScanResult,
} from './hooks/prompt-injection-filter.js';

// ── Core utilities ──
export { loadPhilosophy } from './core/philosophy-loader.js';

// ── Errors ──
export { TenetxError, HookError, ConfigError, ForgeError, NonRetryableError } from './core/errors.js';
