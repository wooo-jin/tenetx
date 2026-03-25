# ADR-002: Lab Learning Rate Parameters

**Status**: Accepted (pending empirical validation)
**Date**: 2026-03-25
**Context**: Lab auto-learn uses EMA smoothing to evolve Forge profile dimensions. Parameters were chosen conservatively but lack empirical tuning data.

## Current Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| LEARNING_RATE (EMA α) | 0.25 | Balance between responsiveness and stability. Higher than typical EMA (0.1) because coding patterns change faster than financial data. |
| MAX_DELTA_PER_CYCLE | 0.15 | Prevent any single learning cycle from dramatically shifting profile. 0.15 means a dimension can move at most 15% of its range per day. |
| MIN_EVENTS_THRESHOLD | 30 | Minimum behavioral events before learning triggers. Prevents overfitting to small samples. Was 50, lowered to 30 after initial testing showed 50 was too conservative for short sessions. |
| MIN_HOURS_BETWEEN_RUNS | 24 | One learning cycle per day maximum. Prevents oscillation from rapid successive adjustments. |
| DEFAULT_WINDOW_DAYS | 30 | Analysis window for pattern detection. 30 days balances recency with statistical significance. |

## Validation Plan
1. Dogfood for 2+ weeks, recording dimension values daily
2. Plot dimension trajectories — should converge, not oscillate
3. If dimensions barely move: increase LEARNING_RATE to 0.35
4. If dimensions swing wildly: decrease MAX_DELTA to 0.10
5. Document actual trajectories in docs/case-study.md

## Decision
Keep current values as starting point. Adjust based on empirical data. This ADR will be updated with validation results.
