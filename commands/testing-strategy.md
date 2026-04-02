---
name: testing-strategy
description: This skill should be used when the user asks to "testing strategy,테스트 전략,test plan,테스트 계획,coverage plan". Test strategy design, coverage analysis, and quality planning
triggers:
  - "testing strategy"
  - "테스트 전략"
  - "test plan"
  - "테스트 계획"
  - "coverage plan"
---
<!-- tenetx-managed -->

<Purpose>
테스트 전략을 수립하고 커버리지 계획을 설계합니다.
TDD 스킬이 Red-Green-Refactor 워크플로우를 다루는 반면,
이 스킬은 "무엇을 어떻게 테스트할 것인가"의 전략적 관점을 다룹니다.
테스트 피라미드, 커버리지 갭 분석, 우선순위 결정을 수행합니다.
</Purpose>

<Steps>
1. **현재 커버리지 평가**: 기존 테스트 상태를 분석합니다
   - 라인/브랜치/함수 커버리지 측정
   - 테스트 피라미드 비율 분석 (unit : integration : e2e)
   - 테스트 실행 시간 측정
   - 불안정(flaky) 테스트 식별
   - 테스트 없는 핵심 경로 식별
   - 최근 버그의 테스트 커버리지 분석 (커버 되었는가?)

2. **갭 분석**: 테스트가 부족한 영역을 식별합니다
   - 비즈니스 로직의 테스트 커버리지 확인
   - 에러 핸들링 경로의 테스트 존재 여부
   - 엣지 케이스 누락 식별
     * 빈 입력, null/undefined
     * 경계값 (최소/최대)
     * 동시성/경쟁 조건
     * 타임아웃/네트워크 에러
   - 보안 관련 로직의 테스트 확인 (인증, 인가, 입력 검증)
   - 통합 테스트 누락 (모듈 간 상호작용)
   - 외부 의존성 모킹의 적절성

3. **우선순위 결정**: 테스트 작성 순서를 결정합니다
   - 위험도 기반 우선순위 매트릭스:
     * [P0] 결제, 인증, 데이터 무결성 -- 반드시 테스트
     * [P1] 핵심 비즈니스 로직 -- 높은 우선순위
     * [P2] 일반 CRUD 작업 -- 중간 우선순위
     * [P3] 유틸리티, 헬퍼 -- 낮은 우선순위
   - 변경 빈도가 높은 코드 우선
   - 최근 버그가 발생한 모듈 우선
   - 복잡도가 높은 함수 우선

4. **테스트 전략 수립**: 테스트 유형별 전략을 설계합니다
   - Unit Test 전략:
     * 순수 함수: 입력/출력 테스트
     * 사이드 이펙트: 모킹/스터빙
     * 커버리지 목표: 85%+ (브랜치 기준)
   - Integration Test 전략:
     * 모듈 간 상호작용 검증
     * 외부 서비스 모킹 범위
     * 데이터베이스 테스트 (인메모리 vs 컨테이너)
   - E2E Test 전략:
     * 핵심 사용자 시나리오 선정
     * 테스트 환경 구성
     * 데이터 시딩 전략
   - 성능 Test 전략:
     * 부하 테스트 시나리오
     * 성능 기준값 설정

5. **구현 및 추적**: 테스트를 점진적으로 구현합니다
   - 테스트 작성 태스크 목록 생성
   - 커버리지 추적 대시보드 설정
   - CI 파이프라인에 커버리지 게이트 추가
   - 정기적인 커버리지 리뷰 일정 설정
   - 뮤테이션 테스트 도입 계획 (핵심 비즈니스 로직)
</Steps>

## 에이전트 위임

`test-engineer` 에이전트(Opus 모델)에 위임하여 테스트 전략을 수립합니다:

```
Agent(
  subagent_type="test-engineer",
  model="opus",
  prompt="TESTING STRATEGY TASK

테스트 전략을 수립하고 커버리지 계획을 설계하세요.

Project: [프로젝트 설명]
Current Coverage: [현재 커버리지 또는 '미측정']

Strategy Checklist:
1. 현재 커버리지 측정 및 분석
2. 테스트 갭 식별 (에러 경로, 엣지 케이스)
3. 위험도 기반 우선순위 결정
4. 테스트 유형별 전략 (unit/integration/e2e)
5. 구현 로드맵 및 커버리지 목표

Output: 테스트 전략 문서:
- 현재 커버리지 분석
- 갭 분석 결과
- 우선순위 목록
- 유형별 전략
- 커버리지 목표 및 로드맵"
)
```

## External Consultation (Optional)

test-engineer 에이전트는 교차 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 전략을 먼저 수립** -- 독립적으로 분석 수행
2. **검증을 위한 자문** -- Claude Task 에이전트를 통해 전략 교차 확인
3. **비판적 평가** -- 외부 제안을 맹목적으로 수용하지 않음
4. **우아한 폴백** -- 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 복잡한 도메인의 테스트 커버리지 전략
- 마이크로서비스 간 통합 테스트 설계
- 성능/부하 테스트 시나리오 설계
- 뮤테이션 테스트 도입 전략

### 자문을 생략하는 경우
- 단순 유닛 테스트 계획
- 명확한 CRUD 테스트
- 기존 패턴 반복
- 소규모 모듈의 테스트

