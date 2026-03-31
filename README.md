<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.svg" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>The AI coding tool that adapts to you.</strong>
</p>

<p align="center">
  <a href="https://github.com/wooo-jin/tenetx/actions/workflows/ci.yml"><img src="https://github.com/wooo-jin/tenetx/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://github.com/wooo-jin/tenetx/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/tests-1450_across_85_files-brightgreen.svg" alt="Tests: 1555"/></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#core-commands">Commands</a> &middot;
  <a href="#compound-engine">Compound</a> &middot;
  <a href="README.ko.md">한국어</a> &middot;
  <a href="README.zh.md">简体中文</a> &middot;
  <a href="README.ja.md">日本語</a>
</p>

---

## What is Tenetx?

Other AI tools give everyone the same experience. Tenetx **learns how you code** and gets better over time.

```
$ tenetx forge                     # Profile your working style (once)
$ tenetx                           # Work normally — it learns silently
```

That's it. Tenetx extracts your coding patterns, validates them through real usage, and injects them when relevant. Bad patterns auto-retire. Good patterns get promoted.

Tenetx wraps [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It does not fork or modify it — it configures settings, hooks, and agents shaped by YOUR profile.

---

## Quick Start

```bash
npm install -g tenetx
tenetx forge              # Scan your project + interview → done
tenetx                    # Work normally. Learning is automatic.
```

### Prerequisites

- **Node.js** >= 20
- **Claude Code** installed and authenticated
  > Tenetx wraps Claude Code and depends on its hook API. Future Claude Code updates may require tenetx updates.

### When to Use Tenetx

| Scenario | Fit |
|----------|-----|
| Long-running project with repeating patterns | Great |
| Personal workflow optimization | Great |
| Lightweight harness (3 runtime deps) | Great |
| One-off scripts or throwaway code | Not ideal |
| Environment without Claude Code | Not supported |

---

## How It Works

```
You code → Forge profiles you → Lab observes patterns → Compound extracts solutions
    ↓                                                          ↓
Config adapts (agents, skills, hooks, routing)     Solutions injected when relevant
    ↓                                                          ↓
Better AI assistance                               Good patterns promoted, bad ones retired
```

**Four engines work together:**

| Engine | What it does | Command |
|--------|-------------|---------|
| **Forge** | Profiles your working style across 5 dimensions | `tenetx forge` |
| **Lab** | Observes your behavior and auto-adjusts your profile | `tenetx lab` |
| **Compound** | Extracts coding patterns, validates through lifecycle | `tenetx compound` |
| **Pack** | Share and install community packs | `tenetx pack` |

---

## Core Commands

```bash
# Essential
tenetx forge              # Profile your working style (once)
tenetx                    # Work normally (learning is automatic)

# When curious
tenetx me                 # See your profile + what it learned
tenetx compound list      # View learned patterns with status
tenetx pack search        # Browse community packs
tenetx pack install X     # Install a pack
tenetx pack publish X     # Share your pack
```

All 42 commands still work — run `tenetx <command> --help` for any command.

---

## Forge — Your Profile

Forge scans your project and asks 10 questions to build a 5-dimension profile:

```
$ tenetx forge

Profile generated:
  품질 초점    [########--] 0.80    자율성 선호  [####------] 0.45
  위험 감수도  [######----] 0.62    추상화 수준  [#######---] 0.70
  커뮤니케이션 [#########-] 0.88
```

From your profile, Forge generates agent overlays, skill tuning, rules, hook parameters, model routing, and philosophy. Lab auto-adjusts this daily based on your actual behavior (EMA 0.25, max ±0.1/day).

---

## Compound Engine — AI That Learns From You

Compound automatically extracts coding patterns, validates them through evidence, and shares them.

```
Session work → Auto-extraction (git diff) → Quality gates → Solution stored
    ↓
Next session → Tag matching → Solution injected → Code Reflection
    ↓
Identifier in your code → reflected++  |  Build failure → negative++
    ↓
Lifecycle check → Promote / Demote / Circuit-break / Retire
```

### Evidence-Based Lifecycle

Solutions earn trust through real usage:

| Status | Confidence | How to reach |
|--------|-----------|--------------|
| experiment | 0.3 | Auto-extracted from git diff |
| candidate | 0.6 | reflected >= 2, sessions >= 2, negative == 0 |
| verified | 0.8 | reflected >= 4, sessions >= 3, OR `--verify` |
| mature | 0.85 | reflected >= 8, sessions >= 5, sustained 30 days |

### What Makes It Different

- **Code Reflection** — detects when Claude actually uses your pattern via identifier matching
- **Negative signals** — build/test failures automatically demote bad patterns
- **Circuit breaker** — experiment patterns with 2+ failures are auto-retired
- **Contradiction detection** — flags patterns with overlapping tags but disjoint identifiers
- **Prompt injection defense** — 13 patterns + Unicode NFKC + XML escaping

```bash
tenetx compound --solution "ErrorBoundary" "centralized error handling"
tenetx compound list                          # All patterns with status
tenetx compound inspect <name>                # Detailed evidence
tenetx compound --verify <name>               # Manual promote
tenetx compound --lifecycle                   # Run promotion check
tenetx compound rollback --since 2026-03-20   # Undo extractions
```

---

## Pack Marketplace — Share Patterns

Publish and install community packs. No server — powered by GitHub.

```bash
tenetx pack search "react"           # Search community registry
tenetx pack install react-patterns   # Install a pack
tenetx pack publish my-pack          # Share your pack to registry
```

Packs bundle skills, agents, rules, and workflows. Sorted by download count.

Registry: [wooo-jin/tenetx-registry](https://github.com/wooo-jin/tenetx-registry)

---

## Advanced Features

<details>
<summary>Execution Modes (9 modes)</summary>

| Flag | Mode | What it does |
|------|------|-------------|
| `-a` | **autopilot** | 5-stage autonomous pipeline |
| `-r` | **ralph** | PRD-based completion guarantee |
| `-t` | **team** | Multi-agent parallel pipeline |
| `-u` | **ultrawork** | Maximum parallelism burst |
| `-p` | **pipeline** | Sequential processing |
| | **ccg** | 3-model cross-validation |
| | **ralplan** | Consensus design (Planner→Architect→Critic) |
| | **deep-interview** | Socratic requirements clarification |
| | **tdd** | Test-driven development |

Magic keywords work too — type `autopilot`, `ralph`, `ultrawork`, `tdd` anywhere in your prompt.

</details>

<details>
<summary>19 Dimension-Tuned Agents</summary>

| Lane | Agents | Purpose |
|------|--------|---------|
| **BUILD** | explore, analyst, planner, architect, debugger, executor, verifier, code-simplifier, refactoring-expert | Exploration → Implementation → Verification |
| **REVIEW** | code-reviewer, security-reviewer, critic | Quality assurance |
| **DOMAIN** | designer, test-engineer, writer, qa-tester, performance-reviewer, scientist, git-master | Specialized expertise |

A developer with Quality=0.80 gets strict code review. Quality=0.40 gets correctness-only review.

</details>

<details>
<summary>Model Routing (16-Signal Scoring)</summary>

```
Haiku   →  explore, file-search, simple-qa
Sonnet  →  code-review, analysis, design
Opus    →  implement, architect, debug-complex
```

Your Forge profile adds overrides. Lab auto-adjusts routing based on your patterns.

</details>


<details>
<summary>Remix — Cherry-Pick From Others</summary>

```bash
tenetx remix browse
tenetx remix pick strict-reviewer --from senior-dev-harness
```

Cherry-pick agents, skills, rules from published harnesses with conflict detection.

</details>

<details>
<summary>Multi-Model Synthesis</summary>

```bash
tenetx ask "saga or choreography?" --all
```

Ask all configured providers, get confidence-scored synthesis.

</details>

<details>
<summary>txd — Skip Permissions Shortcut</summary>

```bash
txd                   # Equivalent to: tenetx --dangerously-skip-permissions
```

**Warning**: `txd` disables ALL Claude Code permission checks. Tools execute without confirmation. Only use in trusted, isolated environments (e.g., disposable containers, personal dev machines with no sensitive data). Never use in production or shared environments.

</details>

---

## Architecture

<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/architecture.svg" alt="Tenetx Architecture" width="100%"/>
</p>

| Layer | Purpose | Components |
|-------|---------|------------|
| **Profile** | Who you are | 5 continuous dimensions |
| **Adapt** | Learn and adjust | Forge + Lab + Compound |
| **Execute** | Do the work | 9 modes, 21 skills, 19 agents, 17 hooks |
| **Share** | Community | Pack marketplace + Remix |

---

## Statistics

| Metric | Count |
|--------|-------|
| Tests | 1855 across 107 files |
| Agents | 19 (dimension-tuned) |
| Skills | 21 (6 dimension-aware) |
| Compound quality gates | 4 |
| Lab event types | 15 |
| Execution modes | 9 |
| CLI commands | 5 core + 37 advanced |

---

## Acknowledgements

Tenetx draws significant inspiration from [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) by Yeachan Heo. The multi-agent orchestration patterns, magic keyword system, and the vision of enhancing Claude Code through a harness layer were deeply influenced by OMC's pioneering work.

**Where Tenetx diverges:** OMC gives you powerful, general-purpose tools. Tenetx makes those tools **personal**. Forge profiles how you work. Lab evolves it. Compound Engine tracks which patterns actually help — promoting good ones and auto-retiring bad ones through evidence-based lifecycle.

---

## Contact

- **Author:** Woojin Jang
- **LinkedIn:** [linkedin.com/in/우진-장-1567aa294](https://www.linkedin.com/in/%EC%9A%B0%EC%A7%84-%EC%9E%A5-1567aa294/)
- **GitHub:** [@wooo-jin](https://github.com/wooo-jin)

---

## License

MIT
