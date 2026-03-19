---
name: autopilot
description: 5-phase autonomous execution pipeline with quality gates
triggers:
  - "autopilot"
  - "자동실행"
  - "자동 실행"
---

<Purpose>
Compound Harness Autopilot — 철학 기반 5단계 자율 실행 파이프라인.
간략한 제품 아이디어를 받아 전체 생명주기를 자율적으로 처리합니다: 요구사항 분석, 기술 설계, 계획, 병렬 구현, QA 순환, 다각적 검증. 2-3줄 설명에서 작동하는 검증된 코드를 생산합니다.
모든 단계는 philosophy 원칙에 따라 구동됩니다.
</Purpose>

<Principles>
- understand-before-act: 탐색 없이 실행하지 않음
- decompose-to-control: 큰 작업을 원자적 단위로 분해
- capitalize-on-failure: 실패는 학습 기회
- focus-resources-on-judgment: 단순 작업은 빠른 모델, 판단은 강력한 모델
- knowledge-comes-to-you: 기존 솔루션을 먼저 검색
</Principles>

<Use_When>
- 아이디어에서 작동 코드까지 전 과정 자율 실행이 필요할 때
- "autopilot", "자동실행", "만들어줘", "빌드해줘", "전부 처리해줘" 등의 요청
- 계획, 코딩, 테스트, 검증 등 여러 단계가 필요한 작업
- 사용자가 완료까지 핸즈오프 실행을 원할 때
</Use_When>

<Do_Not_Use_When>
- 옵션 탐색이나 브레인스토밍이 필요하면 `plan` 스킬 사용
- "설명만 해줘", "초안만", "어떻게 하는 게 좋을까" 등이면 대화형으로 응답
- 단일 집중 코드 변경이면 `ralph` 또는 executor 에이전트에 직접 위임
- 기존 계획을 리뷰/비평하려면 `plan --review` 사용
- 빠른 수정이나 작은 버그면 executor 직접 위임
</Do_Not_Use_When>

<Execution_Policy>
- Phase 완료 전까지 다음 Phase로 넘어가지 않는다
- 각 Phase는 완료 증거를 남긴다 (파일 또는 명시적 확인)
- Phase 내에서 가능한 곳은 병렬 실행 (Phase 0, 2, 4)
- QA 사이클은 최대 설정값까지 반복; 같은 에러가 3회 반복되면 근본 이슈로 보고
- Validation은 모든 리뷰어의 승인 필요; 거부 항목은 수정 후 재검증
- 실패 시 최대 3회 재시도 후 사용자에게 에스컬레이션
- 모든 변경은 git에서 추적 가능해야 한다
- 언제든 취소 가능; 진행 상태는 resume을 위해 보존됨
</Execution_Policy>

<Phases>

## Phase 0 — Expansion (모호 -> 명확)

에이전트 기반 2단계 확장:

### Step 1: Analyst (Opus)
IF 요청이 모호하다면:
1. 사용자 아이디어에서 요구사항 추출
2. 도메인, 핵심 기능, 제약조건 식별
3. 또는 deep-interview 스킬로 요구사항 명확화 (자동 감지)
4. 또는 기존 `.compound/specs/`에서 관련 스펙 검색

### Step 2: Architect (Opus)
1. Analyst 출력을 기반으로 기술 사양 작성
2. 명확한 acceptance criteria 도출
3. 출력: `.compound/autopilot/spec.md`

IF 요청이 명확하면 (파일 경로, 함수명, 에러 메시지 등 구체적 정보 포함):
-> Phase 0 건너뛰기

**pauseAfterExpansion 설정이 true이면 여기서 일시정지하고 사용자 확인 대기.**

## Phase 1 — Planning (탐색 + 계획)

Architect (Opus)가 직접 모드로 계획 생성 (인터뷰 없음):

1. 코드베이스 탐색 (Glob, Grep, Read)
   - 관련 파일 식별
   - 아키텍처 이해
   - 기존 패턴 파악
2. 기존 솔루션 검색 (~/.compound/me/solutions/)
3. 구현 계획 작성:
   - 수정할 파일 목록
   - 각 파일의 변경 내용
   - 의존성 순서
   - 리스크 평가
4. Critic (Opus): 계획 검증
5. 계획을 `.compound/plans/autopilot-impl.md`에 저장

**pauseAfterPlanning 설정이 true이면 여기서 일시정지하고 사용자 확인 대기.**

## Phase 2 — Execution (병렬 구현)

