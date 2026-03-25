# Using Tenetx with oh-my-claudecode

Tenetx and [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (OMC) serve different purposes and can complement each other.

## What Each Does

| Aspect | oh-my-claudecode | tenetx |
|--------|-----------------|--------|
| Focus | Multi-agent orchestration | Adaptive personalization |
| Approach | Same powerful tools for everyone | Tools that learn YOUR style |
| Agents | 29 (3-tier: Haiku/Sonnet/Opus) | 19 (dimension-tuned to your profile) |
| Hooks | 31 (keyword detection, compression prevention, etc.) | 14 (solution injection, reflection, negative signals) |
| Learning | Static configuration | Lab evolves profile from usage data |
| Knowledge | Session-scoped | Cross-session compound learning |

## When to Use What

**OMC alone**: You want powerful orchestration tools immediately, with zero personalization overhead. Great for teams where consistency matters more than individual adaptation.

**Tenetx alone**: You want a lightweight harness (3 deps) that learns your coding style over time. Great for individual developers who work on the same codebase regularly.

**Both together**: You want OMC's orchestration power AND tenetx's learning loop. This is experimental — see compatibility notes below.

## Compatibility Notes

⚠ **Not tested in combination.** Potential issues:
- Hook conflicts: Both register UserPromptSubmit hooks. Order may matter.
- Settings.json: Both may try to inject settings. Last writer wins.
- Agent overlays: Tenetx's dimension-tuned agents may conflict with OMC's tiered agents.

If you try this combination, please report your experience via [GitHub Issues](https://github.com/wooo-jin/tenetx/issues).

## Key Difference

OMC asks: "How can AI tools be more powerful?"
Tenetx asks: "How can AI tools understand ME better?"

Both are valid questions. The answers are complementary, not competing.
