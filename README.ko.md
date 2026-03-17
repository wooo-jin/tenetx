# 테넷엑스 — 원칙 기반 Claude Code 하네스

[English README](README.md)

<p align="center">
  <img src="assets/banner.svg" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>원칙을 선언하세요. 워크플로우를 생성하세요. 복리로 성장하세요.</strong>
</p>

<p align="center">
  <a href="#설치">설치</a> &middot;
  <a href="#철학">철학</a> &middot;
  <a href="#사용법">사용법</a> &middot;
  <a href="#아키텍처">아키텍처</a>
</p>

---

## 테넷엑스란?

**테넷엑스**는 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)를 위한 **원칙 기반 하네스**입니다. 설정 파일을 일일이 수정하는 대신, 엔지니어링 원칙을 선언하면 훅, 모델 라우팅, 경고, 에이전트, 스킬이 자동으로 생성됩니다.

```
$ claude                        $ tenetx
│                                │
│ 기본 Claude Code               │ 테넷엑스가 먼저 실행
│ 범용 설정                       │  ├── philosophy.yaml 로드
│                                │  ├── 스코프 결정 (Me / Team / Project)
│                                │  ├── 지식 팩 동기화
│                                │  ├── 훅 & 라우팅 생성
│                                │  └── Claude Code 실행 (설정 적용)
│                                │
│ 범용 도구                       │ 내 도구
```

**Claude Code를 수정하지 않습니다.** Claude Code가 읽는 설정(hooks, CLAUDE.md, statusLine)을 철학에 맞게 구성해서 주입합니다.

### 왜 테넷엑스인가?

- **원칙 기반**: 설정이 아니라 신념을 선언하세요. 워크플로우는 자동으로 생성됩니다.
- **성장 지향**: 모든 세션에서 패턴을 추출하는 복리 엔지니어링 루프.
- **팀 인식**: 개인 → 팀 → 조직 간에 지식(팩)을 매끄럽게 이동.
- **프로덕션 준비**: 654개 테스트(100% 통과), 3-lane 19개 에이전트, 8개 MCP 서버, 16-signal 모델 라우팅.

---

## 설치

### 요구사항

- **Node.js** >= 18
- **Claude Code** 설치 및 인증 완료

### 빠른 시작

```bash
# 전역 설치
npm install -g tenetx

# 초기 설정 — 3가지 질문, 30초
tenetx setup

# 내 원칙이 적용된 Claude Code 실행
tenetx
```

### Claude Code 플러그인으로 설치

```bash
tenetx install --plugin
```

---

## 철학

핵심 아이디어: **설정을 구성하는 게 아니라 신념을 선언하면 워크플로우가 생성됩니다.**

### philosophy.yaml

```yaml
name: "내-엔지니어링"
author: "이름"

principles:
  understand-before-act:
    belief: "이해 없이 행동하면 비용이 기하급수적으로 증가한다"
    generates:
      - "모든 작업은 탐색 → 계획 → 구현 순서"
      - "롤백 시 변경 범위를 먼저 평가"
      - hook: "UserPromptSubmit → 관련 매뉴얼 자동 로드"

  decompose-to-control:
    belief: "큰 작업은 분해되어야 통제 가능하다"
    generates:
      - "작업을 PLANS / CONTEXT / CHECKLIST로 분해"
      - alert: "같은 파일 5회 이상 편집 시 경고"

  capitalize-on-failure:
    belief: "같은 실수를 두 번 하는 건 시스템의 실패다"
    generates:
      - "모든 세션 후 compound로 패턴 추출"
      - "실패에서 예방 규칙 자동 생성"

  focus-resources-on-judgment:
    belief: "자원은 판단이 필요한 곳에 집중되어야 한다"
    generates:
      - routing: "탐색 → Sonnet, 구현 → Opus"
      - alert: "세션 비용 $10 초과 시 경고"

  knowledge-comes-to-you:
    belief: "개발자는 결정 시점에 지식이 필요하다"
    generates:
      - "편집 중 관련 솔루션 자동 제안"
      - "팩 지식을 프롬프트에 자동 주입"
```

5개의 원칙이 자동으로 훅, 경고, 라우팅, compound 규칙을 생성합니다. 수동 설정은 필요 없습니다.

---

## 빠른 시작 경로

### 개인 개발자

```bash
tenetx setup                    # 기본값 수락
tenetx                          # 내 원칙으로 실행
# 세션 종료
tenetx compound                 # 패턴 추출 및 재사용
```