## 테스트 피라미드 기준

```
        /  E2E  \         5~10% (핵심 시나리오만)
       /----------\
      / Integration \     15~25% (모듈 간 상호작용)
     /----------------\
    /    Unit Tests     \  70~80% (모든 비즈니스 로직)
   /--------------------\
```

## 커버리지 목표 가이드

| 코드 유형 | 라인 | 브랜치 | 뮤테이션 |
|-----------|------|--------|----------|
| 결제/인증 | 95%+ | 90%+ | 80%+ |
| 비즈니스 로직 | 85%+ | 80%+ | 70%+ |
| 유틸리티 | 80%+ | 75%+ | -- |
| UI 컴포넌트 | 70%+ | 60%+ | -- |
| 설정/부트스트랩 | 60%+ | -- | -- |

## 테스트 품질 지표

| 지표 | 건강 | 주의 | 위험 |
|------|------|------|------|
| 브랜치 커버리지 | > 80% | 60~80% | < 60% |
| 테스트 실행 시간 | < 30s | 30s~2m | > 2m |
| Flaky 테스트 비율 | 0% | < 2% | > 2% |
| 뮤테이션 점수 | > 70% | 50~70% | < 50% |

<Output>
```
TESTING STRATEGY / 테스트 전략 문서
=====================================

Project: [프로젝트명]
Date: YYYY-MM-DD
Test Framework: [vitest / jest / playwright]

CURRENT STATE / 현재 상태
---------------------------
Line Coverage:    72% (target: 85%)
Branch Coverage:  58% (target: 80%)
Test Count:       142 (unit: 120, integration: 18, e2e: 4)
Execution Time:   24s
Flaky Tests:      2 (src/api/order.test.ts, src/utils/date.test.ts)

GAP ANALYSIS / 갭 분석
------------------------
[P0] CRITICAL GAPS (테스트 없는 핵심 경로):
  - src/services/payment.ts -- 결제 처리 로직 (0% coverage)
  - src/middleware/auth.ts -- 인증 미들웨어 에러 경로 (30% branch)

[P1] HIGH GAPS (불충분한 커버리지):
  - src/services/order.ts -- 할인 계산 엣지 케이스 미테스트
  - src/utils/validation.ts -- 경계값 테스트 부재

[P2] MEDIUM GAPS:
  - src/api/users.ts -- 통합 테스트 부재
  - src/components/Cart.tsx -- 상태 변경 테스트 부족

IMPLEMENTATION ROADMAP / 구현 로드맵
--------------------------------------
Week 1: P0 갭 해소 (결제, 인증)
  - [ ] payment.ts 유닛 테스트 (15개)
  - [ ] auth.ts 에러 경로 테스트 (8개)

Week 2: P1 갭 해소 (비즈니스 로직)
  - [ ] order.ts 엣지 케이스 테스트 (10개)
  - [ ] validation.ts 경계값 테스트 (12개)

Week 3: 통합 테스트 보강
  - [ ] API 엔드포인트 통합 테스트 (20개)
  - [ ] E2E 핵심 시나리오 (3개)

TARGET / 목표
--------------
Line Coverage:    72% → 85%
Branch Coverage:  58% → 80%
Test Count:       142 → 210
Flaky Tests:      2 → 0
```
</Output>

<Policy>
- 커버리지 숫자보다 테스트 품질을 우선합니다
- 브랜치 커버리지를 라인 커버리지보다 중요하게 봅니다
- 핵심 비즈니스 로직에 뮤테이션 테스트를 권장합니다
- Flaky 테스트는 즉시 수정하거나 격리합니다
- 테스트는 빠르게 실행되어야 합니다 (전체 30초 이내 목표)
- 테스트 작성 계획은 스프린트에 통합하여 추적합니다
</Policy>

## 다른 스킬과의 연동

**TDD 연동:**
```
/tenetx:tdd 전략에서 식별된 갭 구현
```
전략에서 식별된 테스트 갭을 TDD로 구현

**코드 리뷰 연동:**
```
/tenetx:code-review 테스트 코드 품질 확인
```
작성된 테스트 코드의 품질 검증

**CI/CD 연동:**
```
/tenetx:ci-cd 커버리지 게이트 설정
```
CI에서 커버리지 임계값 강제

## Best Practices

- **전략 먼저** -- 무작정 테스트를 쓰기 전에 어디가 중요한지 파악
- **위험 기반** -- 모든 코드를 균일하게 테스트하지 않음
- **피라미드 유지** -- E2E에 의존하지 않고 유닛 테스트 기반 구축
- **Flaky 제로** -- 불안정한 테스트는 신뢰를 해침
- **지속 추적** -- 커버리지 트렌드를 모니터링

<Arguments>
## 사용법
`/tenetx:testing-strategy {대상}`

### 예시
- `/tenetx:testing-strategy 전체 프로젝트 커버리지 분석`
- `/tenetx:testing-strategy 결제 모듈 테스트 계획`
- `/tenetx:testing-strategy E2E 테스트 전략 수립`
- `/tenetx:testing-strategy 현재 테스트의 갭 분석`

### 인자
- 분석 대상 모듈, 테스트 유형, 목표 등을 설명
- 인자 없으면 프로젝트 전체의 테스트 전략을 수립
</Arguments>

$ARGUMENTS
