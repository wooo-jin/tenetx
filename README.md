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
  <a href="https://github.com/wooo-jin/tenetx/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/tests-1465-brightgreen.svg" alt="Tests: 1465"/></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#why-tenetx">Why Tenetx</a> &middot;
  <a href="#core-features">Features</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="README.ko.md">한국어</a> &middot;
  <a href="README.zh.md">简体中文</a> &middot;
  <a href="README.ja.md">日本語</a>
</p>

---

## What is Tenetx?

Other tools give you THEIR workflow. Tenetx builds YOUR workflow — and evolves it as you work.

```
$ tenetx forge
  [1] Scans your project (git history, tests, CI, dependencies)
  [2] Asks 10 questions about YOUR working style
  [3] Generates a personalized harness

$ tenetx                    # Work normally
                             # Lab silently tracks what works for YOU

$ tenetx me                 # See how your harness has evolved
  품질 초점    [########--] 0.80  thorough
  자율성 선호  [####------] 0.45  supervised
  -> code-reviewer: strict mode (SOLID + naming + edge cases)
  -> Model routing: prefer opus for reviews
```

Tenetx wraps [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It does not fork or modify it — it configures settings, hooks, and agents shaped by YOUR profile.

---

## Why Tenetx?

- **Adapts to you.** Forge profiles your working style across 5 continuous dimensions. Lab evolves your profile over time. Every agent, skill, and hook responds to who you are.
- **Closed-loop learning.** Use Tenetx. Lab tracks patterns. Detectors fire. Profile adjusts. Config regenerates. Automatic. Daily.
- **Build on others, not depend on them.** Remix lets you cherry-pick agents, skills, and rules from published harnesses — without adopting their entire tool.
- **Team-aware.** Move knowledge between personal, team, and org with packs and 3-tier scoping.

---

## Quick Start

```bash
npm install -g tenetx

tenetx setup              # Basic setup (3 questions, 30 seconds)
tenetx forge              # Personalize — scan your project + interview
tenetx                    # Run with YOUR harness
tenetx me                 # See your profile and how it evolved
```

### Prerequisites

- **Node.js** >= 18
- **Claude Code** installed and authenticated

### As a Claude Code Plugin

```bash
tenetx install --plugin
```

### What it looks like

<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/demo-preview.svg" alt="Tenetx in action" width="700"/>
</p>

> To record a full demo, install [VHS](https://github.com/charmbracelet/vhs) and run `vhs demo/demo.tape`

---

## Core Features

### Forge — Your Personalized Harness

Forge scans your project and interviews you to build a profile across 5 continuous dimensions:

```
$ tenetx forge

Scanning project...
  git: 847 commits, 12 contributors, monorepo
  tests: vitest, 94% coverage
  ci: GitHub Actions
  deps: React 18, TypeScript 5.4

Interview (10 questions):
  "When a PR has a minor style issue, do you comment or let it go?"
  "How do you feel about AI making commits without your review?"
  ...

Profile generated:
  품질 초점    [########--] 0.80    자율성 선호  [####------] 0.45
  위험 감수도  [######----] 0.62    추상화 수준  [#######---] 0.70
  커뮤니케이션 [#########-] 0.88
```

From your profile, Forge generates:
- **Agent overlays** — code-reviewer strictness, planner depth, architect scope
- **Skill tuning** — autopilot autonomy, review thoroughness
- **Rules** — what to warn about, what to enforce
- **Hook parameters** — edit limits, cost thresholds, context alerts
- **Model routing** — which models for which tasks
- **Philosophy** — your principles, derived from your answers

### Lab — Your Harness Evolves

Lab runs silently in the background. It watches how you work and adjusts your profile over time.

- **Passive event tracking** — no interruptions, no surveys
- **8 behavioral pattern detectors** — review style, edit frequency, model preference, autonomy level, and more
- **Auto-learning** — profile dimensions shift max +/-0.1 per day (EMA 0.25) to prevent whiplash
- **Session cost tracking** — per-session and cumulative, displayed in the HUD
- **A/B experiments** — Lab can test config variants and measure which works better for you

### Remix — Build on Others

Remix connects you to published harnesses. Take what works, leave the rest.

```bash
tenetx remix browse                        # Browse published harnesses
tenetx remix pick strict-reviewer --from senior-dev-harness
tenetx remix pick fast-deploy-hook --from devops-harness
```

- **Cherry-pick individual components** — agents, skills, rules, hooks
- **Conflict detection** — warns when a picked component clashes with your existing config
- **Provenance tracking** — every picked component records where it came from

### Me Dashboard

```bash
$ tenetx me

Profile (v12, last updated 2h ago):
  품질 초점    [########--] 0.80 (+0.05 this week)
  자율성 선호  [####------] 0.45 (-0.02 this week)
  위험 감수도  [######----] 0.62
  추상화 수준  [#######---] 0.70
  커뮤니케이션 [#########-] 0.88

Active patterns:
  review-thoroughness   triggered 14x this week
  edit-consolidation    triggered 8x this week

Tuning effects:
  code-reviewer    -> strict (SOLID + naming + edge cases)
  model routing    -> opus for reviews, sonnet for exploration
  autopilot        -> require approval before commit

Cost this week: $4.23 across 12 sessions
```

### Multi-Model Synthesis

Ask a question to all configured providers at once. Get a confidence-scored synthesis.

```bash
tenetx ask "Should I use a saga or choreography pattern here?" --all
```

- **Confidence scoring** — weighted by provider track record on similar tasks
- **Provider performance tracking** — Lab records which providers gave useful answers
- **Task-type routing** — different models for architecture vs. debugging vs. code review

### Execution Modes (9 modes, 21 skills)

| Flag | Mode | What it does |
|------|------|-------------|
| `-a` | **autopilot** | 5-stage autonomous pipeline (explore -> plan -> implement -> QA -> verify) |
| `-r` | **ralph** | PRD-based completion guarantee with verify/fix loop |
| `-t` | **team** | Multi-agent parallel pipeline with specialized roles |
| `-u` | **ultrawork** | Maximum parallelism burst |
| `-p` | **pipeline** | Sequential stage-by-stage processing |
| | **ccg** | 3-model cross-validation |
| | **ralplan** | Consensus-based design (Planner -> Architect -> Critic) |
| | **deep-interview** | Socratic requirements clarification |
| | **tdd** | Test-driven development mode |

```bash
tenetx --autopilot "Build user authentication"
tenetx --ralph "Complete the payment integration"
tenetx --team "Redesign the dashboard"
```

Magic keywords also work — type `autopilot`, `ralph`, `ultrawork`, `tdd`, `ccg`, `deep-interview`, or `ultrathink` anywhere in your prompt.

### Model Routing (16-Signal Scoring)

Tenetx routes tasks to the optimal model tier using 16 signals (lexical, structural, contextual, pattern-based):

```
  Haiku   ->  explore, file-search, simple-qa
  Sonnet  ->  code-review, analysis, design
  Opus    ->  implement, architect, debug-complex
```

Your Forge profile adds overrides. If Lab detects you prefer thorough reviews, it routes review tasks to Opus automatically.

### Pack System (3-tier knowledge)

Knowledge lives in three scopes and grows over time:

| Scope | Location | When loaded |
|-------|----------|-------------|
| **Me** | `~/.compound/me/` | Always |
| **Team** | `~/.compound/packs/<name>/` | In team repos |
| **Project** | `{repo}/.compound/` | In that repo |

```bash
tenetx pack install https://github.com/your-org/pack-backend
tenetx pack sync
tenetx pick api-caching --from backend
tenetx propose retry-pattern --to backend
```

Packs support inheritance via `extends` and sync to GitHub, Google Drive, S3, or local directories.

### Agents (19 dimension-tuned)

Every agent adapts its behavior based on your Forge profile:

| Lane | Agents | Purpose |
|------|--------|---------|
| **BUILD** | explore, analyst, planner, architect, debugger, executor, verifier, code-simplifier, refactoring-expert | Exploration -> Implementation -> Verification |
| **REVIEW** | code-reviewer, security-reviewer, critic | Quality assurance |
| **DOMAIN** | designer, test-engineer, writer, qa-tester, performance-reviewer, scientist, git-master | Specialized expertise |

A developer with Quality=0.80 gets a strict code-reviewer that checks SOLID principles, naming, and edge cases. A developer with Quality=0.40 gets a reviewer focused on correctness only.

### Code Intelligence (AST + LSP)

Tenetx integrates real code understanding tools when available:

**AST-grep** — structural code search using actual syntax trees, not regex:

```bash
tenetx ast search "function $NAME($$$)" --lang ts   # Find all functions
tenetx ast classes                                    # List all classes
tenetx ast calls handleForge                          # Find all call sites
tenetx ast status                                     # Check if sg is installed
```

Falls back to regex when `sg` (ast-grep CLI) is not installed. Supports TypeScript, Python, Go, Rust patterns.

**LSP** — real language server integration for type-aware operations:

```bash
tenetx lsp status                              # Detected servers
tenetx lsp hover src/forge/types.ts 14 10      # Type info at position
tenetx lsp definition src/cli.ts 50 20         # Go to definition
tenetx lsp references src/core/paths.ts 7 13   # Find all references
```

Auto-detects installed language servers (tsserver, pylsp, gopls, rust-analyzer, jdtls). Falls back gracefully when none available.

### Real-time Monitoring

| Watch | Trigger | Action |
|-------|---------|--------|
| File edits | Same file 5+ times | Stop and redesign |
| Session cost | $10+ | Reduce scope |
| Session time | 40+ minutes | Suggest compaction |
| Context window | 70%+ usage | Visual warning |
| Knowledge | Related solution exists | Suggest reuse |

---

## Architecture

<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/architecture.svg" alt="Tenetx Architecture" width="100%"/>
</p>

### Layer 0: Your Profile (WHO)

Your 5-dimension profile — generated by Forge, evolved by Lab. This is the foundation everything else builds on.

### Layer 1: Forge + Lab (ADAPT)

Forge generates your harness from your profile. Lab observes your usage and feeds adjustments back to Forge. A closed loop that runs every session.

### Layer 2: Workflow Engine (HOW)

The engine that translates your profile into executable components:
- 9 execution modes and 21 skills
- 3-tier model routing with 16-signal scoring
- 17 hooks, 10 event types, 3 security hooks
- Real-time monitoring and compound loop

### Layer 3: Pack + Remix (SHARE)

Move knowledge between personal, team, and org scopes. Cherry-pick from others via Remix. Propose patterns upstream. Inherit configurations via `extends`.

---

## Statistics

| Metric | Count |
|--------|-------|
| Tests | 1465 across 92 test files |
| Agents | 19 (dimension-tuned, 3 lanes) |
| Skills | 21 (6 dimension-aware) |
| Personalization dimensions | 5 continuous |
| Behavioral pattern detectors | 8 |
| New modules (Forge/Lab/Remix/Synth) | 35+ |
| Execution modes | 9 |
| Hooks | 17 + 3 security hooks |
| MCP servers | 8 (JSON-RPC 2.0) |
| Model routing signals | 16 |
| CLI commands | 45+ |

---

## Acknowledgements

Tenetx draws significant inspiration from [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) by Yeachan Heo. The multi-agent orchestration patterns, magic keyword system, execution modes, and the vision of enhancing Claude Code through a harness layer were deeply influenced by OMC's pioneering work. We also acknowledge [Claude Forge](https://github.com/sangrokjung/claude-forge) for its clean "oh-my-zsh for Claude Code" approach.

**Where Tenetx diverges:** OMC and OMO give you powerful, general-purpose tools. Tenetx makes those tools personal. Forge builds a profile of how YOU work. Lab evolves it. Every agent, skill, hook, and routing decision responds to your dimensions — not a generic default.

---

## License

MIT
