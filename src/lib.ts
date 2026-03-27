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
  PackMeta,
  PackRequirement,
} from './core/types.js';

// ── Forge (profiling) ──
export { DIMENSION_META, CORE_DIMENSIONS, defaultDimensionVector, clampDimension, applyDeltas, dimensionDistance, dimensionLabel } from './forge/dimensions.js';
export type { CoreDimension, DimensionVector, DimensionMeta, ForgeProfile, DerivedConfig, AgentOverlay, SkillOverlay, HookTuning } from './forge/types.js';

// ── Engine ──
/** @deprecated Provider API is scheduled for removal in v3.0. Use direct model configuration instead. */
export { readCodexOAuthToken, loadProviderConfigs, type ProviderConfig, type ProviderName } from './engine/provider.js';
export { extractSignals, extractLexicalSignals, extractStructuralSignals, type SignalBundle, type LexicalSignals, type StructuralSignals } from './engine/signals.js';
export { ModelRouter, type ModelTier, type TaskCategory, type RoutingPreset, type RoutingResult } from './engine/router.js';

// ── Lab ──
export type { LabEvent, LabEventType } from './lab/types.js';

// ── Hooks (utilities) ──
export {
  PROMPT_INJECTION_PATTERNS,
  normalizeForInjectionCheck,
  containsPromptInjection,
  filterSolutionContent,
} from './hooks/prompt-injection-filter.js';

// ── Core utilities ──
export { loadPhilosophy } from './core/philosophy-loader.js';
export { profileTask, routeTasks, autoDelegate, type TaskProfile, type AgentPreference } from './core/codex-router.js';

// ── Errors ──
export { TenetxError, ProviderError, HookError, ConfigError, PackError, ForgeError, NonRetryableError } from './core/errors.js';
