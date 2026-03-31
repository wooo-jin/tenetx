# Changelog

All notable changes to tenetx will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-03-31

### Breaking Changes
- **Public API**: Removed `readCodexOAuthToken`, `loadProviderConfigs`, `ProviderConfig`, `ProviderName`, `ProviderError`, `PackError`, `PackMeta`, `PackRequirement` exports from lib.ts
- **CLI**: 37 commands → 12 (removed pack, remix, dashboard, setup, status, worktree, ask, codex-spawn, synth, wait, notify, governance, gateway, worker, proposals, scan, verify, stats, rules, marketplace, session, philosophy)
- **Dependencies**: Removed `ink`, `react`. Added `zod` as direct dependency

### Added
- **MCP compound server**: 4 tools (compound-search, compound-list, compound-read, compound-stats) for on-demand knowledge access
- **Behavioral learning**: 10 thinking patterns (verify-first, quality-over-speed, understand-why, pragmatic, systematic, evidence-based, risk-aware, autonomous, collaborative, incremental)
- **Pre-compact Claude analysis**: Claude analyzes conversation for thinking patterns at context compaction (0 API cost)
- **Session feedback**: "[tenetx] 학습된 패턴 N개 활성 중" shown at session start
- **forge-behavioral.md**: Auto-generated rules from learned preferences
- **Progressive Disclosure**: Push summaries (~200 tokens), pull full content via MCP (89% token reduction)
- **Hook response utilities**: Shared approve/deny/failOpen functions (Plugin SDK format)
- **Tool-specific matchers**: db-guard→Bash, secret-filter→Write|Edit|Bash, slop-detector→Write|Edit

### Changed
- **Codebase**: 36,977 → ~24,000 lines (35% reduction)
- **Hook protocol**: Migrated all 17 hooks from `result/message` to `continue/systemMessage` (Plugin SDK format)
- **Tag extraction**: Korean stopwords filter (80 words), MAX_TAGS=10, frequency-based ranking
- **Solution matching**: Identifier-based boost (+0.15), threshold relaxed (2 tags → 1 tag or 1 identifier)
- **Context budget**: Conservative fallback (factor=0.7 on detection failure)
- **Rules**: Conditional loading via paths frontmatter, RULE_FILE_CAPS enforced (3000/file, 15000/total)
- **Skill descriptions**: Updated to 3rd-person format per Claude Code Plugin SDK best practices
- **Build**: `rm -rf dist` before tsc (clean tarball guaranteed)

### Removed
- Pack system (src/pack/, packs/, tenetx pack commands)
- Remix system (src/remix/)
- Dashboard TUI (src/dashboard/, ink/react dependencies)
- 27 unused modules (synthesizer, marketplace, worktree, etc.)
- 12 workflow mode commands (ralph, autopilot, team, etc.)
- Philosophy generator/CLI
- Templates directory
- Dead INJECTION_CAPS (keywordInjectMax, perPromptTotal)

### Fixed
- **compound-lifecycle.ts**: confidence subtraction -20 → -0.20 (was zeroing on 0-1 scale)
- **compound-lifecycle.ts**: Promotion now runs before staleness check (was blocking upgrades)
- **compound-lifecycle.ts**: Identifier staleness aligned to 6+ chars (was 4+, mismatched with Code Reflection)
- **session-recovery.ts**: runExtraction fire-and-forget (3056ms → 151ms)
- **Security**: Symlink protection at 8 locations, SUDO_USER execFileSync, settings.json single-write
- **postinstall**: Matcher field from hook-registry.json (was hardcoded '*')
- **uninstall**: Now cleans mcpServers['tenetx-compound']
- **Dead paths**: tenetx status→me, dashboard deleted, tmux binding fixed, REMIX_DIR removed
- **Docs**: All 4 language READMEs rewritten, SECURITY.md updated to 2.5.x→3.0.0

### Security
- 46 issues fixed across 6 review iterations
- All hooks fail-open with Plugin SDK format
- Prompt injection defense: 13 patterns + Unicode NFKC + XML escaping
- YAML bomb protection (5KB frontmatter cap, 3 anchor limit)

## [2.1.0] - 2026-03-25

### Added
- **Compound Engine integrity improvements**
  - **Code Reflection false positive prevention** — identifier minimum length raised from 4 to 6 characters, reducing false `reflected++` from common words
  - **"Why" context in auto-extraction** — extracted solutions now include git commit messages, addressing the "git diff only shows what, not why" gap
  - **Staleness detection** — `checkIdentifierStaleness()` verifies solution identifiers still exist in codebase via grep
  - **Extraction precision metrics** — `compound-precision` lab event emitted during lifecycle checks for tracking promotion/retirement rates
