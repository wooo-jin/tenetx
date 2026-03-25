# Auto vs Manual Extraction: Tradeoffs

Tenetx supports two paths for extracting solutions from coding sessions.

## Auto Extraction (SessionStart hook)

**How it works**: When a new session starts, the `session-recovery.ts` hook checks for new git commits since last extraction. If found, `compound-extractor.ts` analyzes the diff through 4 quality gates and saves solutions as `experiment` status.

**Strengths**:
- Zero effort — patterns are captured without manual action
- Consistent — every qualifying session produces extractions
- Quantity — catches patterns you might not notice

**Weaknesses**:
- No "why" context — git diff shows what changed, not why (mitigated in v2.1 by including commit messages)
- Lower precision — 4 quality gates are negative filters (removing bad), not positive filters (selecting good)
- Risk of noise — many experiments may retire without ever being useful

**Best for**: Long-running projects where patterns naturally repeat

## Manual Extraction (/compound skill)

**How it works**: Run `/compound` or type "복리화" during a session. The skill prompts Claude to analyze the full conversation context — including reasoning, failed attempts, and decision tradeoffs — and produce solutions.

**Strengths**:
- Captures "why" — conversation context includes reasoning that diff cannot
- Higher precision — human-in-the-loop judges what's worth extracting
- Richer content — includes anti-patterns, decision rationale, troubleshooting steps

**Weaknesses**:
- Requires manual action — easy to forget
- Subjective — quality depends on the extraction prompt and Claude's interpretation

**Best for**: Sessions with significant decisions, novel problem-solving, or architecture changes

## Recommendation

Use both. Auto-extraction catches the routine patterns. Manual extraction preserves the important "why" context for significant work. Review `tenetx compound list` periodically to see what was auto-extracted and promote or retire as needed.

## Disabling Auto Extraction

```bash
tenetx compound pause-auto    # Pause auto-extraction
tenetx compound resume-auto   # Resume auto-extraction
```