Ralph + Ultrawork 패턴으로 구현:

1. 계획의 각 단계를 순서대로 실행
2. 독립적인 작업은 3티어 에이전트로 병렬 처리:

| 작업 유형 | 모델 | 용도 |
|-----------|------|------|
| 단순 작업 | Haiku | 타입 추가, 간단한 수정 |
| 표준 작업 | Sonnet | 모듈 구현, 에러 처리 추가 |
| 복잡한 작업 | Opus | 아키텍처 변경, 복잡한 리팩토링 |

3. 각 파일 수정 후 즉시 검증:
   - TypeScript: tsc --noEmit
   - Lint: eslint (있으면)
   - 기존 테스트: npm test (있으면)
4. 5회 이상 같은 파일 수정 시 중단 -> 전체 재설계

## Phase 3 — QA (테스트 + 검증)

UltraQA 모드로 빌드/린트/테스트 순환:

1. 변경된 파일에 대한 테스트 실행
2. 빌드 검증 (npm run build / tsc)
3. 실패 시:
   - 에러 분석
   - 수정 시도 (최대 maxQaCycles회, 기본 5회)
   - 같은 에러가 3회 반복되면 근본 이슈로 판단하고 조기 중단
4. 모든 테스트 통과 확인

**skipQa 설정이 true이면 이 Phase 건너뛰기.**

## Phase 4 — Validation (3개 병렬 리뷰어)

3개의 전문 리뷰어가 병렬로 최종 검증:

1. **Architect (Opus)**: 기능 완전성, 아키텍처 일관성, 설계 검증
2. **Security-reviewer (Sonnet)**: OWASP Top 10, 시크릿 노출, 취약점 점검
3. **Code-reviewer (Sonnet)**: 로직 결함, 유지보수성, 패턴 준수, 코드 품질

**모든 리뷰어가 승인해야 통과.**
거부 항목 발견 시 -> Phase 2로 돌아가 수정 후 재검증.
최대 maxValidationRounds회 재검증 (기본 3회).

**skipValidation 설정이 true이면 이 Phase 건너뛰기.**

## Phase 5 — Cleanup (정리)
1. 상태 파일 정리:
   - `.compound/state/autopilot-state.json`
   - `.compound/state/ralph-state.json`
   - `.compound/state/ultrawork-state.json`
   - `.compound/state/ultraqa-state.json`
2. 변경 요약 출력
3. compound loop: 이번 세션의 패턴/솔루션 추출 제안

</Phases>

<Tool_Usage>
- Phase 4에서 Architect 검증: Agent(model="opus", prompt="아키텍처 및 기능 완전성 검증...")
- Phase 4에서 Security 검증: Agent(model="sonnet", prompt="보안 취약점 점검...")
- Phase 4에서 Code 검증: Agent(model="sonnet", prompt="코드 품질 리뷰...")
- 에이전트는 먼저 자체 분석을 수행한 후 교차 검증을 위해 추가 에이전트 생성
- 사용할 수 없는 도구에 블로킹하지 않음; 위임 실패 시 가용한 에이전트로 진행
</Tool_Usage>

<Examples>
<Good>
사용자: "autopilot TypeScript와 React로 서점 재고 관리 REST API 만들어줘"
구체적인 도메인(서점), 명확한 기능(CRUD), 기술 제약(TypeScript). Autopilot이 전체 스펙으로 확장할 충분한 컨텍스트가 있음.
</Good>

<Good>
사용자: "자동실행 스트릭 카운팅 기능이 있는 일일 습관 추적 CLI 도구 만들어줘"
명확한 제품 컨셉과 구체적인 기능. "자동실행" 트리거로 autopilot 활성화.
</Good>

<Bad>
사용자: "로그인 페이지의 버그 고쳐줘"
단일 집중 수정이지 다단계 프로젝트가 아님. ralph 또는 executor 직접 위임 사용.
</Bad>

<Bad>
사용자: "캐싱 추가할 좋은 방법이 뭐가 있을까?"
탐색/브레인스토밍 요청. 대화형으로 응답하거나 plan 스킬 사용.
</Bad>
</Examples>

<Escalation_And_Stop_Conditions>
- 같은 QA 에러가 3사이클에 걸쳐 지속되면 중단 및 보고 (사용자 개입 필요한 근본 이슈)
- Validation이 maxValidationRounds회 재검증 후에도 계속 실패하면 중단 및 보고
- 사용자가 "멈춰", "취소", "중단"을 말하면 중단
- 요구사항이 너무 모호하여 Expansion이 불명확한 스펙을 생성하면 일시정지하고 사용자에게 명확화 요청
</Escalation_And_Stop_Conditions>

