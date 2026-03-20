# Pack Guide

Packs are the knowledge-sharing layer of Tenetx. A pack bundles rules, solutions, skills, agents, and workflows into a shareable unit — a senior engineer designs it once, and the entire team gets the same AI environment automatically.

This guide covers everything from creating your first pack to running multi-pack layered setups at org scale.

---

## What Are Packs?

A pack is a directory containing any combination of:

| Asset | What it does |
|-------|-------------|
| `philosophy.json` | Declares team principles that generate hooks, routing, and alerts |
| `rules/` | Markdown rules injected into every Claude session |
| `solutions/` | Validated patterns injected when relevant keywords are detected |
| `skills/` | Auto-injected skill context triggered by prompt keywords |
| `agents/` | Custom agents installed into `.claude/agents/` |
| `workflows/` | Custom execution modes available as `tenetx --{name}` |

Packs live in three scopes:

| Scope | Location | When loaded |
|-------|----------|-------------|
| **Me** | `~/.compound/me/` | Always (your personal collection) |
| **Pack** | `~/.compound/packs/{name}/` | When connected to the current project |
| **Project** | `{repo}/.compound/` | In that specific repo |

---

## Pack Directory Structure

```
my-team-pack/
├── pack.json              # Pack metadata (required)
├── philosophy.json        # Team philosophy / principles
├── rules/                 # Team rules (.md files)
│   ├── code-style.md
│   └── review-checklist.md
├── solutions/             # Validated solution patterns (.md files)
│   └── api-error-handling.md
├── skills/                # Auto-injected skills (.md files)
│   ├── deploy-check.md
│   └── db-migration.md
├── agents/                # Custom Claude Code agents (.md files)
│   └── domain-reviewer.md
└── workflows/             # Custom execution modes (.json files)
    └── team-review.json
```

None of these subdirectories are required — start with just `pack.json` and add what you need.

---

## Creating a Pack

### Scaffolded creation

```bash
tenetx pack init my-team-pack
```

Creates `~/.compound/packs/my-team-pack/` with the full directory structure and a starter `pack.json`.

### From existing project

```bash
tenetx pack init my-pack --from-project
```

Extracts rules and solutions already present in your current project's `.compound/` directory.

### Using a starter template

```bash
tenetx pack init my-pack --starter backend
```

Available starters: `frontend`, `backend`, `devops`, `security`, `data`.

---

## pack.json — Pack Metadata

Every pack requires a `pack.json`:

```json
{
  "name": "my-team-pack",
  "version": "1.0.0",
  "remote": {
    "type": "github",
    "url": "https://github.com/your-org/my-team-pack",
    "auto_sync": true
  },
  "provides": {
    "rules": 2,
    "solutions": 1,
    "skills": 2,
    "agents": 1,
    "workflows": 1
  }
}
```

| Field | Description |
|-------|-------------|
| `name` | Unique pack identifier (alphanumeric, hyphens allowed) |
| `version` | Semantic version |
| `remote.type` | `"github"` or `"local"` |
| `remote.url` | GitHub URL or local path |
| `remote.auto_sync` | Pull latest on every `tenetx` startup |
| `provides` | Asset counts (auto-updated by `tenetx pack sync`) |

---

## Installing Packs

### From GitHub

```bash
# Full URL
tenetx pack install https://github.com/your-org/my-team-pack

# Short form (owner/repo)
tenetx pack install your-org/my-team-pack
```

### From local path

```bash
tenetx pack install ~/shared/company-standards
```

Installed packs are stored at `~/.compound/packs/{name}/`.

---

## Connecting Packs to a Project

Installing a pack makes it available globally but doesn't activate it for any project. You need to connect it:

### One-click setup (recommended)

```bash
tenetx pack setup your-org/my-team-pack
```

This runs all steps in sequence: install → connect → sync → dependency check.

### Manual steps

```bash
# 1. Install the pack globally
tenetx pack install your-org/my-team-pack

# 2. Connect to the current project
tenetx pack add my-team-pack --repo your-org/my-team-pack

# 3. Sync latest content
tenetx pack sync my-team-pack
```

Check what's connected to the current project:

```bash
tenetx pack connected
```

### Connecting multiple packs

```bash
tenetx pack setup your-org/org-standards
tenetx pack setup your-org/emr-domain
tenetx pack setup your-org/team-workflows
```

---

## Pack Auto-Sync

