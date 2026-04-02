---
name: starter-input-validation
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - security
  - validation
  - input
  - zod
  - boundary
  - 보안
  - 입력검증
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
Every security vulnerability starts with trusting external input. SQL injection, XSS, and path traversal exploit unvalidated input passed to sensitive operations.

## Content
**Validate at system boundaries** (HTTP requests, file uploads, CLI args, env vars) using schema validation:

```typescript
const Schema = z.object({ email: z.string().email(), name: z.string().min(1).max(100) });
const input = Schema.parse(req.body); // throws if invalid
```

**Principle**: Parse, don't validate. Transform `unknown` into a typed shape at the boundary, then work with trusted types internally. Never rely on client-side validation alone. Never cast `req.body as T` without runtime validation.
