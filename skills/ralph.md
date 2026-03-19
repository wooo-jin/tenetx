---
name: ralph
description: Persistent mode with PRD-based iteration and verify/fix loop
triggers:
  - "ralph"
  - "끝까지"
  - "완료까지"
---

[RALPH + COMPOUND HARNESS - ITERATION {{ITERATION}}/{{MAX}}]

이전 시도에서 완료 promise가 출력되지 않았습니다. 작업을 계속합니다.

<Purpose>
Compound Harness Ralph — 완료 보장 지속 모드.
PRD를 자동 생성하고, 각 스토리를 순서대로 구현하며,
검증/수정 루프로 완료를 보장합니다.
"capitalize-on-failure" 원칙의 극대화.

복잡한 작업은 부분 구현이 "완료"로 선언되거나, 테스트가 건너뛰어지거나, 엣지 케이스가 잊혀지며 조용히 실패합니다. Ralph는 작업이 진정으로 완료될 때까지 루프하고, 완료를 허용하기 전에 신선한 검증 증거를 요구하며, 티어별 Architect 리뷰로 품질을 확인하여 이를 방지합니다.
</Purpose>

<Use_When>
- 복잡한 기능 구현이 필요할 때
- "끝까지 해줘" 류의 요청
- 여러 단계를 거쳐야 하는 작업
- 실패 가능성이 높은 작업
- 검증을 포함한 완료 보장이 필요할 때 (단순 "최선"이 아닌)
- 여러 반복에 걸친 지속성이 필요할 때
</Use_When>

<Do_Not_Use_When>
- 아이디어에서 코드까지 자율 파이프라인이 필요하면 `autopilot` 사용
- 실행 전 탐색/계획이 필요하면 `/tenetx:ralplan` 사용
- 빠른 원샷 수정이면 executor 에이전트에 직접 위임
- 수동 완료 제어가 필요하면 `ultrawork` 직접 사용
</Do_Not_Use_When>

<Execution_Policy>
- 중단하지 않는다 (사용자가 canceltenetx 입력 전까지)
- 실패 시 다른 접근법으로 자동 재시도
- 각 스토리 완료 시 검증 필수
- 5회 연속 실패 시 사용자에게 도움 요청
- 독립적인 에이전트 호출은 동시에 실행 -- 독립 작업을 순차 대기하지 않는다
- 긴 작업(설치, 빌드, 테스트 스위트)은 `run_in_background: true` 사용
- 에이전트 위임 시 `model` 파라미터를 항상 명시
- 완전한 구현을 제공: 범위 축소 없음, 부분 완료 없음, 테스트 삭제로 통과시키기 없음
</Execution_Policy>

<Steps>

## Step 1 — PRD 생성 (PRD 모드)

### PRD 모드 감지
`{{PROMPT}}`에 `--prd`가 포함되어 있거나, `--no-prd`가 없으면 PRD 모드로 진입합니다.

### PRD 워크플로우
1. 사용자 요청 분석
2. `.compound/prd.json`과 `.compound/progress.txt` 생성
3. Auto-PRD 생성:
   ```json
   {
     "project": "[프로젝트명]",
     "branchName": "ralph/[feature-name]",
     "description": "[기능 설명]",
     "userStories": [
       {
         "id": "US-001",
         "title": "[짧은 제목]",
         "description": "사용자로서, 나는 [행동]을 원하고, 그래서 [이점]을 얻는다.",
         "acceptanceCriteria": ["기준 1", "타입체크 통과"],
         "priority": 1,
         "passes": false
       }
     ]
   }
   ```
4. `progress.txt`에 타임스탬프와 빈 패턴 섹션 생성
5. PRD를 `.compound/plans/ralph-prd.md`에도 마크다운으로 저장
6. 가이드라인: 적절한 크기의 스토리(세션 하나에 하나), 검증 가능한 기준, 독립적 스토리, 우선순위 순서(기반 작업 우선)

**중요**: Acceptance Criteria는 반드시 검증 가능해야 함
- BAD: "구현이 완료됨" (너무 추상적)
- GOOD: "parseMode('--ultrawork')가 'ultrawork'를 반환함" (검증 가능)

**--no-prd 옵션**: 요청에 --no-prd가 포함되면 PRD 건너뛰고 직접 실행

