<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>The Claude Code personalization harness.</strong><br/>
  <strong>The more you use Claude, the better it knows you.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"/></a>
</p>

<p align="center">
  <a href="#what-happens-when-you-use-tenetx">What Happens</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#4-axis-personalization">4-Axis</a> &middot;
  <a href="#commands">Commands</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#safety">Safety</a>
</p>

<p align="center">
  English &middot;
  <a href="README.ko.md">한국어</a> &middot;
  <a href="README.ja.md">日本語</a> &middot;
  <a href="README.zh.md">简体中文</a>
</p>

---

## Two developers. Same Claude. Completely different behavior.

Developer A is careful. They want Claude to run all tests, explain reasoning, and ask before touching anything outside the current file.

Developer B moves fast. They want Claude to make assumptions, fix related files automatically, and report results in two lines.

Without tenetx, both developers get the same generic Claude. With tenetx, each gets a Claude that works the way *they* work.

```
Developer A's Claude:                    Developer B's Claude:
"I found 3 related issues.               "Fixed login + 2 related files.
Before proceeding, should I also          Tests pass. One risk: session
fix the session handler? Here's           timeout not covered. Done."
my analysis of each..."
```

Tenetx makes this happen. It profiles your work style, learns from your corrections, and renders personalized rules that Claude follows every session.

---

## What happens when you use tenetx

### First run (one time, ~1 minute)

```bash
npm install -g tenetx
tenetx
```

Tenetx detects this is your first run and launches a 4-question onboarding. Each question is a concrete scenario:

```
  Q1: Ambiguous implementation request

  You receive "improve the login feature." Requirements are
  unclear and adjacent modules may be affected.

  A) Clarify requirements/scope first. Ask if scope expansion is possible.
  B) Proceed if within same flow. Check when major scope expansion appears.
  C) Make reasonable assumptions and fix adjacent files directly.

  Choice (A/B/C):
```

Four questions. Four axes measured. Your profile is created with a pack for each axis plus fine-grained facets. A personalized rule file is rendered and placed where Claude reads it.

### Every session (daily use)

```bash
tenetx                    # Use this instead of `claude`
```

Behind the scenes:

1. Harness loads your profile from `~/.tenetx/me/forge-profile.json`
2. Preset manager composes the session: global safety rules + pack base rules + personal overlays + session overlays
3. Rule renderer converts everything into natural language and writes `~/.claude/rules/v1-rules.md`
4. Claude Code starts and reads those rules as behavioral instructions
5. Safety hooks activate: blocking dangerous commands, filtering secrets, detecting prompt injection

### When you correct Claude

You say: "Don't refactor files I didn't ask you to touch."

Claude calls the `correction-record` MCP tool. The correction is stored as structured evidence with axis classification (`judgment_philosophy`), kind (`avoid-this`), and confidence score. A temporary rule is created for immediate effect in the current session.

### Between sessions (automatic)

When a session ends, auto-compound extracts:
- Solutions (reusable patterns with context)
- Behavioral observations (how you work)
- A session learning summary

Facets are micro-adjusted based on accumulated evidence. If your corrections consistently point away from your current pack, mismatch detection triggers after 3 sessions and recommends a pack change.

### Next session

Updated rules are rendered with your corrections included. Compound knowledge is searchable via MCP. Claude gets better at being *your* Claude.

---

## Quick Start

```bash
# 1. Install
npm install -g tenetx

# 2. First run — 4-question onboarding (English or Korean)
tenetx

# 3. Every day after that
tenetx
```

### Prerequisites

- **Node.js** >= 20 (>= 22 recommended for SQLite session search)
- **Claude Code** installed and authenticated (`npm i -g @anthropic-ai/claude-code`)

---

## How It Works

### The learning loop

