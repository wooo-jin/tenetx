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

<Usage>
## 사용법

```
/tenetx:team N:agent-type "작업 설명"
/tenetx:team "작업 설명"
/tenetx:team ralph "작업 설명"
```

### 파라미터

- **N** - 팀원 에이전트 수 (1-20). 선택사항; 기본값은 태스크 분해 기반 자동 결정.
- **agent-type** - `team-exec` 단계에 스폰할 에이전트 타입 (executor, debugger, designer, codex, gemini 등). 선택사항; 기본값은 단계별 자동 라우팅.
- **task** - 분해하여 팀원에게 분배할 상위 작업 설명
- **ralph** - 선택 수식어. 사용 시 Ralph 지속 루프(실패 시 재시도, architect 검증)로 팀을 감싼다. 아래 Team + Ralph Composition 참조.

### 예시

```bash
/tenetx:team 5:executor "프로젝트 전체의 TypeScript 에러 수정"
/tenetx:team 3:debugger "src/ 빌드 에러 수정"
/tenetx:team 4:designer "모든 페이지 컴포넌트에 반응형 레이아웃 구현"
/tenetx:team "인증 모듈 리팩토링 + 보안 리뷰"
/tenetx:team ralph "사용자 관리 REST API 전체 구축"
# Codex CLI 워커 (필요: npm install -g @openai/codex)
/tenetx:team 2:codex "아키텍처 리뷰 및 개선 제안"
# Gemini CLI 워커 (필요: npm install -g @google/gemini-cli)
/tenetx:team 2:gemini "UI 컴포넌트 재설계"
```
</Usage>

<Architecture>
## 아키텍처

```
User: "/tenetx:team 3:executor TypeScript 에러 전부 수정"
              |
              v
      [TEAM ORCHESTRATOR (Lead)]
              |
              +-- TeamCreate("fix-ts-errors")
              |       -> lead가 team-lead@fix-ts-errors가 됨
              |
              +-- 태스크 분석 및 분해
              |       -> explore/architect가 하위 태스크 목록 생성
              |
              +-- TaskCreate x N (하위 태스크별 1개)
              |       -> 태스크 #1, #2, #3 (의존성 포함)
              |
              +-- TaskUpdate x N (오너 사전 배정)
              |       -> 태스크 #1 owner=worker-1, 등
              |
              +-- Task(team_name="fix-ts-errors", name="worker-1") x 3
              |       -> 팀원을 팀에 스폰
              |
              +-- 모니터 루프
              |       <- 팀원의 SendMessage (자동 수신)
              |       -> TaskList 폴링으로 진행 상황 확인
              |       -> SendMessage로 조율/차단 해제
              |
              +-- 완료
                      -> SendMessage(shutdown_request) 각 팀원에게
                      <- SendMessage(shutdown_response, approve: true)
                      -> TeamDelete("fix-ts-errors")
                      -> rm .compound/state/team-state.json
```

**저장소 레이아웃 (Claude Code 관리):**
```
~/.claude/
  teams/fix-ts-errors/
    config.json          # 팀 메타데이터 + members 배열
  tasks/fix-ts-errors/
    .lock                # 동시 접근용 파일 락
    1.json               # 하위 태스크 #1
    2.json               # 하위 태스크 #2
    3.json               # 하위 태스크 #3
    ...
```
</Architecture>

<Staged_Pipeline>
## Staged Pipeline (정규 팀 런타임)

팀 실행은 단계별 파이프라인을 따릅니다:

`team-plan -> team-prd -> team-exec -> team-verify -> team-fix (루프)`

### Stage Agent Routing

각 파이프라인 단계는 **전문 에이전트**를 사용합니다. 리드가 단계와 태스크 특성에 따라 에이전트를 선택합니다.

| 단계 | 필수 에이전트 | 선택 에이전트 | 선택 기준 |
|------|-------------|-------------|----------|
| **team-plan** | `explore` (haiku), `planner` (opus) | `analyst` (opus), `architect` (opus) | 요구사항 불명확 시 `analyst`. 복잡한 시스템 경계 시 `architect`. |
| **team-prd** | `analyst` (opus) | `critic` (opus) | 스코프 도전 시 `critic`. |
| **team-exec** | `executor` (sonnet) | `executor` (opus), `debugger` (sonnet), `designer` (sonnet), `writer` (haiku), `test-engineer` (sonnet) | 하위 태스크 유형에 에이전트 매칭. 복잡한 자율 작업은 `executor` (model="opus"), UI는 `designer`, 빌드 문제는 `debugger`, 문서는 `writer`, 테스트 생성은 `test-engineer`. |
| **team-verify** | `verifier` (sonnet) | `test-engineer` (sonnet), `security-reviewer` (sonnet), `code-reviewer` (opus), `code-reviewer` (haiku) | 항상 `verifier` 실행. 인증/암호화 변경 시 `security-reviewer` 추가. 20+ 파일 또는 아키텍처 변경 시 `code-reviewer` 추가. 스타일/포맷팅은 `code-reviewer` (model="haiku"). |
| **team-fix** | `executor` (sonnet) | `debugger` (sonnet), `debugger` (sonnet), `executor` (opus) | 타입/빌드 에러는 `debugger`. 회귀 격리는 `debugger`. 복잡한 다중 파일 수정은 `executor` (model="opus"). |

**라우팅 규칙:**

1. **리드가 단계별 에이전트를 선택한다.** 사용자의 `N:agent-type` 파라미터는 `team-exec` 단계 워커 타입만 오버라이드. 나머지 단계는 단계별 전문가 사용.
2. **전문 에이전트가 executor를 보완한다.** 분석/리뷰는 architect/critic Claude 에이전트에, UI 작업은 designer 에이전트에 라우팅.
3. **비용 모드가 모델 티어에 영향.** 다운그레이드 시: `opus` → `sonnet`, `sonnet` → `haiku`. `team-verify`는 최소 `sonnet` 유지.
4. **리스크 수준이 리뷰를 에스컬레이션.** 보안 민감 또는 20+ 파일 변경 시 `security-reviewer` + `code-reviewer` (opus) 필수.

