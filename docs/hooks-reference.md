# Hooks Reference

Tenetx injects 14 hooks into Claude Code's `~/.claude/settings.json` at startup. Each hook runs as a Node.js subprocess communicating via stdin/stdout JSON.

All hooks follow Claude Code's hook protocol:
- **Input**: JSON object via stdin (tool name, input, session ID, etc.)
- **Output**: `{ "result": "approve" | "reject", "message"?: string, "reason"?: string }`

Hooks are re-injected every time `tenetx` starts, replacing any previous Tenetx hooks while preserving user-defined hooks.

---

## UserPromptSubmit Hooks

Triggered when the user submits a prompt. All hooks in this group run before Claude processes the message. They can inject additional context via `message`.

### intent-classifier

**File:** `src/hooks/intent-classifier.ts`
**Timeout:** 3000ms

Classifies the user's prompt into one of 8 intent categories and injects a brief hint:

| Intent | Trigger keywords | Hint injected |
|--------|-----------------|---------------|
| `implement` | create, add, build, write, 만들어 | "Consider tests too." |
| `debug` | error, bug, fix, 고쳐, 왜 | "Reproduce → isolate → fix." |
| `refactor` | refactor, clean up, optimize, 리팩토링 | "Preserve existing behavior." |
| `explain` | explain, what is, how does, 설명 | "Keep it concise." |
| `review` | review, audit, check, 리뷰 | "Classify by severity." |
| `explore` | find, search, where, locate, 찾아 | "Use Glob/Grep." |
| `design` | design, architect, structure, 설계 | "State trade-offs." |
| `general` | *(no match)* | *(no hint)* |

The hint is visible to Claude as a system reminder.

---

### keyword-detector

**File:** `src/hooks/keyword-detector.ts`
**Timeout:** 5000ms

Detects magic keywords in the prompt and activates the corresponding execution mode by injecting the full skill definition into Claude's context.

| Keyword | Mode activated |
|---------|---------------|
| `autopilot` | 5-phase autonomous pipeline |
| `ralph` | PRD-based completion loop |
| `ultrawork` | Maximum parallelism burst |
| `tdd` | Test-driven development |
| `ultrathink` | Extended reasoning |
| `deepsearch` | Deep codebase search |
| `ccg` | 3-model cross-validation |
| `deep-interview` | Socratic requirements clarification |
| `canceltenetx` | Cancel all active modes |

Mode state is written to `~/.compound/state/{mode}-state.json` and cleared when cancelled.

---

### skill-injector

**File:** `src/hooks/skill-injector.ts`
**Timeout:** 3000ms

Matches the prompt against skill `triggers` defined in skill YAML frontmatter. When a match is found, injects the full skill content as context.

Skill lookup order (highest priority first):
1. `{project}/.compound/skills/`
2. Connected pack `skills/`
3. `~/.compound/me/skills/`
4. `~/.compound/skills/`
5. Built-in package skills

Skills already handled by `keyword-detector` are skipped to prevent double-injection.

---

### context-guard *(also in Stop)*

**File:** `src/hooks/context-guard.ts`
**Timeout:** 2000ms (UserPromptSubmit), 3000ms (Stop)

Tracks conversation length and warns when approaching context limits:
- Prompt count ≥ 50 → warning
- Total characters ≥ 200,000 → warning
- Warning cooldown: 10 minutes (prevents spam)

In the `Stop` event, also detects session-end errors and preserves state.

---

### notepad-injector

**File:** `src/hooks/notepad-injector.ts`
**Timeout:** 3000ms

If a notepad file exists at `.compound/notepad.md`, injects its content into every prompt. Use `tenetx notepad add "..."` to populate it with persistent context (e.g., recurring constraints, current task state).

---

### solution-injector

**File:** `src/hooks/solution-injector.ts`
**Timeout:** 3000ms

Scans `~/.compound/me/solutions/` and connected pack `solutions/` for entries whose keywords match the current prompt. Injects matching solutions as context hints — bringing past answers to you at the moment of decision.

---

## SessionStart Hooks

Triggered once when a new Claude Code session begins.

### session-recovery

**File:** `src/hooks/session-recovery.ts`
**Timeout:** 3000ms

On session start, checks `~/.compound/state/` for checkpoints from the previous session. If a persistent mode (ralph, autopilot, ultrawork) was active, injects a recovery message so work can resume automatically.

Checkpoints are written every 5 tool calls by the `post-tool-use` hook.

---

## Stop Hooks

Triggered when Claude stops generating (end of response).

### context-guard *(shared with UserPromptSubmit)*