```
                          +-------------------+
                          |    Onboarding     |
                          |  (4 questions)    |
                          +--------+----------+
                                   |
                                   v
                   +-------------------------------+
                   |        Profile Created         |
                   |  4 axes x pack + facets + trust |
                   +-------------------------------+
                                   |
           +-----------------------+------------------------+
           |                                                |
           v                                                |
  +------------------+                                      |
  | Rules Rendered   |   ~/.claude/rules/v1-rules.md        |
  | to Claude format |                                      |
  +--------+---------+                                      |
           |                                                |
           v                                                |
  +------------------+                                      |
  | Session Runs     |   Claude follows your rules          |
  |   You correct    | ---> correction-record MCP           |
  |   Claude learns  |      Evidence stored                 |
  +--------+---------+      Temp rule created               |
           |                                                |
           v                                                |
  +------------------+                                      |
  | Session Ends     |   auto-compound extracts:            |
  |                  |   solutions + observations + summary  |
  +--------+---------+                                      |
           |                                                |
           v                                                |
  +------------------+                                      |
  | Facets Adjusted  |   micro-adjustments to profile       |
  | Mismatch Check   |   rolling 3-session analysis         |
  +--------+---------+                                      |
           |                                                |
           +------------------------------------------------+
                    (next session: updated rules)
```

### Compound knowledge

Knowledge accumulates across sessions and becomes searchable:

| Type | Source | How Claude uses it |
|------|--------|--------------------|
| **Solutions** | Extracted from sessions | `compound-search` via MCP |
| **Skills** | Promoted from verified solutions | Auto-loaded as slash commands |
| **Behavioral patterns** | Auto-detected at 3+ observations | Applied to `forge-behavioral.md` |
| **Evidence** | Corrections + observations | Drives facet adjustments |

---

## 4-Axis Personalization

Each axis has 3 packs. Each pack includes fine-grained facets (numerical values from 0-1) that are micro-adjusted over time based on your corrections.

### Quality/Safety

| Pack | What Claude does |
|------|-----------------|
| **Conservative** | Runs all tests before reporting done. Checks types. Verifies edge cases. Won't say "complete" until everything passes. |
| **Balanced** | Runs key checks, summarizes remaining risks. Balances thoroughness with speed. |
| **Speed-first** | Quick smoke test. Reports results and risks immediately. Prioritizes delivery. |

### Autonomy

| Pack | What Claude does |
|------|-----------------|
| **Confirm-first** | Asks before touching adjacent files. Clarifies ambiguous requirements. Requests approval for scope expansion. |
| **Balanced** | Proceeds within the same flow. Checks when major scope expansion appears. |
| **Autonomous** | Makes reasonable assumptions. Fixes related files directly. Reports what was done after. |

### Judgment

| Pack | What Claude does |
|------|-----------------|
| **Minimal-change** | Preserves existing structure. Does not refactor working code. Keeps modification scope minimal. |
| **Balanced** | Focuses on current task. Suggests improvements when clearly beneficial. |
| **Structural** | Proactively suggests structural improvements. Prefers abstraction and reusable design. Maintains architectural consistency. |

### Communication

| Pack | What Claude does |
|------|-----------------|
| **Concise** | Code and results only. No proactive elaboration. Explains only when asked. |
| **Balanced** | Summarizes key changes and reasons. Invites follow-up questions. |
| **Detailed** | Explains what, why, impact, and alternatives. Provides educational context. Structures reports with sections. |

---

## What the rendered rules actually look like

When tenetx composes your session, it renders a `v1-rules.md` file that Claude reads. Here are two real examples showing how different profiles produce completely different Claude behavior.

### Example 1: Conservative + Confirm-first + Structural + Detailed

```markdown
[Conservative quality / Confirm-first autonomy / Structural judgment / Detailed communication]

## Must Not
- Never commit or expose .env, credentials, or API keys.
- Never execute destructive commands (rm -rf, DROP, force-push) without user confirmation.

## Working Defaults
- Trust: Dangerous bypass disabled. Always confirm before destructive commands or sensitive path access.
- Proactively suggest structural improvements when you spot repeated patterns or tech debt.
- Prefer abstraction and reusable design, but avoid over-abstraction.
- Maintain architectural consistency across changes.

## When To Ask
- Clarify requirements before starting ambiguous tasks.
- Ask before modifying files outside the explicitly requested scope.

## How To Validate
- Run all related tests, type checks, and key verifications before reporting completion.
- Do not say "done" until all checks pass.

## How To Report
- Explain what changed, why, impact scope, and alternatives considered.
- Provide educational context — why this approach is better, compare with alternatives.
- Structure reports: changes, reasoning, impact, next steps.

## Evidence Collection
- When the user corrects your behavior ("don't do that", "always do X", "stop doing Y"), call the correction-record MCP tool to record it as evidence.
- kind: fix-now (immediate fix), prefer-from-now (going forward), avoid-this (never do this)
- axis_hint: quality_safety, autonomy, judgment_philosophy, communication_style
- Do not record general feedback — only explicit behavioral corrections.
```

