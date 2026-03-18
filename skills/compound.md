---
name: compound
description: Compound Engineering (복리화) — 작업 패턴을 추출하여 솔루션으로 축적
triggers:
  - "복리화"
  - "compound"
  - "패턴 추출"
  - "솔루션 축적"
---

<Purpose>
작업 완료 후 복리화 단계를 실행합니다.
세션에서 수행한 작업을 분석하여 패턴, 솔루션, 컨벤션을 추출하고,
`tenetx compound` CLI를 통해 올바른 경로(~/.compound/me/)에 축적합니다.
</Purpose>

<Steps>
## Phase 1: 컨텍스트 수집
```bash
git diff --stat HEAD~1
git diff HEAD~1
git log --oneline -5
```
`.claude/.modified-files.json`도 참조.

## Phase 2: 분석
### 솔루션 추출
- 재사용 가능한 패턴 식별 (패턴명, 적용 상황, 코드 스니펫, 주의사항)

### 예방 규칙 도출
- CLAUDE.md 규칙 / 린트 규칙 / 타입 강화 / 테스트 추가 제안

## Phase 3: 축적 — `tenetx compound` CLI 사용

추출한 각 인사이트를 타입별로 CLI 명령어로 저장합니다:

```bash
# 솔루션 (재사용 가능한 패턴)
tenetx compound --solution "제목" "내용"

# 규칙 (예방 규칙)
tenetx compound --rule "제목" "내용"

# 컨벤션 (코딩 관례)
tenetx compound --convention "제목" "내용"

# 팀 스코프로 저장 (팀 전체에 공유할 인사이트)
tenetx compound --solution "제목" "내용" --to team
```

**중요**: 반드시 위 CLI 명령어로 저장하세요. 직접 파일을 생성하지 마세요.
이렇게 해야 `Me(N)` 스코프 카운트에 정확히 반영됩니다.

## Phase 4: 리포트
세션 요약, 추출 패턴, 예방 규칙, CLAUDE.md 업데이트 제안 (직접 수정 X)

## 판정
단순 타이포/1줄 수정 → "복리화 불필요" 후 종료
</Steps>

$ARGUMENTS
