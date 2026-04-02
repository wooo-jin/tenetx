---
name: starter-error-handling-patterns
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - error
  - handling
  - validation
  - boundary
  - 에러
  - 에러처리
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
Catching `Error` everywhere and logging "something went wrong" makes debugging impossible. Untyped errors propagate silently until they crash in production.

## Content
**Custom error classes** — make errors machine-readable with `code` and `statusCode` fields. Extend a base `AppError` class for consistent handling.

**Validate at boundaries, trust internally**: Parse external input at the edge (controller/handler). Internal functions receive already-validated types — no defensive checks needed deep inside.

**Early returns** reduce nesting: error paths are explicit at the top, happy path at lowest indentation.

**Never swallow errors**: Empty catch blocks hide bugs. At minimum, log the error and re-throw.
