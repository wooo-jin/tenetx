---
name: autopilot
description: 5-phase autonomous execution pipeline with quality gates
triggers:
  - "autopilot"
  - "자동실행"
  - "자동 실행"
---

<Purpose>
Compound Harness Autopilot — 철학 기반 5단계 자율 실행 파이프라인.
모든 단계는 philosophy 원칙에 따라 구동됩니다.
</Purpose>

<Principles>
- understand-before-act: 탐색 없이 실행하지 않음
- decompose-to-control: 큰 작업을 원자적 단위로 분해
- capitalize-on-failure: 실패는 학습 기회
- focus-resources-on-judgment: 단순 작업은 빠른 모델, 판단은 강력한 모델
- knowledge-comes-to-you: 기존 솔루션을 먼저 검색
</Principles>

<Execution_Policy>
- Phase 완료 전까지 다음 Phase로 넘어가지 않는다
- 각 Phase는 완료 증거를 남긴다 (파일 또는 명시적 확인)
- 실패 시 최대 3회 재시도 후 사용자에게 에스컬레이션
- 모든 변경은 git에서 추적 가능해야 한다
</Execution_Policy>

<Phases>

## Phase 0 — Expansion (모호 → 명확)
IF 요청이 모호하다면:
1. deep-interview 스킬로 요구사항 명확화 (자동 감지)
2. 또는 기존 .compound/specs/ 에서 관련 스펙 검색
3. 명확한 acceptance criteria 도출

IF 요청이 명확하면 (파일 경로, 함수명, 에러 메시지 등 구체적 정보 포함):
→ Phase 0 건너뛰기

## Phase 1 — Planning (탐색 + 계획)
1. 코드베이스 탐색 (Glob, Grep, Read)
   - 관련 파일 식별
   - 아키텍처 이해
   - 기존 패턴 파악
2. 기존 솔루션 검색 (~/.compound/me/solutions/)
3. 구현 계획 작성:
   - 수정할 파일 목록
   - 각 파일의 변경 내용
   - 의존성 순서
   - 리스크 평가
4. 계획을 .compound/plans/autopilot-impl.md 에 저장

## Phase 2 — Execution (병렬 구현)
1. 계획의 각 단계를 순서대로 실행
2. 독립적인 작업은 Agent로 병렬 처리 (ultrawork 패턴)
3. 각 파일 수정 후 즉시 검증:
   - TypeScript: tsc --noEmit
   - Lint: eslint (있으면)
   - 기존 테스트: npm test (있으면)
4. 5회 이상 같은 파일 수정 시 중단 → 전체 재설계

## Phase 3 — QA (테스트 + 검증)
1. 변경된 파일에 대한 테스트 실행
2. 빌드 검증 (npm run build / tsc)
3. 실패 시:
   - 에러 분석
   - 수정 시도 (최대 5회)
   - 5회 초과 시 사용자 알림
4. 모든 테스트 통과 확인

## Phase 4 — Validation (다각 검증)
REVIEW 레인 에이전트로 최종 검증 (병렬 실행 권장):
1. **code-reviewer**: 로직 결함, 유지보수성, 패턴 준수
2. **security-reviewer**: OWASP Top 10, 시크릿 노출
3. **critic**: 아키텍처 일관성, 설계 검증

각 검증에서 CRITICAL 이슈 발견 시 → Phase 2로 돌아가 수정 (BUILD 레인 재진입)

## Phase 5 — Cleanup (정리)
1. .compound/state/autopilot-state.json 정리
2. 변경 요약 출력
3. compound loop: 이번 세션의 패턴/솔루션 추출 제안

</Phases>

<State_Management>
상태 파일: ~/.compound/state/autopilot-state.json
```json
{
  "active": true,
  "phase": 0,
  "startedAt": "ISO timestamp",
  "prompt": "original user request",
  "completedPhases": [],
  "plan": "path to plan file"
}
```
세션 재시작 시 마지막 완료된 Phase부터 재개.
</State_Management>

<Completion_Signal>
모든 Phase 완료 후:
1. "✅ Autopilot 완료" 메시지 출력
2. 변경 파일 목록 + diff 요약
3. `ch compound` 실행 제안 (인사이트 축적)
</Completion_Signal>

<Arguments>
## 사용법
`/tenetx:autopilot {작업 설명}`

### 예시
- `/tenetx:autopilot API 엔드포인트에 페이지네이션 추가`
- `/tenetx:autopilot 검색 기능을 Elasticsearch로 마이그레이션`
- `/tenetx:autopilot 이 컴포넌트를 접근성 기준에 맞게 리팩토링`

### 인자
- 작업 설명이 구체적일수록 Phase 0(모호→명확)을 건너뛰어 빠릅니다
- 파일 경로, 함수명, 에러 메시지 등을 포함하면 더 정확합니다
</Arguments>

$ARGUMENTS