### 소규모 팀 (5-10명)

```bash
# 팀 리드
tenetx init --team --yes        # 자동 감지 + .compound/pack.json 생성
git add .compound/ && git commit -m "chore: add tenetx team pack"

# 팀원들
git pull && tenetx              # 팀 원칙 자동 로드

# 업무 종료
tenetx compound                 # 인사이트 추출 → 자동 분류 (개인/팀)
tenetx propose                  # 팀 지식 제안 생성
tenetx proposals                # 팀 리드가 검토 및 병합
```

### 대규모 조직

```bash
# 초기 설정
tenetx init --team --pack-repo org/tenetx-pack-emr --yes
tenetx init --extends           # 또는 상속 사용

# 매일
tenetx                          # 최신 팀 규칙 자동 동기화
```

---

## 사용법

### 기본 명령어

```bash
tenetx                              # 하네스 적용 후 실행
tenetx "차트 API 리팩토링"           # 프롬프트와 함께 시작
tenetx --resume                     # 이전 세션 재개
tenetx --offline                    # 네트워크 없이 실행
```

### 실행 모드 (9가지 모드, 11개 스킬)

각 모드는 철학적 원칙과 매핑됩니다:

| 플래그 | 모드 | 설명 |
|--------|------|------|
| `-a` | **autopilot** | 5단계 자율 파이프라인 (탐색→계획→구현→QA→검증) |
| `-r` | **ralph** | PRD 기반 완료 보장 + verify/fix 루프 |
| `-t` | **team** | 다중 에이전트 병렬 파이프라인 |
| `-u` | **ultrawork** | 최대 병렬성 버스트 |
| `-p` | **pipeline** | 순차 단계별 처리 |
| | **ccg** | 3-모델 교차 검증 |
| | **ralplan** | 합의 기반 설계 (Planner → Architect → Critic) |
| | **deep-interview** | 소크라테스 요구사항 명확화 |
| | **tdd** | 테스트 주도 개발 모드 |

```bash
tenetx --autopilot "사용자 인증 구현"
tenetx --ralph "결제 연동 완성"
tenetx --team "대시보드 재설계"
tenetx deep-interview "핵심 문제가 뭘까?"
```

### 매직 키워드

플래그 없이 프롬프트에 직접 입력하세요:

```
autopilot <작업>      autopilot 모드 활성화
ralph <작업>          ralph 모드 활성화
ultrawork <작업>      최대 병렬성
tdd                   테스트 주도 개발
ultrathink            확장 추론
deepsearch            깊은 코드베이스 검색
ccg                   3-모델 교차 검증
deep-interview        소크라테스 명확화
canceltenetx           모든 모드 취소
```

### 모델 라우팅 (16-Signal 스코어링)

작업 유형에 따라 최적 모델을 자동 선택합니다:

```
┌─────────┬─────────────────────────────────────┐
│  Haiku  │  탐색, 파일 검색, 단순 질의          │
├─────────┼─────────────────────────────────────┤
│ Sonnet  │  코드 리뷰, 분석, 설계               │
├─────────┼─────────────────────────────────────┤
│  Opus   │  구현, 아키텍처, 디버깅              │
└─────────┴─────────────────────────────────────┘
```

16-signal 스코어링(어휘, 구조, 맥락, 패턴 기반)으로 라우팅하며, 철학 선언 우선순위가 최우선입니다.

### 실시간 감시

세션을 모니터링하고 문제가 복리로 증가하기 전에 경고합니다:

| 감시 대상 | 조건 | 경고 |
|----------|------|------|
| 파일 편집 | 같은 파일 5회+ | 중단 후 재설계 권고 |
| 세션 비용 | $10+ | 범위 축소 권고 |
| 세션 시간 | 40분+ | 압축 권고 |
| 컨텍스트 | 70%+ 사용 | 시각적 경고 |
| 지식 | 관련 솔루션 존재 | 재사용 제안 |

### 팩 시스템 (3가지 스코프, inline/github/local)

지식은 3가지 스코프로 나뉘어 복리로 성장합니다:

```bash
# 팀 지식 팩 설치
tenetx pack install https://github.com/your-org/pack-backend

# 최신 지식 동기화
tenetx pack sync

# 팀 솔루션을 내 컬렉션으로 가져오기
tenetx pick api-caching --from backend

# 내 패턴을 팀에 제안
tenetx propose retry-pattern --to backend

# 팩 내용 보기
tenetx pack list
```

