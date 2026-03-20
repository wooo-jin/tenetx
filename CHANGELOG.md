# Changelog

All notable changes to tenetx will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/wooo-jin/tenetx/compare/v1.6.2...HEAD
[1.6.2]: https://github.com/wooo-jin/tenetx/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/wooo-jin/tenetx/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/wooo-jin/tenetx/compare/v1.4.0...v1.6.0
[1.4.0]: https://github.com/wooo-jin/tenetx/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/wooo-jin/tenetx/compare/v1.1.0...v1.3.0
[1.1.0]: https://github.com/wooo-jin/tenetx/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/wooo-jin/tenetx/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/wooo-jin/tenetx/releases/tag/v1.0.0