<Final_Checklist>
- [ ] 모든 5개 Phase 완료 (Expansion, Planning, Execution, QA, Validation)
- [ ] Phase 4에서 모든 검증자 승인
- [ ] 테스트 통과 (신선한 테스트 실행 출력으로 확인)
- [ ] 빌드 성공 (신선한 빌드 출력으로 확인)
- [ ] 상태 파일 정리 완료
- [ ] 사용자에게 무엇이 만들어졌는지 요약과 함께 완료 알림
</Final_Checklist>

<State_Management>
상태 파일: ~/.compound/state/autopilot-state.json
```json
{
  "active": true,
  "phase": 0,
  "startedAt": "ISO timestamp",
  "prompt": "original user request",
  "completedPhases": [],
  "plan": "path to plan file",
  "qaCycleCount": 0,
  "validationRound": 0
}
```
세션 재시작 시 마지막 완료된 Phase부터 재개.
</State_Management>

<Completion_Signal>
모든 Phase 완료 후:
1. "Autopilot 완료" 메시지 출력
2. 변경 파일 목록 + diff 요약
3. `ch compound` 실행 제안 (인사이트 축적)
</Completion_Signal>

<Advanced>
## Configuration

`.claude/settings.json`에서 선택적 설정:

```json
{
  "compound": {
    "autopilot": {
      "maxIterations": 10,
      "maxQaCycles": 5,
      "maxValidationRounds": 3,
      "pauseAfterExpansion": false,
      "pauseAfterPlanning": false,
      "skipQa": false,
      "skipValidation": false
    }
  }
}
```

| 설정 | 기본값 | 설명 |
|------|--------|------|
| maxIterations | 10 | 전체 최대 반복 횟수 |
| maxQaCycles | 5 | Phase 3 QA 최대 사이클 |
| maxValidationRounds | 3 | Phase 4 재검증 최대 라운드 |
| pauseAfterExpansion | false | Phase 0 후 사용자 확인 대기 |
| pauseAfterPlanning | false | Phase 1 후 사용자 확인 대기 |
| skipQa | false | Phase 3 건너뛰기 |
| skipValidation | false | Phase 4 건너뛰기 |

## Resume

autopilot이 취소되거나 실패한 경우, `/tenetx:autopilot`을 다시 실행하면 중단된 지점에서 재개합니다.
상태 파일(`~/.compound/state/autopilot-state.json`)이 존재하면 자동으로 마지막 완료된 Phase 다음부터 시작합니다.

## Best Practices for Input

1. 도메인을 구체적으로 -- "상점"이 아닌 "서점"
2. 핵심 기능 언급 -- "CRUD 포함", "인증 포함"
3. 제약조건 명시 -- "TypeScript 사용", "PostgreSQL 사용"
4. 실행 중 불필요한 중단 자제

## Troubleshooting

**Phase에서 막힌 경우?**
TODO 목록에서 블로킹된 작업 확인, `.compound/state/autopilot-state.json` 리뷰, 또는 취소 후 재개.

**QA 사이클 소진?**
같은 에러 3회는 근본 이슈를 의미합니다. 에러 패턴을 리뷰하세요; 수동 개입이 필요할 수 있습니다.

**Validation이 계속 실패?**
구체적인 이슈를 리뷰하세요. 요구사항이 너무 모호했을 수 있습니다 -- 취소 후 더 구체적인 설명을 제공하세요.

**상태 파일이 꼬인 경우?**
`~/.compound/state/autopilot-state.json`을 삭제하고 처음부터 다시 시작하세요.
</Advanced>

<Arguments>
## 사용법
`/tenetx:autopilot {작업 설명}`

### 예시
- `/tenetx:autopilot API 엔드포인트에 페이지네이션 추가`
- `/tenetx:autopilot 검색 기능을 Elasticsearch로 마이그레이션`
- `/tenetx:autopilot 이 컴포넌트를 접근성 기준에 맞게 리팩토링`

### 인자
- 작업 설명이 구체적일수록 Phase 0(모호->명확)을 건너뛰어 빠릅니다
- 파일 경로, 함수명, 에러 메시지 등을 포함하면 더 정확합니다
- "명확한 요청 시 건너뛰기" -- 구체적 정보가 충분하면 Expansion을 자동 스킵합니다
</Arguments>

$ARGUMENTS
