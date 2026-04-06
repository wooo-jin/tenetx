# Hooks Reference

Tenetx registers up to 19 hooks (16 active by default; 3 workflow hooks auto-disabled when other plugins are detected). Each hook runs as a Node.js subprocess communicating via stdin/stdout JSON.

All hooks follow the Claude Code Plugin SDK protocol:
- **Input**: JSON object via stdin (tool name, input, session ID, etc.)
- **Output**: `{ "continue": true|false, "suppressOutput"?: true, "systemMessage"?: "..." }`

Hooks are organized into 3 tiers:
- **compound-core** (8): Always active. Required for the learning loop.
- **safety** (4): Active by default. Can be individually disabled via `hook-config.json`.
- **workflow** (7): Auto-disabled when overlapping plugins (OMC, superpowers) are detected.

---

## compound-core Tier

### solution-injector
- **Event:** UserPromptSubmit | **Timeout:** 3s | **compoundCritical:** yes
- Matches user prompt against accumulated solutions in `~/.tenetx/me/solutions/`. Injects matching solution summaries (Progressive Disclosure Tier 2). Full content available via `compound-read` MCP tool. v5.1: compound-read 호출 시 `reflected += 1` 자동 기록.

### notepad-injector
- **Event:** UserPromptSubmit | **Timeout:** 3s
- Injects `~/.tenetx/notepad.md` content into every prompt if present.

### context-guard
- **Event:** UserPromptSubmit | **Timeout:** 2s
- Tracks conversation length. Warns at prompt count ≥ 50 or total chars ≥ 200K. Cooldown: 10 minutes.

### context-guard-stop
- **Event:** Stop | **Timeout:** 5s
- Same module as context-guard. Detects context window exhaustion on Stop events.

### session-recovery
- **Event:** SessionStart | **Timeout:** 3s | **compoundCritical:** yes
- Recovers active persistent modes (ralph, autopilot, ultrawork, team, pipeline) from previous session. Triggers lazy compound extraction in background. Runs preference/content/workflow pattern detection. Runs lifecycle check once per day.

### post-tool-use
- **Event:** PostToolUse | **Timeout:** 3s | **compoundCritical:** yes
- File edit tracking (warns at ≥ 5 edits to same file), checkpoint saving (every 5 tool calls), token/cost tracking, error detection for model routing escalation.

### pre-compact
- **Event:** PreCompact | **Timeout:** 3s
- Injects a system message asking Claude to analyze the conversation and extract behavioral patterns. Saves handoff files for session recovery.

### pre-tool-use
- **Event:** PreToolUse | **Timeout:** 3s | **compoundCritical:** yes
- Dangerous command detection (from `dangerous-patterns.json`), Code Reflection detection (checks if Edit/Write code reflects injected solution identifiers), active mode reminders.

---

## safety Tier

### secret-filter
- **Event:** PostToolUse | **Matcher:** `Write|Edit|Bash` | **Timeout:** 3s
- Warns on exposed API keys, AWS access keys, JWT tokens, passwords, PEM private keys, DB connection strings.

### slop-detector
- **Event:** PostToolUse | **Matcher:** `Write|Edit` | **Timeout:** 3s
- Detects AI code quality issues: leftover TODOs, `eslint-disable`, `@ts-ignore`, `as any`, empty catch blocks, debug `console.log`.

### db-guard
- **Event:** PreToolUse | **Matcher:** `Bash` | **Timeout:** 3s
- Blocks `DROP TABLE/DATABASE/SCHEMA`, `TRUNCATE TABLE`, `DELETE FROM` without WHERE. Warns on `ALTER TABLE DROP COLUMN`, `UPDATE SET` without WHERE.

### rate-limiter
- **Event:** PreToolUse | **Timeout:** 2s
- 30 calls/minute sliding window. Prevents runaway agent loops.

---

## workflow Tier

These hooks are auto-disabled when other plugins (OMC, superpowers) are detected, to avoid conflicts.

### intent-classifier
- **Event:** UserPromptSubmit | **Timeout:** 3s
- Classifies prompt into 8 intent categories (implement, debug, refactor, explain, review, explore, design, general).

### keyword-detector
- **Event:** UserPromptSubmit | **Timeout:** 5s
- Detects magic keywords (autopilot, ralph, ultrawork, tdd, etc.) and activates execution modes.

### skill-injector
- **Event:** UserPromptSubmit | **Timeout:** 3s
- Matches prompt against skill triggers and injects skill content.

### permission-handler
- **Event:** PermissionRequest | **Timeout:** 2s
- Applies philosophy-declared permission policies.

### subagent-tracker (start/stop)
- **Event:** SubagentStart / SubagentStop | **Timeout:** 2s each
- Tracks active subagents in session state.

### post-tool-failure
- **Event:** PostToolUseFailure | **Timeout:** 3s
- Recovery guidance on tool failure. Feeds into model routing escalation.

---

## Fail-Safe Behavior

- All hooks emit `{ "continue": true }` on internal errors (fail-open).
- PreToolUse hooks use a consecutive-failure counter: 3 consecutive stdin parse failures → block for safety. Counter resets on success.
