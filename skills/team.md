---
name: team
description: Multi-agent staged pipeline with specialized workers
triggers:
  - "team mode"
  - "team-mode"
  - "팀 모드"
  - "--team"
---

<Purpose>
Compound Harness Team — 전문 에이전트 기반 단계별 파이프라인.
"decompose-to-control" 원칙의 구현.
Claude Code 네이티브 팀 API를 활용합니다.
</Purpose>

<Staged_Pipeline>

## Stage 1: team-plan (탐색 + 분해)
- Agent: explore (Haiku) → planner (Opus)
- 작업 분석 및 하위 태스크 분해
- 각 태스크의 독립성/의존성 식별
- 에이전트 타입 및 모델 티어 결정

## Stage 2: team-prd (요구사항 정제)
- Agent: analyst (Opus)
- 각 태스크의 acceptance criteria 구체화
- 엣지 케이스 식별
- 선택적: critic 검토

## Stage 3: team-exec (병렬 실행)
- Agent: 태스크 유형별 전문가 선택
  - 코드 구현 → executor (Sonnet)
  - 버그 수정 → debugger (Sonnet)
  - UI 작업 → designer (Sonnet)
  - 문서 작성 → writer (Haiku)
- 독립적 태스크는 병렬 실행
- 의존적 태스크는 순차 실행

## Stage 4: team-verify (병렬 검증)
- Agent: verifier (Sonnet)
- 선택적: security-reviewer, code-reviewer
- 각 태스크의 acceptance criteria 검증
- CRITICAL 이슈 발견 시 team-fix로 전환

## Stage 5: team-fix (수정 루프)
- Agent: executor (Sonnet) 또는 debugger (Sonnet)
- team-verify에서 발견된 이슈 수정
- 수정 후 team-verify 재실행
- 최대 3회 반복

</Staged_Pipeline>

<Handoff_Protocol>
스테이지 전환 시 핸드오프 문서 작성:
```markdown
## Handoff: {from-stage} → {to-stage}
- **결정사항**: 확정된 설계/구현 방향
- **거부사항**: 검토 후 채택하지 않은 대안과 이유
- **리스크**: 알려진 위험 요소
- **산출물**: 생성/수정된 파일 목록
- **잔여 작업**: 다음 스테이지에서 처리할 것
```
핸드오프는 .compound/handoffs/{stage-name}.md 에 저장.
</Handoff_Protocol>

<Agent_Routing>
| 태스크 유형 | 에이전트 | 모델 |
|------------|---------|------|
| 탐색/검색 | explore | Haiku |
| 계획/설계 | planner, architect | Opus |
| 요구사항 | analyst | Opus |
| 코드 구현 | executor | Sonnet |
| 디버깅 | debugger | Sonnet |
| 검증 | verifier | Sonnet |
| 보안 | security-reviewer | Sonnet |
| 코드 리뷰 | code-reviewer | Sonnet |
| 비평 | critic | Opus |
| 문서 | writer | Haiku |
</Agent_Routing>

<State_Management>
상태 파일: ~/.compound/state/team-state.json
핸드오프: ~/.compound/handoffs/{stage}.md
</State_Management>