**팩 상속**: philosophy.yaml에서 `extends`를 사용하여 다른 팩의 규칙을 상속받으세요:

```yaml
extends:
  - github: https://github.com/your-org/tenetx-pack-core
  - local: ~/mycompany-standards
```

### Compound 루프 (개인/팀 자동 분류)

의미 있는 작업 후 인사이트를 추출하고 축적하세요:

```bash
tenetx compound
```

다음을 분석하여 추출합니다:
- **패턴** — 재사용할 가치가 있는 반복 접근법
- **솔루션** — 문맥이 있는 구체적 해결책
- **규칙** — 실패에서 배운 예방 규칙
- **골든 프롬프트** — 효과적인 프롬프트 템플릿

추출된 지식은 자동으로 개인 또는 팀 수준으로 분류됩니다.

### 거버넌스 대시보드

```bash
tenetx dashboard
```

실시간 에이전트 활동, 스킬 사용, 모델 라우팅, 세션 비용, 팀 제안 활동을 봅니다.

---

## 모든 명령어 (45+)

### 핵심

| 명령어 | 목적 |
|--------|------|
| `tenetx` | 하네스 적용 후 시작 |
| `tenetx "프롬프트"` | 프롬프트와 함께 시작 |
| `tenetx setup` | 초기 설정 (글로벌) |
| `tenetx setup --project` | 프로젝트별 원칙 (`--pack`, `--extends`, `--yes`) |
| `tenetx --resume` | 이전 세션 재개 |
| `tenetx init` | 프로젝트 타입 자동 감지 → 맞춤 철학 생성 |
| `tenetx init --team` | 팀 팩 초기화 (리포지토리) |

### 철학 & 설정

| 명령어 | 목적 |
|--------|------|
| `tenetx philosophy show` | 현재 원칙 표시 |
| `tenetx philosophy edit` | philosophy.yaml 편집 |
| `tenetx philosophy validate` | 문법 검증 |
| `tenetx init --extends` | 팩 상속 사용 |

### 팩 관리

| 명령어 | 목적 |
|--------|------|
| `tenetx pack list` | 설치된 팩 목록 |
| `tenetx pack install <source>` | 팩 설치 (GitHub URL, `owner/repo`, 로컬 경로) |
| `tenetx pack sync [name]` | 전체 또는 특정 팩 동기화 |
| `tenetx pack init <name>` | 새 팩 생성 (`--from-project`, `--starter`) |
| `tenetx pack add <name>` | 프로젝트에 팩 연결 (`--repo`, `--type`, `--path`) |
| `tenetx pack remove <name>` | 프로젝트에서 팩 연결 해제 |
| `tenetx pack connected` | 현재 프로젝트에 연결된 팩 목록 |
| `tenetx pack setup <source>` | 원클릭 셋업 (설치→연결→동기화→의존성 검사) |
| `tenetx pack lock` | 팩 버전 고정 (`pack.lock` 생성) |
| `tenetx pack unlock` | 팩 버전 고정 해제 (`pack.lock` 삭제) |
| `tenetx pack outdated` | 업데이트 가능한 팩 확인 |

### 지식 공유

| 명령어 | 목적 |
|--------|------|
| `tenetx pick <pattern> --from <pack>` | 솔루션을 개인 컬렉션으로 선택 |
| `tenetx propose <pattern> --to <pack>` | 개인 패턴을 팀에 제안 |
| `tenetx proposals` | 팀 제안 검토 |
| `tenetx compound` | 세션 인사이트 추출 (개인/팀 자동 분류) |
| `tenetx rules` | 개인 및 팀 규칙 조회 |

### AI & 프로바이더

| 명령어 | 목적 |
|--------|------|
| `tenetx ask "질문"` | 다중 제공자 질문 (`--compare`, `--fallback`) |
| `tenetx providers` | AI 프로바이더 관리 (enable/disable/model/auth) |
| `tenetx worker` | AI Workers (spawn/list/kill/output) |

### 세션 & 모니터링

| 명령어 | 목적 |
|--------|------|
| `tenetx status` | 현재 상태 라인 출력 |
| `tenetx stats [--week]` | 세션 통계 |
| `tenetx session` | 세션 관리 (search/list/show) |
| `tenetx dashboard` | 거버넌스 대시보드 |
| `tenetx governance` | 거버넌스 리포트 (`--json`, `--trend`) |
| `tenetx gateway` | 이벤트 게이트웨이 (config/test/disable) |
| `tenetx notepad` | 노트패드 (show/add/clear) |

### 인프라

