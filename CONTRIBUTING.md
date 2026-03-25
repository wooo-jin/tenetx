# Contributing to tenetx

Thank you for your interest in contributing! tenetx is a philosophy-driven Claude Code harness built for individual developers who value intentional, compound-growth workflows.

## Quick Start

```bash
git clone https://github.com/wooo-jin/tenetx.git
cd tenetx
npm install
npm run build
npm test
```

## Code Style

- **Language**: TypeScript with strict mode enabled
- **Linter**: [Biome](https://biomejs.dev/) — run `npm run lint` before committing. Fix all warnings on files you touch.
- **Formatter**: `npm run format` (Biome)
- Keep functions under 50 lines; split if larger
- No nested depth beyond 4 levels — use early returns
- No unnecessary abstractions — implement only what's needed now
- No empty catch blocks — at minimum add a descriptive comment or `debugLog()`
- Adding new runtime dependencies requires justification in the PR description (current: 3 deps)

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and ensure tests pass: `npm test`
4. Commit using [Conventional Commits](#commit-convention)
5. Open a Pull Request against `main`

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new skill for X
fix: resolve Y when Z
docs: update contributing guide
chore: bump version to 1.x.0
test: add scenario tests for X
refactor: extract helper from Y
```

## PR Guidelines

- Keep PRs focused — one concern per PR
- Include a brief description of what changed and why
- If fixing a bug, describe how to reproduce it
- Tests are expected for new features and bug fixes

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    tenetx CLI                        │
│                   (src/cli.ts)                       │
├──────────┬──────────┬───────────┬───────────────────┤
│  Forge   │   Lab    │ Compound  │      Pack         │
│ (forge/) │ (lab/)   │ (engine/) │    (pack/)        │
│          │          │           │                   │
│ Profile  │ Pattern  │ Extract   │ Marketplace       │
│ Scan     │ Detect   │ Inject    │ Publish/Install   │
│ Interview│ Auto-    │ Lifecycle │ Search            │
│ Tune     │ Learn    │ Reflect   │                   │
├──────────┴──────────┴───────────┴───────────────────┤
│                 Core (core/)                         │
│  harness.ts — init, settings injection               │
│  spawn.ts — Claude Code process launch               │
│  config-injector.ts — settings.json generation       │
├─────────────────────────────────────────────────────┤
│               Hooks (hooks/)                         │
│  UserPromptSubmit: keyword-detector, skill-injector, │
│                    solution-injector, context-guard   │
│  PreToolUse: pre-tool-use (reflection), db-guard     │
│  PostToolUse: post-tool-use (negative signals)       │
│  SessionStart: session-recovery                      │
├─────────────────────────────────────────────────────┤
│        Agents (agents/) + Skills (skills/)           │
│         19 agents, 21 skills (Markdown)              │
└─────────────────────────────────────────────────────┘
```

**Key entry points**:
- `src/cli.ts` — All CLI commands
- `src/core/harness.ts` — Harness initialization (large file, decomposition planned — see docs/adr/001)
- `src/hooks/` — Claude Code hook scripts (each runs as standalone Node process)
- `plugin.json` — Hook registration manifest

## Philosophy

tenetx is built around five principles: `understand-before-act`, `decompose-to-control`, `capitalize-on-failure`, `focus-resources-on-judgment`, and `knowledge-comes-to-you`. Contributions that align with these principles are more likely to be accepted.

## Questions

Open a [GitHub Issue](https://github.com/wooo-jin/tenetx/issues) for questions, bug reports, or feature proposals.