### Stage 1: team-plan (탐색 + 분해)
- Agent: explore (Haiku) → planner (Opus)
- Entry: 팀 호출이 파싱되고 오케스트레이션 시작.
- 작업 분석 및 하위 태스크 분해
- 각 태스크의 독립성/의존성 식별
- 에이전트 타입 및 모델 티어 결정
- Exit: 분해 완료 및 실행 가능한 태스크 그래프 준비.

### Stage 2: team-prd (요구사항 정제)
- Agent: analyst (Opus)
- Entry: 스코프가 모호하거나 acceptance criteria 누락.
- 각 태스크의 acceptance criteria 구체화
- 엣지 케이스 식별
- 선택적: critic 검토
- Exit: acceptance criteria와 경계가 명시적.

### Stage 3: team-exec (병렬 실행)
- Agent: 태스크 유형별 전문가 선택
  - 코드 구현 → executor (Sonnet)
  - 복잡한 자율 작업 → executor (Opus, model="opus")
  - 버그 수정 → debugger (Sonnet)
  - UI 작업 → designer (Sonnet)
  - 문서 작성 → writer (Haiku)
  - 테스트 생성 → test-engineer (Sonnet)
  - 빌드 문제 → debugger (Sonnet)
- Entry: `TeamCreate`, `TaskCreate`, 배정, 워커 스폰 완료.
- 독립적 태스크는 병렬 실행
- 의존적 태스크는 순차 실행
- Exit: 현재 패스의 실행 태스크가 터미널 상태 도달.

### Stage 4: team-verify (병렬 검증)
- Agent: verifier (Sonnet)
- 선택적: security-reviewer, code-reviewer
- Entry: 실행 패스 완료.
- 각 태스크의 acceptance criteria 검증
- Exit (통과): 검증 게이트 통과, 후속 작업 없음.
- Exit (실패): 수정 태스크 생성, team-fix로 전환.

### Stage 5: team-fix (수정 루프)
- Agent: executor (Sonnet) 또는 debugger (Sonnet)
- Entry: 검증에서 결함/회귀/불완전 발견.
- team-verify에서 발견된 이슈 수정
- 수정 후 team-verify 재실행
- Exit: 수정 완료, team-exec → team-verify로 복귀.
- 최대 3회 반복. 초과 시 터미널 `failed` 상태 (무한 루프 방지).

### Verify/Fix 루프 정지 조건

`team-exec -> team-verify -> team-fix` 반복 조건:
1. 검증 통과 + 필수 수정 태스크 없음, 또는
2. 명시적 터미널 blocked/failed 결과 + 증거.
</Staged_Pipeline>

<Handoff_Protocol>
## 핸드오프 프로토콜

스테이지 전환 시 핸드오프 문서 작성:

```markdown
## Handoff: {from-stage} → {to-stage}
- **결정사항**: 확정된 설계/구현 방향
- **거부사항**: 검토 후 채택하지 않은 대안과 이유
- **리스크**: 알려진 위험 요소
- **산출물**: 생성/수정된 파일 목록
- **잔여 작업**: 다음 스테이지에서 처리할 것
```

핸드오프는 `.compound/handoffs/{stage-name}.md`에 저장.

### 핸드오프 규칙

1. **리드가 다음 단계 에이전트 스폰 전에 이전 핸드오프를 읽는다.** 핸드오프 내용은 다음 단계 에이전트 스폰 프롬프트에 포함되어 에이전트가 전체 컨텍스트로 시작.
2. **핸드오프는 누적된다.** verify 단계에서 모든 이전 핸드오프(plan → prd → exec)를 읽어 전체 결정 이력 확보.
3. **팀 취소 시 핸드오프는 보존된다.** `.compound/handoffs/`에 남아 세션 재개에 활용. `TeamDelete`로 삭제되지 않음.
4. **핸드오프는 경량.** 최대 10-20줄. 결정과 근거를 기록하며, 전체 명세(DESIGN.md 등)는 별도 산출물 파일에.

### 핸드오프 예시

```markdown
## Handoff: team-plan → team-exec
- **결정사항**: 마이크로서비스 아키텍처, 3개 서비스(auth, api, worker). PostgreSQL. JWT 인증.
- **거부사항**: 모놀리스(확장성 우려), MongoDB(팀 전문성이 SQL), 세션 쿠키(API 우선 설계).
- **리스크**: Worker 서비스에 Redis 필요 — 아직 미프로비저닝. Auth 서비스 초기 설계에 rate limiting 없음.
- **산출물**: DESIGN.md, TEST_STRATEGY.md
- **잔여 작업**: DB 마이그레이션 스크립트, CI/CD 파이프라인 설정, Redis 프로비저닝.
```
</Handoff_Protocol>

<Claude_Code_Native_API>
## Claude Code 네이티브 API 호출 시퀀스

### Phase 1: 입력 파싱
- **N** (에이전트 수) 추출, 1-20 범위 검증
- **agent-type** 추출, 알려진 서브에이전트 매핑 검증
- **task** 설명 추출

### Phase 2: 분석 및 분해
`explore` 또는 `architect`를 사용하여 코드베이스 분석 및 N개 하위 태스크 분해:
- 각 하위 태스크는 **파일 범위** 또는 **모듈 범위**로 충돌 방지
- 독립적이거나 명확한 의존성 순서 필요
- 각 하위 태스크에 간결한 `subject`와 상세 `description` 필요
- 하위 태스크 간 의존성 식별 (예: "공유 타입이 소비자보다 먼저 수정되어야 함")

### Phase 3: 팀 생성

`TeamCreate` 호출:

```json
{
  "team_name": "fix-ts-errors",
  "description": "프로젝트 전체 TypeScript 에러 수정"
}
```

**응답:**
```json
{
  "team_name": "fix-ts-errors",
  "team_file_path": "~/.claude/teams/fix-ts-errors/config.json",
  "lead_agent_id": "team-lead@fix-ts-errors"
}
```

현재 세션이 팀 리드(`team-lead@fix-ts-errors`)가 됨.

