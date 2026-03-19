---
name: pipeline
description: Sequential multi-stage processing with stage-specific agents
triggers:
  - "pipeline"
  - "파이프라인"
  - "단계별"
---

<Purpose>
Compound Harness Pipeline — 순차 단계별 처리 모드.
각 단계가 이전 단계의 결과를 입력으로 받아 처리합니다.
다단계 변환, 마이그레이션, 리팩토링에 적합.
Unix 파이프와 유사하지만 AI 에이전트 오케스트레이션에 맞게 설계되었습니다.
</Purpose>

<Core_Concepts>
## 핵심 개념

### 1. 순차 파이프라인
가장 단순한 형태: Agent A의 출력이 Agent B로, B의 출력이 Agent C로 흐릅니다.

```
explore -> architect -> executor
```

**흐름:**
1. Explore 에이전트가 코드베이스를 검색하여 발견 사항 생성
2. Architect가 발견 사항을 받아 분석/권장사항 생성
3. Executor가 권장사항을 받아 변경 구현

### 2. 분기 파이프라인
출력 조건에 따라 다른 에이전트로 라우팅.

```
explore -> {
  if "복잡한 리팩토링" -> architect -> executor:opus
  if "단순 변경" -> executor:haiku
  if "UI 작업" -> designer -> executor
}
```

### 3. 병렬 후 병합 파이프라인
여러 에이전트를 병렬로 실행한 후 출력을 병합.

```
parallel(explore, document-specialist) -> architect -> executor
```
</Core_Concepts>

<Built_In_Presets>
## 빌트인 파이프라인 프리셋

### Review 파이프라인
**목적:** 포괄적 코드 리뷰 및 구현

```
/tenetx:pipeline review <작업>
```

**단계:**
1. `explore` — 관련 코드와 패턴 검색
2. `architect` — 아키텍처 및 설계 영향 분석
3. `critic` — 분석 리뷰 및 비평
4. `executor` — 전체 컨텍스트로 구현

**사용처:** 대규모 기능, 리팩토링, 복잡한 변경

---

### Implement 파이프라인
**목적:** 계획된 구현 + 테스트

```
/tenetx:pipeline implement <작업>
```

**단계:**
1. `planner` — 상세 구현 계획 작성
2. `executor` — 계획 실행
3. `test-engineer` — 테스트 추가/검증

**사용처:** 명확한 요구사항이 있는 새 기능

---

### Debug 파이프라인
**목적:** 체계적 디버깅 워크플로우

```
/tenetx:pipeline debug <이슈>
```

**단계:**
1. `explore` — 에러 위치 및 관련 코드 탐색
2. `architect` — 근본 원인 분석
3. `build-fixer` — 수정 적용 및 검증

**사용처:** 버그, 빌드 에러, 테스트 실패

---

### Research 파이프라인
**목적:** 외부 조사 + 내부 분석

```
/tenetx:pipeline research <주제>
```

**단계:**
1. `parallel(document-specialist, explore)` — 외부 문서 + 내부 코드
2. `architect` — 발견 사항 종합
3. `writer` — 권장사항 문서화

**사용처:** 기술 결정, API 통합

---

### Refactor 파이프라인
**목적:** 안전하고 검증된 리팩토링

```
/tenetx:pipeline refactor <대상>
```

**단계:**
1. `explore` — 모든 사용처 및 의존성 검색
2. `architect-medium` — 리팩토링 전략 설계
3. `executor:opus` — 리팩토링 실행
4. `qa-tester` — 회귀 없음 검증

**사용처:** 아키텍처 변경, API 재설계

---

### Security 파이프라인
**목적:** 보안 감사 및 수정

```
/tenetx:pipeline security <범위>
```

**단계:**
1. `explore` — 잠재 취약점 탐색
2. `security-reviewer` — 감사 및 이슈 식별
3. `executor` — 수정 구현
4. `security-reviewer-low` — 재검증

**사용처:** 보안 리뷰, 취약점 수정
</Built_In_Presets>

<Custom_Pipeline_DSL>
## 커스텀 파이프라인 DSL 문법

### 기본 순차
```
/tenetx:pipeline agent1 -> agent2 -> agent3 "작업 설명"
```

