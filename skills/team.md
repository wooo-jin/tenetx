---
name: team
description: Multi-agent staged pipeline with specialized workers
triggers:
  - "team mode"
  - "team-mode"
  - "팀 모드"
  - "--team"
---

<Purpose>
Compound Harness Team — 전문 에이전트 기반 단계별 파이프라인.
"decompose-to-control" 원칙의 구현.
Claude Code 네이티브 팀 API를 활용합니다.
</Purpose>

<Staged_Pipeline>

## Stage 1: team-plan (탐색 + 분해)
- Agent: explore (Haiku) → planner (Opus)
- 작업 분석 및 하위 태스크 분해
- 각 태스크의 독립성/의존성 식별
- 에이전트 타입 및 모델 티어 결정

## Stage 2: team-prd (요구사항 정제)
- Agent: analyst (Opus)
- 각 태스크의 acceptance criteria 구체화
- 엣지 케이스 식별
- 선택적: critic 검토

## Stage 3: team-exec (병렬 실행)
- Agent: 태스크 유형별 전문가 선택
  - 코드 구현 → executor (Sonnet)
  - 버그 수정 → debugger (Sonnet)
  - UI 작업 → designer (Sonnet)
  - 문서 작성 → writer (Haiku)
- 독립적 태스크는 병렬 실행
- 의존적 태스크는 순차 실행

## Stage 4: team-verify (병렬 검증)
- Agent: verifier (Sonnet)
- 선택적: security-reviewer, code-reviewer
- 각 태스크의 acceptance criteria 검증
- CRITICAL 이슈 발견 시 team-fix로 전환

## Stage 5: team-fix (수정 루프)
- Agent: executor (Sonnet) 또는 debugger (Sonnet)
- team-verify에서 발견된 이슈 수정
- 수정 후 team-verify 재실행
- 최대 3회 반복

</Staged_Pipeline>

<Handoff_Protocol>
스테이지 전환 시 핸드오프 문서 작성:
```markdown
## Handoff: {from-stage} → {to-stage}
- **결정사항**: 확정된 설계/구현 방향
- **거부사항**: 검토 후 채택하지 않은 대안과 이유
- **리스크**: 알려진 위험 요소
- **산출물**: 생성/수정된 파일 목록
- **잔여 작업**: 다음 스테이지에서 처리할 것
```
핸드오프는 .compound/handoffs/{stage-name}.md 에 저장.
</Handoff_Protocol>

<Agent_Routing>

### Lane 기반 파이프라인
에이전트는 3개 레인으로 구조화됩니다:

**BUILD Lane** (순차 파이프라인):
explore → analyst → planner → architect → debugger → executor → verifier → code-simplifier → refactoring-expert

**REVIEW Lane** (병렬 검증):
code-reviewer, security-reviewer, critic

**DOMAIN Lane** (전문 영역):
designer, test-engineer, writer, qa-tester, performance-reviewer, scientist, git-master

### 모델 라우팅
| 태스크 유형 | 에이전트 | 모델 | 레인 |
|------------|---------|------|------|
| 탐색/검색 | explore | Haiku | build |
| 요구사항 | analyst | Opus | build |
| 계획/설계 | planner, architect | Opus | build |
| 디버깅 | debugger | Sonnet | build |
| 코드 구현 | executor | Sonnet | build |
| 검증 | verifier | Sonnet | build |
| 단순화 | code-simplifier | Opus | build |
| 리팩토링 | refactoring-expert | Sonnet | build |
| 코드 리뷰 | code-reviewer | Sonnet | review |
| 보안 | security-reviewer | Sonnet | review |
| 비평 | critic | Opus | review |
| UI/UX | designer | Sonnet | domain |
| 테스트 | test-engineer | Sonnet | domain |
| 문서 | writer | Haiku | domain |
| QA | qa-tester | Sonnet | domain |
| 성능 | performance-reviewer | Sonnet | domain |
| 데이터 분석 | scientist | Sonnet | domain |
| Git 관리 | git-master | Sonnet | domain |
</Agent_Routing>

<State_Management>
상태 파일: ~/.compound/state/team-state.json
핸드오프: ~/.compound/handoffs/{stage}.md
</State_Management>

<Codex_Delegation>
## Codex 팀원 위임 (tmux 패널 분할)

독립적인 태스크가 있고 tmux 환경이면, Codex를 별도 패널에 스폰하여 병렬 작업할 수 있습니다.

### 사용 조건
- tmux 세션 안에서 실행 중
- `codex` CLI 설치 + 인증 완료 (`codex login`)

### 자동 분배
team-exec 단계에서 태스크를 분해한 후, 각 태스크의 특성을 분석하여 자동 분배합니다:

**Claude 우선 (판단 필요):**
- 아키텍처/설계, 리팩토링, 보안, 마이그레이션, 디버깅, API 설계, 코드 리뷰

**Codex 우선 (실행 중심):**
- 테스트 작성, 반복 패턴 적용, CRUD 구현, 타입 추가, 에러 핸들링 추가, 코드 변환

### 위임 방법
```bash
# 단일 작업 위임
tenetx codex-spawn "src/payment/ 디렉토리에 결제 검증 로직 구현. 기존 패턴은 src/auth/를 참고."

# 모델 지정
tenetx codex-spawn --model o3 "복잡한 알고리즘 구현"
```

### 위임 기준
- ✅ 위임 적합: 독립 디렉토리/파일, 명확한 스펙, Claude와 파일 충돌 없음
- ❌ 위임 부적합: 같은 파일 수정, Claude 작업에 의존, 아키텍처 결정 필요

### 결과 통합
Codex 패널 완료 후 `git diff`로 변경사항 확인하여 team-verify에서 함께 검증합니다.
</Codex_Delegation>

<Arguments>
## 사용법
`/tenetx:team {작업 설명}`

### 예시
- `/tenetx:team 사용자 프로필 페이지 전체 구현 (API + UI + 테스트)`
- `/tenetx:team 인증 시스템을 JWT에서 세션 기반으로 전환`
- `/tenetx:team 이 PR의 모든 리뷰 피드백 반영해줘`

### 인자
- 여러 분야(API, UI, 테스트 등)에 걸친 작업일수록 효과적
- 단일 파일 수정 같은 작업에는 오버킬 — 직접 요청이 나음
</Arguments>

$ARGUMENTS
