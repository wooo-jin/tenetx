# Getting Started with Tenetx

Install and start learning in 2 minutes.

---

## Prerequisites

- **Node.js** >= 20
- **Claude Code** installed and authenticated (`claude --version` should work)

---

## Installation

```bash
npm install -g tenetx
```

Installation automatically:
1. Creates `~/.compound/` — your personal knowledge directory
2. Registers tenetx as a Claude Code plugin (hooks + MCP server)
3. Configures `~/.claude/settings.json`

---

## First Session

```bash
tenetx
```

That's it. Tenetx wraps Claude Code and starts learning silently. You'll see Claude Code open as normal — but 16 hooks are now observing your patterns.

### What happens in the background

- **prompt-learner** records your prompts and detects preferences (35 patterns)
- **post-tool-use** tracks modified files and tool usage
- **pre-tool-use** runs Code Reflection (detects when Claude uses your patterns)
- **solution-injector** pushes relevant knowledge when it matches your prompt
- **session-recovery** shows what was learned at next session start

### Optional: Profile your style

```bash
tenetx forge
```

Scans your project and asks questions to build a 5-dimension profile (quality, autonomy, communication, risk, abstraction). This enhances learning quality but isn't required.

---

## Plugin Mode (Alternative)

If you prefer running `claude` directly, tenetx works as a plugin too:

```bash
claude                    # Hooks + MCP server fire automatically
```

The difference: harness mode (`tenetx`) updates your profile and regenerates rules every session. Plugin mode uses rules from the last harness run.

---

## Commands

```bash
tenetx                    # Start with harness (recommended)
tenetx forge              # Profile your working style
tenetx me                 # Personal dashboard (profile, patterns, cost)
tenetx compound           # View accumulated knowledge
tenetx lab                # Adaptive optimization metrics
tenetx cost               # Session cost tracking
tenetx config hooks       # Hook management
tenetx mcp                # MCP server management
tenetx notepad            # Session notepad
tenetx doctor             # System diagnostics
tenetx init               # Initialize project
tenetx uninstall          # Remove tenetx cleanly
```

---

## Verify Everything Works

```bash
tenetx doctor
```

Checks Node.js version, Claude Code installation, `~/.compound/` structure, plugin registration, and hook status.

---

## Next Steps

- Run `tenetx me` after a few sessions to see what tenetx learned
- Check `~/.compound/me/solutions/` for accumulated patterns
- Read the [README](../README.md) for architecture details