상태 기록:
```
state_write(mode="team", active=true, current_phase="team-plan", state={
  "team_name": "fix-ts-errors",
  "agent_count": 3,
  "agent_types": "executor",
  "task": "TypeScript 에러 전부 수정",
  "fix_loop_count": 0,
  "max_fix_loops": 3,
  "linked_ralph": false,
  "stage_history": "team-plan"
})
```

> **참고:** 상태 값은 모두 문자열로 전송됨. `agent_count`, `fix_loop_count`, `max_fix_loops`는 숫자로, `linked_ralph`는 boolean으로 변환 필요.

**상태 스키마 필드:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `active` | boolean | 팀 모드 활성 여부 |
| `current_phase` | string | 현재 파이프라인 단계: `team-plan`, `team-prd`, `team-exec`, `team-verify`, `team-fix` |
| `team_name` | string | 팀 슬러그명 |
| `agent_count` | number | 워커 에이전트 수 |
| `agent_types` | string | team-exec에서 사용하는 쉼표 구분 에이전트 타입 |
| `task` | string | 원본 태스크 설명 |
| `fix_loop_count` | number | 현재 수정 반복 횟수 |
| `max_fix_loops` | number | 최대 수정 반복 횟수 (기본: 3) |
| `linked_ralph` | boolean | Ralph 지속 루프 연결 여부 |
| `stage_history` | string | 타임스탬프 포함 단계 전환 이력 (쉼표 구분) |

**단계 전환 시 상태 업데이트:**
```
state_write(mode="team", current_phase="team-exec", state={
  "stage_history": "team-plan:2026-02-07T12:00:00Z,team-prd:2026-02-07T12:01:00Z,team-exec:2026-02-07T12:02:00Z"
})
```

**재개 감지용 상태 읽기:**
```
state_read(mode="team")
```
`active=true`이고 `current_phase`가 비터미널이면, 새 팀 생성 대신 마지막 미완료 단계에서 재개.

### Phase 4: 태스크 생성

각 하위 태스크에 `TaskCreate` 호출. `TaskUpdate`의 `addBlockedBy`로 의존성 설정.

```json
// 하위 태스크 1의 TaskCreate
{
  "subject": "src/auth/ 타입 에러 수정",
  "description": "src/auth/login.ts, src/auth/session.ts, src/auth/types.ts의 모든 TypeScript 에러 수정. tsc --noEmit으로 검증.",
  "activeForm": "auth 타입 에러 수정 중"
}
```

**응답 (태스크 파일, 예: `1.json`):**
```json
{
  "id": "1",
  "subject": "src/auth/ 타입 에러 수정",
  "description": "src/auth/login.ts의 모든 TypeScript 에러 수정...",
  "activeForm": "auth 타입 에러 수정 중",
  "owner": "",
  "status": "pending",
  "blocks": [],
  "blockedBy": []
}
```

의존성 있는 태스크:
```json
// 태스크 #3이 태스크 #1에 의존 (공유 타입이 먼저 수정되어야 함)
{
  "taskId": "3",
  "addBlockedBy": ["1"]
}
```

**리드에서 오너 사전 배정** (레이스 컨디션 방지, 원자적 클레이밍 없음):
```json
// 태스크 #1을 worker-1에 배정
{
  "taskId": "1",
  "owner": "worker-1"
}
```

### Phase 5: 팀원 스폰

N명의 팀원을 `Task`로 스폰. `team_name`과 `name` 파라미터 사용. 각 팀원에게 워커 프리앰블(아래 참조) + 특정 배정 주입.

```json
{
  "subagent_type": "tenetx:executor",
  "team_name": "fix-ts-errors",
  "name": "worker-1",
  "prompt": "<worker-preamble + 배정된 태스크>"
}
```

**응답:**
```json
{
  "agent_id": "worker-1@fix-ts-errors",
  "name": "worker-1",
  "team_name": "fix-ts-errors"
}
```

**부작용:**
- `config.json` members 배열에 팀원 추가
- `metadata._internal: true`인 **내부 태스크** 자동 생성 (에이전트 라이프사이클 추적)
- 내부 태스크가 `TaskList` 출력에 표시됨 — 실제 태스크 카운트 시 필터링 필요

**중요:** 모든 팀원을 병렬로 스폰 (백그라운드 에이전트). 하나가 끝날 때까지 기다리지 않음.

### Phase 6: 모니터

리드 오케스트레이터가 두 채널을 통해 진행 모니터링:

1. **인바운드 메시지** — 팀원이 태스크 완료 또는 도움 필요 시 `SendMessage`를 `team-lead`에게 전송. 새 대화 턴으로 자동 도착 (폴링 불필요).

2. **TaskList 폴링** — 주기적으로 `TaskList` 호출하여 전체 진행 확인:
   ```
   #1 [completed] src/auth/ 타입 에러 수정 (worker-1)
   #3 [in_progress] src/api/ 타입 에러 수정 (worker-2)
   #5 [pending] src/utils/ 타입 에러 수정 (worker-3)
   ```
   형식: `#ID [status] subject (owner)`

**리드의 조율 액션:**
- **팀원 차단 해제:** 가이드나 누락된 컨텍스트를 `message`로 전송
- **작업 재배정:** 팀원이 일찍 완료하면 `TaskUpdate`로 대기 태스크 배정 + `SendMessage`로 알림
- **실패 처리:** 팀원이 실패 보고 시, 태스크 재배정 또는 교체 팀원 스폰

#### 태스크 워치독 정책

정체/실패 팀원 모니터링:
- **최대 in-progress 시간**: 5분 이상 메시지 없이 `in_progress` → 상태 확인 메시지 전송
- **죽은 워커 의심**: 10분+ 메시지 없음 + 정체 태스크 → 다른 워커에 태스크 재배정
- **재배정 임계값**: 워커가 2+ 태스크 실패 시 새 태스크 배정 중단

### Phase 6.5: 단계 전환 (상태 유지)

모든 단계 전환 시 상태 업데이트:

```
// 계획 후 team-exec 진입
state_write(mode="team", current_phase="team-exec", state={
  "stage_history": "team-plan:T1,team-prd:T2,team-exec:T3"
})

// 실행 후 team-verify 진입
state_write(mode="team", current_phase="team-verify")

// 검증 실패 후 team-fix 진입
state_write(mode="team", current_phase="team-fix", state={
  "fix_loop_count": 1
})
```

활용:
- **재개**: 리드 크래시 시 `state_read(mode="team")`로 마지막 단계와 팀명 복구
- **취소**: cancel 스킬이 `current_phase`를 읽어 필요한 정리 파악
- **Ralph 통합**: Ralph가 팀 상태를 읽어 파이프라인 완료/실패 여부 판단

### Phase 7: 완료

모든 실제 태스크(비내부)가 completed 또는 failed일 때:

1. **결과 확인** — `TaskList`로 모든 하위 태스크가 `completed`인지 확인
2. **팀원 종료** — 각 활성 팀원에게 `shutdown_request` 전송
3. **응답 대기** — 각 팀원이 `shutdown_response(approve: true)`로 응답 후 종료
4. **팀 삭제** — `TeamDelete` 호출하여 정리
5. **상태 정리** — `.compound/state/team-state.json` 삭제
6. **요약 보고** — 사용자에게 결과 표시
</Claude_Code_Native_API>

<Worker_Preamble>
## 워커 프리앰블 (Agent Preamble)

팀원 스폰 시 프롬프트에 이 프리앰블을 포함하여 작업 프로토콜을 수립합니다. 팀원별 특정 태스크 배정으로 적응시키세요.

```
당신은 팀 "{team_name}"의 TEAM WORKER입니다. 당신의 이름은 "{worker_name}"입니다.
팀 리드("team-lead")에게 보고합니다.

== 작업 프로토콜 ==

1. CLAIM: TaskList를 호출하여 배정된 태스크 확인 (owner = "{worker_name}").
   status "pending"인 첫 번째 배정 태스크를 선택.
   TaskUpdate로 status "in_progress" 설정:
   {"taskId": "ID", "status": "in_progress", "owner": "{worker_name}"}

2. WORK: 도구(Read, Write, Edit, Bash)를 사용하여 태스크 실행.
   서브 에이전트를 스폰하지 마세요. 위임하지 마세요. 직접 작업하세요.

3. COMPLETE: 완료 시 태스크를 completed로 마킹:
   {"taskId": "ID", "status": "completed"}

4. REPORT: SendMessage로 리드에게 알림:
   {"type": "message", "recipient": "team-lead", "content": "태스크 #ID 완료: <수행 내용 요약>", "summary": "태스크 #ID 완료"}

5. NEXT: TaskList에서 추가 배정 태스크 확인. 대기 태스크가 있으면 1단계로.
   추가 태스크 없으면 리드에게 알림:
   {"type": "message", "recipient": "team-lead", "content": "배정된 모든 태스크 완료. 대기 중.", "summary": "전체 태스크 완료, 대기 중"}

6. SHUTDOWN: shutdown_request 수신 시 응답:
   {"type": "shutdown_response", "request_id": "<요청에서 추출>", "approve": true}

== 차단된 태스크 ==
태스크에 blockedBy 의존성이 있으면, 해당 태스크가 완료될 때까지 건너뛰기.
TaskList를 주기적으로 확인하여 차단이 해제되었는지 확인.

== 에러 ==
태스크를 완료할 수 없으면, 리드에게 실패 보고:
{"type": "message", "recipient": "team-lead", "content": "태스크 #ID 실패: <사유>", "summary": "태스크 #ID 실패"}
태스크를 completed로 마킹하지 마세요. in_progress로 두어 리드가 재배정할 수 있게.

== 규칙 ==
- 절대 서브 에이전트를 스폰하거나 Task 도구를 사용하지 마세요
- 항상 절대 파일 경로를 사용하세요
- 항상 "team-lead"에게 SendMessage로 진행 보고하세요
- SendMessage의 type은 "message"만 사용 — "broadcast" 금지
```
</Worker_Preamble>

<Communication_Patterns>
## 커뮤니케이션 패턴

### 팀원 → 리드 (태스크 완료 보고)

```json
{
  "type": "message",
  "recipient": "team-lead",
  "content": "태스크 #1 완료: src/auth/login.ts에서 타입 에러 3개, src/auth/session.ts에서 2개 수정. 모든 파일 tsc --noEmit 통과.",
  "summary": "태스크 #1 완료"
}
```

### 리드 → 팀원 (재배정 또는 가이드)

```json
{
  "type": "message",
  "recipient": "worker-2",
  "content": "태스크 #3이 차단 해제되었습니다. worker-1에 원래 배정된 태스크 #5도 맡아주세요.",
  "summary": "새 태스크 배정"
}
```

### 브로드캐스트 (절제하여 사용 — N개 별도 메시지 발송)

```json
{
  "type": "broadcast",
  "content": "중단: src/types/index.ts 공유 타입이 변경됐습니다. 계속하기 전에 최신 버전을 풀해주세요.",
  "summary": "공유 타입 변경"
}
```
</Communication_Patterns>

<Shutdown_Protocol>
## 종료 프로토콜 (5단계 순차 종료)

**중요: 단계는 정확한 순서로 실행해야 합니다. 종료가 확인되기 전에 TeamDelete를 절대 호출하지 마세요.**

### Step 1: 완료 확인
```
TaskList 호출 — 모든 실제 태스크(비내부)가 completed 또는 failed인지 확인.
```

### Step 2: 각 팀원에게 종료 요청

**리드 전송:**
```json
{
  "type": "shutdown_request",
  "recipient": "worker-1",
  "content": "모든 작업 완료, 팀 종료 중"
}
```

### Step 3: 응답 대기 (BLOCKING)
- 팀원당 최대 30초 대기 `shutdown_response`
- 확인한 팀원 vs 타임아웃 팀원 추적
- 30초 내 응답 없는 팀원: 경고 로그, 비응답으로 마킹

**팀원 수신 및 응답:**
```json
{
  "type": "shutdown_response",
  "request_id": "shutdown-1770428632375@worker-1",
  "approve": true
}
```