### Example 2: Speed-first + Autonomous + Minimal-change + Concise

```markdown
[Speed-first quality / Autonomous autonomy / Minimal-change judgment / Concise communication]

## Must Not
- Never commit or expose .env, credentials, or API keys.
- Never execute destructive commands (rm -rf, DROP, force-push) without user confirmation.

## Working Defaults
- Trust: Minimal runtime friction. Free execution except explicit bans and destructive commands.
- Preserve existing code structure. Do not refactor working code unnecessarily.
- Keep modification scope minimal. Change adjacent files only when strictly necessary.
- Secure evidence (tests, error logs) before making changes.

## How To Validate
- Quick smoke test. Report results and risks immediately.

## How To Report
- Keep responses short and to the point. Focus on code and results.
- Only elaborate when asked. Do not proactively write long explanations.

## Evidence Collection
- When the user corrects your behavior ("don't do that", "always do X", "stop doing Y"), call the correction-record MCP tool to record it as evidence.
- kind: fix-now (immediate fix), prefer-from-now (going forward), avoid-this (never do this)
- axis_hint: quality_safety, autonomy, judgment_philosophy, communication_style
- Do not record general feedback — only explicit behavioral corrections.
```

Same Claude. Same codebase. Completely different working style, driven by a 1-minute onboarding.

---

## Commands

### Core

```bash
tenetx                          # Start Claude Code with personalization
tenetx "fix the login bug"      # Start with a prompt
tenetx --resume                 # Resume previous session
```

### Personalization

```bash
tenetx onboarding               # Run 4-question onboarding
tenetx forge --profile          # View current profile
tenetx forge --reset soft       # Reset profile (soft / learning / full)
tenetx forge --export           # Export profile
```

### Inspection

```bash
tenetx inspect profile          # 4-axis profile with packs and facets
tenetx inspect rules            # Active and suppressed rules
tenetx inspect evidence         # Correction history
tenetx inspect session          # Current session state
tenetx me                       # Personal dashboard (shortcut for inspect profile)
```

### Knowledge management

```bash
tenetx compound                 # Preview accumulated knowledge
tenetx compound --save          # Save auto-analyzed patterns
tenetx skill promote <name>     # Promote a verified solution to a skill
tenetx skill list               # List promoted skills
```

### System

```bash
tenetx init                     # Initialize project
tenetx doctor                   # System diagnostics
tenetx config hooks             # View hook status
tenetx config hooks --regenerate # Regenerate hooks
tenetx mcp                      # MCP server management
tenetx uninstall                # Remove tenetx cleanly
```

### MCP tools (available to Claude during sessions)

| Tool | Purpose |
|------|---------|
| `compound-search` | Search accumulated knowledge by query |
| `compound-read` | Read full solution content |
| `compound-list` | List solutions with filters |
| `compound-stats` | Overview statistics |
| `session-search` | Search past session conversations (SQLite FTS5, Node.js 22+) |
| `correction-record` | Record user corrections as structured evidence |

---

## Architecture

```
~/.tenetx/                           Personalization home
|-- me/
|   |-- forge-profile.json           4-axis profile (packs + facets + trust)
|   |-- rules/                       Rule store (one JSON file per rule)
|   |-- behavior/                    Evidence store (corrections + observations)
|   |-- recommendations/             Pack recommendations (onboarding + mismatch)
|   +-- solutions/                   Compound knowledge
|-- state/
|   |-- sessions/                    Session effective state snapshots
|   +-- raw-logs/                    Raw session logs (7-day TTL auto-cleanup)
+-- config.json                      Global config (locale, trust, packs)

~/.claude/
|-- settings.json                    Hooks + env vars injected by harness
|-- rules/
|   |-- forge-behavioral.md          Learned behavioral patterns (auto-generated)
|   +-- v1-rules.md                  Rendered personalization rules (per-session)
|-- commands/tenetx/                 Slash commands (promoted skills)
+-- .claude.json                     MCP server registration

~/.tenetx/                           Tenetx home (v5.1 unified storage)
|-- me/
|   |-- solutions/                   Accumulated compound knowledge
|   |-- behavior/                    Behavioral patterns
|   |-- rules/                       Personal correction rules
|   +-- forge-profile.json           4-axis personalization profile
|-- state/                           Session state, checkpoints
+-- sessions.db                      SQLite session history (Node.js 22+)
```

