---
name: code-review
description: Systematic code review with severity-rated feedback
triggers:
  - "code review"
  - "코드 리뷰"
  - "리뷰해줘"
  - "review this"
---

<Purpose>
체계적인 코드 리뷰를 수행하여 품질, 보안, 유지보수성을 검증합니다.
심각도별로 분류된 피드백을 제공합니다.
</Purpose>

<Steps>
1. **스코프 파악**: 변경된 파일과 영향 범위를 식별합니다
   - git diff 또는 지정된 파일 확인
   - 변경의 목적과 컨텍스트 이해

2. **정확성 검증**: 로직이 의도대로 동작하는지 확인합니다
   - 엣지 케이스 처리 여부
   - 에러 핸들링 적절성
   - 동시성/경쟁 조건

3. **보안 검토**: OWASP Top 10 기준으로 취약점을 점검합니다
   - 입력 검증/살균
   - 인증/인가 로직
   - 민감 정보 노출

4. **유지보수성**: 코드 품질과 가독성을 평가합니다
   - 네이밍 컨벤션
   - SOLID 원칙 준수
   - 적절한 추상화 수준

5. **피드백 작성**: 심각도별로 분류하여 리포트합니다
</Steps>

## 에이전트 위임

`code-reviewer` 에이전트(Opus 모델)에 위임하여 심층 코드 분석을 수행합니다:

```
Task(
  subagent_type="tenetx:code-reviewer",
  model="opus",
  prompt="CODE REVIEW TASK

코드 변경 사항의 품질, 보안, 유지보수성을 리뷰하세요.

Scope: [git diff 또는 특정 파일]

Review Checklist:
- Security 취약점 (OWASP Top 10)
- Code Quality (복잡도, 중복)
- Performance 이슈 (N+1, 비효율 알고리즘)
- Best Practices (네이밍, 문서화, 에러 핸들링)
- Maintainability (결합도, 테스트 가능성)

Output: 코드 리뷰 리포트:
- 리뷰한 파일 수
- 심각도별 이슈 (CRITICAL, HIGH, MEDIUM, LOW)
- 구체적인 파일:라인 위치
- 수정 권고
- 승인 권고 (APPROVE / REQUEST CHANGES / COMMENT)"
)
```

## 리뷰 체크리스트 (20개 항목)

### Security (6개)
- [ ] 하드코딩된 시크릿 없음 (API 키, 비밀번호, 토큰)
- [ ] 모든 사용자 입력이 살균됨
- [ ] SQL/NoSQL 인젝션 방지
- [ ] XSS 방지 (출력 이스케이핑)
- [ ] CSRF 보호 (상태 변경 작업)
- [ ] 인증/인가가 적절히 적용됨

### Code Quality (5개)
- [ ] 함수가 50줄 미만 (가이드라인)
- [ ] 순환 복잡도 10 미만
- [ ] 깊은 중첩 없음 (4단계 초과 시 early return 적용)
- [ ] 중복 로직 없음 (DRY 원칙)
- [ ] 명확하고 서술적인 네이밍

### Performance (4개)
- [ ] N+1 쿼리 패턴 없음
- [ ] 적절한 캐싱 적용
- [ ] 효율적인 알고리즘 (O(n^2) 대신 O(n) 가능한 경우)
- [ ] 불필요한 리렌더링 없음 (React/Vue)

### Best Practices (5개)
- [ ] 에러 핸들링이 적절히 구현됨
- [ ] 적절한 레벨의 로깅
- [ ] 공개 API에 대한 문서화
- [ ] 핵심 경로에 대한 테스트 존재
- [ ] 주석 처리된 코드 없음

## 승인 기준

| 판정 | 조건 | 설명 |
|------|------|------|
| **APPROVE** | CRITICAL/HIGH 이슈 없음 | 경미한 개선 사항만 있음, 머지 가능 |
| **REQUEST CHANGES** | CRITICAL 또는 HIGH 이슈 존재 | 반드시 수정 후 재리뷰 필요 |
| **COMMENT** | LOW/MEDIUM 이슈만 존재 | 차단 사항 없음, 선택적 개선 권장 |

## External Consultation (Optional)

