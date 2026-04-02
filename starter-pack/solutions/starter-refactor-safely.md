---
name: starter-refactor-safely
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - refactor
  - safe
  - incremental
  - testing
  - 리팩토링
  - 안전
identifiers: []
evidence:
  injected: 0
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
created: "2026-04-03"
updated: "2026-04-03"
supersedes: null
extractedBy: manual
---

## Context
Refactoring without tests is just editing code and hoping. Large refactors touching many files are impossible to review and frequently introduce regressions.

## Content
Three invariants: **tests exist before starting**, **each step is small**, **tests pass after every step**.

**Before**: Write characterization tests for uncovered code. Commit tests separately.

**During**: One mechanical step at a time. `Rename -> test -> commit. Extract -> test -> commit.` Never combine behavior changes with refactoring.

**Safe moves**: extract method, rename, inline variable, move function, replace magic number. **Anti-pattern**: "Refactor everything, test at the end" — 15 interleaved changes, no way to isolate the break.