When `auto_sync: true` in `pack.json`, Tenetx pulls the latest version from GitHub at session start. If the pack is on the same commit, nothing happens (no delay).

Force a sync at any time:

```bash
tenetx pack sync              # Sync all connected packs
tenetx pack sync my-team-pack # Sync a specific pack
```

---

## Pack Version Locking

For production teams that need reproducible environments:

```bash
# Pin all connected packs to their current commit SHA
tenetx pack lock

# Commit the lock file so teammates use the same versions
git add .compound/pack.lock
git commit -m "Lock pack versions for release"
```

When `pack.lock` exists, `auto_sync` is suppressed at startup. Tenetx shows an "updates available" notice instead of auto-pulling.

```bash
# Check what updates are available
tenetx pack outdated

# Apply updates and re-lock
tenetx pack sync
tenetx pack lock
git add .compound/pack.lock && git commit -m "Update pack versions"

# Remove lock (re-enable auto-sync)
tenetx pack unlock
```

---

## Pack Inheritance

A pack or project philosophy can extend another pack's principles:

```yaml
# project philosophy.yaml
name: "my-project"
extends:
  - github: https://github.com/your-org/tenetx-pack-core
  - local: ~/company-standards
```

Or in `philosophy.json`:

```json
{
  "name": "project-philosophy",
  "extends": "pack:my-team-pack",
  "principles": {
    "project-specific-rule": {
      "belief": "...",
      "generates": ["..."]
    }
  }
}
```

The parent pack's principles are loaded first, then the child's principles are merged in. Child principles with the same name override the parent.

---

## Writing Pack Assets

### rules/

Each `.md` file is one rule. Rules are injected into `.claude/rules/compound.md` for every session in the connected project.

```markdown
# API Response Format Standard

All API responses must follow this structure:
- Success: `{ data: T, meta?: { ... } }`
- Error: `{ error: { code: string, message: string } }`
- Pagination: `{ data: T[], meta: { total, page, limit } }`
```

Tips:
- One file = one concern
- Start with `# Rule Title` (used in listings)
- Keep rules concrete and actionable

---

### solutions/

Validated patterns extracted from real incidents. The `solution-injector` hook matches these against prompts and surfaces them automatically.

```markdown
# Redis Cache Invalidation Pattern

## Problem
Cached API responses served stale data after DB updates.

## Solution
Write-through + TTL combination:
- On write: immediately delete the cache key (invalidate)
- On read: cache miss → query DB → cache with 30-minute TTL
- Batch updates: prefix-based bulk delete

## Where to apply
`src/cache/` — all cache wrapper classes
```

---

### skills/

Skills are injected into Claude's context when prompt keywords match the `triggers` list.

```markdown
---
name: deploy-check
description: Deploy pre-flight checklist
triggers:
  - "deploy"
  - "release"
  - "릴리즈"
---
<Purpose>
Ensure all deployment prerequisites are met before going live.
</Purpose>

<Steps>
1. Confirm `npm test` passes fully
2. Confirm `npm run build` succeeds
3. Review env var diff (.env.example vs production)
4. Check if DB migrations are needed
5. Prepare rollback plan
</Steps>

<Constraints>
- Production deploys require staging validation
- No deploys on Friday afternoons
</Constraints>
```

Required frontmatter fields:

| Field | Required | Description |
|-------|:--------:|-------------|
| `name` | ✅ | Unique skill identifier |
| `description` | ✅ | One-line description |
| `triggers` | ✅ | Keyword array (case-insensitive) |

Skills are also installed as slash commands: `/tenetx:pack-{name}-{skill}`.

---

### agents/

Custom Claude Code agents deployed to `.claude/agents/pack-{packname}-{filename}.md`:

```markdown
---
name: emr-domain-reviewer
description: EMR domain specialist code reviewer
---

You are a code reviewer specialized in Electronic Medical Records (EMR) systems.

## Expertise
- FHIR resource structure validation
- Medical data security regulations (HIPAA)
- HL7 message format validation

## Review Criteria
1. Patient data access must have audit logs
2. Validate ICD-10 diagnosis codes
3. Check multilingual handling for medical terms
```

Add `<!-- tenetx-managed -->` to allow automatic overwrites on pack sync. Without it, user modifications are protected.

---

### workflows/

Custom execution modes available as `tenetx --{name}`:

```json
{
  "name": "emr-review",
  "description": "EMR code review pipeline (security + domain + performance)",
  "claudeArgs": [],
  "envOverrides": {
    "COMPOUND_REVIEW_SCOPE": "security,domain,performance"
  },
  "principle": "understand-before-act",
  "persistent": false,
  "composedOf": ["ralph"]
}
```

| Field | Required | Default | Description |
|-------|:--------:|---------|-------------|
| `name` | ✅ | — | Mode name (used as CLI flag) |
| `description` | ✅ | — | Human-readable description |
| `claudeArgs` | | `[]` | Extra Claude Code CLI arguments |
| `envOverrides` | | `{}` | Environment variable overrides |
| `principle` | | `"-"` | Associated philosophy principle |
| `persistent` | | `false` | Keep state between sessions |
| `composedOf` | | — | Built-in modes to compose with |

---

## Declaring Dependencies

Declare what your pack needs to function. `tenetx pack setup` and `tenetx doctor` check these automatically:

```json
{
  "name": "emr-pack",
  "version": "1.0.0",
  "requires": {
    "mcpServers": [
      {
        "name": "context7",
        "npm": "@context7/mcp-server",
        "description": "Library documentation search"
      }
    ],
    "tools": [
      {
        "name": "gh",
        "installCmd": "brew install gh",
        "description": "GitHub CLI for team PR features"
      }
    ],
    "envVars": [
      {
        "name": "ANTHROPIC_API_KEY",
        "description": "Claude API key",
        "required": true
      }
    ]
  }
}
```

---

## Publishing a Pack

```bash
cd ~/.compound/packs/my-team-pack
git init
git add .
git commit -m "Initial pack"
gh repo create your-org/my-team-pack --push --source .
```

Teammates install it with:

```bash
tenetx pack setup your-org/my-team-pack
```

---

## Proposing Patterns to Your Team

When you discover something worth sharing from a personal session:

```bash
# After running tenetx compound, propose a personal pattern to a team pack
tenetx propose caching-strategy --to my-team-pack
```

The team lead reviews proposals:

```bash
tenetx proposals    # Interactive UI: approve / reject / modify
```

Approved proposals are merged into the pack and synced to all teammates on next session start.

---

## Multi-Pack Composition

Connect multiple packs to layer knowledge:

```
Project A:
  ├── org-standards      (org-wide: code style, security)
  ├── emr-domain         (EMR: medical terms, FHIR)
  └── team-workflows     (our team's custom modes)

Project B:
  ├── org-standards      (same org layer)
  ├── fintech-domain     (PCI-DSS, payments)
  └── team-workflows     (same team layer)
```

**Conflict resolution:** When the same asset name appears in multiple packs, the first-connected pack wins.

```bash
# Connection order = priority
tenetx pack add high-priority --repo your-org/important
tenetx pack add low-priority --repo your-org/fallback
```

---

## Design Principles

### One pack, one concern

```
✅ Good:
  emr-security-pack/     — EMR security rules only
  api-standards-pack/    — API design standards only

❌ Avoid:
  everything-pack/       — One pack for everything
```

### Grow incrementally

Don't try to fill every directory at once:

```
Phase 1: rules/ + philosophy.json     → standardize team rules
Phase 2: + solutions/                 → accumulate validated patterns
Phase 3: + skills/                    → automate repetitive workflows
Phase 4: + agents/ + workflows/       → custom team pipelines
```

---

## FAQ

**Can I use a private GitHub repo for a pack?**
Yes. Any repo accessible to your `gh auth login` account works.

**How do teammates receive pack updates?**
Push to your pack repo. Teammates with `auto_sync: true` get updates on the next `tenetx` start. Those with `pack.lock` see an "update available" notice instead.

**Can a teammate customize a pack agent locally?**
Yes. Edit `.claude/agents/pack-{name}-{file}.md` directly. The hash-protection system detects the modification and skips that file on future syncs.

**What's the difference between a skill and an agent?**
- **Skill**: Automatically injected into context when prompt keywords match. No explicit invocation needed.
- **Agent**: A specialized role invoked explicitly by Claude via the `Agent` tool for subtasks requiring deep domain focus.

**How does `tenetx compound` interact with packs?**
`tenetx compound` extracts patterns from your session and saves them to `~/.compound/me/`. If the pattern is team-worthy, use `tenetx propose` to submit it to a pack for team review and adoption.