**예시:**
```
/tenetx:pipeline explore -> architect -> executor "인증 기능 추가"
```

### 모델 지정
```
/tenetx:pipeline explore:haiku -> architect:opus -> executor:sonnet "성능 최적화"
```

각 에이전트 뒤에 콜론(:)과 모델 티어를 명시하여 해당 단계의 모델을 직접 제어합니다.

### 분기 구조
```
/tenetx:pipeline explore -> (
  complexity:high -> architect:opus -> executor:opus
  complexity:medium -> executor:sonnet
  complexity:low -> executor:haiku
) "보고된 이슈 수정"
```

에이전트 출력의 조건에 따라 다른 경로로 분기합니다. 조건은 `key:value` 형식.

### 병렬 구조
```
/tenetx:pipeline [explore, document-specialist] -> architect -> executor "OAuth 구현"
```

대괄호(`[]`)로 묶인 에이전트들은 병렬 실행되며, 모든 결과가 다음 단계에 병합됩니다.

### 루프 구조
```
repeat_until(tests_pass) {
  executor -> qa-tester
}
```

조건이 충족될 때까지 지정된 단계 시퀀스를 반복합니다.

### 조건부 분기
에이전트 출력에 기반하여 다른 경로로 라우팅:

```
explore -> {
  if files_found > 5 -> architect:opus -> executor:opus
  if files_found <= 5 -> executor:sonnet
}
```

### 병합 전략
병렬 에이전트 완료 시 출력 병합 방식:

- **concat**: 모든 출력 연결
- **summarize**: architect를 사용하여 발견 사항 요약
- **vote**: critic을 사용하여 최적 출력 선택
</Custom_Pipeline_DSL>

<Data_Passing_Protocol>
## 데이터 전달 프로토콜 (Data Passing Protocol)

파이프라인의 각 에이전트는 이전 단계의 구조화된 컨텍스트를 수신합니다:

```json
{
  "pipeline_context": {
    "original_task": "사용자의 원본 요청",
    "previous_stages": [
      {
        "agent": "explore",
        "model": "haiku",
        "findings": "...",
        "files_identified": ["src/auth.ts", "src/user.ts"]
      }
    ],
    "current_stage": "architect",
    "next_stage": "executor"
  },
  "task": "이 에이전트의 특정 작업"
}
```

### 전달 규칙

1. **원본 태스크 보존** — `original_task`는 모든 단계에서 변경 없이 전달
2. **누적 히스토리** — `previous_stages` 배열에 완료된 모든 단계 결과가 누적
3. **다음 단계 인식** — `next_stage` 필드로 현재 에이전트가 출력 형식을 최적화
4. **파일 목록 전파** — 식별된 파일 목록이 후속 단계에 전달되어 스코프 유지
5. **병렬 단계 병합** — 병렬 단계의 출력은 `previous_stages`에 동일 인덱스로 배열 삽입
</Data_Passing_Protocol>

<Execution_Policy>
## 실행 정책

1. 사용자 요청에서 단계 목록 추출 (또는 자동 분해)
2. 각 단계에 최적 에이전트/모델 배정
3. 단계 1부터 순차 실행
4. 각 단계 완료 후 결과 검증
5. 검증 실패 시 해당 단계만 재시도
6. 모든 단계 완료 후 전체 검증

단계 간 핸드오프 문서로 컨텍스트 전달.
</Execution_Policy>

<Stage_Format>
## 단계 형식

```
Stage N: {제목}
  Agent: {agent_type}
  Model: {haiku|sonnet|opus}
  Input: {이전 단계 결과}
  Output: {이 단계 산출물}
  Verify: {검증 기준}
```
</Stage_Format>

<Error_Handling>
## 에러 핸들링

### 재시도 로직

에이전트 실패 시 파이프라인 행동:

1. **Retry** — 동일 에이전트 재실행 (최대 3회)
2. **Skip** — 부분 출력으로 다음 단계 진행
3. **Abort** — 전체 파이프라인 중단
4. **Fallback** — 대체 에이전트로 라우팅

**설정:**
```
/tenetx:pipeline explore -> architect -> executor --retry=3 --on-error=abort
```