승인 후:
- 팀원 프로세스 종료
- `config.json` members 배열에서 자동 제거
- 해당 팀원의 내부 태스크 완료

### Step 4: TeamDelete — 모든 팀원이 확인 또는 타임아웃된 후에만

```json
{ "team_name": "fix-ts-errors" }
```

### Step 5: 고아 프로세스 스캔

TeamDelete 이후 생존한 에이전트 프로세스 확인:
```bash
# 팀명과 일치하지만 config가 더 이상 없는 프로세스를 스캔하여 종료 (SIGTERM → 5초 대기 → SIGKILL)
```

**종료 시퀀스는 BLOCKING:** 모든 팀원이 다음 중 하나가 될 때까지 TeamDelete로 진행하지 않음:
- 종료 확인 (`shutdown_response` with `approve: true`), 또는
- 타임아웃 (30초 응답 없음)

**중요:** `request_id`는 팀원이 수신한 종료 요청 메시지에 제공됨. 팀원이 이를 추출하여 다시 전달해야 함. request_id를 조작하면 종료가 조용히 실패함.
</Shutdown_Protocol>

<Agent_Routing>
## Lane 기반 에이전트 라우팅

에이전트는 3개 레인으로 구조화됩니다:

**BUILD Lane** (순차 파이프라인):
explore → analyst → planner → architect → debugger → executor → verifier → code-simplifier → refactoring-expert

**REVIEW Lane** (병렬 검증):
code-reviewer, security-reviewer, critic

**DOMAIN Lane** (전문 영역):
designer, test-engineer, writer, qa-tester, performance-reviewer, scientist, git-master

### 모델 라우팅
| 태스크 유형 | 에이전트 | 모델 | 레인 |
|------------|---------|------|------|
| 탐색/검색 | explore | Haiku | build |
| 요구사항 | analyst | Opus | build |
| 계획/설계 | planner, architect | Opus | build |
| 디버깅 | debugger | Sonnet | build |
| 코드 구현 | executor | Sonnet | build |
| 복잡한 자율 작업 | executor (model="opus") | Opus | build |
| 검증 | verifier | Sonnet | build |
| 단순화 | code-simplifier | Opus | build |
| 리팩토링 | refactoring-expert | Sonnet | build |
| 코드 리뷰 | code-reviewer | Sonnet | review |
| 보안 | security-reviewer | Sonnet | review |
| 비평 | critic | Opus | review |
| UI/UX | designer | Sonnet | domain |
| 테스트 | test-engineer | Sonnet | domain |
| 문서 | writer | Haiku | domain |
| QA | qa-tester | Sonnet | domain |
| 성능 | performance-reviewer | Sonnet | domain |
| 데이터 분석 | scientist | Sonnet | domain |
| Git 관리 | git-master | Sonnet | domain |
</Agent_Routing>

<CLI_Workers>
## CLI 워커 (Codex & Gemini)

팀 스킬은 Claude 에이전트 팀원과 외부 CLI 워커(Codex CLI, Gemini CLI)를 결합한 **하이브리드 실행**을 지원합니다. 두 타입 모두 코드 변경 가능 — 역량과 비용이 다릅니다.

### 실행 모드

태스크 분해 시 실행 모드 태깅:

| 실행 모드 | 제공자 | 역량 |
|----------|--------|------|
| `claude_worker` | Claude 에이전트 | 전체 Claude Code 도구 접근 (Read/Write/Edit/Bash/Task). Claude 추론 + 반복 도구 사용이 필요한 태스크에 최적. |
| `codex_worker` | Codex CLI (tmux pane) | working_directory 내 전체 파일시스템 접근. tmux pane에서 자율 실행. 코드 리뷰, 보안 분석, 리팩토링, 아키텍처에 최적. `npm install -g @openai/codex` 필요. |
| `gemini_worker` | Gemini CLI (tmux pane) | working_directory 내 전체 파일시스템 접근. tmux pane에서 자율 실행. UI/디자인, 문서, 대용량 컨텍스트 태스크에 최적. `npm install -g @google/gemini-cli` 필요. |

### CLI 워커 작동 방식

tmux CLI 워커는 전용 tmux pane에서 파일시스템 접근과 함께 실행됩니다. **자율적 실행자**입니다:

1. 리드가 프롬프트 파일에 태스크 지시사항 기록
2. 리드가 `working_directory`를 프로젝트 루트로 설정하여 tmux CLI 워커 스폰
3. 워커가 파일 읽기, 변경, 명령 실행 — 모두 working directory 내에서
4. 결과/요약을 출력 파일에 기록
5. 리드가 출력을 읽고, 태스크 완료 표시, 의존 태스크에 결과 전달

**Claude 팀원과의 핵심 차이:**
- CLI 워커는 tmux를 통해 운영, Claude Code의 도구 시스템이 아님
- TaskList/TaskUpdate/SendMessage 사용 불가 (팀 인식 없음)
- 원샷 자율 작업으로 실행, 지속적 팀원이 아님
- 리드가 라이프사이클 관리 (스폰, 모니터, 결과 수집)

### 라우팅 가이드

| 태스크 유형 | 최적 경로 | 이유 |
|------------|----------|------|
| 반복적 다단계 작업 | Claude 팀원 | 도구 매개 반복 + 팀 커뮤니케이션 필요 |
| 코드 리뷰 / 보안 감사 | CLI 워커 또는 전문 에이전트 | 자율 실행, 구조적 분석에 적합 |
| 아키텍처 분석 / 기획 | architect Claude 에이전트 | 코드베이스 접근과 함께 강력한 분석적 추론 |
| 리팩토링 (범위 명확) | CLI 워커 또는 executor 에이전트 | 자율 실행, 구조적 변환에 적합 |
| UI/프론트엔드 구현 | designer Claude 에이전트 | 디자인 전문성, 프레임워크 관용구 |
| 대규모 문서화 | writer Claude 에이전트 | 작문 전문성 + 일관성을 위한 대용량 컨텍스트 |
| 빌드/테스트 반복 루프 | Claude 팀원 | Bash 도구 + 반복 수정 사이클 필요 |
| 팀 조율 필요 태스크 | Claude 팀원 | 상태 업데이트를 위한 SendMessage 필요 |

