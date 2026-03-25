<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.svg" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>쓸수록 나에게 맞춰지는 AI 코딩 도구.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> &middot;
  <a href="README.zh.md">简体中文</a> &middot;
  <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> &middot;
  <a href="#왜-테넷엑스인가">왜 테넷엑스인가</a> &middot;
  <a href="#핵심-기능">핵심 기능</a> &middot;
  <a href="#아키텍처">아키텍처</a>
</p>

---

## 테넷엑스란?

다른 도구는 **그들의** 워크플로우를 줍니다.
테넷엑스는 **당신의** 워크플로우를 만들고 — 사용할수록 진화시킵니다.

```
$ tenetx forge
  [1] 프로젝트 스캔 (git, 테스트, CI, 의존성)
  [2] 작업 스타일에 대한 10가지 질문
  [3] 나만의 하네스 생성

$ tenetx                    # 평소처럼 작업
                             # Lab이 조용히 효과를 추적

$ tenetx me                 # 내 하네스가 어떻게 진화했는지 확인
  품질 초점    [########··] 0.80  thorough
  자율성 선호  [####······] 0.45  supervised
  → code-reviewer: strict 모드 (SOLID + 네이밍 + 엣지 케이스)
  → 모델 라우팅: 리뷰에 opus 우선
```

**Claude Code를 수정하지 않습니다.** Claude Code가 읽는 설정(hooks, CLAUDE.md, statusLine)을 당신에게 맞게 구성해서 주입합니다.

---

## 왜 테넷엑스인가?

1. **나에게 맞춰진다** — Forge가 작업 스타일을 프로파일링. Lab이 진화시킨다. 모든 에이전트, 스킬, 훅이 내 차원에 반응.
2. **닫힌 학습 루프** — 사용 → 추적 → 패턴 감지 → 프로필 조정 → 설정 재생성. 자동. 매일.
3. **의존하지 않고 배운다** — Remix로 다른 사람의 에이전트/스킬/규칙을 선택적으로 가져올 수 있다. 도구 전체를 갈아타지 않는다.
4. **팀 인식** — 개인 → 팀 → 조직 간 지식(팩) 이동.

---

## 빠른 시작

### 요구사항

- **Node.js** >= 20
- **Claude Code** 설치 및 인증 완료
  > Tenetx는 Claude Code를 감싸며 훅 API에 의존합니다. Claude Code 업데이트 시 tenetx 업데이트가 필요할 수 있습니다.

### Tenetx를 사용해야 할 때

| 시나리오 | 적합도 |
|----------|--------|
| 반복 패턴이 있는 장기 프로젝트 | 최적 |
| 개인 워크플로우 최적화 | 최적 |
| 가벼운 하네스 (런타임 의존성 3개) | 최적 |
| 일회성 스크립트나 임시 코드 | 부적합 |
| Claude Code가 없는 환경 | 지원 안 됨 |
| 팀 전체 표준화 (OMC 사용 권장) | 주 목적 아님 |

### 설치 및 실행

```bash
npm install -g tenetx
tenetx setup              # 기본 설정
tenetx forge              # 개인화 (스캔 + 인터뷰)
tenetx                    # 나만의 하네스로 실행
tenetx me                 # 내 프로필 확인
```

### Claude Code 플러그인으로 설치

```bash
tenetx install --plugin
```

---

## 핵심 기능

### Forge — 나만의 하네스

Forge는 프로젝트와 작업 스타일을 분석해서 나만의 하네스를 만든다.

1. **프로젝트 스캔** — git 히스토리, 테스트 프레임워크, CI 파이프라인, 의존성 구조를 읽는다.
2. **인터뷰** — 코드 품질, 자율성, 위험 허용도 등 10가지 질문으로 작업 성향을 파악한다.
3. **하네스 생성** — 스캔 결과와 인터뷰 응답을 결합해 `philosophy.yaml`, 훅, 라우팅, 에이전트 설정을 생성한다.

```bash
tenetx forge                    # 처음부터 시작
tenetx forge --rescan           # 프로젝트 변경 후 재스캔
```

### Lab — 진화하는 하네스

Lab은 세션 중 행동을 조용히 추적하고, Forge 프로필을 자동으로 조정한다.

- 어떤 리뷰 피드백을 수용하고 무시하는지 관찰
- 모델별 수정 비율과 재시도 패턴 분석
- 8개 행동 패턴 감지기가 실시간으로 차원 값을 보정

