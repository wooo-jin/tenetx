---
name: starter-dependency-injection
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - di
  - dependency
  - injection
  - testing
  - mock
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
Direct imports prevent substituting dependencies in tests, forcing integration tests for everything.

## Content
Pass dependencies as parameters — function arguments are the simplest DI, no framework needed.
```typescript
interface Deps { db: Database; mailer: Mailer; }
export const createUserService = ({ db, mailer }: Deps) => async (data: CreateUserInput) => {
  const user = await db.insert('users', data);
  await mailer.send(user.email, 'Welcome!');
  return user;
};
```
In tests, inject fakes via `vi.fn()` and assert on calls. Production wires real implementations.