### 하이브리드 팀 예시

```
/tenetx:team 3:executor "인증 모듈 리팩토링 + 보안 리뷰"

태스크 분해:
#1 [codex_worker] 현재 인증 코드 보안 리뷰 -> .compound/research/auth-security.md로 출력
#2 [codex_worker] auth/login.ts와 auth/session.ts 리팩토링 (#1 결과 활용)
#3 [claude_worker:designer] 인증 UI 컴포넌트 재설계 (로그인 폼, 세션 표시)
#4 [claude_worker] 인증 테스트 업데이트 + 통합 이슈 수정
#5 [gemini_worker] 전체 변경사항 최종 코드 리뷰
```
</CLI_Workers>

<Codex_Delegation>
## Codex 팀원 위임 (tmux 패널 분할)

독립적인 태스크가 있고 tmux 환경이면, Codex를 별도 패널에 스폰하여 병렬 작업할 수 있습니다.

### 사용 조건
- tmux 세션 안에서 실행 중
- `codex` CLI 설치 + 인증 완료 (`codex login`)

### 자동 분배
team-exec 단계에서 태스크를 분해한 후, 각 태스크의 특성을 분석하여 자동 분배합니다:

**Claude 우선 (판단 필요):**
- 아키텍처/설계, 리팩토링, 보안, 마이그레이션, 디버깅, API 설계, 코드 리뷰

**Codex 우선 (실행 중심):**
- 테스트 작성, 반복 패턴 적용, CRUD 구현, 타입 추가, 에러 핸들링 추가, 코드 변환

### 위임 방법
```bash
# 단일 작업 위임
tenetx codex-spawn "src/payment/ 디렉토리에 결제 검증 로직 구현. 기존 패턴은 src/auth/를 참고."

# 모델 지정
tenetx codex-spawn --model o3 "복잡한 알고리즘 구현"
```

### 위임 기준
- 위임 적합: 독립 디렉토리/파일, 명확한 스펙, Claude와 파일 충돌 없음
- 위임 부적합: 같은 파일 수정, Claude 작업에 의존, 아키텍처 결정 필요

### 결과 통합
Codex 패널 완료 후 `git diff`로 변경사항 확인하여 team-verify에서 함께 검증합니다.
</Codex_Delegation>

<Team_Ralph_Composition>
## Team + Ralph 합성

사용자가 `/tenetx:team ralph`을 호출하면, 팀 모드가 Ralph의 지속 루프로 감싸집니다:

- **팀 오케스트레이션** — 단계별 전문 에이전트 다중 에이전트 파이프라인
- **Ralph 지속** — 실패 시 재시도, architect 검증 후 완료, 반복 추적

### 활성화 조건

1. 사용자가 `/tenetx:team ralph "작업"` 호출
2. 키워드 감지기가 프롬프트에서 `team`과 `ralph` 동시 발견
3. 훅이 팀 컨텍스트와 함께 `MAGIC KEYWORD: RALPH` 감지

### 상태 연결

양 모드가 교차 참조하며 각자의 상태 파일 기록:

```
// 팀 상태
state_write(mode="team", active=true, current_phase="team-plan", state={
  "team_name": "build-rest-api",
  "linked_ralph": true,
  "task": "REST API 전체 구축"
})

// Ralph 상태
state_write(mode="ralph", active=true, iteration=1, max_iterations=10, current_phase="execution", state={
  "linked_team": true,
  "team_name": "build-rest-api"
})
```

### 실행 흐름

1. Ralph 외부 루프 시작 (iteration 1)
2. 팀 파이프라인 실행: `team-plan -> team-prd -> team-exec -> team-verify`
3. `team-verify` 통과 시: Ralph가 architect 검증 실행 (STANDARD 티어 이상)
4. architect 승인 시: 양 모드 완료, `canceltenetx` 키워드 입력으로 종료
5. `team-verify` 실패 또는 architect 거부 시: team-fix 진입, 이후 `team-exec -> team-verify` 루프 복귀
6. fix 루프가 `max_fix_loops` 초과 시: Ralph가 iteration 증가하여 전체 파이프라인 재시도
7. Ralph가 `max_iterations` 초과 시: 터미널 `failed` 상태

### 취소

어느 모드든 취소하면 양쪽 모두 취소:
- **Ralph 취소 (연결됨):** 팀 먼저 취소(정상 종료), 이후 Ralph 상태 정리
- **팀 취소 (연결됨):** 팀 정리, Ralph iteration 취소 표시, 루프 중단
</Team_Ralph_Composition>

<Git_Worktree_Integration>
## Git Worktree 통합

워커는 동시 작업자 간 파일 충돌을 방지하기 위해 격리된 git worktree에서 운영할 수 있습니다.

### 작동 방식

1. **Worktree 생성**: 워커 스폰 전 `createWorkerWorktree(teamName, workerName, repoRoot)` 호출하여 `.compound/worktrees/{team}/{worker}`에 격리된 worktree 생성. 브랜치명: `tenetx-team/{teamName}/{workerName}`.

2. **워커 격리**: worktree 경로를 워커의 `workingDirectory`로 전달. 워커는 자신의 worktree에서만 작업.

3. **병합 조율**: 워커 완료 후 `checkMergeConflicts()`로 클린 병합 가능 여부 확인, `mergeWorkerBranch()`로 `--no-ff` 병합.

4. **팀 정리**: 팀 종료 시 `cleanupTeamWorktrees(teamName, repoRoot)` 호출하여 모든 worktree와 브랜치 제거.

### API 참조

| 함수 | 설명 |
|------|------|
| `createWorkerWorktree(teamName, workerName, repoRoot, baseBranch?)` | 격리된 worktree 생성 |
| `removeWorkerWorktree(teamName, workerName, repoRoot)` | worktree 및 브랜치 제거 |
| `listTeamWorktrees(teamName, repoRoot)` | 팀 전체 worktree 목록 |
| `cleanupTeamWorktrees(teamName, repoRoot)` | 팀 전체 worktree 제거 |
| `checkMergeConflicts(workerBranch, baseBranch, repoRoot)` | 비파괴적 충돌 확인 |
| `mergeWorkerBranch(workerBranch, baseBranch, repoRoot)` | 워커 브랜치 병합 (--no-ff) |
| `mergeAllWorkerBranches(teamName, repoRoot, baseBranch?)` | 완료된 모든 워커 병합 |

