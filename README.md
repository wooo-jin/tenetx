<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.svg" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>Claude Code plugin that learns your coding patterns.</strong>
</p>

<p align="center">
  <a href="https://github.com/wooo-jin/tenetx/actions/workflows/ci.yml"><img src="https://github.com/wooo-jin/tenetx/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://github.com/wooo-jin/tenetx/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/tests-passing-brightgreen.svg" alt="Tests"/></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#commands">Commands</a> &middot;
  <a href="README.ko.md">한국어</a>
</p>

---

## What is Tenetx?

Tenetx watches how you use Claude Code and **automatically writes rules that make Claude work better for you**.

```bash
npm install -g tenetx
tenetx                    # Start Claude Code with learning enabled
```

No configuration needed. Use Claude Code normally — tenetx learns in the background.

- **Day 1**: Detects your language, response style, and workflow preferences
- **Week 1**: Generates personalized `.claude/rules/` from observed patterns
- **Ongoing**: Patterns earn trust through evidence. Good ones get promoted, bad ones retire.

### Harness + Plugin

- **Harness mode** (`tenetx`): Full experience — profile update, rule generation, pattern extraction every session
- **Plugin mode** (`claude` directly): Hooks + MCP still work. Learning continues between harness runs.

Designed to coexist with other plugins (OMC, superpowers, claude-mem) — detects them at install time and disables overlapping workflow hooks. Core learning hooks always remain active. See [docs/with-omc.md](docs/with-omc.md) for details and known limitations.

---

## How It Works

```
You code normally
    ↓
Up to 19 hooks observe silently (prompt patterns, tool usage, code reflection)
    ↓
Patterns detected → Solutions stored → Evidence tracked
    ↓
Context compaction → Claude analyzes your thinking patterns (0 API cost)
    ↓
Next session: personalized rules auto-generated + feedback shown
```

### The Compound Loop

Technical solutions earn trust through real usage:

| Status | Confidence | How to reach |
|--------|-----------|--------------|
| experiment | 0.3 | Auto-extracted from git diff or Claude analysis |
| candidate | 0.55 | reflected >= 3 and sessions >= 3, or reExtracted >= 2 and reflected >= 1 |
| verified | 0.75 | reflected >= 4 and sessions >= 3, or reExtracted >= 2 |
| mature | 0.90 | reflected >= 8, sessions >= 5, negative <= 1, sustained 7+ days |

**Code Reflection** detects when Claude actually uses your pattern. Build/test failures automatically demote bad patterns. Circuit breaker auto-retires patterns with 2+ failures.

Behavioral learning is stored separately under `~/.compound/me/behavior/` and only feeds generated `.claude/rules/`. Technical compound knowledge remains under `~/.compound/me/solutions/`.

### What Gets Learned

Not just surface preferences ("use Korean") — **thinking patterns**:

- "This user always verifies before trusting" → skeptical review mode
- "This user prefers quality over speed" → thorough testing rules
- "This user plans before implementing" → design-first workflow
- "This user wants evidence, not intuition" → data-driven decisions

50+ learned preference/workflow/thinking patterns + Claude semantic analysis at compaction.

---

## Quick Start

```bash
# Install
npm install -g tenetx

# Option A: Harness mode (recommended)
tenetx                    # Wraps Claude Code with full learning
tenetx forge              # Profile your working style (optional, enhances learning)

# Option B: Plugin mode (if you prefer running claude directly)
# Hooks and MCP server are auto-registered at install. Just use claude as usual.
```

### Prerequisites

- **Node.js** >= 20
- **Claude Code** installed and authenticated

---

## Commands

```bash
tenetx                    # Start Claude Code with harness
tenetx forge              # Profile your working style (scan + interview)
tenetx me                 # Personal dashboard (profile, patterns, cost)
tenetx compound           # Preview auto compound analysis
tenetx compound --save    # Save previewed technical insights
tenetx compound interactive # Manually capture insights in a TTY session
tenetx lab                # Adaptive optimization metrics
tenetx cost               # Session cost tracking
tenetx config hooks       # Hook management
tenetx mcp                # MCP server management
tenetx notepad            # Session notepad
tenetx doctor             # System diagnostics
tenetx init               # Initialize a project
tenetx uninstall          # Remove tenetx cleanly
```

