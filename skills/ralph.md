---
name: ralph
description: Persistent mode with PRD-based iteration and verify/fix loop
triggers:
  - "ralph"
  - "끝까지"
  - "완료까지"
---

<Purpose>
Compound Harness Ralph — 완료 보장 지속 모드.
PRD를 자동 생성하고, 각 스토리를 순서대로 구현하며,
검증/수정 루프로 완료를 보장합니다.
"capitalize-on-failure" 원칙의 극대화.
</Purpose>

<Use_When>
- 복잡한 기능 구현이 필요할 때
- "끝까지 해줘" 류의 요청
- 여러 단계를 거쳐야 하는 작업
- 실패 가능성이 높은 작업
</Use_When>

<Execution_Policy>
- 중단하지 않는다 (사용자가 canceltenetx 입력 전까지)
- 실패 시 다른 접근법으로 자동 재시도
- 각 스토리 완료 시 검증 필수
- 5회 연속 실패 시 사용자에게 도움 요청
</Execution_Policy>

<Steps>

## Step 1 — PRD 생성 (첫 실행 시)
1. 사용자 요청 분석
2. Auto-PRD 생성:
   ```
   # PRD: {task_title}

   ## 목표
   {goal}

   ## 스토리 목록
   ### Story 1: {title}
   - Acceptance Criteria:
     - [ ] 구체적 검증 기준 1
     - [ ] 구체적 검증 기준 2
   - Priority: P0/P1/P2

   ### Story 2: {title}
   ...
   ```
3. PRD를 .compound/plans/ralph-prd.md 에 저장
4. **중요**: Acceptance Criteria는 반드시 검증 가능해야 함
   - ❌ "구현이 완료됨" (너무 추상적)
   - ✅ "parseMode('--ultrawork')가 'ultrawork'를 반환함" (검증 가능)

**--no-prd 옵션**: 요청에 --no-prd가 포함되면 PRD 건너뛰고 직접 실행

## Step 2 — 스토리별 반복
P0 → P1 → P2 순서로:
1. 스토리 시작 선언
2. 탐색: 관련 코드 읽기
3. 구현: 코드 작성/수정
4. 검증: Acceptance Criteria 하나씩 확인
   - 테스트 실행
   - 빌드 확인
   - 수동 검증 (필요 시)
5. 스토리 완료 표시

## Step 3 — Verify/Fix Loop (자동 검증)
각 스토리 완료 후 `ch verify`가 자동 검증합니다:
1. 타입 체크 (tsc --noEmit)
2. 빌드 검사 (npm run build)
3. 테스트 실행 (npm test)
4. 아키텍처 제약 검사 (constraints.json 있을 때)
5. 실패 발견 시:
   - 원인 분석
   - 수정 시도 (다른 접근법 포함)
   - 재검증
6. 최대 5회 반복
7. 5회 초과 시 → 사용자에게 현재 상태 + 시도한 접근법 보고

## Step 4 — 최종 검증
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

<State_Management>
상태 파일: ~/.compound/state/ralph-state.json
```json
{
  "active": true,
  "startedAt": "ISO timestamp",
  "prompt": "original request",
  "prdPath": "path to PRD file",
  "currentStory": 1,
  "completedStories": [],
  "retryCount": 0
}
```
</State_Management>

<Arguments>
## 사용법
`/tenetx:ralph {작업 설명}`

### 예시
- `/tenetx:ralph 로그인 기능 구현해줘`
- `/tenetx:ralph 결제 모듈 리팩토링 --no-prd`
- `/tenetx:ralph 사용자 대시보드 페이지 만들어줘`

### 옵션
- `--no-prd`: PRD 생성 건너뛰고 바로 실행
- 인자 없이 실행 시 현재 컨텍스트에서 작업 요청을 질문합니다
</Arguments>

$ARGUMENTS
