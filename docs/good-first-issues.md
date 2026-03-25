# Good First Issues — Ready to Post

These issues are prepared for GitHub to attract first-time contributors.

## Easy (no architecture knowledge needed)

### 1. Replace remaining empty catch blocks with descriptive comments
**Labels**: `good first issue`, `code quality`
**Description**: ~100 catch blocks in src/ use `/* ignore */`. Each should explain WHY it's safe to ignore, or use `debugLog()` if the error matters for debugging. See CONTRIBUTING.md for guidelines.
**Files**: grep for `catch.*ignore` in src/
**Difficulty**: Easy — mechanical but requires reading context per catch block

### 2. Add architecture diagram to CONTRIBUTING.md
**Labels**: `good first issue`, `documentation`
**Description**: CONTRIBUTING.md lacks an architecture overview. Add a text-based diagram showing the 4-engine system (Forge → Lab → Compound → Pack) and key file entry points. See docs/action-plan-v2.1.md for reference.
**Difficulty**: Easy — documentation only

### 3. Verify multi-language README sync
**Labels**: `good first issue`, `documentation`, `i18n`
**Description**: README exists in 4 languages (EN/KO/ZH/JA). Check that v2.0 changes (Compound Engine v3, Pack Marketplace) are reflected in all 4. Flag any sections that are out of sync.
**Difficulty**: Easy — comparison work

## Medium (some codebase understanding needed)

### 4. E2E test for hook stdin/stdout pipeline
**Labels**: `good first issue`, `testing`
**Description**: All hooks are tested via mocks. Create an integration test that spawns an actual hook script (e.g., `node dist/hooks/solution-injector.js`), pipes JSON to stdin, and validates the stdout JSON structure.
**Files**: `tests/e2e/hook-pipeline.test.ts` (new)
**Difficulty**: Medium — requires understanding hook I/O format

### 5. Add compound extraction precision tracking to `tenetx compound stats`
**Labels**: `enhancement`, `compound-engine`
**Description**: The `compound-precision` lab event is now emitted during lifecycle checks. Add a display in `tenetx compound stats` showing: total experiments, promotion rate, circuit-breaker rate.
**Difficulty**: Medium — requires reading lab event store and CLI output formatting

### 6. Seed pack registry with builtin packs
**Labels**: `enhancement`, `marketplace`
**Description**: Verify that `wooo-jin/tenetx-registry` has entries. If empty, create registry entries for the 5 builtin packs (backend, frontend, security, data, devops) so `tenetx pack search` returns results.
**Difficulty**: Medium — requires understanding pack format and registry structure
