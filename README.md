<p align="center">
  <img src="assets/banner.svg" alt="Tenet" width="100%"/>
</p>

<p align="center">
  <strong>Declare principles. Generate workflow. Compound growth.</strong>
</p>

<p align="center">
  <a href="#installation">Install</a> &middot;
  <a href="#philosophy">Philosophy</a> &middot;
  <a href="#usage">Usage</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#한국어">한국어</a>
</p>

---

## What is Tenet?

Tenet is a **philosophy-driven harness** for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Instead of tweaking dozens of config files, you declare your engineering principles — and Tenet generates hooks, model routing, alerts, agents, and skills automatically.

```
$ claude                        $ tenet
│                                │
│ Default Claude Code            │ Tenet runs first
│ Generic settings               │  ├── Load philosophy.yaml
│                                │  ├── Resolve scope (Me / Team / Project)
│                                │  ├── Sync knowledge packs
│                                │  ├── Generate hooks & routing
│                                │  └── Launch Claude Code (configured)
│                                │
│ General-purpose tool           │ Your tool
```

**Tenet does not fork or modify Claude Code.** It configures the settings, hooks, and CLAUDE.md that Claude Code already reads — shaped by your principles.

---

## Installation

### Prerequisites

- **Node.js** >= 18
- **Claude Code** installed and authenticated

### Quick Start

```bash
# Install globally
npm install -g tenet

# Initial setup — 3 questions, 30 seconds
tenet setup

# Run Claude Code with your philosophy applied
tenet
```

### As a Claude Code Plugin

```bash
tenet install --plugin
```

---

## Philosophy

The core idea: **you don't configure workflows — you declare beliefs, and workflows emerge.**

### philosophy.yaml

```yaml
name: "my-style"
author: "Your Name"

principles:
  understand-before-act:
    belief: "Acting without understanding compounds cost exponentially"
    generates:
      - "Every task follows explore → plan → implement"
      - "On rollback, assess change scope first"
      - hook: "UserPromptSubmit → auto-load relevant manuals"

  decompose-to-control:
    belief: "Large tasks must be decomposed to remain controllable"
    generates:
      - "Break work into PLANS / CONTEXT / CHECKLIST"
      - alert: "Warn when same file edited 5+ times"

  capitalize-on-failure:
    belief: "Repeating the same mistake is a system failure"
    generates:
      - "Extract patterns via compound after every session"
      - "Auto-generate prevention rules from failures"

  focus-resources-on-judgment:
    belief: "Resources should concentrate where judgment is needed"
    generates:
      - routing: "explore → Sonnet, implement → Opus"
      - alert: "Warn when session cost exceeds $10"
```

Five principles automatically generate hooks, alerts, routing rules, and compound behaviors. No manual configuration required.

---

## Usage

### Basic

```bash
tenet                              # Start with harness applied
tenet "Refactor the chart API"     # Start with a prompt
tenet --resume                     # Resume previous session
```

### Execution Modes

Each mode maps to a philosophical principle:

| Flag | Mode | What it does |
|------|------|-------------|
| `-a` | **autopilot** | 5-stage autonomous pipeline (explore → plan → implement → QA → verify) |
| `-r` | **ralph** | PRD-based completion guarantee with verify/fix loop |
| `-t` | **team** | Multi-agent parallel pipeline with specialized roles |
| `-u` | **ultrawork** | Maximum parallelism burst |
| `-p` | **pipeline** | Sequential stage-by-stage processing |
| | **ccg** | Claude-Codex-Gemini 3-model cross-validation |
| | **ralplan** | Consensus-based design (Planner → Architect → Critic) |
| | **deep-interview** | Socratic requirements clarification |

```bash
tenet --autopilot "Build user authentication"
tenet --ralph "Complete the payment integration"
tenet --team "Redesign the dashboard"
```

### Magic Keywords

Type these anywhere in your prompt — no flags needed:

```
autopilot <task>         Activate autopilot mode
ralph <task>             Activate ralph mode
ultrawork <task>         Maximum parallelism
tdd                      Test-driven development mode
ultrathink               Extended reasoning
deepsearch               Deep codebase search
canceltenet              Cancel all active modes
```

### Model Routing

Tenet automatically routes tasks to the optimal model tier:

```
┌─────────┬─────────────────────────────────────┐
│  Haiku  │  explore, file-search, simple-qa    │
├─────────┼─────────────────────────────────────┤
│ Sonnet  │  code-review, analysis, design      │
├─────────┼─────────────────────────────────────┤
│  Opus   │  implement, architect, debug        │
└─────────┴─────────────────────────────────────┘
```

Routing is driven by 16-signal scoring (lexical, structural, contextual) with philosophy-declared overrides taking priority.

### Real-time Monitoring