See [context-guard](#context-guard-also-in-stop) above. In Stop events, detects context window exhaustion and advises compaction.

---

## PreToolUse Hooks

Triggered before any tool executes. Can block execution with `result: "reject"`.

### pre-tool-use

**File:** `src/hooks/pre-tool-use.ts`
**Timeout:** 3000ms

Checks `Bash` tool commands against dangerous patterns loaded from:
1. `dist/hooks/dangerous-patterns.json` (built-in)
2. `~/.compound/dangerous-patterns.json` (user customizations)

**Block** (hard reject, cannot proceed):
- `rm -rf` on root or home paths
- `curl ... | sh` (pipe to shell)
- Fork bombs
- Other patterns in `dangerous-patterns.json`

**Warn** (approve with warning):
- Patterns marked `severity: "warn"` in the pattern files

Also injects an active-mode reminder every 10 tool calls when execution modes are active.

**Customization:** Add your own patterns to `~/.compound/dangerous-patterns.json`:

```json
[
  {
    "pattern": "kubectl delete namespace",
    "description": "Delete Kubernetes namespace",
    "severity": "block"
  }
]
```

---

### db-guard

**File:** `src/hooks/db-guard.ts`
**Timeout:** 3000ms

Detects dangerous SQL statements in `Bash` tool commands:

| Pattern | Severity |
|---------|----------|
| `DROP TABLE/DATABASE/SCHEMA` | block |
| `TRUNCATE TABLE` | block |
| `DELETE FROM` without `WHERE` | block |
| `ALTER TABLE ... DROP COLUMN` | warn |
| `UPDATE ... SET` without `WHERE` | warn |

SQL comments are stripped before matching to avoid false positives. `DELETE`/`UPDATE` with a valid `WHERE` clause are allowed through.

---

### rate-limiter

**File:** `src/hooks/rate-limiter.ts`
**Timeout:** 2000ms

Limits tool call frequency to 30 calls/minute (sliding window). Blocks with a rate-limit message when exceeded. Designed to prevent runaway agent loops.

State is stored atomically in `~/.compound/state/rate-limit.json` using PID-specific temp files to handle concurrent sessions safely.

---

## PostToolUse Hooks

Triggered after a tool completes successfully.

### post-tool-use

**File:** `src/hooks/post-tool-use.ts`
**Timeout:** 3000ms

Does four things:

1. **File edit tracking** — For `Write`/`Edit` tool calls, records the file path and edit count to `~/.compound/state/modified-files-{sessionId}.json`. Warns when the same file has been edited ≥ 5 times.

2. **Checkpoint saving** — Every 5 tool calls, writes a checkpoint to `~/.compound/state/checkpoint-{sessionId}.json` (used by `session-recovery`).

3. **Token/cost tracking** — Estimates token usage and cost across the session. Displays a summary every 50 tool calls.

4. **Error detection** — Scans `Bash` tool output for error patterns (`ENOENT`, `EACCES`, `SyntaxError`, etc.) and increments a failure counter used by the model routing escalation system.

---

### secret-filter

**File:** `src/hooks/secret-filter.ts`
**Timeout:** 3000ms

Scans tool outputs for exposed secrets. Warns (does not block) when detected:

| Pattern | What it catches |
|---------|----------------|
| API Key | `sk_...`, `pk_...`, `api_key_...` |
| AWS Access Key | `AKIA` prefix (20 chars) |
| Token/Bearer/JWT | Token assignment patterns |
| Password | `password=...` assignments |
| Private Key | PEM headers |
| Connection String | DB URLs with embedded credentials |

---

### slop-detector

**File:** `src/hooks/slop-detector.ts`
**Timeout:** 3000ms

After `Write` or `Edit` tool calls, scans written content for common AI code quality issues:

| Pattern | Severity |
|---------|----------|
| Leftover `// TODO: implement/add/fix` | warn |
| `// eslint-disable` comments | warn |
| `// @ts-ignore` comments | warn |
| `as any` type assertions | warn |
| Empty catch blocks `catch(e) {}` | warn |
| `console.log` debug code | info |
| Duplicate JSDoc blocks | info |
| Unnecessary explanatory comments | info |

---

## SubagentStart / SubagentStop Hooks

Triggered when Claude spawns or completes a subagent.

### subagent-tracker

**File:** `src/hooks/subagent-tracker.ts`
**Timeout:** 2000ms (both events)

Tracks active subagents in `~/.compound/state/subagent-{sessionId}.json`. Used by the governance dashboard to display real-time agent activity.

Called with `start` or `stop` argument to differentiate events.

---

## PreCompact Hook

Triggered before Claude Code compacts the conversation context.

### pre-compact

**File:** `src/hooks/pre-compact.ts`
**Timeout:** 3000ms

Before compaction, saves a handoff file to `~/.compound/handoffs/` containing:
- All currently active mode states
- Snapshot of what was in progress

After compaction, `session-recovery` can use this to restore context.

---

## PermissionRequest Hook

Triggered when Claude Code requests permission to perform an action.

### permission-handler

**File:** `src/hooks/permission-handler.ts`
**Timeout:** 2000ms

Applies philosophy-declared permission policies. Evaluates whether to auto-approve or escalate to the user based on the action type and current scope (Me / Team / Project).

---

## PostToolUseFailure Hook

Triggered when a tool call fails.

### post-tool-failure

**File:** `src/hooks/post-tool-failure.ts`
**Timeout:** 3000ms

Provides recovery guidance when a tool fails. Increments the session failure counter (fed into the 16-signal model routing system, which escalates to a more capable model tier after repeated failures).

---

## Hook Execution Order

For each event, hooks run sequentially in registration order:

```
UserPromptSubmit:
  1. intent-classifier   (3s)
  2. keyword-detector    (5s)
  3. skill-injector      (3s)
  4. context-guard       (2s)
  5. notepad-injector    (3s)
  6. solution-injector   (3s)

SessionStart:
  1. session-recovery    (3s)

Stop:
  1. context-guard       (3s)

PreToolUse:
  1. pre-tool-use        (3s) ← can block
  2. db-guard            (3s) ← can block
  3. rate-limiter        (2s) ← can block

PostToolUse:
  1. post-tool-use       (3s)
  2. secret-filter       (3s)
  3. slop-detector       (3s)

SubagentStart / SubagentStop:
  1. subagent-tracker    (2s)

PreCompact:
  1. pre-compact         (3s)

PermissionRequest:
  1. permission-handler  (2s)

PostToolUseFailure:
  1. post-tool-failure   (3s)
```

---

## Fail-Safe Behavior

All blocking hooks (PreToolUse group) implement a **consecutive-failure counter**. If stdin parsing fails 3 times in a row, the hook blocks to protect against silent failures. On a successful parse, the counter resets.

Non-blocking hooks (PostToolUse group) always output `result: "approve"` even on internal errors, so a hook bug never interrupts your workflow.