닫힌 루프: **사용 → 추적 → 패턴 감지 → 프로필 조정 → 설정 재생성**

### Remix — 남에게서 배우기

다른 사람의 하네스에서 원하는 컴포넌트만 가져온다.

```bash
tenetx remix browse                    # 공유된 컴포넌트 탐색
tenetx remix import <component>        # 선택한 컴포넌트 가져오기
```

도구 전체를 갈아타지 않고, 에이전트 하나, 스킬 하나, 규칙 하나를 선택적으로 체리픽할 수 있다.

### Me 대시보드

`tenetx me`로 내 프로필이 어떻게 진화하고 있는지 확인한다.

```
$ tenetx me
  품질 초점       [########··] 0.80  thorough
  자율성 선호     [####······] 0.45  supervised
  위험 감수도     [######····] 0.60  moderate
  추상화 수준     [###·······] 0.35  pragmatic
  커뮤니케이션    [#######···] 0.70  leaning terse

  → code-reviewer: strict 모드 활성
  → 모델 라우팅: 리뷰에 opus 우선, 탐색에 haiku
  → 최근 조정: 품질 초점 0.72 → 0.80 (리뷰 수용률 기반)
```

5개 연속 개인화 차원이 모든 에이전트와 스킬의 동작을 실시간으로 조정한다.

### 코드 인텔리전스 (AST + LSP)

설치된 도구가 있으면 실제 코드 구조를 이해한다:

**AST-grep** — 정규식이 아닌 구문 트리 기반 코드 검색:

```bash
tenetx ast search "function $NAME($$$)" --lang ts   # 함수 검색
tenetx ast classes                                    # 클래스 목록
tenetx ast calls handleForge                          # 호출 위치 검색
```

`sg` 미설치 시 regex 폴백. TypeScript, Python, Go, Rust 지원.

**LSP** — 언어 서버 통합으로 타입 인식 작업:

```bash
tenetx lsp status                              # 감지된 서버
tenetx lsp hover src/forge/types.ts 14 10      # 타입 정보
tenetx lsp definition src/cli.ts 50 20         # 정의로 이동
tenetx lsp references src/core/paths.ts 7 13   # 참조 검색
```

tsserver, pylsp, gopls, rust-analyzer 자동 감지. 없으면 graceful 폴백.

---

## 다중 모델 합성

작업 유형에 따라 최적 모델을 자동 선택한다.

```
┌─────────┬─────────────────────────────────────┐
│  Haiku  │  탐색, 파일 검색, 단순 질의          │
├─────────┼─────────────────────────────────────┤
│ Sonnet  │  코드 리뷰, 분석, 설계               │
├─────────┼─────────────────────────────────────┤
│  Opus   │  구현, 아키텍처, 디버깅              │
└─────────┴─────────────────────────────────────┘
```

16-signal 스코어링(어휘, 구조, 맥락, 패턴 기반)으로 라우팅하며, 개인 차원 프로필에 따라 우선순위가 조정된다. 신뢰도 점수로 모델 선택 근거를 추적할 수 있다.

---

## 실행 모드

9가지 모드, 21개 스킬. 각 모드는 개인 차원에 맞게 동작이 조정된다.

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

플래그 없이 프롬프트에 직접 입력할 수 있다.

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

---

## 모델 라우팅

16-signal 스코어링으로 작업마다 최적 모델을 자동 선택한다. 개인 차원 프로필이 라우팅 가중치를 조정한다.

| 작업 유형 | 기본 모델 | 차원 오버라이드 예시 |
|----------|----------|-------------------|
| 탐색, 파일 검색 | Haiku | — |
| 코드 리뷰, 분석 | Sonnet | 품질 초점 > 0.7이면 Opus로 에스컬레이션 |
| 구현, 아키텍처, 디버깅 | Opus | — |

---

## 팩 시스템

지식은 3가지 스코프로 나뉘어 성장한다.

| 스코프 | 위치 | 로드 시기 |
|--------|------|----------|
| **Me** | `~/.compound/me/` | 항상 |
| **Team** | `~/.compound/packs/<name>/` | 팀 리포지토리에서 |
| **Project** | `{repo}/.compound/` | 해당 리포지토리에서 |

```bash
tenetx pack install https://github.com/your-org/pack-backend
tenetx pack sync
tenetx pick api-caching --from backend        # 솔루션을 내 컬렉션으로
tenetx propose retry-pattern --to backend     # 내 패턴을 팀에 제안
tenetx pack list
```

