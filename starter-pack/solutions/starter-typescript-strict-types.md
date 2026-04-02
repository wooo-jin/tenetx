---
name: starter-typescript-strict-types
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - typescript
  - type
  - strict
  - any
  - union
  - 타입
  - 타입스크립트
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
Using `any` silences the compiler at the cost of runtime errors. Discriminated unions make complex state type-safe and self-documenting.

## Content
**Eliminate `any`** — use `unknown` + type guards when type is genuinely unknown.

**Discriminated unions** for mutually exclusive states:
```typescript
type State<T> = { status:'idle' } | { status:'loading' } | { status:'ok'; data:T } | { status:'error'; error:Error };
```
Compiler enforces `data` only exists on `ok`, `error` only on `error`. Prefer `satisfies` over type assertions — validates shape without widening.
