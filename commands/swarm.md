---
name: swarm
description: File-based distributed task claiming for multi-agent parallel execution
triggers:
  - "swarm"
  - "swarm mode"
  - "스웜"
  - "스웜 모드"
  - "분산 작업"
---

<Purpose>
Swarm — 파일 기반 분산 task claiming 시스템.
여러 에이전트가 동시에 task pool에서 작업을 가져가 병렬 실행합니다.
SQLite 없이 O_EXCL atomic lock으로 동시성을 제어하여 의존성 최소화 원칙을 유지합니다.
</Purpose>

<Usage>
## 사용법

```
/tenetx:swarm create "작업 설명"
/tenetx:swarm claim <agent-id>
/tenetx:swarm complete <task-id> "결과"
/tenetx:swarm fail <task-id> "사유"
/tenetx:swarm status
/tenetx:swarm cleanup
```

### 서브커맨드

- **create** — 새로운 task를 pending 상태로 생성
- **claim** — pending task 중 하나를 atomic하게 claim
- **complete** — claimed task를 완료 처리
- **fail** — claimed task를 실패 처리
- **status** — 전체 swarm 상태 조회 (pending/claimed/completed/failed 집계)
- **cleanup** — 타임아웃(5분) 초과된 stale lock 정리, claimed → pending 복원

### 예시

```bash
# task 3개 생성
/tenetx:swarm create "API 엔드포인트 구현"
/tenetx:swarm create "프론트엔드 컴포넌트 구현"
/tenetx:swarm create "테스트 작성"

# 에이전트별 task claim
/tenetx:swarm claim agent-backend
/tenetx:swarm claim agent-frontend
/tenetx:swarm claim agent-tester

# 작업 완료/실패 처리
/tenetx:swarm complete <task-id> "구현 완료"
/tenetx:swarm fail <task-id> "타입 에러 발생"

# 전체 상태 확인
/tenetx:swarm status

# stale lock 정리
/tenetx:swarm cleanup
```
</Usage>

<Architecture>
## 아키텍처

```
.compound/swarm/
├── {task-id}.json    # task 상태 파일
└── {task-id}.lock    # atomic lock 파일 (O_EXCL)
```

### 동시성 제어

1. `claimTask(agentId)` 호출 시 pending task를 순회
2. 각 task에 대해 `{taskId}.lock` 파일을 `O_WRONLY | O_CREAT | O_EXCL` 플래그로 생성 시도
3. 성공 → lock 획득, task 상태를 claimed로 업데이트
4. EEXIST → 다른 에이전트가 이미 claim, 다음 task 시도
5. 타임아웃(기본 5분) 초과된 claimed task는 cleanup으로 pending 복원

### 제약사항

- 단일 머신/공유 파일시스템 내에서만 동작 (NFS 등 네트워크 FS에서는 O_EXCL 보장 불확실)
- 5-20 에이전트 수준에 최적화. 100+ 에이전트는 SQLite 기반 구현 권장
</Architecture>

$ARGUMENTS