**팩 상속**: `extends`를 사용해 다른 팩의 규칙을 상속받을 수 있다.

```yaml
extends:
  - github: https://github.com/your-org/tenetx-pack-core
  - local: ~/mycompany-standards
```

---

## 에이전트

19개 에이전트가 3-lane으로 구성된다. 모든 에이전트는 개인 차원 프로필에 따라 동작이 튜닝된다.

| Lane | 에이전트 | 역할 |
|------|----------|------|
| **BUILD** | explore → analyst → planner → architect → debugger → executor → verifier → code-simplifier → refactoring-expert | 탐색 → 구현 → 검증 |
| **REVIEW** | code-reviewer, security-reviewer, critic | 품질 보증 (3개) |
| **DOMAIN** | designer, test-engineer, writer, qa-tester, performance-reviewer, scientist, git-master | 전문 분야 (7개) |

예: 품질 초점 차원이 높으면 code-reviewer가 strict 모드로 전환되어 SOLID 원칙, 네이밍, 엣지 케이스까지 검토한다.

---

## 실시간 감시

세션을 모니터링하고 문제가 커지기 전에 경고한다.

| 감시 대상 | 조건 | 경고 |
|----------|------|------|
| 파일 편집 | 같은 파일 5회+ | 중단 후 재설계 권고 |
| 세션 비용 | $10+ | 범위 축소 권고 |
| 세션 시간 | 40분+ | 압축 권고 |
| 컨텍스트 | 70%+ 사용 | 시각적 경고 |
| 지식 | 관련 솔루션 존재 | 재사용 제안 |

---

## Compound 루프

의미 있는 작업 후 인사이트를 추출하고 축적한다.

```bash
tenetx compound
```

다음을 분석하여 추출한다:
- **패턴** — 재사용할 가치가 있는 반복 접근법
- **솔루션** — 문맥이 있는 구체적 해결책
- **규칙** — 실패에서 배운 예방 규칙
- **골든 프롬프트** — 효과적인 프롬프트 템플릿

추출된 지식은 자동으로 개인 또는 팀 수준으로 분류된다.

---

## 팀 워크플로우

### 소규모 팀 (5-10명)

```bash
# 팀 리드
tenetx init --team --yes
git add .compound/ && git commit -m "chore: add tenetx team pack"

# 팀원
git pull && tenetx

# 업무 종료
tenetx compound                 # 인사이트 추출
tenetx propose                  # 팀 지식 제안
tenetx proposals                # 팀 리드가 검토
```

### 대규모 조직

```bash
tenetx init --team --pack-repo org/tenetx-pack-emr --yes
tenetx init --extends           # 상속 사용
tenetx                          # 최신 팀 규칙 자동 동기화
```

---

<details>
<summary>txd — 권한 검사 건너뛰기</summary>

```bash
txd                   # tenetx --dangerously-skip-permissions와 동일
```

**경고**: `txd`는 모든 Claude Code 권한 검사를 비활성화합니다. 도구가 확인 없이 실행됩니다. 신뢰할 수 있는 격리된 환경에서만 사용하세요.

</details>

---

## 아키텍처

<p align="center">
  <img src="assets/architecture.svg" alt="테넷엑스 아키텍처" width="100%"/>
</p>

### Layer 0: 내 프로필 (WHO)

Forge가 생성한 5차원 개인 프로필. 모든 하위 계층의 동작을 결정하는 기준점이다. Lab이 세션마다 자동으로 보정한다.

### Layer 1: Forge + Lab (ADAPT)

Forge는 프로필을 기반으로 하네스를 생성하고, Lab은 사용 패턴을 추적하여 프로필을 진화시킨다. 닫힌 루프로 연결된다.

### Layer 2: 워크플로우 엔진 (HOW)

프로필에 맞게 조정된 실행 환경:

- **9가지 실행 모드** — 단순 채팅부터 자율 파이프라인까지
- **21개 스킬** — 차원 인식 스킬 6개 포함
- **3-tier 모델 라우팅** — 16-signal 스코어링 + 차원 가중치
- **17개 훅**, 10가지 이벤트 타입, 3개 보안 훅
- **8개 MCP 서버** (JSON-RPC 2.0)
- **실시간 모니터** + Compound 루프

### Layer 3: 팩 + 리믹스 (SHARE)

개인 지식을 팀으로, 팀 지식을 조직으로 이동. Remix로 외부 컴포넌트를 선택적으로 가져온다.

---

## 모든 명령어

### 핵심