## Step 2 — 진행 상황 확인
1. TODO 목록과 이전 반복 상태 확인
2. 중단된 지점에서 계속: 미완료 작업 인계

## Step 3 — 에이전트 위임 (3티어 병렬)
작업을 전문 에이전트에 적절한 티어로 라우팅하여 병렬 위임:

| 작업 유형 | 티어 | 모델 | 용도 |
|-----------|------|------|------|
| 단순 조회/수정 | LOW | Haiku | "이 함수가 무엇을 반환하는가?", 타입 export 추가 |
| 표준 구현 | MEDIUM | Sonnet | "이 모듈에 에러 처리 추가", 캐싱 레이어 구현 |
| 복잡한 분석/구현 | HIGH | Opus | "이 레이스 컨디션 디버그", 인증 모듈 리팩토링 |

```
# 올바른 병렬 위임 예시
Agent(model="haiku", prompt="UserConfig 타입 export 추가")
Agent(model="sonnet", prompt="API 응답 캐싱 레이어 구현")
Agent(model="opus", prompt="OAuth2 플로우 지원을 위한 인증 모듈 리팩토링")
```

**주의**: 독립적인 작업 3개를 동시 실행. 순차 실행 금지.

## Step 4 — 스토리별 반복
P0 -> P1 -> P2 순서로:
1. 스토리 시작 선언
2. 탐색: 관련 코드 읽기
3. 구현: 코드 작성/수정 (에이전트 위임 활용)
4. 검증: Acceptance Criteria 하나씩 확인
   - 테스트 실행
   - 빌드 확인
   - 수동 검증 (필요 시)
5. 스토리 완료 표시

## Step 5 — Verify/Fix Loop (자동 검증)
각 스토리 완료 후 자동 검증:
1. 타입 체크 (tsc --noEmit)
2. 빌드 검사 (npm run build)
3. 테스트 실행 (npm test)
4. 아키텍처 제약 검사 (constraints.json 있을 때)
5. 실패 발견 시:
   - 원인 분석
   - 수정 시도 (다른 접근법 포함)
   - 재검증
6. 최대 5회 반복
7. 5회 초과 시 -> 사용자에게 현재 상태 + 시도한 접근법 보고

## Step 6 — 신선한 증거로 완료 검증
a. 작업 완료를 증명하는 명령어 식별
b. 검증 실행 (테스트, 빌드, 린트)
c. 출력 읽기 -- 실제로 통과했는지 확인
d. 확인: 대기/진행 중인 TODO 항목이 0인지

## Step 7 — Architect 검증 (티어별)
변경 규모에 따른 Architect 검증 티어:

| 조건 | 티어 | 모델 |
|------|------|------|
| 파일 5개 미만, 100줄 미만, 테스트 완비 | STANDARD | Sonnet |
| 일반적인 변경 | STANDARD | Sonnet |
| 파일 20개 초과 또는 보안/아키텍처 변경 | THOROUGH | Opus |

**Ralph 최소 기준**: 아무리 작은 변경이라도 최소 STANDARD 티어 적용.

- **승인 시**: 완료 신호 출력 후 상태 정리
- **거부 시**: 지적된 이슈 수정 후 같은 티어에서 재검증 (중단하지 않음)

## Step 8 — 최종 검증
모든 스토리 완료 후:
1. 전체 빌드 성공 확인
2. 전체 테스트 통과 확인
3. 변경 파일 목록 + 요약 출력

## 완료 신호
모든 스토리가 완료되고 최종 검증을 통과하면, 반드시 다음을 출력하세요:
<promise>TASK COMPLETE</promise>

이 신호가 출력되면 Ralph 루프가 자동 종료됩니다.
종료 전까지는 작업이 자동으로 반복됩니다.

</Steps>

<Retry_Strategy>
실패 시 점진적 접근법 변경:
1. 같은 접근법 재시도 (오타/사소한 에러)
2. 코드 다시 읽고 다른 방식 시도
3. 관련 파일 추가 탐색 후 재구현
4. 전체 설계 재검토
5. 사용자에게 에스컬레이션 + 대안 제시
</Retry_Strategy>

<Escalation_And_Stop_Conditions>
- 근본적인 블로커가 사용자 입력을 필요로 할 때 중단 및 보고 (인증정보 누락, 불명확한 요구사항, 외부 서비스 다운)
- 사용자가 "멈춰", "취소", "중단" 등을 말하면 중단
- 같은 이슈가 3+ 반복에 걸쳐 재발하면 잠재적 근본 문제로 보고
- Architect가 검증을 거부하면 이슈를 수정하고 재검증 (중단하지 않음)
</Escalation_And_Stop_Conditions>

