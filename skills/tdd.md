---
name: tdd
description: Test-Driven Development workflow with Red-Green-Refactor cycle
triggers:
  - "tdd"
  - "test first"
  - "테스트 먼저"
  - "테스트 주도"
---

<Purpose>
TDD(Test-Driven Development) 워크플로우를 실행합니다.
Red-Green-Refactor 사이클을 통해 견고한 코드를 점진적으로 구축합니다.
</Purpose>

## The Iron Law / 철의 법칙

**실패하는 테스트 없이 프로덕션 코드를 작성하지 않는다**

테스트 전에 코드를 작성했다면? **삭제하고 처음부터 다시 시작한다.** 예외 없음.

<Steps>
1. **RED**: 실패하는 테스트를 먼저 작성합니다
   - 요구사항을 테스트 케이스로 변환
   - 엣지 케이스와 에러 케이스 포함
   - 테스트 실행 — **반드시 실패해야 함**
   - 첫 실행에 통과하면 테스트가 잘못된 것 — 수정 필요

2. **GREEN**: 테스트를 통과하는 최소한의 코드를 작성합니다
   - 가장 단순한 구현으로 시작
   - "하는 김에" 추가 기능 금지
   - 모든 테스트가 통과하는 것을 확인
   - 불필요한 최적화나 추상화는 하지 않음

3. **REFACTOR**: 코드를 정리합니다
   - 중복 제거
   - 네이밍 개선
   - 필요 시 추상화 도입
   - **변경할 때마다** 테스트 실행
   - 모든 테스트가 여전히 통과해야 함

4. **REPEAT**: 다음 요구사항으로 사이클 반복
</Steps>

## Enforcement Rules / 시행 규칙

| 감지 상황 | 조치 |
|-----------|------|
| 테스트보다 코드가 먼저 작성됨 | **중단. 코드 삭제. 테스트 먼저 작성.** |
| 테스트가 첫 실행에 통과 | **테스트가 잘못됨. 실패하도록 수정.** |
| 한 사이클에 여러 기능 | **중단. 하나의 테스트, 하나의 기능.** |
| Refactor 단계 건너뜀 | **돌아가서 정리. 다음 기능 전에 리팩터.** |
| Refactor에서 동작 변경 | **중단. Refactor는 동작 보존만.** |
| 테스트를 수정하여 통과시킴 | **금지. 테스트는 요구사항. 코드를 수정.** |

## 에이전트 위임

`test-engineer` 에이전트에 위임하여 TDD 사이클을 수행합니다:

```
Agent(
  subagent_type="test-engineer",
  model="opus",
  prompt="TDD TASK

Red-Green-Refactor 사이클로 기능을 구현하세요.

Feature: [구현할 기능]

Iron Law: 실패하는 테스트 없이 프로덕션 코드를 절대 작성하지 않는다.

각 사이클에서:
1. RED: 실패하는 테스트 작성 및 실행 (실패 확인)
2. GREEN: 최소한의 코드로 테스트 통과
3. REFACTOR: 코드 정리 (테스트 유지)

Output: 각 사이클별 RED/GREEN/REFACTOR 결과 리포트"
)
```

## External Consultation (Optional)

test-engineer 에이전트는 테스트 전략 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 테스트 전략을 먼저 수립** — 독립적으로 테스트 설계
2. **검증을 위한 자문** — Claude Task 에이전트를 통해 테스트 커버리지 전략 교차 확인
3. **비판적 평가** — 외부 제안을 맹목적으로 수용하지 않음
4. **우아한 폴백** — 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 복잡한 도메인 로직의 포괄적 테스트 커버리지
- 핵심 경로의 엣지 케이스 식별
- 대규모 기능의 테스트 아키텍처
- 익숙하지 않은 테스팅 패턴

### 자문을 생략하는 경우
- 단순 유닛 테스트
- 잘 알려진 테스팅 패턴
- 시간이 촉박한 TDD 사이클
- 작고 격리된 기능

## Phase별 출력 형식 템플릿

```
## TDD Cycle: [기능 이름]

=== RED Phase ===
Test File: [테스트 파일 경로]
Test Code:
  [테스트 코드]

Expected Failure: [예상되는 에러 메시지]
Actual Result:
  FAIL: [실제 실행 결과]
  X failing, Y passing

Status: RED (테스트 실패 확인)

=== GREEN Phase ===
Implementation File: [구현 파일 경로]
Implementation Code:
  [최소한의 구현 코드]

Test Result:
  PASS: [실행 결과]
  All tests passing

Status: GREEN (테스트 통과 확인)

=== REFACTOR Phase ===
Changes:
  - [변경 사항 1]
  - [변경 사항 2]

Test Result:
  PASS: All tests still passing

Status: REFACTOR COMPLETE

=== Cycle Summary ===
Feature: [구현된 기능]
Tests Added: N
Tests Passing: N/N
Next: [다음 사이클 기능]
```

## 명령어

각 구현 전:
```bash
# 프로젝트의 테스트 명령어 실행 — 새 실패 테스트가 하나여야 함
```

구현 후:
```bash
# 프로젝트의 테스트 명령어 실행 — 새 테스트 통과, 기존 테스트도 모두 통과
```

<Policy>
- 테스트 없이 프로덕션 코드를 작성하지 않습니다
- 한 번에 하나의 실패하는 테스트만 추가합니다
- Refactor 단계에서 동작을 변경하지 않습니다
- 매 사이클 완료 후 테스트 스위트 전체 실행
- 테스트를 수정하여 통과시키는 행위는 금지 (test hack 금지)
- 규율 자체가 가치입니다 — 지름길은 이점을 파괴합니다
</Policy>

<Arguments>
## 사용법
`/tenetx:tdd {구현할 기능}`

### 예시
- `/tenetx:tdd 이메일 유효성 검증 함수`
- `/tenetx:tdd 장바구니 할인 계산 로직`
- `/tenetx:tdd src/utils/parser.ts에 JSON 파싱 에러 핸들링 추가`

### 인자
- 구현할 기능이나 요구사항을 설명
- 테스트 프레임워크는 프로젝트 설정에서 자동 감지 (jest, vitest 등)
</Arguments>

$ARGUMENTS