### 에러 복구 패턴

**패턴 1: 상위 티어 폴백**
```
executor:haiku -> on-error -> executor:sonnet
```

실패 시 더 강력한 모델의 에이전트로 에스컬레이션.

**패턴 2: Architect 상담**
```
executor -> on-error -> architect -> executor
```

실패 원인을 architect가 분석한 후 executor가 재시도.

**패턴 3: Human-in-the-Loop**
```
any-stage -> on-error -> pause-for-user-input
```

복구 불가능한 에러 시 사용자 입력을 대기.

### 단계별 에러 격리

각 단계의 에러는 해당 단계에 격리됩니다. 이전 단계의 성공적인 출력은 보존되므로, 실패한 단계만 재시도하여 비용과 시간을 절약합니다.
</Error_Handling>

<State_Management>
## 파이프라인 상태 관리

파이프라인은 `.compound/state/pipeline-state.json`에 상태를 유지합니다:

```json
{
  "pipeline_id": "uuid",
  "name": "review",
  "active": true,
  "current_stage": 2,
  "stages": [
    {
      "name": "explore",
      "agent": "explore",
      "model": "haiku",
      "status": "completed",
      "output": "...",
      "completed_at": "2026-01-23T10:28:00Z"
    },
    {
      "name": "architect",
      "agent": "architect",
      "model": "opus",
      "status": "in_progress",
      "started_at": "2026-01-23T10:30:00Z"
    },
    {
      "name": "executor",
      "agent": "executor",
      "model": "sonnet",
      "status": "pending"
    }
  ],
  "task": "원본 사용자 태스크",
  "created_at": "2026-01-23T10:25:00Z",
  "error_history": [],
  "retry_counts": {}
}
```

### 상태 전환

```
pending -> in_progress -> completed
                       -> failed -> (retry) -> in_progress
                       -> skipped
```

### 완료 시 상태 정리

**중요: 완료 시 상태 파일을 삭제 — `active: false`로만 설정하지 마세요.**

파이프라인 완료(모든 단계 완료 또는 취소) 시:
```bash
# 파이프라인 상태 파일 삭제
rm -f .compound/state/pipeline-state.json
```

향후 세션의 깨끗한 상태를 보장합니다. `active: false`인 잔여 상태 파일을 남기지 마세요.

### 재개

중단된 파이프라인 재개:
```
/tenetx:pipeline resume
```

`pipeline-state.json`에서 마지막 `in_progress` 또는 `pending` 단계를 찾아 해당 지점부터 재개합니다.
</State_Management>

<Verification_Rules>
## 검증 규칙

파이프라인 완료 전 검증:

- [ ] 모든 단계가 성공적으로 완료
- [ ] 최종 단계 출력이 원본 태스크를 충족
- [ ] 어떤 단계에서도 미처리 에러 없음
- [ ] 수정된 모든 파일이 lsp_diagnostics 통과
- [ ] 테스트 통과 (해당되는 경우)
</Verification_Rules>

<Cancellation>
## 취소

활성 파이프라인 중단:

```
/tenetx:pipeline cancel
```

또는 활성 파이프라인을 감지하는 일반 취소 명령 사용.

취소 시:
1. 현재 실행 중인 에이전트에 중단 신호
2. 완료된 단계의 출력은 보존
3. `.compound/state/pipeline-state.json` 삭제
4. 사용자에게 취소 요약 보고
</Cancellation>

<Integration>
## 다른 스킬과의 통합

파이프라인은 다른 스킬 내에서 사용 가능:

- **Ralph**: 검증 완료까지 파이프라인 반복
- **Team**: 팀 실행 파이프라인의 각 단계로 활용
- **Autopilot**: 자동화 빌딩 블록으로 파이프라인 사용
</Integration>

<Best_Practices>
## 모범 사례

1. **프리셋부터 시작** — 커스텀 파이프라인 생성 전 빌트인 파이프라인 활용
2. **복잡도에 모델 매칭** — 단순 태스크에 opus 낭비하지 않기
3. **단계를 집중적으로** — 각 에이전트에 하나의 명확한 책임
4. **병렬 단계 활용** — 독립적 작업은 동시 실행
5. **체크포인트에서 검증** — architect 또는 critic으로 진행 확인
6. **커스텀 파이프라인 문서화** — 성공적인 패턴을 재사용을 위해 저장
</Best_Practices>