Tenet watches your session and warns you before problems compound:

| Watch | Trigger | Action |
|-------|---------|--------|
| File edits | Same file 5+ times | Stop and redesign |
| Session cost | $10+ | Reduce scope |
| Session time | 40+ minutes | Suggest compaction |
| Context window | 70%+ usage | Visual warning |
| Knowledge | Related solution exists | Suggest reuse |

### Pack System

Knowledge lives in three scopes and grows over time:

```bash
# Install a team knowledge pack
tenet pack install https://github.com/your-org/pack-backend

# Sync latest knowledge
tenet pack sync

# Cherry-pick a solution to your personal collection
tenet pick api-caching --from backend

# Propose a personal pattern to the team
tenet propose retry-pattern --to backend
```

### Compound Loop

After meaningful work, extract and accumulate insights:

```bash
tenet compound
```

This analyzes your session and extracts:
- **Patterns** — recurring approaches worth reusing
- **Solutions** — specific fixes with context
- **Rules** — prevention rules from failures
- **Golden prompts** — effective prompt templates

### All Commands

```
tenet setup                    Initial setup
tenet setup --project          Project-specific philosophy
tenet philosophy <show|edit>   Manage philosophy
tenet pack <install|sync|list> Manage packs
tenet compound                 Compound loop
tenet ask "question"           Multi-provider question
tenet scan                     Project structure scan
tenet verify                   Auto verification loop
tenet stats [--week]           Session statistics
tenet doctor                   Environment diagnostics
tenet notify "message"         Send notification (Discord/Slack/Telegram)
tenet help                     Full help
```

---

## Architecture

<p align="center">
  <img src="assets/architecture.svg" alt="Tenet Architecture" width="100%"/>
</p>

### Layer 0: Philosophy (WHY)

Your `philosophy.yaml` declares principles. Each principle has a `belief` and `generates` — the system derives hooks, routing, alerts, and compound rules from these declarations.

### Layer 1: Workflow Engine (HOW)

The engine translates philosophy into executable components:

- **9 Execution Modes** — from simple chat to full autonomous pipelines
- **3-Tier Model Routing** — Haiku / Sonnet / Opus with 16-signal scoring
- **10 Hook Events** — PreToolUse, PostToolUse, SessionStart, etc.
- **Real-time Monitor** — cost, edits, context usage tracking
- **Compound Loop** — pattern extraction and knowledge accumulation

### Layer 2: Pack (KNOW + SHARE)

Domain knowledge organized in three scopes:

| Scope | Location | When loaded |
|-------|----------|-------------|
| **Me** | `~/.compound/me/` | Always |
| **Team** | `~/.compound/packs/<name>/` | In team repos |
| **Project** | `{repo}/.compound/` | In that repo |

Packs sync to GitHub, Google Drive, S3, or local directories.

### Built-in Agents (16)

Specialized agents installed automatically:

```
executor          architect         critic            planner
analyst           debugger          designer          code-reviewer
security-reviewer test-engineer     writer            qa-tester
verifier          explore           refactoring-expert performance-reviewer
```

### Built-in Skills (11)

```
autopilot    ralph        team         ultrawork     pipeline
ccg          ralplan      deep-interview tdd         code-review
security-review
```

---

## How It Works

```
tenet "Refactor the chart API"
  │
  ├── 1. Load philosophy.yaml
  │      └── 5 principles → hooks, routing, alerts
  │
  ├── 2. Resolve scope
  │      └── Me (always) + Team (if linked) + Project (if .compound/)
  │
  ├── 3. Sync packs
  │      └── Pull latest team knowledge
  │
  ├── 4. Configure session
  │      ├── Inject hooks into ~/.claude/settings.json
  │      ├── Set model routing in env
  │      ├── Install agents & skills
  │      └── Configure status line
  │
  └── 5. Launch Claude Code
         └── Runs with all configurations applied
```

---

## License

MIT

---

<br>

# 한국어

## Tenet이란?

Tenet은 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)를 위한 **철학 기반 하네스**입니다. 설정 파일을 일일이 수정하는 대신, 엔지니어링 원칙을 선언하면 훅, 모델 라우팅, 경고, 에이전트, 스킬이 자동으로 생성됩니다.

```
$ claude                        $ tenet
│                                │
│ 기본 Claude Code               │ Tenet이 먼저 실행
│ 범용 설정                       │  ├── philosophy.yaml 로드
│                                │  ├── 스코프 결정 (Me / Team / Project)
│                                │  ├── 지식 팩 동기화
│                                │  ├── 훅 & 라우팅 생성
│                                │  └── Claude Code 실행 (설정 적용)
│                                │
│ 범용 도구                       │ 내 도구
```

