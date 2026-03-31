# Getting Started with Tenetx

Get from zero to a philosophy-driven Claude Code session in 5 minutes.

---

## Prerequisites

- **Node.js** >= 20
- **Claude Code** installed and authenticated (`claude --version` should work)

---

## Installation

```bash
npm install -g tenetx
```

Verify installation:

```bash
tenetx --version
```

---

## First Run

Run tenetx for the first time — it automatically sets up your environment:

```bash
tenetx
```

On first run, tenetx will:
1. Create `~/.compound/` — your personal knowledge directory
2. Generate a default configuration
3. Inject hooks and routing into `~/.claude/settings.json`

**What it creates:**

```
~/.compound/
├── me/
│   ├── rules/          # Your personal rules
│   └── solutions/      # Your accumulated solutions
├── sessions/           # Session logs
└── state/              # Runtime state
```

---

## Your First Session

From any project directory, run:

```bash
cd /path/to/your/project
tenetx
```

This runs Tenetx's harness before launching Claude Code. Under the hood it:
- Loads your `philosophy.yaml`
- Injects 14 hooks into Claude Code's settings
- Installs 19 built-in agents into `.claude/agents/`
- Registers skills as slash commands (`/tenetx:autopilot`, etc.)
- Launches Claude Code with everything configured

You'll see Claude Code open exactly as normal — but your philosophy is now active.

### Start with a prompt

```bash
tenetx "Refactor the authentication module"
```

### Use an execution mode

```bash
tenetx --autopilot "Build user profile page"   # 5-stage autonomous pipeline
tenetx --ralph "Fix the failing tests"          # PRD-based completion guarantee
tenetx --team "Redesign the data layer"         # Multi-agent parallel pipeline
```

### Magic keywords (no flags needed)

Just type these anywhere in your prompt inside Claude Code:

```
autopilot <task>        5-stage autonomous pipeline
ralph <task>            PRD-based completion loop
ultrawork <task>        Maximum parallelism burst
tdd                     Test-driven development
ultrathink              Extended reasoning
deepsearch              Deep codebase search
```

---

## The Compound Loop

After a meaningful session, extract and accumulate what you learned:

```bash
tenetx compound
```

This analyzes your session logs and extracts:
- **Patterns** — recurring approaches worth reusing
- **Solutions** — specific fixes with context
- **Rules** — prevention rules derived from failures
- **Golden prompts** — effective prompt templates

Extracted knowledge is saved to `~/.compound/me/` and auto-injected into future sessions via the `solution-injector` hook.

---

## Project-Specific Philosophy

To give a project its own philosophy (separate from your global one):

```bash
cd /path/to/project
tenetx setup --project
```

Or auto-detect and initialize:

```bash
tenetx init          # Auto-detect project type (frontend/backend/etc.)
tenetx init --team   # Initialize a team pack in the repo
```

---

## Verify Everything Works

```bash
tenetx doctor
```

Checks Node.js version, Claude Code installation, `~/.compound/` structure, and settings injection status.

---

## Next Steps

- **[Hooks Reference](hooks-reference.md)** — understand every hook Tenetx injects
- **[Pack Guide](pack-guide.md)** — share knowledge with your team using packs
- **[README](../README.md)** — full command reference (45+ commands)

### Useful commands to explore

```bash
tenetx philosophy show     # View your current philosophy
tenetx philosophy edit     # Edit philosophy.yaml
tenetx stats               # Session statistics
tenetx rules               # View active rules
tenetx pack list           # List installed packs
tenetx dashboard           # Governance dashboard
```