<Final_Checklist>
- [ ] 원래 작업의 모든 요구사항 충족 (범위 축소 없음)
- [ ] 대기/진행 중인 TODO 항목 0개
- [ ] 신선한 테스트 실행 출력으로 모든 테스트 통과 확인
- [ ] 신선한 빌드 출력으로 성공 확인
- [ ] 영향받는 파일에 대한 타입 에러 0개
- [ ] Architect 검증 통과 (최소 STANDARD 티어)
- [ ] 상태 파일 정리 완료
</Final_Checklist>

<State_Management>
상태 파일: ~/.compound/state/ralph-state.json
```json
{
  "active": true,
  "iteration": 1,
  "maxIterations": 10,
  "startedAt": "ISO timestamp",
  "prompt": "original request",
  "prdPath": "path to PRD file",
  "currentStory": 1,
  "completedStories": [],
  "retryCount": 0,
  "architectTier": "STANDARD"
}
```
</State_Management>

<Tool_Usage>
- Architect 검증은 보안 민감, 아키텍처 관련, 복잡한 다중 시스템 통합 변경에 대해 교차 확인 사용
- 단순 기능 추가, 잘 테스트된 변경, 시간 긴급 검증에는 Architect 상담 건너뛰기
- 사용할 수 없는 도구에 블로킹하지 않음 -- 가용한 에이전트로 진행
</Tool_Usage>

<Examples>
<Good>
올바른 병렬 위임:
```
Agent(model="haiku", prompt="UserConfig 타입 export 추가")
Agent(model="sonnet", prompt="API 응답 캐싱 레이어 구현")
Agent(model="opus", prompt="OAuth2 플로우 지원 인증 모듈 리팩토링")
```
세 개의 독립 작업을 적절한 티어로 동시 실행.
</Good>

<Good>
올바른 완료 전 검증:
```
1. 실행: npm test           -> 출력: "42 passed, 0 failed"
2. 실행: npm run build      -> 출력: "Build succeeded"
3. 실행: tsc --noEmit       -> 출력: 0 errors
4. Architect(sonnet) 생성   -> 판정: "APPROVED"
5. 상태 파일 정리
```
각 단계에서 신선한 증거, Architect 검증, 깔끔한 종료.
</Good>

<Bad>
검증 없이 완료 선언:
"모든 변경이 좋아 보이고, 구현이 올바르게 작동할 것입니다. 작업 완료."
"좋아 보인다"와 "~일 것" 사용 -- 신선한 테스트/빌드 출력 없음, Architect 검증 없음.
</Bad>

<Bad>
독립 작업의 순차 실행:
```
Agent(haiku, "타입 export 추가") -> 대기 ->
Agent(sonnet, "캐싱 구현") -> 대기 ->
Agent(opus, "인증 리팩토링")
```
독립적인 작업이므로 순차가 아닌 병렬로 실행해야 합니다.
</Bad>
</Examples>

<Advanced>
## Background Execution Rules

**백그라운드 실행** (`run_in_background: true`):
- 패키지 설치 (npm install, pip install, cargo build)
- 빌드 프로세스 (make, 프로젝트 빌드 명령어)
- 테스트 스위트
- Docker 작업 (docker build, docker pull)

**포그라운드 실행** (블로킹):
- 빠른 상태 확인 (git status, ls, pwd)
- 파일 읽기/편집
- 간단한 명령어
</Advanced>

<Arguments>
## 사용법
`/tenetx:ralph {작업 설명}`

### 예시
- `/tenetx:ralph 로그인 기능 구현해줘`
- `/tenetx:ralph 결제 모듈 리팩토링 --no-prd`
- `/tenetx:ralph --prd 사용자 대시보드 페이지 만들어줘`
- `/tenetx:ralph 사용자 대시보드 페이지 만들어줘`

### 옵션
- `--prd`: PRD를 명시적으로 생성 (기본 동작)
- `--no-prd`: PRD 생성 건너뛰고 바로 실행
- 인자 없이 실행 시 현재 컨텍스트에서 작업 요청을 질문합니다
</Arguments>

$ARGUMENTS