- **Token injection guardrail** — `MAX_INJECTED_CHARS_PER_SESSION = 8000` (~2K tokens) caps per-session injection cost, tracked in session cache
- **E2E hook pipeline tests** — 7 integration tests verifying actual hook stdin→stdout JSON protocol (solution-injector, keyword-detector, pre-tool-use, slop-detector, db-guard)
- **txd security warning** — CLI now emits 3-line warning on startup when permissions are skipped
- **Documentation**
  - Open source readiness review feedback (P0/P1/P2 prioritized)
  - Action plan v2.1 (7 phases, 33 items, 18 success criteria)
  - ADR-001: large file decomposition plan
  - ADR-002: EMA learning rate parameter rationale
  - Auto vs manual extraction tradeoff guide
  - oh-my-claudecode coexistence guide
  - Case study template for dogfooding data
  - Good first issues list (6 issues)

### Fixed
- **3 failing tests** — slop-detector-main.test.ts depended on local `~/.compound/hook-config.json` (now mocked)
- **106 empty catch blocks → 0** — all replaced with `debugLog()` or descriptive comments explaining why safe to ignore
- **70 biome lint warnings → 5** — `noAssignInExpressions`, non-null assertions, array index keys, etc. (remaining: `useTemplate`, `useLiteralKeys`)
- **CI coverage double-run** — merged `npm test` + `--coverage` into single vitest invocation to prevent mock state corruption

### Changed
- **Coverage thresholds** — aligned vitest.config.ts with actual coverage (35% lines) instead of unrealistic 85%. CI now enforces thresholds.
- **Node.js requirement** — 18 → 20 (vitest v4/rolldown requires `node:util.styleText`)
- **CI matrix** — removed Node 18, kept Node 20 + 22
- **CONTRIBUTING.md** — replaced "No linter yet" with Biome instructions, added architecture diagram
- **README** — added vendor lock-in notice, "When to Use" table, txd warning section
- **Multi-language READMEs** — synced KO/ZH/JA with all English changes
- **GitHub Actions** — checkout v4→v6, setup-node v4→v6

### Dependencies
- `@types/node` ^22.19.15 → ^25.5.0
- `@vitest/coverage-v8` ^4.1.0 → ^4.1.1

## [2.0.0] - 2026-03-24

### Added
- **Compound Engine v3** — evidence-based cross-session learning system
  - **Solution Format v3** — YAML frontmatter with version, status, confidence, tags, identifiers, evidence counters
  - **Code Reflection** — PreToolUse hook detects when injected solution identifiers appear in Edit/Write code
  - **Negative Signal Detection** — PostToolUse hook detects build/test failures and attributes to experiment solutions
  - **Extraction Engine** — git-diff-based automatic pattern extraction with 4-stage quality gates (structure, toxicity, dedup, re-extraction)
  - **Lifecycle Management** — experiment → candidate → verified → mature with evidence-driven promotion and confidence-based demotion
  - **Circuit Breaker** — experiment solutions with 2+ negative signals auto-retired
  - **Contradiction Detection** — flags solutions with 70%+ tag overlap but disjoint identifiers
  - **Prompt Injection Defense** — 13 injection patterns, Unicode NFKC normalization, XML tag escaping
  - **Solution Index Cache** — in-memory mtime-based cache for matching performance
  - **V1→V3 Migration** — automatic format upgrade on first access with symlink protection
  - **CLI** — `compound list`, `inspect`, `remove`, `rollback`, `--verify`, `--lifecycle`, `pause-auto`, `resume-auto`
