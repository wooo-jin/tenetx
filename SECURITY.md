# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.0.x   | ✅ Yes    |
| < 3.0.0 | ❌ No     |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

### Option 1: GitHub Security Advisories (Preferred)

Use GitHub's private [Security Advisories](https://github.com/wooo-jin/tenetx/security/advisories/new) to report vulnerabilities confidentially.

### Option 2: Email

Send a report to **security@tenetx.dev** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Any suggested mitigations (optional)

### Response Timeline

| Stage | Timeline |
|-------|----------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 5 business days |
| Resolution or mitigation plan | Within 30 days |
| Public disclosure | Coordinated with reporter |

We appreciate responsible disclosure and will credit reporters in the release notes unless you prefer to remain anonymous.

## Scope

This policy covers:

- The `tenetx` CLI tool and its core libraries
- Hook execution security (shell injection, symlink attacks)
- Solution file handling (YAML parsing, prompt injection defense)
- Credential and token handling (secret-filter hook)
- Plugin registration and settings.json modifications

Out of scope:

- Third-party tools invoked by tenetx (Claude Code, Codex, Gemini)
- Issues in user-authored skills
- Social engineering attacks

## Security Design Notes

tenetx runs 16 shell hooks on Claude Code lifecycle events. Security measures:

- All hooks fail-open on error (never breaks Claude Code)
- Symlink protection on all file reads (8 locations)
- `execFileSync` only (no shell interpolation)
- SUDO_USER validated with strict regex before use
- Settings.json protected by lockfile + atomic write + backup
- Prompt injection defense: 13 patterns + Unicode NFKC + XML escaping
- Solution files: YAML bomb protection (5KB frontmatter cap, 3 anchor limit)