### MCP Tools (available to Claude during sessions)

| Tool | Purpose |
|------|---------|
| `compound-search` | Search accumulated knowledge by query |
| `compound-list` | List solutions with filters |
| `compound-read` | Read full solution content (no truncation) |
| `compound-stats` | Overview statistics |

Claude can pull knowledge on-demand via MCP. Hook injection pushes summaries automatically (Progressive Disclosure).

---

## Architecture

| Layer | Purpose | Components |
|-------|---------|------------|
| **Observe** | Watch how you work | Up to 19 hooks (compound-core 8, safety 4, workflow 7) |
| **Extract** | Find patterns | prompt-learner (50+ behavioral detectors) + compound-extractor (technical solutions) + Claude analysis (pre-compact) |
| **Profile** | Model your style | Forge (5 dimensions) + Lab (adaptive optimization) |
| **Inject** | Apply knowledge | .claude/rules/ + solution-injector (push) + MCP (pull) |
| **Measure** | Track evidence | Code Reflection, lifecycle promotion, session tracking |

### Forge — 5-Dimension Profile

```
Quality Focus    [########--] 0.80    Autonomy       [####------] 0.45
Risk Tolerance   [######----] 0.62    Abstraction    [#######---] 0.70
Communication    [#########-] 0.88
```

Lab auto-adjusts daily based on observed behavior (EMA α=0.15, max ±0.1/day).

### Plugin Coexistence

| Other Plugin | tenetx behavior |
|---|---|
| oh-my-claudecode | Yields 11 overlapping skills, 3 hooks. Compound-core stays active. |
| superpowers | Yields 4 overlapping skills. No hook conflict. |
| claude-mem | No conflict. Context budget reduced 50% for cooperation. |
| Unknown plugin | Detected via ~/.claude/plugins/. Conservative budget applied. |

### Token Efficiency

- **Progressive Disclosure**: Push 1-line summaries (~200 tokens), pull full content via MCP (0 ambient cost)
- **Conditional rules**: `.claude/rules/` files use `paths` frontmatter — loaded only when relevant files are touched
- **Prompt caching**: Rules are cached by Claude Code (10% cost after first turn)

---

## Safety

Hook system provides security by default:

- **secret-filter**: Masks API keys, tokens in tool output
- **db-guard**: Blocks DROP TABLE, TRUNCATE, dangerous SQL
- **pre-tool-use**: Blocks dangerous shell commands (rm -rf /, git push --force main)
- **rate-limiter**: Prevents excessive tool calls
- **slop-detector**: Warns on formulaic/low-quality responses
- **symlink protection**: Prevents arbitrary file reads via symlinks (8 locations)

All hooks fail-open on error (never breaks Claude Code). Timeout: 2-5 seconds per hook.

---

## Statistics

| Metric | Count |
|--------|-------|
| Source code | ~24K lines |
| Tests | 1.4K+ across 80+ files |
| Hook registry | 19 (workflow hooks auto-disable when overlapping plugins are present) |
| Detection patterns | 50+ |
| MCP tools | 4 |
| Dependencies | 3 (js-yaml, @modelcontextprotocol/sdk, zod) |

---

## Acknowledgements

Tenetx draws inspiration from [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) by Yeachan Heo. The multi-agent orchestration, magic keyword system, and the vision of enhancing Claude Code through a harness were deeply influenced by OMC's pioneering work.

**Where Tenetx diverges:** OMC gives powerful, general-purpose tools. Tenetx makes those tools **personal** — it watches how you work and adapts automatically.

---

## Contact

- **Author:** Woojin Jang
- **LinkedIn:** [linkedin.com/in/우진-장-1567aa294](https://www.linkedin.com/in/%EC%9A%B0%EC%A7%84-%EC%9E%A5-1567aa294/)
- **GitHub:** [@wooo-jin](https://github.com/wooo-jin)

---

## License

MIT
