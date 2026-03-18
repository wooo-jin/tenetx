---
name: ultrawork
description: Maximum parallelism burst mode for independent tasks
triggers:
  - "ultrawork"
  - "ulw"
  - "병렬처리"
---

<Purpose>
Compound Harness Ultrawork — 최대 병렬성 버스트 모드.
독립적인 작업을 동시에 Agent로 스폰하여 최대 속도로 처리합니다.
</Purpose>

<Execution_Policy>
1. 작업을 독립적 단위로 분해
2. 각 단위의 독립성 검증 (파일 충돌 없음)
3. 모든 독립 단위를 동시에 Agent로 스폰
4. 결과 수집 및 통합
5. 충돌 해결 (있으면)
6. 전체 빌드/테스트 검증
</Execution_Policy>

<Model_Routing>
- 단순 수정 (타입 변경, 이름 변경 등): Haiku
- 표준 구현 (함수 작성, 버그 수정 등): Sonnet
- 복잡한 설계 (아키텍처, 리팩토링 등): Opus
</Model_Routing>

<Constraints>
- 같은 파일을 수정하는 작업은 절대 병렬 실행하지 않음
- 각 Agent는 자신의 담당 파일만 수정
- Agent 간 의존성이 있으면 순차 실행으로 전환
- 최대 동시 Agent 수: 5
</Constraints>

<Codex_Delegation>
## Codex 병렬 스폰

tmux 환경에서 독립 작업을 Codex에 위임하여 진정한 병렬 실행이 가능합니다.
Claude의 Agent는 같은 프로세스 내 병렬이지만, Codex는 별도 프로세스로 완전히 독립 실행됩니다.

```bash
# Codex에 작업 위임 (tmux 패널 자동 분할)
tenetx codex-spawn "src/services/ 내 모든 파일에 에러 핸들링 추가"
```

Claude는 나머지 작업을 계속 진행하고, Codex가 완료되면 결과를 통합합니다.
**주의**: 같은 파일을 수정하는 작업은 절대 Codex에 위임하지 마세요.
</Codex_Delegation>

<Arguments>
## 사용법
`/tenetx:ultrawork {병렬 처리할 작업 목록}`

### 예시
- `/tenetx:ultrawork 모든 API 엔드포인트에 입력 검증 추가`
- `/tenetx:ultrawork 10개 컴포넌트의 className을 tailwind로 전환`
- `/tenetx:ultrawork 각 서비스 파일에 에러 핸들링 추가: auth.ts, payment.ts, user.ts`

### 인자
- 독립적인 파일/작업을 나열하면 최대 병렬로 실행
- 파일 간 의존성이 있으면 자동으로 순차 전환
</Arguments>

$ARGUMENTS
