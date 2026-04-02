---
name: starter-tdd-red-green-refactor
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - tdd
  - test
  - workflow
  - red-green-refactor
  - 테스트
  - 테스트주도개발
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
Writing code first and testing later creates coverage gaps. TDD inverts this: prove the requirement as a failing test before writing production code.

## Content
**Red**: Write the smallest failing test. **Green**: Write minimum code to pass. **Refactor**: Clean up while tests stay green.

```typescript
// RED: it('returns 0 for empty cart', () => expect(calculateTotal([])).toBe(0));
// GREEN: const calculateTotal = (items: CartItem[]) => items.reduce((s,i) => s+i.price*i.qty, 0);
// REFACTOR: improve naming, extract helpers — re-run tests after each change
```

Rules: (1) No production code without a failing test. (2) Only enough to fail. (3) Only enough to pass. (4) Refactor only when green.