<Troubleshooting>
## 문제 해결

### 파이프라인 정체
**확인:** `.compound/state/pipeline-state.json`에서 현재 단계
**해결:** `/tenetx:pipeline resume`로 재개 또는 취소 후 재시작

### 에이전트 반복 실패
**확인:** 재시도 횟수와 에러 메시지
**해결:** 상위 티어 에이전트로 라우팅 또는 architect 상담 추가

### 출력 미전달
**확인:** 에이전트 프롬프트의 데이터 전달 구조
**해결:** 각 에이전트가 `pipeline_context`와 함께 프롬프트되는지 확인
</Troubleshooting>

<Technical_Implementation>
## 기술 구현

파이프라인 오케스트레이터:

1. **파이프라인 정의 파싱** — 문법 검증 및 에이전트명 확인
2. **상태 초기화** — pipeline-state.json 생성
3. **단계 순차 실행** — Task 도구로 에이전트 스폰
4. **단계 간 컨텍스트 전달** — 다음 에이전트를 위한 출력 구조화
5. **분기 로직 처리** — 조건 평가 및 라우팅
6. **병렬 실행 관리** — 동시 에이전트 스폰 및 병합
7. **상태 유지** — 각 단계 후 상태 파일 업데이트
8. **검증 실행** — 완료 전 검사 수행
</Technical_Implementation>

<Usage_Examples>
## 사용 예시

### 예시 1: 기능 구현
```
/tenetx:pipeline review "API에 rate limiting 추가"
```
-> explore -> architect -> critic -> executor

### 예시 2: 버그 수정
```
/tenetx:pipeline debug "OAuth 로그인 실패"
```
-> explore -> architect -> build-fixer

### 예시 3: 커스텀 체인
```
/tenetx:pipeline explore:haiku -> architect:opus -> executor:sonnet -> test-engineer:sonnet "인증 모듈 리팩토링"
```

### 예시 4: 리서치 기반 구현
```
/tenetx:pipeline research "GraphQL subscriptions 구현"
```
-> parallel(document-specialist, explore) -> architect -> writer

### 예시 5: 모델 지정 보안 파이프라인
```
/tenetx:pipeline explore:haiku -> security-reviewer:opus -> executor:sonnet -> security-reviewer:sonnet "인증 토큰 취약점 수정"
```

### 예시 6: 조건부 분기
```
/tenetx:pipeline explore -> (
  complexity:high -> architect:opus -> executor:opus
  complexity:low -> executor:haiku
) "레거시 API 마이그레이션"
```
</Usage_Examples>

<Skill_Invocation>
## 스킬 호출

이 스킬은 다음 상황에서 활성화:

- 사용자가 `/tenetx:pipeline` 명령 입력
- "에이전트 체인", "워크플로우", "파이프라인" 언급
- 패턴 감지: 에이전트 이름과 함께 "X한 다음 Y한 다음 Z"

**명시적 호출:**
```
/tenetx:pipeline review "작업"
```

**자동 감지:**
```
"먼저 코드베이스를 탐색하고, 그 다음 architect가 분석하고, 마지막으로 executor가 구현"
```
-> 자동으로 파이프라인 생성: explore -> architect -> executor
</Skill_Invocation>

<Arguments>
## 사용법
`/tenetx:pipeline {작업 설명 또는 단계 목록}`

### 예시
- `/tenetx:pipeline DB 스키마 변경 → 마이그레이션 스크립트 → API 수정 → 테스트`
- `/tenetx:pipeline 레거시 코드를 TypeScript로 단계별 전환`
- `/tenetx:pipeline 1단계: 분석, 2단계: 인터페이스 설계, 3단계: 구현`

### 인자
- 단계를 직접 명시하면 해당 순서대로 실행
- 단계 없이 작업만 설명하면 자동으로 단계를 분해합니다
- 프리셋명(review, implement, debug, research, refactor, security)을 사용하면 빌트인 파이프라인 실행
</Arguments>

$ARGUMENTS
