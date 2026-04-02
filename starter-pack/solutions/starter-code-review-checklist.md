---
name: starter-code-review-checklist
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - review
  - code-review
  - checklist
  - quality
  - 코드리뷰
  - 품질
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
Unstructured reviews catch surface-level issues while missing critical bugs. Reviewing in priority order ensures high-severity problems are found before reviewer fatigue sets in.

## Content
Review in this order — stop and fix before moving to the next layer:

1. **Correctness**: Does it do what the requirement says? Edge cases handled? Error paths tested?
2. **Security**: Input validation at trust boundaries? Injection risks? Secrets exposed? Auth checks?
3. **Performance**: N+1 queries? Unbounded loops? Missing pagination or indexes?
4. **Readability**: Understandable in 5 minutes by a newcomer? Names descriptive? DRY?

Never approve with open items in layers 1-2. Layers 3-4 can be tracked as follow-ups. Re-review after fixes — never assume corrections are correct.
