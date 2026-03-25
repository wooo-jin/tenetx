# Tenetx v2.0.0 — Open Source Readiness Review

**Date**: 2026-03-25
**Reviewers**: Virtual panel simulating oh-my-claudecode, oh-my-openagent, Compound Engineering (Every Inc.) maintainers
**Target**: Evaluate readiness for public promotion

---

## Competitive Landscape

| Project | Stars | Version | Agents | Hooks | Differentiator |
|---------|-------|---------|--------|-------|----------------|
| oh-my-openagent | 43,000+ | v3.x | 7 (multi-provider) | 25+ | Hash-anchored edits, multi-provider routing |
| oh-my-claudecode | 11,262 | v4.9.1 | 29 (3-tier) | 31 | Zero-syntax magic keywords, team pipeline |
| compound-engineering-plugin (Every Inc.) | 5,132 | — | 26 | — | Plan→Work→Review→Compound methodology |
| **tenetx** | **new** | **v2.0.0** | **19** | **14** | **Adaptive personalization + evidence-based learning** |

**Tenetx's unique axis: depth of adaptation.** Cannot win on scale or breadth — differentiate on "AI that learns how YOU code."

---

## Scores

| Area | Score | Notes |
|------|-------|-------|
| Architecture | 9/10 | 4-engine design, closed-loop, evidence-based lifecycle |
| Code Quality | 7/10 | Type-safe, defensive, but self-rule violations |
| Testing | 6.5/10 | 1548 tests (3 failing), coverage threshold 40% vs 85% rule |
| Documentation | 8/10 | 4-language README, CHANGELOG, CONTRIBUTING |
| Practicality | 6/10 | Claude Code lock-in, no real-usage validation data |
| OSS Readiness | 6.5/10 | CI, license, contrib guide present but first-impression issues |

---

## P0 — Must Fix Before Promotion

### P0-1: Fix 3 Failing Tests (slop-detector-main.test.ts)
- **Problem**: `npm test` shows 3 failures. First thing any contributor does is `git clone → npm test`.
- **Impact**: Destroys trust on first impression.
- **File**: `tests/slop-detector-main.test.ts` (lines 57, 92, 104)
- **Action**: Fix the slop-detector tests or update the test expectations.

### P0-2: Coverage Threshold vs Self-Rule Contradiction
- **Problem**: `vitest.config.ts` sets `lines: 40%, branches: 34%`. `.claude/rules/forge-quality.md` demands `85%`.
- **Impact**: "Do as I say, not as I do" perception. Undermines Compound Engine's evidence-based credibility.
- **Action**: Either raise coverage to match the rule, or lower the rule to match reality with a roadmap to increase.
- **Recommendation**: Set realistic thresholds (e.g., 60% lines, 50% branches) and add a comment in forge-quality.md noting the gap with a plan.

### P0-3: txd Binary Security Warning
- **Problem**: `txd` shortcut for `--dangerously-skip-permissions` is a convenience wrapper for bypassing safety.
- **Impact**: Contradicts security-focused messaging (prompt injection defense, secret filter, db-guard).
- **Action**: Add clear warning in README/CLI help. Consider requiring explicit opt-in (e.g., env var).

---

## P1 — Should Fix Before Promotion

### P1-1: Real Compound Effect Demonstration
- **Problem**: No before/after data showing tenetx actually improves productivity over time.
- **Source**: All 3 reviewers flagged this independently.
- **Action**: Create a case study document showing:
  - Experiment→mature solution journey (at least 1 real example)
  - Solution survival rate (% of experiments that reach candidate+)
  - Before/after session comparison
- **Output**: `docs/case-study.md` or demo video

### P1-2: E2E Test for Hook Pipeline
- **Problem**: All hooks tested via mocks. No test that emulates actual Claude Code stdin protocol.
- **Action**: Create at least 1 integration test that pipes JSON stdin → hook script → validates stdout.
- **Benefit**: Proves the system works, not just individual functions.

### P1-3: Vendor Lock-in Transparency
- **Problem**: Claude Code dependency not explicitly disclosed in README.
- **Action**: Add one line to README Quick Start: "Requires Claude Code (Anthropic). Hook API changes may affect tenetx."

