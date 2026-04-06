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

// ── v1 Store types ──
export type {
  Profile, Rule, Evidence, PackRecommendation, SessionEffectiveState,
  QualityPack, AutonomyPack, JudgmentPack, CommunicationPack, TrustPolicy,
  QualityFacets, AutonomyFacets, JudgmentFacets, CommunicationFacets,
} from './store/types.js';

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

// ── v1 stores ──
export { loadProfile, saveProfile, createProfile } from './store/profile-store.js';
export { loadActiveRules } from './store/rule-store.js';

// ── Errors ──
export { TenetxError, HookError, ConfigError, ForgeError, NonRetryableError } from './core/errors.js';
