---
name: ecomode
description: This skill should be used when the user asks to "eco,ecomode,절약,비용절약". Token-saving eco mode with Haiku priority and minimal responses
triggers:
  - "eco"
  - "ecomode"
  - "절약"
  - "비용절약"
---

<Purpose>
Compound Harness Ecomode — 토큰 절약 모드.
비용을 최소화하면서 작업을 수행합니다. Haiku 모델을 우선 사용하고, 간결한 응답을 지향합니다.
</Purpose>

<Execution_Policy>
1. 모든 탐색은 최소한으로 (Glob/Grep 우선, Agent 최소화)
2. 응답은 간결하게 (불필요한 설명 생략)
3. 코드 블록 위주로 답변, 부연 설명 최소화
4. 한 번에 정확히 수정 (반복 수정 회피)
5. 에이전트 스폰 시 전부 Haiku 모델 사용
</Execution_Policy>

<Model_Routing>
- 모든 작업: Haiku (강제)
- 에이전트 스폰: Haiku (강제)
- 복잡한 아키텍처 판단이 필요한 경우에만 Sonnet 허용
</Model_Routing>

<Constraints>
- Agent 도구 사용 최소화 (직접 Glob/Grep/Read로 해결)
- 불필요한 파일 탐색 금지 (목적이 명확한 탐색만)
- 코드 설명은 요청 시에만 제공
- 반복 수정 시 즉시 중단하고 전체 구조 파악 후 단일 수정
- 에이전트 스폰 시 model: "haiku" 파라미터 필수
</Constraints>

<Arguments>
## 사용법
`/tenetx:ecomode {작업 내용}`

### 예시
- `/tenetx:ecomode 버그 수정: login API 500 에러`
- `/tenetx:ecomode 타입 정의 추가: UserProfile 인터페이스`
- `eco 이 함수 리팩토링해줘`

### 인자
- 간단한 작업 설명을 전달하면 최소 비용으로 처리
</Arguments>

$ARGUMENTS