| 명령어 | 목적 |
|--------|------|
| `tenetx mcp` | MCP 서버 관리 (list/templates/add/remove) |
| `tenetx marketplace` | 플러그인 마켓플레이스 (search/install/list/remove) |
| `tenetx worktree` | Git worktree 관리 (list/create/remove/teleport) |
| `tenetx scan` | 프로젝트 구조 스캔 (`--constraints`, `--md`) |
| `tenetx verify` | 자동 검증 루프 (build+test+constraints) |

### 유틸리티

| 명령어 | 목적 |
|--------|------|
| `tenetx doctor` | 환경 진단 |
| `tenetx notify "메시지"` | 알림 전송 (Discord/Slack/Telegram) |
| `tenetx wait <minutes>` | 레이트 리밋 대기 + 알림 |
| `tenetx install --plugin` | Claude Code 플러그인 설치 |
| `tenetx uninstall` | 제거 (`--force`) |
| `tenetx help` | 전체 도움말 |

---

## 아키텍처

<p align="center">
  <img src="assets/architecture.svg" alt="테넷엑스 아키텍처" width="100%"/>
</p>

### Layer 0: 철학 (WHY)

`philosophy.yaml`은 원칙을 선언합니다. 각 원칙은 `belief`와 `generates` 속성을 가지며 — 시스템은 이를 바탕으로 훅, 라우팅, 경고, compound 규칙을 도출합니다.

### Layer 1: 워크플로우 엔진 (HOW)

엔진은 철학을 실행 가능한 컴포넌트로 번역합니다:

- **9가지 실행 모드** — 단순 채팅부터 전체 자율 파이프라인까지
- **11개 스킬** — autopilot, ralph, team, ultrawork, pipeline, ccg, ralplan, deep-interview, tdd, code-review, security-review
- **3-tier 모델 라우팅** — Haiku / Sonnet / Opus (16-signal 스코어링)
- **14개 훅** — UserPromptSubmit, SessionStart, PreToolUse, PostToolUse, PostToolFailure 등
- **10가지 이벤트 타입** — 포괄적 관찰 가능성 (startup, hook_trigger, model_routing 등)
- **3개 보안 훅** — permission-handler, secret-filter, db-guard
- **실시간 모니터** — 비용, 편집, 컨텍스트 사용 추적
- **Compound 루프** — 패턴 추출 및 지식 축적

### Layer 2: 팩 (KNOW + SHARE)

지식은 3가지 스코프로 조직되어 있습니다:

| 스코프 | 위치 | 로드 시기 |
|--------|------|----------|
| **Me** | `~/.compound/me/` | 항상 |
| **Team** | `~/.compound/packs/<name>/` | 팀 리포지토리에서 |
| **Project** | `{repo}/.compound/` | 해당 리포지토리에서 |

팩은 GitHub, Google Drive, S3 또는 로컬 디렉토리로 동기화됩니다. `extends`를 통한 철학 상속을 지원합니다.

### 내장 에이전트 (3-lane 19개)

3-lane으로 구조화된 파이프라인을 위해 구성됩니다:

| Lane | 에이전트 (9개) | 목적 |
|------|---------------|------|
| **BUILD** | explore → analyst → planner → architect → debugger → executor → verifier → code-simplifier → refactoring-expert | 탐색 → 구현 → 검증 |
| **REVIEW** | code-reviewer, security-reviewer, critic | 품질 보증 (3개) |
| **DOMAIN** | designer, test-engineer, writer, qa-tester, performance-reviewer, scientist, git-master | 전문 분야 (7개) |

### 내장 MCP 서버 (8개, JSON-RPC 2.0)

테넷엑스는 실행 가능한 MCP 서버를 제공합니다:

```
lsp-bridge              언어 서버 감지 & 호출
ast-search              AST 기반 코드 구조 검색
test-runner             테스트 프레임워크 감지 & 실행
repo-index              프로젝트 구조 인덱싱
secrets-scan            시크릿/토큰/키 감지 (마스킹 포함)
python-repl             Python 환경 감지 & 실행
file-watcher             최근 수정 파일 추적
dependency-analyzer     패키지 의존성 분석
```

### 내장 스킬 (11개)

```
autopilot     ralph        team         ultrawork     pipeline
ccg           ralplan      deep-interview tdd         code-review
security-review
```

---

## 동작 방식