### 주의사항
- `createSession()`(tmux-session.ts)은 worktree 생성을 처리하지 않음 — worktree 라이프사이클은 `git-worktree.ts`에서 별도 관리
- 개별 워커 종료 시 worktree가 정리되지 않음 — 팀 종료 시에만 (사후 검사 허용)
- 브랜치명은 `sanitizeName()`으로 정규화하여 인젝션 방지
- 모든 경로는 디렉토리 트래버설에 대해 검증됨
</Git_Worktree_Integration>

<Error_Handling>
## 에러 핸들링

### 팀원이 태스크 실패
1. 팀원이 리드에게 SendMessage로 실패 보고
2. 리드 결정: 재시도(같은/다른 워커에 재배정) 또는 스킵
3. 재배정: `TaskUpdate`로 새 오너 설정 + 새 오너에게 `SendMessage`

### 팀원 정체 (메시지 없음)
1. 리드가 `TaskList`로 감지 — 태스크가 너무 오래 `in_progress`
2. 리드가 팀원에게 `SendMessage`로 상태 문의
3. 응답 없으면 죽은 팀원으로 간주
4. `TaskUpdate`로 다른 워커에 태스크 재배정

### 의존성 차단
1. 차단 태스크 실패 시 리드 결정:
   - 차단자 재시도
   - 의존성 제거 (`TaskUpdate`로 blockedBy 수정)
   - 차단된 태스크 자체를 스킵
2. 영향받는 팀원에게 `SendMessage`로 결정 전달

### 팀원 크래시
1. 해당 팀원의 내부 태스크에 예기치 않은 상태 표시
2. `config.json` members에서 팀원 사라짐
3. 리드가 고아 태스크를 남은 워커에 재배정
4. 필요 시 교체 팀원 스폰: `Task(team_name, name)`
</Error_Handling>

<Idempotent_Recovery>
## 멱등 복구

리드가 실행 중 크래시되면, 기존 상태를 감지하여 재개:

1. `~/.claude/teams/`에서 태스크 슬러그와 일치하는 팀 확인
2. 발견 시 `config.json` 읽어 활성 멤버 파악
3. 중복 팀 생성 대신 모니터 모드로 재개
4. `TaskList` 호출하여 현재 진행 상황 파악
5. 모니터링 단계부터 계속

### 재개/취소 시맨틱
- **재개:** 마지막 비터미널 단계에서 재시작. `.compound/handoffs/` 읽어 단계 전환 컨텍스트 복구.
- **취소:** `canceltenetx` 키워드 입력 시 팀원 종료 요청, 응답 대기, `cancelled` 표시(`active=false`), 취소 메타데이터 캡처, 팀 리소스 삭제. `.compound/handoffs/` 핸드오프 파일은 보존.
- 터미널 상태: `complete`, `failed`, `cancelled`.
</Idempotent_Recovery>

<Monitor_Enhancement>
## 모니터 강화: Outbox 자동 수집

리드가 CLI 워커의 outbox 메시지를 능동적으로 수집하여, `SendMessage` 전달에만 의존하지 않고 이벤트 기반 모니터링을 가능하게 합니다.

### Outbox 리더 함수

- **`readNewOutboxMessages(teamName, workerName)`** — 단일 워커의 새 outbox 메시지를 바이트 오프셋 커서로 읽기. 각 호출이 커서를 진행하므로 이후 호출은 마지막 읽기 이후 작성된 메시지만 반환.
- **`readAllTeamOutboxMessages(teamName)`** — 팀 전체 워커의 새 outbox 메시지 읽기. `{ workerName, messages }` 항목 배열 반환, 새 메시지 없는 워커는 스킵.
- **`resetOutboxCursor(teamName, workerName)`** — 워커의 outbox 커서를 바이트 0으로 리셋.

### 이벤트 기반 액션

| 메시지 타입 | 액션 |
|------------|------|
| `task_complete` | 태스크 완료 마킹, 차단 태스크 해제 확인, 의존 워커 알림 |
| `task_failed` | 실패 카운트 증가, 재시도 vs 재배정 vs 스킵 결정 |
| `idle` | 워커에 배정 태스크 없음 — 대기 작업 배정 또는 종료 시작 |
| `error` | 에러 로깅, heartbeat의 `consecutiveErrors`로 격리 임계값 확인 |
| `shutdown_ack` | 워커가 종료 확인 — 팀에서 안전하게 제거 |
| `heartbeat` | 활성 추적 업데이트 |
</Monitor_Enhancement>

<Cancellation>
## 취소

`canceltenetx` 키워드 입력으로 팀 정리를 처리:

1. `state_read(mode="team")`로 팀 상태 읽어 `team_name`과 `linked_ralph` 확인
2. 모든 활성 팀원에게 `shutdown_request` 전송 (`config.json` members 기반)
3. 각 팀원의 `shutdown_response` 대기 (멤버당 15초 타임아웃)
4. `TeamDelete` 호출하여 팀/태스크 디렉토리 제거
5. `state_clear(mode="team")`로 상태 정리
6. `linked_ralph`가 true이면 Ralph도 정리: `state_clear(mode="ralph")`

### 연결 모드 취소 (Team + Ralph)

팀이 Ralph에 연결된 경우, 의존성 순서를 따라 취소:
- **Ralph 컨텍스트에서 취소:** 팀 먼저 취소(모든 팀원 정상 종료), 이후 Ralph 상태 정리.
- **팀 컨텍스트에서 취소:** 팀 상태 정리, Ralph를 취소로 표시. Ralph의 stop 훅이 누락된 팀을 감지하고 반복 중단.
- **강제 취소 (`--force`):** `state_clear`로 `team`과 `ralph` 상태 모두 무조건 정리.

