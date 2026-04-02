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

## What is Tenetx?

Tenetx wraps Claude Code as a **harness** — it spawns `claude`, watches your sessions, and **automatically accumulates reusable knowledge** that makes Claude better for you over time.

```bash
npm install -g tenetx
tenetx                    # Use this instead of `claude`
```

### What happens when you use `tenetx`:

1. **Project facts** auto-detected (TypeScript? Vitest? CI?) → `.claude/rules/project-context.md`
2. **Safety hooks** active — dangerous commands blocked, secrets filtered
3. **Compound knowledge** searchable — Claude proactively searches past patterns via MCP
4. **Session ends** → auto-compound extracts reusable patterns from the conversation
5. **Next session** → Claude uses accumulated knowledge to give better answers

### User journey

```
npm i -g tenetx          → Install: hooks, MCP, skills registered
tenetx forge             → One-time interview: set your preferences (global)
tenetx                   → Daily use: Claude + safety + compound + auto-learning
/compound                → Optional: manually extract patterns mid-session
```

---

## Quick Start

```bash
# Install
npm install -g tenetx

# Personalize (one-time, optional)
tenetx forge

# Use daily (instead of `claude`)
tenetx
```

### Prerequisites

- **Node.js** >= 22 (for built-in SQLite session search)
- **Claude Code** installed and authenticated (`npm i -g @anthropic-ai/claude-code`)

---

## How It Works

```
tenetx (harness mode)
├── Spawns claude with safety hooks + project facts
├── Session runs normally — you work as usual
├── Session ends (exit, /new, /compact)
│   ├── Transcript analyzed by Claude (auto-compound)
│   ├── Reusable patterns saved to ~/.compound/me/solutions/
│   └── User patterns observed → ~/.compound/me/behavior/
└── Next session
    ├── MCP instructions tell Claude about compound knowledge
    ├── Claude proactively searches past patterns
    └── Accumulated knowledge improves answers
```

### Compound Knowledge

Knowledge accumulates across sessions:

- **Solutions** — reusable patterns with "why" context
- **Skills** — promoted from verified solutions via `tenetx skill promote`
- **Behavioral patterns** — observed user habits auto-accumulated in `~/.compound/me/behavior/`, converted to `.claude/rules/forge-behavioral.md`

Claude searches this knowledge via MCP tools (`compound-search` → `compound-read`).
No regex matching — **Claude decides what's relevant**.

### Forge (Personalization)

One-time interview sets your preferences:

```bash
tenetx forge
```

- Generates **global rules** (`~/.claude/rules/forge-*.md`) based on your work style
- Quality focus, risk tolerance, communication style, etc.
- **Project scan is facts only** — "TypeScript, Vitest, ESLint" (not preference inference)

### Safety

Active hooks (settings.json registered):

| Hook | What it does |
|------|-------------|
| `pre-tool-use` | Blocks dangerous commands (rm -rf, curl\|sh, force-push) |
| `db-guard` | Blocks dangerous SQL (DROP TABLE, WHERE-less DELETE) |
| `secret-filter` | Warns on API key exposure |
| `slop-detector` | Detects AI slop (TODO remnants, eslint-disable, as any) |
| `context-guard` | Warns on context limit approach |
| `rate-limiter` | MCP tool rate limiting |

Security scan uses **severity classification** (block/warn) with exfiltration and obfuscation detection.

---

## Commands

```bash
tenetx                    # Start Claude Code (harness mode)
tenetx forge              # Personalize your profile
tenetx compound           # Manage accumulated knowledge
tenetx compound --save    # Save auto-analyzed patterns
tenetx skill promote <n>  # Promote verified solution to skill
tenetx skill list         # List promoted skills
tenetx me                 # Personal dashboard
tenetx config hooks       # Hook management
tenetx doctor             # System diagnostics
tenetx uninstall          # Remove tenetx cleanly
```

### MCP Tools (available to Claude during sessions)

| Tool | Purpose |
|------|---------|
| `compound-search` | Search accumulated knowledge by query (with content preview) |
| `compound-read` | Read full solution content |
| `compound-list` | List solutions with filters |
| `compound-stats` | Overview statistics |
| `session-search` | Search past session conversations (tokenized, with context window) |

---

## Architecture

```
~/.claude/
├── settings.json          ← hooks registered here (absolute paths)
├── rules/
│   └── forge-*.md         ← global user preferences (from interview)
├── skills/
│   └── {promoted}/SKILL.md ← promoted skills (Claude Code auto-recognizes)
└── .claude.json           ← MCP server registered here

{project}/
└── .claude/
    ├── rules/
    │   └── project-context.md  ← project facts (auto-scanned)
    └── agents/
        └── ch-*.md             ← custom agents with memory + MCP access

~/.compound/
├── me/
│   ├── solutions/         ← accumulated compound knowledge
│   ├── skills/            ← promoted skills (tenetx managed copy)
│   ├── behavior/          ← observed user patterns → forge-behavioral.md
│   └── forge-profile.json ← personality dimensions
├── sessions.db            ← SQLite session history (Node.js 22+ built-in)
└── state/                 ← auto-compound state
```

### Key Design Decisions

- **Harness, not just plugin** — `tenetx` spawns `claude` and controls session lifecycle
- **Claude is the extractor** — no regex pattern matching; Claude analyzes conversations
- **Pull, not push** — MCP instructions guide Claude to search knowledge; no forced injection
- **Facts, not inference** — project scan collects facts; preferences come from interview only
- **Security by severity** — block vs warn classification prevents false-positive knowledge loss

---

## Coexistence

Tenetx detects other plugins (oh-my-claudecode, superpowers, claude-mem) at install time and disables overlapping workflow hooks. Core safety and compound hooks always remain active.

---

## License

MIT
