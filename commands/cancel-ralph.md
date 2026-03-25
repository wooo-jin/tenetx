---
name: cancel-ralph
description: Cancel active Ralph Loop and clean up all state files
triggers:
  - "cancel ralph"
  - "랄프 취소"
  - "랄프 중단"
---

<Purpose>
활성화된 Ralph 루프를 즉시 중단하고 모든 상태 파일을 정리합니다.
</Purpose>

<Steps>

## Step 1 — 상태 파일 정리

다음 파일들을 삭제하여 Ralph 루프를 완전히 중단합니다:

1. `.claude/ralph-loop.local.md` (현재 프로젝트 디렉토리)
2. `~/.compound/state/ralph-state.json`
3. `~/.compound/state/skill-cache-*.json` (스킬 캐시)

```bash
# Ralph 루프 상태 파일 삭제
rm -f .claude/ralph-loop.local.md
rm -f ~/.compound/state/ralph-state.json

# 스킬 캐시 정리
rm -f ~/.compound/state/skill-cache-*.json
```

## Step 2 — 정리 확인

삭제 후 파일이 실제로 제거되었는지 확인합니다:

```bash
ls -la .claude/ralph-loop.local.md 2>/dev/null && echo "WARNING: ralph-loop.local.md still exists" || echo "OK: ralph-loop.local.md removed"
ls -la ~/.compound/state/ralph-state.json 2>/dev/null && echo "WARNING: ralph-state.json still exists" || echo "OK: ralph-state.json removed"
```

## Step 3 — 완료 메시지

사용자에게 다음을 알립니다:
- Ralph 루프가 중단되었습니다
- 진행 중이던 PRD/진행 파일(`.compound/prd.json`, `.compound/progress.txt`)은 보존됩니다 (나중에 재개 가능)
- 다시 시작하려면 `/tenetx:ralph`를 사용하세요

</Steps>

$ARGUMENTS
