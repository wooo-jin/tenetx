<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>The Claude Code harness that learns from you.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#commands">Commands</a> &middot;
  <a href="README.ko.md">한국어</a>
</p>

---

## The more you use Claude, the better it knows you.

Tenetx wraps Claude Code as a **personalization harness**. It profiles your work style across 4 axes, learns from your corrections, and adapts Claude's behavior over time.

```bash
npm install -g tenetx
tenetx                    # Use this instead of `claude`
```

---

## Quick Start

```bash
# Install
npm install -g tenetx

# First run — 4-question onboarding (English/Korean)
tenetx

# Daily use (instead of `claude`)
tenetx
```

### Prerequisites

- **Node.js** >= 20 (>= 22 recommended for session-search)
- **Claude Code** installed and authenticated (`npm i -g @anthropic-ai/claude-code`)

---

## How It Works

### 4-Axis Personalization

Tenetx profiles you across 4 axes, each with a pack and fine-grained facets:

| Axis | Packs | What it controls |
|------|-------|-----------------|
| **Quality/Safety** | Conservative / Balanced / Speed-first | Verification depth, stop threshold, change scope |
| **Autonomy** | Confirm-first / Balanced / Autonomous | When to ask, scope expansion, assumption tolerance |
| **Judgment** | Minimal-change / Balanced / Structural | Refactoring bias, abstraction preference |
| **Communication** | Concise / Balanced / Detailed | Explanation depth, report structure, teaching style |

### Learning Loop

```
Onboarding (4 questions)
    → Profile created with pack + facets + trust policy
    → Rules rendered to .claude/rules/v1-rules.md

Session runs
    → Claude follows your personalized rules
    → You correct Claude → correction-record MCP tool → Evidence stored
    → Behavioral patterns observed

Session ends
    → Auto-compound extracts solutions + session learning summary
    → Facet deltas applied to profile (micro-adjustments)
    → Workflow patterns accumulated

Next session
    → Updated rules rendered (corrections included)
    → Mismatch detection (rolling 3-session check)
    → Compound knowledge searchable via MCP
```

### Compound Knowledge

Knowledge accumulates across sessions:

- **Solutions** — reusable patterns with context
- **Skills** — promoted from verified solutions
- **Evidence** — corrections and behavioral observations
- **Workflow patterns** — repeated action sequences (auto-detected, applied at 3+ observations)

Claude searches this knowledge via MCP tools (`compound-search`, `compound-read`).

---

## Commands

```bash
tenetx                          # Start Claude Code with personalization
tenetx onboarding               # Run 4-question onboarding
tenetx forge                    # Profile management (--profile, --export, --reset)
tenetx inspect profile          # View your 4-axis profile + facets
tenetx inspect rules            # View active/suppressed rules
tenetx inspect evidence         # View correction history
tenetx inspect session          # View current session state
tenetx compound                 # Manage accumulated knowledge
tenetx compound --save          # Save auto-analyzed patterns
tenetx skill promote <name>     # Promote solution to skill
tenetx init                     # Initialize project
tenetx doctor                   # System diagnostics
tenetx uninstall                # Remove tenetx cleanly
```

### MCP Tools (available to Claude during sessions)

| Tool | Purpose |
|------|---------|
| `compound-search` | Search accumulated knowledge by query |
| `compound-read` | Read full solution content |
| `compound-list` | List solutions with filters |
| `compound-stats` | Overview statistics |
| `session-search` | Search past session conversations |
| `correction-record` | Record user corrections as structured evidence |

---

## Architecture

```
~/.tenetx/                       ← v1 personalization home
├── me/
│   ├── forge-profile.json       ← 4-axis profile (packs + facets + trust)
│   ├── rules/                   ← structured Rule store (JSON per rule)
│   ├── behavior/                ← Evidence store (corrections + observations)
│   ├── recommendations/         ← Pack recommendations (onboarding + mismatch)
│   └── solutions/               ← Compound knowledge
├── state/
│   ├── sessions/                ← Session effective state snapshots
│   └── raw-logs/                ← Raw session logs (7-day TTL)
└── config.json                  ← Global config (locale, trust, packs)

~/.claude/
├── settings.json                ← Hooks + env vars injected by harness
├── rules/
│   ├── forge-behavioral.md      ← Learned patterns (global, all projects)
│   └── v1-rules.md              ← Rendered personalization rules (per project)
├── commands/tenetx/             ← Slash commands (19 skills)
└── .claude.json                 ← MCP server registration

~/.compound/                     ← Legacy compound home (hooks/MCP still reference)
├── me/
│   ├── solutions/               ← Accumulated compound knowledge
│   ├── behavior/                ← Behavioral patterns
│   └── skills/                  ← Promoted skills
└── sessions.db                  ← SQLite session history (Node.js 22+)
```

### Key Design Decisions

- **4-axis personalization** — not just preferences, but structured packs with fine-grained facets
- **Evidence-based learning** — corrections are structured data, not regex pattern matching
- **AI judgment boundary** — hooks collect events, Claude interprets, algorithms apply
- **Pack + overlay model** — stable base pack, personalized via facet adjustments over time
- **Mismatch detection** — rolling 3-session analysis flags when your pack no longer fits
- **i18n** — English/Korean, selected at onboarding, applied throughout

---

## Safety

Active hooks (auto-registered):

| Hook | What it does |
|------|-------------|
| `pre-tool-use` | Blocks dangerous commands (rm -rf, curl\|sh, force-push) |
| `db-guard` | Blocks dangerous SQL (DROP TABLE, WHERE-less DELETE) |
| `secret-filter` | Warns on API key exposure |
| `slop-detector` | Detects AI slop (TODO remnants, eslint-disable, as any) |
| `prompt-injection-filter` | Blocks prompt injection attempts |
| `context-guard` | Warns on context limit approach |

---

## Coexistence

Tenetx detects other plugins (oh-my-claudecode, superpowers, claude-mem) at install time and disables overlapping hooks. Core safety and compound hooks always remain active.

---

## License

MIT
