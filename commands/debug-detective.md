---
name: debug-detective
description: Systematic debugging with reproduce-isolate-fix-verify loop
triggers:
  - "debug-detective"
  - "디버그탐정"
  - "체계적디버깅"
---

<Purpose>
재현→격리→수정→검증의 4단계 루프를 통해 버그를 체계적으로 추적합니다.
에러 분류, git bisect, 최소 재현 사례 구성으로 근본 원인을 신속히 파악합니다.
</Purpose>

<Steps>
1. **재현 (Reproduce)**
   - 버그 재현 조건을 최대한 구체적으로 문서화
     ```
     환경: Node 20.x, macOS 14.3
     입력값: { userId: null, action: "delete" }
     예상 동작: 422 Validation Error
     실제 동작: 500 Internal Server Error
     재현율: 100% / 간헐적 (~30%)
     ```
   - 간헐적 버그: 로그 레벨 높이고 반복 실행으로 패턴 포착
   - 환경 차이 확인: 로컬 vs CI vs 프로덕션

2. **격리 (Isolate)**
   - **에러 분류**:
     - **런타임 에러**: TypeError, ReferenceError → 스택 트레이스 추적
     - **타입 에러**: TS 컴파일 에러 → 타입 정의 불일치 확인
     - **논리 에러**: 잘못된 계산/조건 → 중간값 로깅
     - **비동기 에러**: Promise rejection, race condition → async/await 추적
   - **Bisect 전략**:
     ```bash
     # git bisect로 버그 도입 커밋 이진 탐색
     git bisect start
     git bisect bad                    # 현재 커밋은 버그 있음
     git bisect good <마지막_정상_sha>  # 정상 커밋 지정
     # Git이 자동으로 중간 커밋 체크아웃
     # 테스트 후 good/bad 판정 반복
     git bisect run npm test           # 자동화 가능
     git bisect reset                  # 완료 후 원상복구
     ```
   - **최소 재현 사례 구성**: 관련 없는 코드를 제거해 가장 단순한 형태로 축소

3. **로그 분석 패턴**
   ```typescript
   // 구조화 로그로 맥락 추가
   logger.error('결제 처리 실패', {
     userId, orderId, amount,
     stack: err.stack,
     timestamp: new Date().toISOString(),
   });

   // 조건부 디버그 로그 (프로덕션 영향 최소화)
   if (process.env.DEBUG_PAYMENT) {
     console.log('[DEBUG]', JSON.stringify({ state, payload }, null, 2));
   }
   ```
   - 타임스탬프 정렬 → 이벤트 순서 파악
   - 상관관계 ID(correlation ID)로 분산 로그 추적

4. **수정 (Fix)**
   - 근본 원인(root cause)을 먼저 명시
   - 증상만 치료하는 패치 금지 → 원인 제거
   - 수정 범위를 최소화 (side effect 방지)
   - 수정 전후 코드 diff를 커밋 메시지에 설명

5. **검증 (Verify)**
   - 버그 재현 시나리오를 회귀 테스트로 추가
   - 원래 문제가 해결됐는지 확인
   - 관련 기능에 새 버그가 생기지 않았는지 확인
   - 스테이징 → 프로덕션 순서로 검증
</Steps>

<Policy>
- 추측 기반 수정 금지 — 반드시 재현 먼저
- 로그 추가 시 민감 정보(비밀번호, 토큰) 절대 출력 금지
- 수정 후 해당 버그의 회귀 테스트 1개 이상 추가
- 간헐적 버그는 최소 10회 연속 통과 후 수정 완료 판정
</Policy>

<Arguments>
## 사용법
`/tenetx:debug-detective {버그 설명}`

### 예시
- `/tenetx:debug-detective 로그인 후 가끔 401 에러가 발생함 (재현율 20%)`
- `/tenetx:debug-detective 최근 배포 후 결제 API 응답 시간이 3배 증가`
- `/tenetx:debug-detective TypeScript 컴파일은 되는데 런타임에서 undefined 에러`

### 인자
- 버그 증상과 재현 조건
- 발생 환경 (로컬/스테이징/프로덕션)
- 관련 에러 메시지나 스택 트레이스
</Arguments>

$ARGUMENTS
