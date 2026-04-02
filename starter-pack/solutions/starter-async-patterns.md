---
name: starter-async-patterns
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - async
  - promise
  - parallel
  - sequential
  - 비동기
  - 병렬처리
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
Misusing async/await causes silent bugs, performance problems (accidental sequential execution), and memory leaks (unbounded concurrency).

## Content
**Parallel** — `Promise.all` when operations are independent. **Sequential** — `for...of` when order matters. **Never `async` in `forEach`** — fires all callbacks simultaneously, returns void, silently drops errors.

**Bounded concurrency** with `p-limit`:
```typescript
const limit = pLimit(5);
await Promise.all(urls.map(url => limit(() => fetch(url))));
```

Use `Promise.allSettled` when partial failure is acceptable and you need all results.
