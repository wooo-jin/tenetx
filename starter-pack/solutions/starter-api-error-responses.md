---
name: starter-api-error-responses
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - api
  - error
  - response
  - rest
  - format
  - API에러
  - 응답형식
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
Inconsistent error responses force API consumers to write special-case handling per endpoint.

## Content
Every error uses the **same envelope**: `{ error: { code, message, details?, requestId } }`.

Use a centralized error handler that catches `AppError` subclasses and maps them to HTTP responses. Unknown errors return 500 with no internal details exposed.

Rules: (1) Machine-readable `code` for client switching — never match on `message`. (2) Never expose stack traces in production. (3) Include `requestId` for log correlation. (4) Correct HTTP status codes — never 200 for failures.
