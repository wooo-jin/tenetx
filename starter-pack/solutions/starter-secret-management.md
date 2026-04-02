---
name: starter-secret-management
version: 1
status: verified
confidence: 0.70
type: pattern
scope: me
tags:
  - security
  - secret
  - env
  - api-key
  - credential
  - 보안
  - 시크릿
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
Hardcoded secrets in source code are the top cause of credential leaks. Once in git history, a secret is compromised — deleting it later doesn't remove it from history.

## Content
**Never put secrets in source code.** Use env vars as baseline. Validate required vars at startup — fail fast if missing. Commit `.env.example` with placeholder values, gitignore all real `.env` files.

**Escalation**: Local dev uses `.env`. Production uses a secret manager (AWS Secrets Manager, Vault, Doppler) with IAM access.

**If leaked**: (1) Rotate immediately. (2) Audit access logs. (3) Remove from history with `git filter-repo`. (4) Assume compromised from moment of commit.
