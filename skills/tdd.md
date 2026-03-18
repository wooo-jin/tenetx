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

<Steps>
1. **Red**: 실패하는 테스트를 먼저 작성합니다
   - 요구사항을 테스트 케이스로 변환
   - 엣지 케이스와 에러 케이스 포함
   - 테스트가 실패하는 것을 확인

2. **Green**: 테스트를 통과하는 최소한의 코드를 작성합니다
   - 가장 단순한 구현으로 시작
   - 모든 테스트가 통과하는 것을 확인
   - 불필요한 최적화나 추상화는 하지 않음

3. **Refactor**: 코드를 정리합니다
   - 중복 제거
   - 네이밍 개선
   - 필요 시 추상화 도입
   - 모든 테스트가 여전히 통과하는 것을 확인

4. **반복**: 다음 요구사항으로 사이클 반복
</Steps>

<Policy>
- 테스트 없이 프로덕션 코드를 작성하지 않습니다
- 한 번에 하나의 실패하는 테스트만 추가합니다
- Refactor 단계에서 동작을 변경하지 않습니다
- 매 사이클 완료 후 테스트 스위트 전체 실행
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
