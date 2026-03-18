---
name: ralplan
description: Consensus-based planning with Planner→Architect→Critic loop
triggers:
  - "ralplan"
  - "합의"
  - "합의 계획"
---

<Purpose>
Compound Harness Ralplan — 합의 기반 설계 계획.
3명의 전문가(Planner, Architect, Critic)가 합의에 도달할 때까지
반복 검토하여 고품질 계획을 수립합니다.
고위험 작업(인증, 데이터 마이그레이션, 보안, 공개 API 변경)에 권장.
</Purpose>

<Execution_Steps>

## Step 1 — Planner (계획 수립)
Agent: planner (Opus)
- 요구사항 분석 및 초기 계획 작성
- RALPLAN-DR 요약:
  - Principles (3-5개 핵심 원칙)
  - Decision Drivers (상위 3개 결정 요인)
  - Viable Options (≥2개 실행 가능한 대안)
- .compound/plans/ralplan-{slug}.md 에 저장

## Step 2 — Architect (반박 + 트레이드오프)
Agent: architect (Opus, 읽기 전용)
- Planner의 계획에 대한 Steelman 반박 (최강 반대 의견)
- 트레이드오프 텐션 (피할 수 없는 긴장 관계 식별)
- 원칙 위반 플래그

## Step 3 — Critic (최종 검증)
Agent: critic (Opus, 읽기 전용)
- 원칙-옵션 일관성 검증
- 대안 탐색의 공정성 평가
- 위험 완화 전략 검증
- 검증 가능성 평가
- 명시적 승인 또는 거부 (거짓 승인은 거짓 거부보다 10-100배 비싸다)

## Step 4 — Re-review Loop
합의 미달 시:
1. Planner가 Architect/Critic 피드백 반영하여 계획 수정
2. Architect 재검토
3. Critic 재검토
4. 최대 5회 반복
5. 합의 도달 시 → 실행 스테이지로 전환

## Deliberate Mode (고위험)
고위험 감지 시 자동 활성화 또는 --deliberate 플래그:
- Pre-mortem: 3개 실패 시나리오 작성
- Expanded Test Plan: 각 시나리오의 검증 방법
- Architect의 원칙 위반 플래그 추가

</Execution_Steps>

<Gate_Check>
명확한 요청인 경우 Ralplan 건너뛰기 (1개 이상 해당):
- 파일 경로 명시 (src/auth.ts)
- Issue/PR 번호 (#42)
- camelCase 함수명 (processKeywordDetector)
- 테스트 러너 지정 (npm test)
- 번호 매김 스텝
- Acceptance criteria 명시

강제 실행: force: ralplan 또는 ! ralplan
</Gate_Check>

<Arguments>
## 사용법
`/tenetx:ralplan {설계가 필요한 작업}`

### 예시
- `/tenetx:ralplan 멀티테넌트 인증 시스템 설계`
- `/tenetx:ralplan DB 스키마를 v2로 마이그레이션 계획`
- `/tenetx:ralplan 결제 API 보안 아키텍처 --deliberate`

### 옵션
- `--deliberate`: 고위험 모드 강제 (pre-mortem + 확장 테스트 플랜)
- `force: ralplan` 또는 `! ralplan`: 명확한 요청에도 강제 실행
</Arguments>

$ARGUMENTS
