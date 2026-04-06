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

# Tenetx — Completion Checklist

## 작업 완료 시 문서 정리 필수
- 코드 변경 후 관련 문서(CHANGELOG, README, 백로그, plugin.json 버전 등)도 반드시 업데이트
- 완료된 계획/이슈는 docs/history/로 이관하거나 상태를 갱신
- 버전 범프 시 package.json, plugin.json, CHANGELOG 3곳 동기화 확인

---

# Tenetx — Compound Loop

## Personal Rules (Me)
- Test First