```
tenetx "차트 API 리팩토링"
  │
  ├── 1. philosophy.yaml 로드
  │      └── 5개 이상 원칙 → 훅, 라우팅, 경고, compound 규칙 생성
  │
  ├── 2. 스코프 결정
  │      └── Me (항상) + Team (리포지토리에 있으면) + Project (.compound/에 있으면)
  │
  ├── 3. 팩 동기화
  │      └── 최신 팀 지식 + 상속 검증
  │
  ├── 4. 세션 설정
  │      ├── 14개 훅을 ~/.claude/settings.json에 주입
  │      ├── 16-signal 모델 라우팅을 env에 설정
  │      ├── 에이전트 & 스킬 설치
  │      ├── 10가지 이벤트 타입 관찰 가능성 설정
  │      └── 상태 라인 + 거버넌스 대시보드 설정
  │
  └── 5. Claude Code 실행
         └── 모든 설정이 적용된 상태로 실행
```

---

## 팀 워크플로우 예제

### 1일: 설정 (15분)

```bash
# 팀 리드가 리포지토리 전체 원칙 초기화
tenetx init --team --yes

# .compound/pack.json, philosophy.yaml, .compound/rules.yaml 생성
git add .compound/ && git commit -m "chore: add tenetx team pack"
```

### 1일-N: 매일 사용

```bash
# 팀원이 동기화 후 실행
git pull
tenetx "검색 버그 수정"

# 세션 종료
tenetx compound                 # 추출: 패턴, 솔루션, 규칙, 골든 프롬프트
```

### 1일-N: 지식 공유

```bash
# 개인 솔루션 → 팀 제안
tenetx propose caching-strategy --to core-pack

# 팀 리드가 제안 검토
tenetx proposals               # UI: 제안 규칙, 제안 훅, 신뢰도 점수
# (승인/거절 인터페이스)

# 최신 지식 자동 동기화
tenetx pack sync
```

---

## 샘플 철학 팩 (5개)

테넷엑스는 5개의 초급자용 철학 팩을 포함합니다:

1. **frontend** — 컴포넌트 분리, 접근성, 반응형 디자인, 성능 최적화
2. **backend** — API 계약, 데이터 무결성, 에러 처리, 관측성
3. **devops** — IaC, 관측성, 장애 복구, CI/CD
4. **security** — OWASP, 최소 권한, 감사 추적, 암호화
5. **data** — 파이프라인 검증, 스키마 진화, 재현성, 테스트

시작점으로 사용할 수 있습니다:

```bash
tenetx init --yes                         # 프로젝트 타입 자동 감지
tenetx setup --project --pack backend     # 또는 직접 선택
```

---

## 통계

- **654개 테스트** (36개 테스트 파일, 100% 통과)
- **19개 에이전트** (3-lane: BUILD 9, REVIEW 3, DOMAIN 7)
- **11개 스킬**과 9가지 실행 모드
- **14개 훅**, 10가지 이벤트 타입, 3개 보안 훅
- **8개 내장 MCP 서버** (실행 가능, JSON-RPC 2.0)
- **16-signal 모델 라우팅** (Haiku/Sonnet/Opus)
- **5개 샘플 철학 팩** (startup, enterprise, research, content, platform)
- **45개 이상 CLI 명령어** (setup, philosophy, pack, compound, ask, scan, verify, stats, dashboard, doctor, notify, mcp, marketplace, session, worktree 등)

---

## 감사의 말

테넷엑스는 [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (Yeachan Heo)로부터 큰 영감을 받았습니다. 다중 에이전트 오케스트레이션 패턴, 매직 키워드 시스템, 실행 모드, 그리고 하네스 계층을 통해 Claude Code를 향상시키는 전체적 비전이 OMC의 선구적 작업에 크게 영향을 받았습니다.

oh-my-claudecode에서 적응한 핵심 개념:
- 전문화된 역할을 가진 다중 에이전트 오케스트레이션
- 실행 모드 (autopilot, ralph, team, ultrawork)
- 훅을 통한 매직 키워드 감지
- 교차-AI 통합을 위한 tmux 기반 CLI 워커
- 세션 모니터링 및 알림 시스템

테넷엑스는 **원칙 기반 접근법** — 엔지니어링 원칙을 선언하여 워크플로우를 자동 생성하고, 팀 지식 축적을 위한 **compound 엔지니어링 루프**로 차별화됩니다.

또한 사전 설정된 개발 스위트에 대한 깔끔한 "oh-my-zsh for Claude Code" 접근법인 [Claude Forge](https://github.com/sangrokjung/claude-forge)를 인정합니다.

---

## 라이선스

MIT
