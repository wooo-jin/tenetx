---
name: ci-cd
description: This skill should be used when the user asks to "ci cd,ci/cd,파이프라인,github actions,배포 자동화,pipeline design". CI/CD pipeline design, implementation, and optimization
triggers:
  - "ci cd"
  - "ci/cd"
  - "파이프라인"
  - "github actions"
  - "배포 자동화"
  - "pipeline design"
---
<!-- tenetx-managed -->

<Purpose>
CI/CD 파이프라인을 설계하고 구현합니다.
빌드, 테스트, 린트, 보안 스캔, 배포까지의 자동화 파이프라인을 구축하고
안정적이고 빠른 배포 사이클을 확립합니다.
</Purpose>

<Steps>
1. **요구사항 분석**: 프로젝트의 CI/CD 요구사항을 파악합니다
   - 현재 배포 프로세스 파악 (수동/자동)
   - 배포 대상 환경 (staging, production, preview)
   - 브랜치 전략 확인 (gitflow, trunk-based, GitHub flow)
   - 필요한 품질 게이트 식별
   - 배포 빈도 목표
   - 롤백 요구사항
   - 시크릿 관리 방식
   - 알림/모니터링 연동 대상

2. **파이프라인 스테이지 설계**: 단계별 작업을 정의합니다
   - **Install**: 의존성 설치 (캐시 활용)
   - **Lint**: 코드 스타일 검사 (ESLint, Prettier)
   - **Type Check**: 타입 검사 (TypeScript)
   - **Unit Test**: 유닛 테스트 실행 + 커버리지
   - **Integration Test**: 통합 테스트 (DB, 외부 서비스)
   - **Build**: 프로덕션 빌드
   - **Security Scan**: 의존성 취약점 검사 (npm audit, Snyk)
   - **E2E Test**: End-to-End 테스트 (Playwright, Cypress)
   - **Deploy**: 배포 (환경별 차등)
   - **Smoke Test**: 배포 후 기본 동작 확인
   - **Notify**: 결과 알림 (Slack, Discord)

3. **구현**: 파이프라인 설정 파일을 작성합니다
   - CI 플랫폼 선택 (GitHub Actions, GitLab CI, CircleCI)
   - 워크플로우 파일 작성
   - 병렬 실행 가능한 작업 식별 및 설정
   - 캐싱 전략 (node_modules, 빌드 아티팩트)
   - 매트릭스 빌드 (여러 Node 버전, OS)
   - 환경별 배포 조건 설정
   - 시크릿 설정 (환경 변수, 시크릿 스토어)
   - 재사용 가능한 워크플로우 분리

4. **품질 게이트 설정**: 머지/배포 차단 조건을 설정합니다
   - 테스트 커버리지 임계값 (85%+)
   - 린트 에러 제로
   - 타입 에러 제로
   - 보안 취약점 제로 (CRITICAL/HIGH)
   - 빌드 성공 필수
   - PR 리뷰 승인 필수
   - 커밋 메시지 컨벤션 검사

5. **모니터링 및 최적화**: 파이프라인 성능을 관리합니다
   - 파이프라인 실행 시간 추적
   - 실패율 모니터링
   - Flaky 테스트 추적 및 제거
   - 캐시 히트율 최적화
   - 불필요한 재실행 방지 (경로 필터링)
   - 비용 최적화 (러너 크기, 병렬화)
</Steps>

## 에이전트 위임

`executor` 에이전트(Sonnet 모델)에 위임하여 파이프라인을 구현합니다:

```
Agent(
  subagent_type="executor",
  model="sonnet",
  prompt="CI/CD PIPELINE TASK

CI/CD 파이프라인을 설계하고 구현하세요.

Project: [프로젝트 설명]
Platform: [GitHub Actions / GitLab CI / etc.]
Branch Strategy: [gitflow / trunk-based / GitHub flow]

Pipeline Checklist:
1. 스테이지 설계 (lint, test, build, deploy)
2. 워크플로우 파일 작성
3. 캐싱 및 병렬화 최적화
4. 품질 게이트 설정
5. 시크릿 및 환경 변수 관리
6. 배포 전략 (환경별)

Output: CI/CD 구성 파일 및 문서:
- 워크플로우 파일(들)
- 환경별 배포 설정
- 품질 게이트 목록
- 파이프라인 다이어그램"
)
```

## External Consultation (Optional)

executor 에이전트는 교차 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 파이프라인 설계를 먼저 완료** -- 독립적으로 구현
2. **검증을 위한 자문** -- Claude Task 에이전트를 통해 설계 교차 확인
3. **비판적 평가** -- 외부 제안을 맹목적으로 수용하지 않음
4. **우아한 폴백** -- 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 멀티 환경 배포 전략 (dev/staging/prod)
- Blue-Green 또는 Canary 배포 설정
- 모노레포 CI 최적화
- 보안이 중요한 배포 파이프라인

### 자문을 생략하는 경우
- 단순 린트/테스트 파이프라인
- 단일 환경 배포
- 잘 알려진 CI 템플릿 적용
- 기존 파이프라인의 경미한 수정

## 파이프라인 체크리스트

### CI (Continuous Integration) (6개)
- [ ] 의존성 설치에 캐시 적용
- [ ] 린트가 모든 PR에서 실행됨
- [ ] 타입 체크가 모든 PR에서 실행됨
- [ ] 테스트가 커버리지와 함께 실행됨
- [ ] 보안 스캔이 포함됨
- [ ] 빌드가 성공해야 머지 가능