- **Pack Marketplace** — GitHub-based community pack sharing
  - `tenetx pack publish <name>` — publish verified solutions to GitHub + registry PR
  - `tenetx pack search <query>` — search community registry
  - Registry: [wooo-jin/tenetx-registry](https://github.com/wooo-jin/tenetx-registry)
- **Lab compound events** — 6 new event types (compound-injected, compound-reflected, compound-negative, compound-extracted, compound-promoted, compound-demoted)
- 83 new tests (solution-format, prompt-injection-filter, solution-index, compound-lifecycle, compound-extractor)

### Changed
- `solution-matcher.ts` — tags-based matching replaces keyword substring matching
- `solution-injector.ts` — v3 format with status/confidence/type in XML output, experiment 1/prompt limit, cumulative injection-cache
- `compound-loop.ts` — v3 YAML frontmatter output, `inferIdentifiers()` for manual solutions, `slugify` deduplicated
- `pre-tool-use.ts` — Code Reflection + evidence update via parse-modify-serialize
- `post-tool-use.ts` — negative signal detection + evidence update
- `session-recovery.ts` — SessionStart triggers extraction + daily lifecycle check
- `state-gc.ts` — injection-cache pattern added for GC

### Dependencies
- Added `js-yaml` ^4.1.0 (YAML frontmatter parsing with JSON_SCHEMA safety)

## [1.7.0] - 2026-03-23

### Added
- **Forge** — signal-based personalization engine: project scanning, 10-question interview, 5 continuous dimensions (qualityFocus, autonomyPreference, riskTolerance, abstractionLevel, communicationStyle), generates agent overlays, skill tuning, rules, hook parameters, philosophy, and routing config
- **Lab** — adaptive optimization engine: JSONL event tracking, 8 behavioral pattern detectors, auto-learning closed loop (Lab → Forge, EMA 0.25, daily), component effectiveness scoring, A/B experiments, session cost tracking with HUD integration
- **Remix** — harness composition: browse/search published harnesses, cherry-pick individual components (agent/skill/hook/rule/principle), conflict detection (hash-based), provenance tracking
- **Multi-model Synthesizer** — heuristic response evaluation (4-axis scoring), agreement analysis, task-type-weighted provider synthesis, provider performance tracking
- **AST-grep integration** — real AST parsing via `sg` CLI with regex fallback, pre-built patterns for TypeScript/Python/Go/Rust, `tenetx ast` CLI
- **LSP integration** — JSON-RPC 2.0 over stdio client, auto-detects tsserver/pylsp/gopls/rust-analyzer/jdtls, hover/definition/references/diagnostics, `tenetx lsp` CLI
- **`tenetx me`** — personal dashboard showing profile, evolution history, detected patterns, agent tuning, session cost
- **`tenetx forge`** — onboarding UX with live dimension visualization after each interview answer
- **`tenetx lab evolve`** — manual/auto learning cycle with dry-run support
- **`tenetx lab cost`** / **`tenetx cost`** — session cost tracking and reporting
- **`tenetx synth`** — multi-model synthesis status, weights, and history
- **hookTuning pipeline** — forge generates hook parameters → hook-config.json → actual hooks (slop-detector, context-guard, secret-filter) read and apply them
- **Skill-tuner** — 6 skills (autopilot, ralph, team, ultrawork, code-review, tdd) respond to forge dimensions
- **Auto-learn notification** — profile evolution changes displayed on harness startup
- **Setup → Forge integration** — `tenetx setup` offers forge personalization at the end
- 257 new tests (14 files) covering forge, lab, remix, evaluator, synthesizer, LSP

### Changed
- README rewritten for all 4 languages (EN/KO/ZH/JA) with new positioning: "The AI coding tool that adapts to you"
- package.json and plugin.json description updated to new positioning
- Interview deltas increased (±0.10~0.30) for meaningful profile divergence
- Auto-learn constants tuned: LEARNING_RATE 0.15→0.25, MAX_DELTA 0.1→0.15, MIN_EVENTS 50→30
- Agent overlays enriched from 1-3 line fragments to 3-5 sentence behavioral briefings
- LSP request timeout increased to 30s for large project indexing

## [1.6.3] - 2026-03-23

### Fixed
- **CRITICAL**: Fix ESM import side-effect causing double JSON output in `skill-injector` and `post-tool-use` hooks — root cause of Stop hook errors across environments
- **CRITICAL**: Fix "cancel ralph" activating ralph mode instead of canceling — keyword pattern priority conflict
- **CRITICAL**: Fix path traversal vulnerability via unsanitized `session_id` in file paths (7 hooks affected)
- Fix Stop hook timeout race condition — 0ms margin between plugin timeout and stdin read timeout
- Fix non-atomic file writes causing state corruption under concurrent sessions (9 hooks)
- Fix `readStdinJSON` missing `process.stdin.resume()` causing silent timeout in some Node.js environments
- Fix `readStdinJSON` having no input size limit (potential memory exhaustion)
- Fix user-supplied regex patterns in `dangerous-patterns.json` vulnerable to ReDoS
- Fix `ralph` keyword false positive matching on casual mentions
- Fix `pipeline` keyword requiring "pipeline mode" suffix — standalone "pipeline" now works
- Fix `migrate` and `refactor` keywords triggering on casual mentions — now require explicit mode invocation
- Fix inject-type keywords (`tdd`, `code-review`, etc.) causing double injection via both keyword-detector and skill-injector
- Fix `plugin.json` version stuck at `0.2.0` — now synced with `package.json`

### Added
- `--version` / `-V` CLI flag
- `sanitize-id.ts` shared utility for safe file path construction
- `atomic-write.ts` shared utility for corruption-resistant state writes
- `isSafeRegex()` validation for user-supplied regex patterns
- Ecomode entry in CLI help text and magic keywords section
- `cancel-ralph` keyword pattern for targeted ralph cancellation

## [1.6.2] - 2026-03-20

### Fixed
- Fix `.npmignore` excluding `templates/` from npm package
- Fix README coverage badge showing 60% instead of actual 41%
- Fix `@types/node` version mismatch (`^25` → `^18`) to match `engines: >=18`
- Fix type error in `session-recovery.ts` from `@types/node` downgrade
- Fix CHANGELOG duplicate entries in `[1.6.0]`
- Fix README banner image using relative path (breaks on npm)
- Adjust vitest coverage thresholds to match actual coverage

## [1.6.1] - 2026-03-20

### Fixed
- Resolve remaining audit warnings — rate-limiter timeout, governance try-catch
- Resolve 4 critical runtime issues from previous audit
- Resolve all skill/agent audit issues — 2 CRITICAL, 4 HIGH, 4 MEDIUM
- Correct README statistics — skills 11→19, hooks 14/18→17, tests 654→1204
- Complete i18n — convert all remaining Korean to English

### Added
- `cancel-ralph` skill for Ralph loop cancellation via `/tenetx:cancel-ralph`
- `ralph-craft` skill for interactive Ralph prompt building

## [1.6.0] - 2026-03-20

### Added
- Ecomode for token-saving with Haiku priority and minimal responses
- Intent classifier for automatic task routing
- Slop detector to identify low-quality outputs
- 7 new skills for expanded workflow coverage
- Crash recovery support
- 47 scenario tests for comprehensive coverage
- Ralph mode integration with ralph-loop plugin for auto-iteration

### Changed
- Upgraded all 10 skills to OMC-level depth and completeness

### Fixed
- Comprehensive security, stability, and system design overhaul
- Replaced non-existent OMC references with tenetx/Claude Code native APIs
- Resolved 13 cross-reference inconsistencies across skills, hooks, and modes

## [1.4.0] - 2025-12-01

### Added
- Gemini provider support
- Codex CLI integration
- Codex tmux team spawning with auto task routing
- `$ARGUMENTS` usage guide to all 12 tenetx skills

### Fixed
- Cross-platform OAuth token for status-line usage display

## [1.3.0] - 2025-10-01

### Added
- Update notification when newer tenetx version is available
- Skills installable as Claude Code slash commands (`/tenetx:xxx`)
- Accumulated solutions injected into Claude context in compound flow

### Fixed
- Rules viewer skips empty dirs and finds pack rules correctly
- Connected pack info shown in startup message and HUD
- 7 CLI bugs: arg parsing, pack display, extends docs
- Project detection, pack init, and pack-builder skill
- Pack setup records `lastSync` for lock

## [1.1.0] - 2025-08-01

### Added
- Pack diagnostics to `doctor` command
- Extended pack schema: skills, agents, workflows, requires fields
- `pack add` / `pack remove` / `pack connected` CLI commands
- Pack assets integration into harness pipeline
- AI-guided pack building (`--from-project`, pack-builder skill)
- `pack.lock` for version pinning and update notifications
- Pack authoring guide

### Changed
- Migrated consumers to multi-pack API

### Fixed
- Consistency guards (P1/P2)
- 7 gaps from completeness verification

## [1.0.1] - 2025-06-15

### Fixed
- Resolved Codex-flagged blockers for npm publish
- Fixed command injection: `execSync` → `execFileSync`
- Fixed cross-platform compatibility (Windows/Linux/macOS)

## [1.0.0] - 2025-06-01

### Added
- Initial public release as **tenetx** (renamed from tenet)
- Philosophy-driven Claude Code harness with 5-system workflow
- Multi-pack support
- Bilingual documentation (EN/KO)
- Core CLI commands: `txd` entrypoint

[Unreleased]: https://github.com/wooo-jin/tenetx/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/wooo-jin/tenetx/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/wooo-jin/tenetx/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/wooo-jin/tenetx/compare/v1.7.0...v2.0.0
[1.7.0]: https://github.com/wooo-jin/tenetx/compare/v1.6.3...v1.7.0
[1.6.3]: https://github.com/wooo-jin/tenetx/compare/v1.6.2...v1.6.3
[1.6.2]: https://github.com/wooo-jin/tenetx/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/wooo-jin/tenetx/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/wooo-jin/tenetx/compare/v1.4.0...v1.6.0
[1.4.0]: https://github.com/wooo-jin/tenetx/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/wooo-jin/tenetx/compare/v1.1.0...v1.3.0
[1.1.0]: https://github.com/wooo-jin/tenetx/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/wooo-jin/tenetx/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/wooo-jin/tenetx/releases/tag/v1.0.0
