# ADR-001: Large File Decomposition Plan

**Status**: Proposed
**Date**: 2026-03-25
**Context**: Review feedback identified 4 files exceeding 20K characters as contributor entry barriers.

## Problem

| File | Size | Responsibility |
|------|------|---------------|
| harness.ts | 34K | Harness init, settings injection, hook registration, process setup |
| agent-tuner.ts | 33K | Profile → agent overlay generation for 19 agents |
| synthesizer.ts | 28K | Multi-model heuristic evaluation, agreement analysis, synthesis |
| prompt-learner.ts | 22K | Prompt pattern analysis, frequency tracking, learning |

These files violate the project's own "functions under 50 lines" guideline and make PR review difficult.

## Decision

Decompose in phases, prioritizing files that external contributors are most likely to modify:

### Phase 1: harness.ts → 3 modules
- `core/config-loader.ts` — Philosophy loading, scope resolution, config merge
- `core/hook-registrar.ts` — Hook registration, settings.json injection
- `core/process-launcher.ts` — Claude Code process setup and spawn coordination

### Phase 2: agent-tuner.ts → dimension-based modules
- `forge/tuners/quality-tuner.ts`
- `forge/tuners/autonomy-tuner.ts`
- `forge/tuners/risk-tuner.ts`
- `forge/tuners/abstraction-tuner.ts`
- `forge/tuners/communication-tuner.ts`
- `forge/agent-tuner.ts` — Coordinator that delegates to dimension tuners

### Phase 3: synthesizer.ts (lower priority — less likely to be externally modified)

## Consequences
- More files but each under 300 lines
- Clearer responsibility boundaries
- Easier PR review
- Import paths change (breaking for direct importers, not for CLI users)