### P1-4: Empty Catch Blocks
- **Problem**: `catch { /* ignore */ }` in compound-extractor.ts, auto-learn.ts — violates own anti-pattern rule.
- **Files**: compound-extractor.ts:37, auto-learn.ts:69, and others.
- **Action**: Replace with `debugLog` calls at minimum.

### P1-5: Large File Decomposition Plan
- **Problem**: harness.ts (34K), agent-tuner.ts (33K), synthesizer.ts (28K), prompt-learner.ts (22K).
- **Impact**: High contributor entry barrier. Hard to review PRs touching these files.
- **Action**: Not immediate refactor needed, but document decomposition plan in CONTRIBUTING.md or an ADR.

### P1-6: Token Cost Guardrail for Solution Injection
- **Problem**: Per-session total injected tokens not capped. Each UserPromptSubmit runs 4 hooks + XML injection.
- **Source**: oh-my-openagent reviewer (citing $438 billing incident from OMO).
- **Action**: Add `MAX_INJECTED_TOKENS_PER_SESSION` constant in solution-injector.ts.

---

## P1-extra — Architectural Issues (Compound Engine Integrity)

### P1-7: Code Reflection False Positive
- **Problem**: If solution identifiers are common words ("ErrorBoundary", "useMemo"), they naturally appear in code without solution injection → `reflected++` falsely increases → incorrect promotion.
- **Source**: Compound Engineering reviewer.
- **Impact**: Undermines the core evidence-based lifecycle credibility.
- **Action**: Require identifier uniqueness (2+ word combo or camelCase), OR only count reflections within injection-session + time window.

### P1-8: "Why" Capture in Auto-Extraction (Upgraded from P2)
- **Problem**: Git diff shows what changed, not why. Auto-extraction path loses the reasoning context that makes solutions valuable long-term.
- **Source**: Every Inc. reviewer — "This is why we made /ce:compound manual."
- **Impact**: Solutions without "why" degrade to code snippets. Reduces long-term reuse value.
- **Action**: Enrich auto-extracted solutions with `git log --format=%B` commit messages. Document auto vs manual tradeoff.

### P1-9: Extraction Has Only Negative Filters
- **Problem**: 4 quality gates only filter bad patterns (structure, toxicity, dedup, re-extract). No positive filter for selecting genuinely reusable patterns.
- **Source**: Every Inc. reviewer + oh-my-openagent reviewer.
- **Impact**: High noise-to-signal ratio. Most experiments may retire without value → system does work without producing benefit.
- **Action**: Track extraction precision metrics, then use data to add positive signals (commit keywords, cross-project applicability).

### P1-10: Self-Rule Violations Beyond Coverage
- **Problem**: Multiple self-rules violated throughout codebase, not just coverage threshold:
  - `catch { /* ignore */ }` ~15 occurrences (anti-pattern.md: "no empty catch")
  - CONTRIBUTING.md: "No linter yet" but `biome.json` exists (documentation lie)
  - Functions exceeding 50-line guideline in 30K+ files
  - `@ts-ignore` / `eslint-disable` usage not audited
- **Impact**: Pattern of "rules for thee, not for me" — toxic for open source trust.
- **Action**: Systematic audit + fix. Each violation either fix or document exception with justification.

---

## P2 — Nice to Have

### P2-1: Architecture Guide for Contributors
- **Problem**: CONTRIBUTING.md has code style but no architecture overview.
- **Action**: Add a "How tenetx works" section with the 4-engine diagram and data flow.

### P2-2: Pack Marketplace Population
- **Problem**: Registry exists but community packs may be empty.
- **Action**: Verify tenetx-registry has content. If empty, seed with 2-3 example packs.

### P2-3: Extraction Precision Metrics
- **Problem**: Auto-extraction from git diff has unknown precision.
- **Source**: Every Inc. reviewer.
- **Action**: Track and log extraction precision (experiments that reach candidate / total experiments). Emit `compound-precision` lab event.

