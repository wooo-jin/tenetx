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

Ultrawork는 독립적인 컴포넌트입니다 — 독립형 지속성 모드가 아니라 구성 요소입니다.
병렬성과 스마트 모델 라우팅을 제공하지만, 지속성·검증 루프·상태 관리는 포함하지 않습니다.
</Purpose>

<Component_Architecture>
## 컴포넌트 계층 구조

```
autopilot (자율 실행 파이프라인)
 └── ralph (지속성 + 검증 래퍼)
     └── ultrawork (이 스킬 — 병렬 실행 레이어만)
         └── 제공: 병렬 실행, 모델 라우팅
```

- **ultrawork만 사용**: 병렬 실행 + 경량 검증 (빌드/테스트 통과)
- **ralph 사용**: ultrawork + 세션 지속성 + 종합 아키텍트 검증
- **autopilot 사용**: ralph + 전체 자율 라이프사이클 파이프라인

> 완전한 지속성과 포괄적 검증이 필요하면 `ralph`를 사용하세요.
> 완전한 자율 파이프라인이 필요하면 `autopilot`을 사용하세요.

## 언제 사용하지 않는가
- 완료 보증 + 검증이 필요한 작업 → `ralph` 사용 (ralph가 ultrawork를 포함)
- 완전한 자율 파이프라인 → `autopilot` 사용 (autopilot이 ralph를 포함)
- 병렬성 기회가 없는 단일 순차 작업 → 에이전트에 직접 위임
- 재개를 위한 세션 지속성 필요 → ultrawork에 지속성을 추가하는 `ralph` 사용
</Component_Architecture>

<Execution_Policy>
1. 작업을 독립적 단위로 분해
2. 각 단위의 독립성 검증 (파일 충돌 없음)
3. 모든 독립 단위를 동시에 Agent로 스폰
4. 결과 수집 및 통합
5. 충돌 해결 (있으면)
6. 전체 빌드/테스트 검증
</Execution_Policy>

<Model_Routing>
## 에이전트 티어 라우팅

| 티어 | 모델 | 에이전트 서브타입 | 적합한 작업 |
|------|------|------------------|-------------|
| LOW | Haiku | `executor` + `model="haiku"` | 단순 수정 — 타입 변경, 이름 변경, 누락된 익스포트 추가 |
| MEDIUM | Sonnet | `executor` + `model="sonnet"` | 표준 구현 — 함수 작성, 버그 수정, 테스트 추가 |
| HIGH | Opus | `executor` + `model="opus"` | 복잡한 설계 — 아키텍처 분석, 대형 리팩토링 |

### Tool_Usage 예시

```
# 단순 변경 (LOW)
Task(subagent_type="tenetx:executor", model="haiku", prompt="Config 인터페이스의 누락된 타입 익스포트 추가")

# 표준 구현 (MEDIUM)
Task(subagent_type="tenetx:executor", model="sonnet", prompt="/api/users 엔드포인트 검증 로직 구현")

# 복잡한 분석 (HIGH)
Task(subagent_type="tenetx:executor", model="opus", prompt="인증 미들웨어 전체 보안 감사")
```

> Opus는 단순 수정에 과도한 비용입니다. 세미콜론 추가 같은 작업에는 `executor` + `model="haiku"`를 사용하세요.

### background 실행 기준
- `run_in_background: true` — 패키지 설치, 빌드, 테스트 스위트 (~30초 이상)
- 포그라운드 — git status, 파일 읽기, 단순 체크
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
