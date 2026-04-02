---
name: starter-git-atomic-commits
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - git
  - commit
  - workflow
  - atomic
  - 커밋
  - 버전관리
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
Large commits bundling unrelated changes make debugging, reverting, and reviewing painful. `git bisect` becomes useless with multi-feature commits.

## Content
Each commit = one logical change. Revertable independently, reviewable in isolation. Use `git add -p` to stage specific hunks.

**Checklist**: Does this commit do exactly one thing? Can it be reverted without breaking unrelated code? Does the message explain WHY?

**Anti-patterns**: "WIP", "misc fixes", "updates" as messages. Mixing formatting with logic. Accumulating uncommitted work — ship after every meaningful chunk.
