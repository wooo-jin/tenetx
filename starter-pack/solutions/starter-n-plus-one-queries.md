---
name: starter-n-plus-one-queries
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - performance
  - database
  - n+1
  - query
  - batch
  - 성능
  - 데이터베이스
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
N+1 is the most common performance killer. Invisible in dev (10 rows), catastrophic in production (10,000 rows = 10,001 queries).

## Content
**The problem**: 1 query for a list, then N queries for related data per item.

**Fixes**: (1) **JOIN** — fetch everything in one query. (2) **Batch load** — collect all IDs, fetch with `WHERE id IN (...)`, map back. Result: 2 queries regardless of N. (3) **DataLoader** — automatic batching and per-request caching.

**Detection**: Enable query logging in dev. Same query template repeated N times = N+1 problem.
