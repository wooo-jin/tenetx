# Tenetx — Security Rules

## Dangerous Command Warning
- Always confirm before executing destructive commands like `rm -rf`, `git push --force`, `DROP TABLE`
- Double confirmation required for production environment access

## Secret Key Protection
- Do not commit sensitive information such as `.env`, `credentials.json`, API keys
- Manage through environment variables or a secrets manager
- Detect hardcoded secrets during code review


---

# Tenetx — Anti-Pattern Detection

## Repeated Edit Warning
- Stop immediately when editing the same file 3+ times → full structure redesign required
- For 5+ edits, always check current state with Read before replacing with a single Write

## Error Suppression Warning
- No empty catch blocks — at minimum log or re-throw
- Minimize suppression comments like eslint-disable, @ts-ignore

## Excessive Complexity Warning
- Consider splitting single functions exceeding 50 lines
- Apply early return pattern when nesting depth exceeds 4
- No unnecessary abstraction — implement only what is currently needed


---

# Tenetx — Compound Loop

## Personal Rules (Me)
- Test First
