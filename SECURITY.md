# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.6.x   | ✅ Yes    |
| < 1.6.0 | ❌ No     |

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
- Hook execution security (shell injection risks)
- Pack loading and trust boundaries
- Credential and token handling

Out of scope:

- Third-party tools invoked by tenetx (Claude, Codex, Gemini)
- Issues in user-authored packs or skills
- Social engineering attacks

## Security Design Notes

tenetx runs shell hooks and loads external packs. Users should:

- Only install packs from trusted sources
- Review hook definitions before enabling them
- Never store secrets in pack config files — use environment variables