### Data flow

```
forge-profile.json                   Source of truth for personalization
        |
        v
preset-manager.ts                    Composes session state:
  global safety rules                  hard constraints (always active)
  + base pack rules                    from profile packs
  + personal overlays                  from correction-generated rules
  + session overlays                   temporary rules from current session
  + runtime capability detection       trust policy adjustment
        |
        v
rule-renderer.ts                     Converts Rule[] to natural language:
  filter (active only)                 pipeline: filter -> dedupe -> group ->
  dedupe (render_key)                  order -> template -> budget (4000 chars)
  group by section
  order: Must Not -> Working Defaults -> When To Ask -> How To Validate -> How To Report
        |
        v
~/.claude/rules/v1-rules.md         What Claude actually reads
```

---

## Safety

Safety hooks are automatically registered in `settings.json` and run on every tool call Claude makes.

| Hook | Trigger | What it does |
|------|---------|-------------|
| **pre-tool-use** | Before any tool execution | Blocks `rm -rf`, `curl\|sh`, `--force` push, dangerous patterns |
| **db-guard** | SQL operations | Blocks `DROP TABLE`, `WHERE`-less `DELETE`, `TRUNCATE` |
| **secret-filter** | File writes and outputs | Warns when API keys, tokens, or credentials are about to be exposed |
| **slop-detector** | After code generation | Detects TODO remnants, `eslint-disable`, `as any`, `@ts-ignore` |
| **prompt-injection-filter** | All inputs | Blocks prompt injection attempts with pattern + heuristic detection |
| **context-guard** | During session | Warns when approaching context window limit |
| **rate-limiter** | MCP tool calls | Prevents excessive MCP tool invocations |

Safety rules are **hard constraints** -- they cannot be overridden by pack selection or corrections. The "Must Not" section in rendered rules is always present regardless of profile.

---

## Key Design Decisions

- **4-axis profile, not preference toggles.** Each axis has a pack (coarse) and facets (fine-grained, 0-1 numerical values). Packs give stable behavior; facets allow micro-adjustment without full reclassification.

- **Evidence-based learning, not regex matching.** Corrections are structured data (`CorrectionRequest` with kind, axis_hint, message). Claude classifies them; algorithms apply them. No pattern matching on user input.

- **Pack + overlay model.** Base packs provide stable defaults. Personal overlays from corrections layer on top. Session overlays for temporary rules. Conflict resolution: session > personal > pack (global safety is always hard constraint).

- **Rules rendered as natural language.** The `v1-rules.md` file contains English (or Korean) sentences, not configuration. Claude reads instructions like "Do not refactor working code unnecessarily" -- the same way a human mentor would give guidance.

- **Mismatch detection.** Rolling 3-session analysis checks if your corrections consistently diverge from your current pack. When detected, tenetx proposes a pack re-recommendation rather than silently drifting.

- **Runtime trust computation.** Your desired trust policy is reconciled with Claude Code's actual runtime permission mode. If Claude Code runs with `--dangerously-skip-permissions`, tenetx adjusts the effective trust level accordingly.

- **Internationalization.** English and Korean fully supported. Language selected at onboarding, applied throughout (onboarding questions, rendered rules, CLI output).

---

## Coexistence

Tenetx detects other Claude Code plugins (oh-my-claudecode, superpowers, claude-mem) at install time and disables overlapping hooks. Core safety and compound hooks always remain active.

See [Coexistence Guide](docs/guides/with-omc.md) for details.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Hooks Reference](docs/reference/hooks-reference.md) | 19 hooks across 3 tiers — events, timeouts, behavior |
| [Coexistence Guide](docs/guides/with-omc.md) | Using tenetx alongside oh-my-claudecode |
| [CHANGELOG](CHANGELOG.md) | Version history and release notes |

---

## License

MIT