팀원이 비응답이면 `TeamDelete`가 실패할 수 있음. 이 경우 잠시 대기 후 재시도하거나, 사용자에게 `~/.claude/teams/{team_name}/`과 `~/.claude/tasks/{team_name}/` 수동 정리 안내.
</Cancellation>

<Configuration>
## 설정

`.compound/config.json`의 선택적 설정:

```json
{
  "team": {
    "maxAgents": 20,
    "defaultAgentType": "executor",
    "monitorIntervalMs": 30000,
    "shutdownTimeoutMs": 15000
  }
}
```

- **maxAgents** — 최대 팀원 수 (기본: 20)
- **defaultAgentType** — 미지정 시 에이전트 타입 (기본: executor)
- **monitorIntervalMs** — TaskList 폴링 주기 (기본: 30초)
- **shutdownTimeoutMs** — 종료 응답 대기 시간 (기본: 15초)

> **참고:** 팀원은 하드코딩된 모델 기본값이 없음. 각 팀원은 사용자의 설정된 모델을 상속하는 별도 Claude Code 세션. 팀원이 자체 서브에이전트를 스폰할 수 있으므로, 세션 모델이 오케스트레이션 레이어로 작동하고 서브에이전트는 어느 모델 티어든 사용 가능.
</Configuration>

<State_Management>
## 상태 관리

상태 파일: `~/.compound/state/team-state.json`
핸드오프: `.compound/handoffs/{stage}.md`

### 완료 시 상태 정리

1. `TeamDelete`가 모든 Claude Code 상태 처리:
   - `~/.claude/teams/{team_name}/` 제거 (config)
   - `~/.claude/tasks/{team_name}/` 제거 (모든 태스크 파일 + lock)
2. 상태 정리:
   ```
   state_clear(mode="team")
   ```
   Ralph 연결 시:
   ```
   state_clear(mode="ralph")
   ```
3. 또는 `canceltenetx` 키워드 입력으로 모든 정리 자동 처리.

**중요:** 모든 팀원이 종료된 후에만 `TeamDelete` 호출. 활성 멤버(리드 제외)가 config에 남아있으면 `TeamDelete` 실패.
</State_Management>

<Gotchas>
## 주의사항 (Gotchas)

1. **내부 태스크가 TaskList를 오염시킨다** — 팀원 스폰 시 시스템이 `metadata._internal: true`인 내부 태스크를 자동 생성. `TaskList` 출력에 표시됨. 실제 태스크 진행 카운트 시 반드시 필터링. 내부 태스크의 subject는 팀원 이름.

2. **원자적 클레이밍 없음** — SQLite 스웜과 달리 `TaskUpdate`에 트랜잭션 보장 없음. 두 팀원이 같은 태스크를 동시에 클레이밍할 수 있음. **완화:** 리드가 팀원 스폰 전 `TaskUpdate(taskId, owner)`로 오너를 사전 배정. 팀원은 자신에게 배정된 태스크만 작업.

3. **태스크 ID는 문자열** — ID는 자동 증가 문자열("1", "2", "3"), 정수가 아님. `taskId` 필드에 항상 문자열 값 전달.

4. **TeamDelete는 빈 팀 필요** — `TeamDelete` 호출 전 모든 팀원이 종료되어야 함. 리드(유일한 남은 멤버)는 이 검사에서 제외.

5. **메시지는 자동 전달** — 팀원 메시지가 리드에게 새 대화 턴으로 자동 도착. 인바운드 메시지에 폴링이나 inbox 확인 불필요. 다만 리드가 턴 처리 중(processing)이면 메시지가 큐잉되어 턴 종료 시 전달.

6. **팀원 프롬프트가 config에 저장** — 전체 프롬프트 텍스트가 `config.json` members 배열에 저장됨. 팀원 프롬프트에 시크릿이나 민감 데이터를 넣지 마세요.

7. **종료 시 멤버 자동 제거** — 팀원이 종료를 승인하고 종료된 후 `config.json`에서 자동 제거. 종료된 팀원을 config에서 찾으려고 다시 읽지 마세요.

8. **shutdown_response에 request_id 필요** — 팀원이 수신한 종료 요청 JSON에서 `request_id`를 추출하여 다시 전달해야 함. 형식: `shutdown-{timestamp}@{worker-name}`. 이 ID를 조작하면 종료가 조용히 실패.

9. **팀 이름은 유효한 슬러그여야** — 소문자, 숫자, 하이픈만 사용. 태스크 설명에서 파생 (예: "TypeScript 에러 수정" → "fix-ts-errors").

10. **브로드캐스트는 비용이 높다** — 각 브로드캐스트가 모든 팀원에게 별도 메시지 발송. 기본적으로 `message`(DM) 사용. 팀 전체 긴급 알림에만 broadcast.

11. **CLI 워커는 원샷, 지속적이지 않다** — tmux CLI 워커는 전체 파일시스템 접근이 가능하고 코드 변경을 할 수 있음. 그러나 자율 원샷 작업으로 실행 — TaskList/TaskUpdate/SendMessage 사용 불가. 리드가 라이프사이클을 관리: prompt_file 작성, CLI 워커 스폰, output_file 읽기, 태스크 완료 마킹. Claude 팀원처럼 팀 커뮤니케이션에 참여하지 않음.
</Gotchas>

<Arguments>
## 사용법 요약
`/tenetx:team {작업 설명}`

### 예시
- `/tenetx:team 사용자 프로필 페이지 전체 구현 (API + UI + 테스트)`
- `/tenetx:team 인증 시스템을 JWT에서 세션 기반으로 전환`
- `/tenetx:team 이 PR의 모든 리뷰 피드백 반영해줘`
- `/tenetx:team ralph REST API 전체 구축 (실패 시 자동 재시도)`
- `/tenetx:team 3:codex 보안 감사 및 취약점 수정`

### 인자
- 여러 분야(API, UI, 테스트 등)에 걸친 작업일수록 효과적
- 단일 파일 수정 같은 작업에는 오버킬 — 직접 요청이 나음
</Arguments>

$ARGUMENTS