**Claude Code를 수정하지 않습니다.** Claude Code가 읽는 설정(hooks, CLAUDE.md, statusLine)을 철학에 맞게 구성해서 주입합니다.

---

## 설치

### 요구사항

- **Node.js** >= 18
- **Claude Code** 설치 및 인증 완료

### 빠른 시작

```bash
# 전역 설치
npm install -g tenet

# 초기 설정 — 3가지 질문, 30초
tenet setup

# 내 철학이 적용된 Claude Code 실행
tenet
```

---

## 핵심 개념: 원칙 선언형

**설정을 구성하는 게 아니라 신념을 선언하면 워크플로우가 생성됩니다.**

```yaml
principles:
  understand-before-act:
    belief: "이해 없이 행동하면 비용이 기하급수적으로 증가한다"
    generates:
      - "모든 작업은 탐색 → 계획 → 구현 순서"
      - hook: "UserPromptSubmit → 관련 매뉴얼 자동 로드"

  capitalize-on-failure:
    belief: "같은 실수를 두 번 하는 건 시스템의 실패다"
    generates:
      - "모든 작업 후 compound로 패턴 추출"
      - "실패에서 예방 규칙 자동 생성"
```

원칙 5개가 훅, 경고, 라우팅, compound 규칙을 자동 생성합니다.

---

## 사용법

### 실행 모드

| 플래그 | 모드 | 설명 |
|--------|------|------|
| `-a` | **autopilot** | 5단계 자율 실행 (탐색→계획→구현→QA→검증) |
| `-r` | **ralph** | PRD 기반 완료 보장 + verify/fix loop |
| `-t` | **team** | 전문 에이전트 병렬 분업 |
| `-u` | **ultrawork** | 최대 병렬성 버스트 |
| `-p` | **pipeline** | 순차 단계별 처리 |

```bash
tenet --autopilot "사용자 인증 구현해줘"
tenet --ralph "결제 연동 완성해줘"
tenet --team "대시보드 재설계해줘"
```

### 매직 키워드

프롬프트 안에서 바로 사용:

```
autopilot 차트 리팩토링    → autopilot 모드 활성화
ralph API 마이그레이션     → ralph 모드 활성화
tdd                       → TDD 모드
ultrathink                → 확장 추론 모드
canceltenet               → 모든 모드 중단
```

### 모델 라우팅

작업 유형에 따라 최적 모델을 자동 선택:

| 모델 | 대상 작업 |
|------|----------|
| **Haiku** | 탐색, 파일 검색, 단순 질의 |
| **Sonnet** | 코드 리뷰, 분석, 설계 |
| **Opus** | 구현, 아키텍처, 복잡한 디버깅 |

### 실시간 감시

| 감시 대상 | 조건 | 경고 |
|----------|------|------|
| 파일 편집 횟수 | 같은 파일 5회+ | 중단 후 재설계 권고 |
| 세션 비용 | $10+ | 범위 축소 권고 |
| 세션 시간 | 40분+ | compact 권고 |
| 컨텍스트 | 70%+ | 시각적 경고 |
| 팩 솔루션 | 관련 솔루션 존재 | 재사용 제안 |

### 팩 시스템

지식은 3가지 스코프로 나뉘어 복리로 성장합니다:

```bash
# 팀 지식 팩 설치
tenet pack install https://github.com/your-org/pack-backend

# 최신 지식 동기화
tenet pack sync

# 팀 솔루션을 내 컬렉션으로 가져오기
tenet pick api-caching --from backend

# 내 패턴을 팀에 제안
tenet propose retry-pattern --to backend
```

### Compound Loop

의미 있는 작업 후 인사이트를 추출하고 축적:

```bash
tenet compound
```

세션을 분석하여 **패턴**, **솔루션**, **예방 규칙**, **골든 프롬프트**를 추출합니다. 추출된 지식은 다음 세션에서 자동으로 매칭되어 제안됩니다.

---

## 3-Layer 아키텍처

| Layer | 역할 | 핵심 |
|-------|------|------|
| **Layer 0** | Philosophy (WHY) | 원칙 선언 → 워크플로우 자동 도출 |
| **Layer 1** | Engine (HOW) | 모드, 라우팅, 훅, 모니터링, Compound Loop |
| **Layer 2** | Pack (KNOW) | Me / Team / Project 3스코프 지식 공유 |

### 내장 에이전트 (16종)

```
executor  architect  critic    planner   analyst   debugger
designer  code-reviewer  security-reviewer  test-engineer
writer    qa-tester  verifier  explore   refactoring-expert
performance-reviewer
```

### 내장 스킬 (11종)

```
autopilot  ralph  team  ultrawork  pipeline  ccg
ralplan  deep-interview  tdd  code-review  security-review
```

---

## 라이선스

MIT
