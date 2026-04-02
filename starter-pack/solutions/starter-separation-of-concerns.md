---
name: starter-separation-of-concerns
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - architecture
  - separation
  - pure
  - function
  - 관심사분리
  - 아키텍처
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
When business logic is entangled with HTTP, database, and logging, testing requires the entire stack and changes to one concern break others.

## Content
Separate by dependency: **Pure logic** (no I/O, trivially testable) / **I/O adapters** (thin DB/HTTP wrappers) / **Orchestration** (glues pure + I/O with async/await and error handling).

Pure functions take data in, return data out — no mocks needed for testing. Adapters convert external formats to domain types. Orchestration is thin glue that's already tested through its components.

**Test strategy**: Unit test pure logic exhaustively (fast). Integration test adapters. Orchestration needs minimal tests.