| 명령어 | 목적 |
|--------|------|
| `tenetx` | 하네스 적용 후 시작 |
| `tenetx "프롬프트"` | 프롬프트와 함께 시작 |
| `tenetx setup` | 초기 설정 |
| `tenetx forge` | 개인화 (스캔 + 인터뷰) |
| `tenetx me` | 내 프로필 확인 |
| `tenetx --resume` | 이전 세션 재개 |

### Forge & Lab

| 명령어 | 목적 |
|--------|------|
| `tenetx forge` | 프로젝트 스캔 + 인터뷰 → 하네스 생성 |
| `tenetx forge --rescan` | 프로젝트 변경 후 재스캔 |
| `tenetx me` | 현재 차원 프로필 확인 |
| `tenetx philosophy show` | 현재 철학 표시 |
| `tenetx philosophy edit` | philosophy.yaml 편집 |

### 팩 관리

| 명령어 | 목적 |
|--------|------|
| `tenetx pack list` | 설치된 팩 목록 |
| `tenetx pack install <source>` | 팩 설치 (GitHub URL, `owner/repo`, 로컬 경로) |
| `tenetx pack sync [name]` | 전체 또는 특정 팩 동기화 |
| `tenetx pack init <name>` | 새 팩 생성 |
| `tenetx pack setup <source>` | 원클릭 셋업 (설치→연결→동기화→의존성 검사) |
| `tenetx pack lock` | 팩 버전 고정 |
| `tenetx pack outdated` | 업데이트 가능한 팩 확인 |

### 지식 공유

| 명령어 | 목적 |
|--------|------|
| `tenetx pick <pattern> --from <pack>` | 솔루션을 개인 컬렉션으로 선택 |
| `tenetx propose <pattern> --to <pack>` | 개인 패턴을 팀에 제안 |
| `tenetx proposals` | 팀 제안 검토 |
| `tenetx compound` | 세션 인사이트 추출 |
| `tenetx remix browse` | 공유 컴포넌트 탐색 |
| `tenetx remix import <component>` | 컴포넌트 가져오기 |

### AI & 프로바이더

| 명령어 | 목적 |
|--------|------|
| `tenetx ask "질문"` | 다중 제공자 질문 (`--compare`, `--fallback`) |
| `tenetx providers` | AI 프로바이더 관리 |
| `tenetx worker` | AI Workers (spawn/list/kill/output) |

### 세션 & 모니터링

| 명령어 | 목적 |
|--------|------|
| `tenetx status` | 현재 상태 라인 출력 |
| `tenetx stats [--week]` | 세션 통계 |
| `tenetx session` | 세션 관리 (search/list/show) |
| `tenetx dashboard` | 거버넌스 대시보드 |
| `tenetx governance` | 거버넌스 리포트 |

### 인프라 & 유틸리티

| 명령어 | 목적 |
|--------|------|
| `tenetx mcp` | MCP 서버 관리 |
| `tenetx marketplace` | 플러그인 마켓플레이스 |
| `tenetx worktree` | Git worktree 관리 |
| `tenetx scan` | 프로젝트 구조 스캔 |
| `tenetx verify` | 자동 검증 루프 |
| `tenetx doctor` | 환경 진단 |
| `tenetx notify "메시지"` | 알림 전송 (Discord/Slack/Telegram) |

---

## 통계

- **1555개 테스트** (98개 테스트 파일)
- **19개 차원 튜닝 에이전트** (3-lane: BUILD 9, REVIEW 3, DOMAIN 7)
- **21개 스킬** (6개 차원 인식)
- **5개 연속 개인화 차원**
- **8개 행동 패턴 감지기**
- **9가지 실행 모드**
- **16-signal 모델 라우팅** (Haiku/Sonnet/Opus)
- **8개 내장 MCP 서버** (JSON-RPC 2.0)
- **3-tier 팩 시스템** (Me/Team/Project)

---

## 감사의 말

테넷엑스는 [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (Yeachan Heo)로부터 큰 영감을 받았습니다. 다중 에이전트 오케스트레이션 패턴, 매직 키워드 시스템, 실행 모드, 그리고 하네스 계층을 통해 Claude Code를 향상시키는 전체적 비전이 OMC의 선구적 작업에 크게 영향을 받았습니다.

또한 사전 설정된 개발 스위트에 대한 깔끔한 접근법인 [Claude Forge](https://github.com/sangrokjung/claude-forge)를 인정합니다.

---

## 라이선스

MIT