### CD (Continuous Deployment) (5개)
- [ ] staging 환경에 자동 배포
- [ ] production 배포에 수동 승인 또는 자동 게이트
- [ ] 배포 후 스모크 테스트 실행
- [ ] 롤백 절차가 문서화/자동화됨
- [ ] 배포 알림이 설정됨

### 보안 (4개)
- [ ] 시크릿이 CI 플랫폼의 시크릿 스토어에 저장됨
- [ ] 워크플로우 파일에 하드코딩된 시크릿 없음
- [ ] 의존성 취약점 스캔 포함
- [ ] 최소 권한 원칙으로 배포 토큰 설정

### 성능 (3개)
- [ ] 병렬 실행으로 총 실행 시간 최소화
- [ ] 경로 필터로 불필요한 실행 방지
- [ ] 캐시 히트율이 80% 이상

## 배포 전략 비교

| 전략 | 다운타임 | 롤백 속도 | 복잡도 | 적합한 경우 |
|------|----------|-----------|--------|-------------|
| **Rolling** | 없음 | 느림 | 낮음 | 일반 웹 서비스 |
| **Blue-Green** | 없음 | 즉시 | 중간 | 빠른 롤백 필요 |
| **Canary** | 없음 | 빠름 | 높음 | 대규모 트래픽 |
| **Recreate** | 있음 | 느림 | 낮음 | 비프로덕션 환경 |

<Output>
```
CI/CD PIPELINE DOCUMENT / CI/CD 파이프라인 문서
================================================

Project: [프로젝트명]
Platform: [GitHub Actions / GitLab CI]
Branch Strategy: [gitflow / trunk-based]

PIPELINE DIAGRAM / 파이프라인 다이어그램
-----------------------------------------
PR → [Install] → [Lint + Type Check + Unit Test] → [Build] → [Security Scan]
                         (parallel)
main → [Install] → [Full Test] → [Build] → [Deploy Staging] → [Smoke Test]
                                                    ↓ (manual approve)
                                            [Deploy Production] → [Smoke Test]

STAGES / 스테이지
------------------
| Stage         | Trigger      | Duration | Parallel |
|---------------|-------------|----------|----------|
| Install       | PR, push    | ~30s     | -        |
| Lint          | PR, push    | ~15s     | Yes      |
| Type Check    | PR, push    | ~20s     | Yes      |
| Unit Test     | PR, push    | ~45s     | Yes      |
| Build         | PR, push    | ~60s     | -        |
| Security Scan | PR, push    | ~30s     | Yes      |
| Deploy Staging| main push   | ~120s    | -        |
| Smoke Test    | after deploy| ~30s     | -        |
| Deploy Prod   | manual      | ~120s    | -        |

QUALITY GATES / 품질 게이트
-----------------------------
- Test Coverage: >= 85%
- Lint Errors: 0
- Type Errors: 0
- Security Vulnerabilities (CRITICAL/HIGH): 0
- Build: Success
- PR Review: >= 1 approval

WORKFLOW FILES / 워크플로우 파일
---------------------------------
.github/workflows/
  ci.yml          -- PR 검증 (lint, test, build)
  cd-staging.yml  -- staging 자동 배포
  cd-prod.yml     -- production 수동 배포
  security.yml    -- 주간 보안 스캔

ESTIMATED TOTAL RUNTIME / 예상 총 실행 시간
---------------------------------------------
PR Pipeline: ~2m30s
Deploy Pipeline: ~5m
```
</Output>

<Policy>
- 파이프라인은 10분 이내에 완료되어야 합니다 (PR 기준 5분 목표)
- 시크릿은 절대 워크플로우 파일에 하드코딩하지 않습니다
- 프로덕션 배포에는 반드시 승인 프로세스를 포함합니다
- 롤백 절차를 반드시 문서화하고 테스트합니다
- Flaky 테스트는 파이프라인 신뢰성을 해치므로 즉시 수정합니다
- 비용 효율성을 고려하여 불필요한 실행을 방지합니다
</Policy>

## 다른 스킬과의 연동

**테스트 전략 연동:**
```
/tenetx:testing-strategy CI에서 실행할 테스트 구성
```
테스트 전략에 맞는 CI 테스트 단계 구성

**보안 리뷰 연동:**
```
/tenetx:security-review .github/workflows/
```
워크플로우 파일의 보안 점검

**Docker 연동:**
```
/tenetx:docker CI에서 컨테이너 빌드
```
CI 파이프라인에 Docker 이미지 빌드 통합

## Best Practices

- **빠르게 실패** -- 가장 빠른 검사를 먼저 실행 (lint > type > test > build)
- **병렬화** -- 독립적인 작업은 동시에 실행
- **캐시 활용** -- 의존성과 빌드 아티팩트를 캐싱
- **경로 필터링** -- 관련 파일 변경 시에만 실행
- **알림 최적화** -- 실패 시에만 알림 (성공 알림은 노이즈)

<Arguments>
## 사용법
`/tenetx:ci-cd {파이프라인 대상}`

### 예시
- `/tenetx:ci-cd GitHub Actions 파이프라인 설계`
- `/tenetx:ci-cd staging 자동 배포 설정`
- `/tenetx:ci-cd 기존 파이프라인 실행 시간 최적화`
- `/tenetx:ci-cd Vercel 배포 + Preview 환경 구성`

### 인자
- CI 플랫폼, 배포 대상, 최적화 목표 등을 설명
- 인자 없으면 프로젝트에 적합한 CI/CD 파이프라인을 설계
</Arguments>

$ARGUMENTS