### P2-4: Solution Staleness Detection
- **Problem**: Solution content may reference code that no longer exists.
- **Source**: oh-my-openagent reviewer (hash-anchored edits context).
- **Action**: During lifecycle check, verify identifiers still exist in codebase. Mark stale solutions for deprioritized injection.

### P2-5: OMC Feature Gap Analysis
- **Problem**: OMC has 31 hooks vs tenetx 14. Notable gaps: preemptive-compaction (context compression prevention), todo-continuation, thinking-block-validator.
- **Action**: Evaluate each for tenetx applicability. Not all are needed, but some may be high-value.

### P2-6: Community Learning Bridge
- **Problem**: `~/.compound/` is personal-only. Every Inc. uses `docs/solutions/` in git for team sharing. Pack marketplace bridges this but is currently empty.
- **Source**: Every Inc. reviewer.
- **Action**: Consider `tenetx compound export` command to copy solutions into project `docs/solutions/`.

### P2-7: Plugin Schema Stability
- **Problem**: `$schema: "https://claude.ai/schemas/claude-plugin.json"` URL stability unknown. Anthropic API changes could break tenetx.
- **Action**: Document tested Claude Code version. Consider schema version pinning.

### P2-8: Dashboard Coverage Exclusion
- **Problem**: `src/dashboard/**` excluded from coverage without documented reason.
- **Action**: Add comment in vitest.config.ts explaining why (Ink/React TUI not suitable for unit tests).

### P2-9: Multi-language README Sync
- **Problem**: 4 language READMEs (EN/KO/ZH/JA) may be out of sync after v2.0 changes.
- **Action**: Verify all 4 reflect v2.0 Compound Engine, Pack Marketplace, and other changes.

### P2-10: Synthesizer ROI Validation
- **Problem**: synthesizer.ts is 28K lines but actual usage frequency and value unvalidated.
- **Action**: Track `tenetx ask --all` / `tenetx synth` usage during dogfooding. Adjust README emphasis accordingly.

### P2-11: Forge 5-Dimension Validation
- **Problem**: Are riskTolerance, autonomyPreference, qualityFocus, abstractionLevel, communicationStyle the RIGHT dimensions? No external user testing.
- **Action**: Have 3+ external users run `tenetx forge` and verify their profiles meaningfully differ.

### P2-12: EMA Learning Rate Justification
- **Problem**: LEARNING_RATE=0.25, MAX_DELTA=0.15 — are these tuned or arbitrary?
- **Action**: Document selection rationale. Validate with dogfooding data. Record in ADR.

---

## Promotional Strategy Recommendations

### Positioning
- **DO NOT**: Position as "OMC replacement" — cannot compete with 11K star community head-on.
- **DO**: Create new category: **"Adaptive AI Coding"** — Forge profiles, Lab evolves, Compound learns.
- **DO**: Show OMC + tenetx coexistence scenario (OMC orchestration + tenetx personalization).

### Key Message
> "Other AI tools give everyone the same experience. Tenetx learns how YOU code and gets better over time."

### Launch Assets Needed
1. **Demo video** (90 seconds): Install → forge interview → dimension visualization → 3 days later Lab evolution → solution promotion moment
2. **Case study document**: Real before/after with one project
3. **"Why not both?" guide**: OMC + tenetx together
4. **Hacker News / Reddit post**: Focus on the Compound Engine v3 evidence-based lifecycle as novel contribution

### Timing
- Fix P0 items first (est. 1-2 hours)
- Fix P1-1 through P1-4 (est. 1 day)
- Then promote

---

## Strengths to Highlight in Promotion

1. **Only 3 runtime dependencies** (ink, react, js-yaml) — lightest harness in the ecosystem
2. **Evidence-based solution lifecycle** — no other tool auto-retires bad patterns via circuit breaker
3. **5-dimension adaptive profiling** — Quality=0.80 senior gets different agent behavior than Quality=0.40 junior
4. **Security-first design** — 13 prompt injection patterns, NFKC normalization, XML escaping, path traversal prevention, ReDoS protection
5. **1548 tests across 97 files** — most thoroughly tested harness in the category (after P0-1 fix)