code-reviewer 에이전트는 교차 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 리뷰를 먼저 완료** — 독립적으로 분석 수행
2. **검증을 위한 자문** — Claude Task 에이전트를 통해 발견 사항 교차 확인
3. **비판적 평가** — 외부 발견 사항을 맹목적으로 수용하지 않음
4. **우아한 폴백** — 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 보안에 민감한 코드 변경
- 복잡한 아키텍처 패턴
- 익숙하지 않은 코드베이스나 언어
- 고위험 프로덕션 코드

### 자문을 생략하는 경우
- 단순 리팩토링
- 잘 알려진 패턴
- 시간이 촉박한 리뷰
- 작고 격리된 변경

## 심각도 정의

| 심각도 | 설명 |
|--------|------|
| **CRITICAL** | 보안 취약점 (머지 전 반드시 수정) |
| **HIGH** | 버그 또는 주요 코드 스멜 (머지 전 수정 권장) |
| **MEDIUM** | 경미한 이슈 (가능할 때 수정) |
| **LOW** | 스타일/제안 (수정 고려) |

<Output>
```
CODE REVIEW REPORT / 코드 리뷰 리포트
======================================

Files Reviewed: N
Total Issues: N

CRITICAL (N)
------------
(없음 / 이슈 상세)

HIGH (N)
--------
1. src/api/auth.ts:42
   Issue: 사용자 입력이 SQL 쿼리 전에 살균되지 않음
   Risk: SQL 인젝션 취약점
   Fix: 파라미터화 쿼리 또는 ORM 사용

2. src/components/UserProfile.tsx:89
   Issue: 비밀번호가 로그에 평문으로 출력됨
   Risk: 크리덴셜 노출
   Fix: 로그 구문에서 비밀번호 제거

3. src/utils/validation.ts:15
   Issue: 이메일 정규식이 잘못된 형식을 허용
   Risk: 잘못된 이메일 수용
   Fix: 검증된 이메일 유효성 검사 라이브러리 사용

MEDIUM (N)
----------
...

LOW (N)
-------
...

RECOMMENDATION: [APPROVE / REQUEST CHANGES / COMMENT]

[수정이 필요한 경우 요약 코멘트]
```
</Output>

<Policy>
- 변경된 코드만 리뷰합니다 (기존 코드의 기술 부채는 별도 이슈로)
- 구체적인 코드 라인을 참조하여 피드백합니다
- 문제 지적 시 해결 방안도 함께 제시합니다
- 잘된 부분도 언급하여 균형 잡힌 피드백을 제공합니다
- 20개 체크 항목을 빠짐없이 검토합니다
- APPROVE/REQUEST CHANGES/COMMENT 3단계 판정을 반드시 포함합니다
</Policy>

## 다른 스킬과의 연동

**Pipeline 연동:**
```
/tenetx:pipeline review "사용자 인증 구현"
```
구현 워크플로우의 일부로 코드 리뷰 포함

**Ralph 연동:**
```
/tenetx:ralph code-review then fix all issues
```
코드 리뷰 후 피드백 수정, 승인될 때까지 반복

**Swarm 연동:**
```
/tenetx:swarm 4:code-reviewer "src/ 전체 파일 리뷰"
```
여러 파일에 대해 병렬 코드 리뷰 수행

## Best Practices

- **조기 리뷰** — 이슈가 누적되기 전에 잡기
- **자주 리뷰** — 크고 드문 리뷰보다 작고 빈번한 리뷰
- **CRITICAL/HIGH 우선** — 보안과 버그부터 즉시 수정
- **컨텍스트 고려** — 일부 "이슈"는 의도적 트레이드오프일 수 있음
- **리뷰에서 학습** — 피드백을 활용하여 코딩 관행 개선

<Arguments>
## 사용법
`/tenetx:code-review {리뷰 대상}`

### 예시
- `/tenetx:code-review` (기본: 최근 변경사항 리뷰)
- `/tenetx:code-review src/auth/login.ts`
- `/tenetx:code-review 최근 3개 커밋`
- `/tenetx:code-review PR #42`

### 인자
- 파일 경로, 커밋 범위, PR 번호 등을 지정
- 인자 없으면 `git diff`로 변경사항을 자동 감지
</Arguments>

$ARGUMENTS
