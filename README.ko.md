<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>당신으로부터 학습하는 Claude Code harness.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> &middot;
  <a href="#동작-방식">동작 방식</a> &middot;
  <a href="#명령어">명령어</a> &middot;
  <a href="README.md">English</a>
</p>

---

## Tenetx란?

Tenetx는 Claude Code를 **harness**로 감쌉니다 — `claude`를 실행하고, 세션을 관찰하며, 시간이 지남에 따라 Claude가 더 잘 동작하게 만드는 **재사용 가능한 지식을 자동으로 축적**합니다.

```bash
npm install -g tenetx
tenetx                    # `claude` 대신 이것을 사용
```

### `tenetx`를 사용할 때 일어나는 일:

1. **프로젝트 정보** 자동 감지 (TypeScript? Vitest? CI?) → `.claude/rules/project-context.md`
2. **Safety hook** 활성화 — 위험 명령 차단, 비밀 정보 필터링
3. **Compound 지식** 검색 가능 — Claude가 MCP를 통해 과거 패턴을 능동적으로 검색
4. **세션 종료** → 자동 compound가 대화에서 재사용 가능한 패턴 추출
5. **다음 세션** → Claude가 축적된 지식을 활용해 더 나은 답변 제공

### 사용자 여정

```
npm i -g tenetx          → 설치: hook, MCP, skill 등록
tenetx forge             → 1회 인터뷰: 선호도 설정 (전역)
tenetx                   → 일상 사용: Claude + safety + compound + 자동 학습
/compound                → 선택: 세션 중 수동으로 패턴 추출
```

---

## 빠른 시작

```bash
# 설치
npm install -g tenetx

# 개인화 (1회, 선택)
tenetx forge

# 매일 사용 (`claude` 대신)
tenetx
```

### 요구사항

- **Node.js** >= 22 (내장 SQLite 세션 검색용)
- **Claude Code** 설치 및 인증 완료 (`npm i -g @anthropic-ai/claude-code`)

---

## 동작 방식

```
tenetx (harness 모드)
├── safety hook + 프로젝트 정보와 함께 claude 실행
├── 세션이 정상적으로 진행됨 — 평소처럼 작업
├── 세션 종료 (exit, /new, /compact)
│   ├── Claude가 대화 분석 (auto-compound)
│   ├── 재사용 가능한 패턴 저장 → ~/.compound/me/solutions/
│   └── 사용자 패턴 관찰 → ~/.compound/me/behavior/
└── 다음 세션
    ├── MCP 지시사항이 Claude에게 compound 지식 안내
    ├── Claude가 과거 패턴을 능동적으로 검색
    └── 축적된 지식이 답변 품질 향상
```

### Compound 지식

지식이 세션을 거쳐 축적됩니다:

- **Solutions** — "왜"라는 맥락을 담은 재사용 가능한 패턴
- **Skills** — `tenetx skill promote`를 통해 검증된 솔루션에서 승급
- **행동 패턴** — 관찰된 사용자 습관이 `~/.compound/me/behavior/`에 자동 축적, `.claude/rules/forge-behavioral.md`로 변환

Claude가 MCP 도구(`compound-search` → `compound-read`)를 통해 이 지식을 검색합니다.
정규식 매칭 없음 — **Claude가 무엇이 관련 있는지 판단**.

### Forge (개인화)

1회 인터뷰로 선호도를 설정합니다:

```bash
tenetx forge
```

- 작업 스타일에 따라 **전역 규칙** (`~/.claude/rules/forge-*.md`) 생성
- 품질 집중도, 위험 허용도, 커뮤니케이션 스타일 등
- **프로젝트 스캔은 사실만** — "TypeScript, Vitest, ESLint" (선호도 추론 없음)

### Safety

활성화된 hook (settings.json에 등록):

| Hook | 기능 |
|------|------|
| `pre-tool-use` | 위험 명령 차단 (rm -rf, curl\|sh, force-push) |
| `db-guard` | 위험 SQL 차단 (DROP TABLE, WHERE 없는 DELETE) |
| `secret-filter` | API 키 노출 경고 |
| `slop-detector` | AI slop 감지 (TODO 잔재, eslint-disable, as any) |
| `context-guard` | 컨텍스트 한계 접근 시 경고 |
| `rate-limiter` | MCP 도구 호출 횟수 제한 |

보안 스캔은 exfiltration 및 난독화 감지와 함께 **심각도 분류** (block/warn) 방식 사용.

---

## 명령어

```bash
tenetx                    # Claude Code 시작 (harness 모드)
tenetx forge              # 프로필 개인화
tenetx compound           # 축적된 지식 관리
tenetx compound --save    # 자동 분석된 패턴 저장
tenetx skill promote <n>  # 검증된 솔루션을 skill로 승급
tenetx skill list         # 승급된 skill 목록
tenetx me                 # 개인 대시보드
tenetx config hooks       # Hook 관리
tenetx doctor             # 시스템 진단
tenetx uninstall          # tenetx 제거
```

### MCP 도구 (세션 중 Claude가 사용 가능)

| 도구 | 용도 |
|------|------|
| `compound-search` | 쿼리로 축적된 지식 검색 (내용 미리보기 포함) |
| `compound-read` | 솔루션 전문 읽기 |
| `compound-list` | 필터링된 솔루션 목록 |
| `compound-stats` | 전체 통계 |
| `session-search` | 과거 세션 대화 검색 (토큰화, 컨텍스트 윈도우 포함) |

---

## 아키텍처

```
~/.claude/
├── settings.json          ← hook 등록 (절대 경로)
├── rules/
│   └── forge-*.md         ← 전역 사용자 선호도 (인터뷰 기반)
├── skills/
│   └── {promoted}/SKILL.md ← 승급된 skill (Claude Code 자동 인식)
└── .claude.json           ← MCP 서버 등록

{project}/
└── .claude/
    ├── rules/
    │   └── project-context.md  ← 프로젝트 사실 (자동 스캔)
    └── agents/
        └── ch-*.md             ← 메모리 + MCP 접근 가능한 커스텀 에이전트

~/.compound/
├── me/
│   ├── solutions/         ← 축적된 compound 지식
│   ├── skills/            ← 승급된 skill (tenetx 관리 복사본)
│   ├── behavior/          ← 관찰된 사용자 패턴 → forge-behavioral.md
│   └── forge-profile.json ← 성격 차원
├── sessions.db            ← SQLite 세션 기록 (Node.js 22+ 내장)
└── state/                 ← auto-compound 상태
```

### 핵심 설계 결정

- **Harness, 단순 플러그인이 아님** — `tenetx`가 `claude`를 실행하고 세션 생명주기를 제어
- **Claude가 추출자** — 정규식 패턴 매칭 없음; Claude가 대화를 분석
- **Pull, push 아님** — MCP 지시사항이 Claude에게 지식 검색을 안내; 강제 주입 없음
- **사실, 추론 아님** — 프로젝트 스캔은 사실 수집; 선호도는 인터뷰에서만 획득
- **심각도 기반 보안** — block vs warn 분류로 오탐에 의한 지식 손실 방지

---

## 공존

Tenetx는 설치 시 다른 플러그인(oh-my-claudecode, superpowers, claude-mem)을 감지하고 중복되는 workflow hook을 비활성화합니다. 핵심 safety 및 compound hook은 항상 활성 상태를 유지합니다.

---

## 라이선스

MIT
