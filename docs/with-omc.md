# Using Tenetx with oh-my-claudecode

Tenetx and [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (OMC) serve different purposes and can complement each other.

## What Each Does

| Aspect | oh-my-claudecode | tenetx |
|--------|-----------------|--------|
| Focus | Multi-agent orchestration | Adaptive personalization |
| Approach | Same powerful tools for everyone | Tools that learn YOUR style |
| Agents | 32+ (3-tier: Haiku/Sonnet/Opus) | 19 (dimension-tuned to your profile) |
| Hooks | 30+ (keyword detection, compression prevention, etc.) | 19 registered, 16 active (solution injection, reflection, negative signals) |
| Learning | Static configuration | Lab evolves profile from usage data |
| Knowledge | Session-scoped | Cross-session compound learning |

## How Coexistence Works

At `npm install` time, tenetx's postinstall script detects OMC by checking for `~/.omc`. When detected:

- **7 workflow hooks** (intent-classifier, keyword-detector, skill-injector, permission-handler, subagent-tracker, post-tool-failure) are **auto-disabled** in `hooks.json` to avoid conflicts with OMC's equivalent hooks.
- **8 compound-core hooks** (solution-injector, session-recovery, pre-tool-use, post-tool-use, pre-compact, context-guard, notepad-injector) remain **always active** — these power the learning loop and don't overlap with OMC.
- **4 safety hooks** (secret-filter, slop-detector, db-guard, rate-limiter) remain active unless explicitly disabled in `hook-config.json`.

## Current Limitations

**This combination has not been tested in practice.** Known potential issues:

- **Hook execution order**: Both plugins register hooks for the same events (e.g., UserPromptSubmit). Claude Code runs hooks sequentially in registration order. The order depends on which plugin is loaded first, which may affect behavior.
- **settings.json writes**: Both plugins may write to `~/.claude/settings.json`. Tenetx uses a backup+lock pattern to avoid data loss, but concurrent writes from OMC are not coordinated.
- **Context budget**: When OMC is detected, tenetx halves its solution injection budget (from 3 to 1 solution per prompt, session max reduced 50%). This may still be too much combined context.

If you try this combination, please report your experience via [GitHub Issues](https://github.com/wooo-jin/tenetx/issues).

## When to Use What

**OMC alone**: You want powerful orchestration tools immediately. Great for teams where consistency matters more than individual adaptation.

**Tenetx alone**: You want a lightweight harness (3 deps) that learns your coding style over time. Great for individual developers who work on the same codebase regularly.

**Both together**: Experimental. You want OMC's orchestration AND tenetx's learning loop. Expect rough edges.

## Key Difference

OMC asks: "How can AI tools be more powerful?"
Tenetx asks: "How can AI tools understand ME better?"

Both are valid questions. The answers are complementary, not competing.
