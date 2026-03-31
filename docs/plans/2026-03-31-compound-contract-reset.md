# Compound Contract Reset Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate behavioral learning from technical compound knowledge, and make `tenetx compound` preview recent-session analysis by default with explicit `--save` persistence.

**Architecture:** Technical compound remains the reusable engineering knowledge system under `~/.compound/me/solutions/`. Behavioral learning moves to a separate store under `~/.compound/me/behavior/` and is consumed only by behavioral rule generation. The `compound` CLI becomes a preview-first analyzer that inspects recent compound state, renders candidates, and persists only when the user passes `--save`.

**Tech Stack:** TypeScript, Vitest, Claude Code hook protocol, YAML frontmatter markdown files

### Task 1: Add failing tests for the new `compound` CLI contract

**Files:**
- Modify: `tests/compound-loop.test.ts`
- Modify: `src/engine/compound-loop.ts`

**Step 1: Write the failing tests**

- Add a test asserting `handleCompound([])` in non-interactive mode shows an analysis preview instead of manual-entry instructions.
- Add a test asserting preview mode does not write files unless `--save` is present.
- Add a test asserting manual entry moves to an explicit subcommand such as `add`.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/compound-loop.test.ts`
Expected: FAIL because current behavior enters interactive/manual mode by default.

**Step 3: Write minimal implementation**

- Introduce preview-first behavior for `tenetx compound`.
- Add explicit persistence flag `--save`.
- Keep manual input behind `add` or `interactive`.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/compound-loop.test.ts`
Expected: PASS

### Task 2: Add failing tests for behavioral storage separation

**Files:**
- Modify: `tests/paths.test.ts`
- Modify: `tests/config-injector.test.ts`
- Create: `tests/prompt-learner.test.ts`
- Modify: `src/core/paths.ts`
- Modify: `src/core/config-injector.ts`
- Modify: `src/engine/prompt-learner.ts`

**Step 1: Write the failing tests**

- Add a path constant test for `ME_BEHAVIOR`.
- Add a config injector test asserting learned behavioral rules are loaded from behavior storage, not technical solutions.
- Add prompt learner tests asserting generated `prefer-*`, `think-*`, `workflow-*`, `works-*`, `writes-*` files are written to behavior storage.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/paths.test.ts tests/config-injector.test.ts tests/prompt-learner.test.ts`
Expected: FAIL because no separate behavior path exists and prompt learner still writes to `ME_SOLUTIONS`.

**Step 3: Write minimal implementation**

- Add `ME_BEHAVIOR` path.
- Update postinstall/harness directory bootstrap to create it.
- Point prompt learner outputs to behavior storage.
- Point behavioral rule generation to behavior storage.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/paths.test.ts tests/config-injector.test.ts tests/prompt-learner.test.ts`
Expected: PASS

### Task 3: Add failing tests for preview analysis source and save path

**Files:**
- Modify: `tests/compound-loop.test.ts`
- Modify: `src/engine/compound-loop.ts`

**Step 1: Write the failing tests**

- Add a test for a pure preview helper that loads recent pending/manual candidates and renders sections without persisting.
- Add a test asserting `--save` writes only technical entries to `ME_SOLUTIONS` and team candidates to proposals as applicable.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/compound-loop.test.ts`
Expected: FAIL because preview helper does not exist yet.

**Step 3: Write minimal implementation**

- Implement preview-generation helper(s).
- Reuse current `runCompoundLoop` persistence only when `--save` is set.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/compound-loop.test.ts`
Expected: PASS

### Task 4: Remove cross-layer contract drift in docs and copy

**Files:**
- Modify: `README.md`
- Modify: `README.ko.md`
- Modify: `docs/getting-started.md`
- Modify: `commands/compound.md`

**Step 1: Write the failing tests**

- No dedicated doc snapshot tests currently exist. Use targeted assertions only if easy; otherwise treat documentation update as verification-only work after code behavior is fixed.

**Step 2: Update documentation**

- Describe `tenetx compound` as preview-first analysis with `--save`.
- Clarify that behavioral learning is separate from compound technical knowledge.

**Step 3: Verify docs match code**

Run: `node dist/cli.js compound --help`
Expected: Help text matches the new contract.

### Task 5: Full verification

**Files:**
- Verify touched files only

**Step 1: Run focused tests**

Run: `npm test -- tests/compound-loop.test.ts tests/paths.test.ts tests/config-injector.test.ts tests/prompt-learner.test.ts`

**Step 2: Run full suite**

Run: `npm test`

**Step 3: Run build**

Run: `npm run build`

**Step 4: Manual CLI verification**

Run: `node dist/cli.js compound`
Expected: Analysis preview, no persistence side effect

Run: `node dist/cli.js compound --save`
Expected: Same analysis plus explicit save result
