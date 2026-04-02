---
name: starter-debugging-systematic
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - debug
  - debugging
  - systematic
  - reproduce
  - 디버깅
  - 체계적
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
Randomly changing code hoping the bug disappears wastes hours and introduces new bugs. Systematic debugging converges on the root cause in predictable time.

## Content
Four-step cycle: **Reproduce -> Isolate -> Fix -> Verify**.

1. **Reproduce**: Write a failing test or minimal reproduction. If you can't reproduce it, you can't confirm the fix.
2. **Isolate**: Binary search the problem space — comment out half the code path, use `git bisect` for regressions.
```bash
git bisect start HEAD v1.2.0 && git bisect bad && git bisect good
```
3. **Fix**: Change the minimum code necessary. If the fix is large, the root cause analysis may be wrong.
4. **Verify**: The reproduction test must pass. Run full suite for regressions. Keep the test permanently as a regression guard.
