---
name: starter-caching-strategy
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - performance
  - cache
  - ttl
  - invalidation
  - 성능
  - 캐싱
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
Caching is powerful but incorrect invalidation causes stale data bugs that are hard to reproduce.

## Content
**When to cache**: Read-heavy, rarely changing, expensive to compute. Never cache real-time data (balances, inventory at checkout).

**TTL-based**: Set time-to-live, accept temporary staleness. Simplest strategy.
**Event-based**: Explicitly clear cache on mutations. No staleness but more complex.
**Hybrid (recommended)**: Event-based for known mutations + TTL as safety net.

**Cache key design**: Include all result-affecting params: `user:${id}:orders:page=${p}`.

**Anti-patterns**: (1) No invalidation strategy. (2) Long TTLs on mutable data. (3) Cache stampede on TTL expiry — fix with stale-while-revalidate or mutex.
