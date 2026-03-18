---
name: refactor
description: Safe refactoring with test-first approach and SOLID principles
triggers:
  - "refactor"
  - "리팩토링"
  - "리팩터"
  - "코드정리"
---

<Purpose>
테스트 확보→변경→검증의 3단계를 통해 기능을 유지하면서 코드 구조를 개선합니다.
코드 스멜 식별, SOLID 원칙 적용, 리팩토링 카탈로그를 활용해 체계적으로 진행합니다.
</Purpose>

<Steps>
1. **테스트 확보 (Test First)**
   - 리팩토링 전 기존 동작을 테스트로 고정
   - 테스트 없는 코드: 특성화 테스트(Characterization Test) 먼저 작성
     ```typescript
     // 현재 동작을 그대로 문서화하는 테스트
     it('현재 동작 특성화', () => {
       expect(legacyFunction(input)).toMatchSnapshot();
     });
     ```
   - 커버리지 확인: 변경할 코드 경로가 모두 테스트에 포함됐는지 검증

2. **코드 스멜 식별**
   - **긴 함수**: 50줄 초과 → 추출(Extract) 대상
   - **중복 코드**: DRY 원칙 위반 → 공통 추출
   - **복잡한 조건**: 중첩 if/else 3단계 초과 → Early Return 또는 전략 패턴
   - **긴 매개변수 목록**: 4개 초과 → 객체로 묶기
   - **거대한 클래스**: 단일 책임 원칙 위반 → 분리
   - **주석으로 설명이 필요한 코드**: 코드 자체를 명확하게 개선

3. **SOLID 원칙 적용**
   - **S** (단일 책임): 클래스/함수는 하나의 이유로만 변경
   - **O** (개방-폐쇄): 확장에 열려 있고 수정에 닫혀 있도록 설계
   - **L** (리스코프 치환): 하위 타입은 상위 타입을 완전히 대체 가능
   - **I** (인터페이스 분리): 사용하지 않는 메서드를 강요하지 않음
   - **D** (의존성 역전): 구체 클래스가 아닌 추상화에 의존

4. **리팩토링 카탈로그 (Fowler)**
   - **Extract Method**: 코드 블록을 독립적인 함수로 추출
     ```typescript
     // Before
     function processOrder(order) {
       // 가격 계산 (20줄)
       let total = 0;
       for (const item of order.items) { total += item.price * item.qty; }
       // ...
     }
     // After
     function processOrder(order) {
       const total = calculateTotal(order.items);
       // ...
     }
     function calculateTotal(items) { /* ... */ }
     ```
   - **Move Method**: 다른 클래스에서 더 많이 사용하는 메서드 이동
   - **Replace Conditional with Polymorphism**: switch/if-else 체인 → 다형성
     ```typescript
     // Before: if (type === 'A') ... else if (type === 'B') ...
     // After: strategy[type].execute()
     ```
   - **Introduce Parameter Object**: 매개변수 그룹 → 객체
   - **Replace Magic Number with Constant**: 리터럴 → 명명된 상수
   - **Inline Variable**: 불필요한 중간 변수 제거

5. **변경 (Refactor)**
   - 한 번에 하나의 리팩토링만 적용
   - 각 단계 후 테스트 실행 (`npm test` / `vitest run`)
   - 작은 커밋으로 이력 추적: `refactor: Extract calculateTotal from processOrder`
   - 동작 변경과 구조 변경을 같은 커밋에 섞지 않음

6. **검증 (Verify)**
   - 전체 테스트 스위트 통과 확인
   - 타입 검사: `tsc --noEmit`
   - 린트: `eslint src/`
   - 성능 회귀 없음 확인 (주요 경로 벤치마크)
</Steps>

<Policy>
- 리팩토링과 기능 추가를 동시에 하지 않는다
- 테스트 없이 리팩토링 시작 금지
- 각 단계 후 테스트 통과 확인 필수
- 한 세션에서 수정하는 파일은 최대 5개로 제한
</Policy>

<Arguments>
## 사용법
`/tenetx:refactor {리팩토링 대상}`

### 예시
- `/tenetx:refactor src/services/PaymentService.ts — 200줄 함수 분리`
- `/tenetx:refactor 주문 처리 로직의 중복 코드 제거`
- `/tenetx:refactor UserController를 SOLID 원칙에 맞게 재설계`

### 인자
- 리팩토링할 파일/함수/모듈 명시
- 목표 (성능, 가독성, 유지보수성, 특정 패턴 적용)
- 제약 조건 (하위 호환성 유지, 특정 인터페이스 유지 등)
</Arguments>

$ARGUMENTS
