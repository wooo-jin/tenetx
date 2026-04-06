<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>Claude Code 개인화 하네스.</strong><br/>
  <strong>쓸수록 나를 더 잘 아는 Claude.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"/></a>
</p>

<p align="center">
  <a href="#tenetx를-쓰면-일어나는-일">동작 흐름</a> &middot;
  <a href="#빠른-시작">빠른 시작</a> &middot;
  <a href="#동작-방식">동작 방식</a> &middot;
  <a href="#4축-개인화">4축 개인화</a> &middot;
  <a href="#명령어">명령어</a> &middot;
  <a href="#아키텍처">아키텍처</a> &middot;
  <a href="#안전">안전</a>
</p>

<p align="center">
  <a href="README.md">English</a> &middot;
  한국어 &middot;
  <a href="README.ja.md">日本語</a> &middot;
  <a href="README.zh.md">简体中文</a>
</p>

---

## 두 개발자. 같은 Claude. 완전히 다른 행동.

개발자 A는 신중합니다. Claude가 모든 테스트를 돌리고, 이유를 설명하고, 현재 파일 밖의 것은 손대기 전에 물어봐야 합니다.

개발자 B는 빠릅니다. Claude가 가정하고, 관련 파일까지 바로 고치고, 결과를 두 줄로 보고하면 됩니다.

tenetx 없이는 두 개발자 모두 같은 범용 Claude를 받습니다. tenetx를 쓰면, 각자 자기 방식대로 일하는 Claude를 받습니다.

```
개발자 A의 Claude:                      개발자 B의 Claude:
"관련 이슈 3개를 발견했습니다.             "로그인 + 관련 파일 2개 수정 완료.
진행하기 전에 세션 핸들러도                  테스트 통과. 리스크 1건: 세션
함께 수정할까요? 각각의 분석은               타임아웃 미커버. 끝."
다음과 같습니다..."
```

tenetx가 이것을 가능하게 합니다. 작업 스타일을 프로파일링하고, 교정에서 학습하고, Claude가 매 세션마다 따르는 개인화 규칙을 렌더링합니다.

---

## tenetx를 쓰면 일어나는 일

### 첫 실행 (1회, 약 1분)

```bash
npm install -g tenetx
tenetx
```

첫 실행을 감지하면 4문항 온보딩이 시작됩니다. 각 질문은 구체적인 시나리오입니다:

```
  질문 1: 애매한 구현 요청

  "로그인 기능을 개선해줘"라는 요청을 받았습니다.
  요구사항이 명확하지 않고, 인접 모듈에 영향을 줄 수 있습니다.

  A) 먼저 요구사항/범위를 확인하고, 범위 확대 가능성이 있으면 물어본다
  B) 같은 흐름 안이면 진행하되, 큰 범위 확대가 보이면 확인한다
  C) 합리적으로 가정하고 인접 파일까지 바로 수정한다

  선택 (A/B/C):
```

4개의 질문. 4개의 축 측정. 각 축에 팩과 세밀한 facet이 포함된 프로필이 생성됩니다. 개인화된 규칙 파일이 렌더링되어 Claude가 읽는 위치에 배치됩니다.

### 매 세션 (일상 사용)

```bash
tenetx                    # `claude` 대신 사용
```

내부 동작:

1. 하네스가 `~/.tenetx/me/forge-profile.json`에서 프로필 로드
2. 프리셋 매니저가 세션 합성: 글로벌 안전 규칙 + 팩 기본 규칙 + 개인 오버레이 + 세션 오버레이
3. 규칙 렌더러가 모든 것을 자연어로 변환하여 `~/.claude/rules/v1-rules.md`에 기록
4. Claude Code가 시작되어 해당 규칙을 행동 지침으로 읽음
5. 안전 훅 활성화: 위험 명령 차단, 시크릿 필터링, 프롬프트 인젝션 탐지

### Claude를 교정할 때

당신이 말합니다: "내가 요청하지 않은 파일은 리팩토링하지 마."

Claude가 `correction-record` MCP 도구를 호출합니다. 교정은 축 분류(`judgment_philosophy`), 종류(`avoid-this`), 신뢰도 점수가 포함된 구조화된 evidence로 저장됩니다. 현재 세션에 즉시 효과를 주는 임시 규칙이 생성됩니다.

### 세션 사이 (자동)

세션이 끝나면 auto-compound가 추출합니다:
- 솔루션 (맥락이 포함된 재사용 가능한 패턴)
- 행동 관찰 (당신의 작업 방식)
- 세션 학습 요약

축적된 evidence를 기반으로 facet이 미세 조정됩니다. 교정이 지속적으로 현재 팩과 다른 방향을 가리키면, 3세션 후 mismatch 감지가 트리거되어 팩 변경을 추천합니다.

### 다음 세션

교정이 반영된 업데이트 규칙이 렌더링됩니다. Compound 지식이 MCP를 통해 검색 가능합니다. Claude가 *당신의* Claude가 되어갑니다.

---

## 빠른 시작

```bash
# 1. 설치
npm install -g tenetx

# 2. 첫 실행 — 4문항 온보딩 (영어/한국어 선택)
tenetx

# 3. 이후 매일
tenetx
```

### 사전 요구사항

- **Node.js** >= 20 (SQLite 세션 검색은 >= 22 권장)
- **Claude Code** 설치 및 인증 (`npm i -g @anthropic-ai/claude-code`)

---

## 동작 방식

### 학습 루프

```
                          +-------------------+
                          |     온보딩         |
                          |   (4문항)          |
                          +--------+----------+
                                   |
                                   v
                   +-------------------------------+
                   |       프로필 생성               |
                   |  4축 x 팩 + facet + trust       |
                   +-------------------------------+
                                   |
           +-----------------------+------------------------+
           |                                                |
           v                                                |
  +------------------+                                      |
  |  규칙 렌더링      |   ~/.claude/rules/v1-rules.md        |
  |  Claude 형식으로  |                                      |
  +--------+---------+                                      |
           |                                                |
           v                                                |
  +------------------+                                      |
  |  세션 진행        |   Claude가 개인화 규칙을 따름          |
  |   교정하면       | ---> correction-record MCP            |
  |   Claude 학습    |      Evidence 저장                    |
  +--------+---------+      임시 규칙 생성                    |
           |                                                |
           v                                                |
  +------------------+                                      |
  |  세션 종료        |   auto-compound 추출:                 |
  |                  |   솔루션 + 관찰 + 요약                  |
  +--------+---------+                                      |
           |                                                |
           v                                                |
  +------------------+                                      |
  |  Facet 조정      |   프로필 미세 조정                     |
  |  Mismatch 확인   |   최근 3세션 rolling 분석              |
  +--------+---------+                                      |
           |                                                |
           +------------------------------------------------+
                    (다음 세션: 업데이트된 규칙)
```

### Compound 지식

지식은 세션을 거치며 축적되고, 검색 가능해집니다:

| 유형 | 출처 | Claude 활용 방법 |
|------|------|-----------------|
| **솔루션** | 세션에서 추출 | MCP를 통한 `compound-search` |
| **스킬** | 검증된 솔루션에서 승격 | 슬래시 커맨드로 자동 로드 |
| **행동 패턴** | 3회 이상 관찰 시 자동 감지 | `forge-behavioral.md`에 적용 |
| **Evidence** | 교정 + 관찰 | facet 조정의 근거 |

---

## 4축 개인화

각 축에는 3개의 팩이 있습니다. 각 팩에는 세밀한 facet(0-1 수치)이 포함되어 있으며, 교정에 따라 시간이 지나면서 미세 조정됩니다.

### 품질/안전

| 팩 | Claude의 행동 |
|----|-------------|
| **보수형** | 완료 보고 전 모든 테스트를 실행. 타입 체크. 엣지 케이스 검증. 모든 검사가 통과해야 "완료"라고 말함. |
| **균형형** | 핵심 검증을 실행하고, 남은 리스크를 요약. 철저함과 속도의 균형. |
| **속도형** | 빠른 smoke 테스트. 결과와 리스크를 즉시 보고. 전달을 우선. |

### 자율성

| 팩 | Claude의 행동 |
|----|-------------|
| **확인 우선형** | 인접 파일을 수정하기 전 확인. 애매한 요구사항 명확화. 범위 확장에 승인 요청. |
| **균형형** | 같은 흐름 안이면 진행. 큰 범위 확대가 보이면 확인. |
| **자율 실행형** | 합리적으로 가정. 관련 파일을 바로 수정. 완료 후 무엇을 했는지 보고. |

### 판단 철학

| 팩 | Claude의 행동 |
|----|-------------|
| **최소변경형** | 기존 구조 유지. 동작하는 코드를 리팩토링하지 않음. 수정 범위를 최소한으로 유지. |
| **균형형** | 현재 작업에 집중. 명확한 개선 기회가 보이면 제안. |
| **구조적접근형** | 반복 패턴이나 기술 부채를 발견하면 적극적으로 구조 개선 제안. 추상화와 재사용 설계 선호. 아키텍처 일관성 유지. |

### 커뮤니케이션

| 팩 | Claude의 행동 |
|----|-------------|
| **간결형** | 코드와 결과만. 선제적으로 설명하지 않음. 물어볼 때만 부연. |
| **균형형** | 핵심 변경과 이유를 요약. 필요하면 추가 질문 유도. |
| **상세형** | 무엇을, 왜, 영향 범위, 대안까지 설명. 교육적 맥락 제공. 보고서를 섹션별로 구조화. |

---

## 렌더링된 규칙의 실제 모습

tenetx가 세션을 합성하면 Claude가 읽는 `v1-rules.md` 파일을 렌더링합니다. 서로 다른 프로필이 완전히 다른 Claude 행동을 만드는 두 가지 실제 예시입니다.

### 예시 1: 보수형 + 확인 우선형 + 구조적접근형 + 상세형

```markdown
[보수형 quality / 확인 우선형 autonomy / 구조적접근형 judgment / 상세형 communication]

## Must Not
- .env, credentials, API 키를 절대 커밋하거나 노출하지 마라.
- 파괴적 명령(rm -rf, DROP, force-push)은 사용자 확인 없이 실행하지 마라.

## Working Defaults
- Trust: 위험 우회 비활성. 파괴적 명령, 민감 경로 접근 시 항상 확인.
- 반복되는 패턴이나 기술 부채를 발견하면 적극적으로 구조 개선을 제안하라.
- 추상화와 재사용 가능한 설계를 선호하라. 단, 과도한 추상화는 피한다.
- 변경 시 전체 아키텍처 관점에서 일관성을 유지하라.

## When To Ask
- 애매한 작업은 시작 전 요구사항을 명확히 하라.
- 명시적으로 요청된 범위 밖의 파일을 수정하기 전에 확인하라.

## How To Validate
- 완료 보고 전 관련 테스트, 타입 체크, 핵심 검증을 모두 완료하라.
- 모든 검사가 통과하기 전에는 "완료"라고 하지 마라.

## How To Report
- 변경 이유, 대안 검토, 영향 범위를 함께 설명하라.
- 교육적 맥락을 제공하라 — 왜 이 접근이 좋은지, 다른 방법과 비교.
- 보고는 구조화하라 (변경 사항, 이유, 영향, 다음 단계).

## Evidence Collection
- 사용자가 행동을 교정하면("하지마", "그렇게 말고", "앞으로는 이렇게") 반드시 correction-record MCP 도구를 호출하여 evidence로 기록하라.
- kind 선택: fix-now(즉시 수정), prefer-from-now(앞으로 이렇게), avoid-this(하지 마라)
- axis_hint: quality_safety(품질/검증), autonomy(자율/확인), judgment_philosophy(변경 접근법), communication_style(설명 스타일)
- 교정이 아닌 일반 피드백은 기록하지 않는다.
```

### 예시 2: 속도형 + 자율 실행형 + 최소변경형 + 간결형

```markdown
[속도형 quality / 자율 실행형 autonomy / 최소변경형 judgment / 간결형 communication]

## Must Not
- .env, credentials, API 키를 절대 커밋하거나 노출하지 마라.
- 파괴적 명령(rm -rf, DROP, force-push)은 사용자 확인 없이 실행하지 마라.

## Working Defaults
- Trust: 런타임 마찰 최소화. 명시적 금지와 파괴적 명령 외에는 자유 실행.
- 기존 코드 구조를 최대한 유지하라. 동작하는 코드를 불필요하게 리팩토링하지 마라.
- 수정 범위를 최소한으로 유지하라. 인접 파일 변경은 꼭 필요한 경우에만.
- 변경 전 근거(테스트, 에러 로그)를 먼저 확보하라.

## How To Validate
- 최소 smoke만 보고 빠르게 결과와 리스크만 보고하라.

## How To Report
- 응답은 짧고 핵심만. 코드와 결과 위주로 보고하라.
- 부연 설명은 물어볼 때만. 선제적으로 길게 설명하지 마라.

## Evidence Collection
- 사용자가 행동을 교정하면("하지마", "그렇게 말고", "앞으로는 이렇게") 반드시 correction-record MCP 도구를 호출하여 evidence로 기록하라.
- kind 선택: fix-now(즉시 수정), prefer-from-now(앞으로 이렇게), avoid-this(하지 마라)
- axis_hint: quality_safety(품질/검증), autonomy(자율/확인), judgment_philosophy(변경 접근법), communication_style(설명 스타일)
- 교정이 아닌 일반 피드백은 기록하지 않는다.
```

같은 Claude. 같은 코드베이스. 완전히 다른 작업 스타일. 1분짜리 온보딩이 만든 차이입니다.

---

## 명령어

### 핵심

```bash
tenetx                          # 개인화된 Claude Code 시작
tenetx "로그인 버그 수정해줘"     # 프롬프트와 함께 시작
tenetx --resume                 # 이전 세션 이어서
```

### 개인화

```bash
tenetx onboarding               # 4문항 온보딩 실행
tenetx forge --profile          # 현재 프로필 확인
tenetx forge --reset soft       # 프로필 초기화 (soft / learning / full)
tenetx forge --export           # 프로필 내보내기
```

### 상태 확인

```bash
tenetx inspect profile          # 4축 프로필 + 팩 + facet
tenetx inspect rules            # 활성/비활성 규칙
tenetx inspect evidence         # 교정 기록
tenetx inspect session          # 현재 세션 상태
tenetx me                       # 개인 대시보드 (inspect profile 단축키)
```

### 지식 관리

```bash
tenetx compound                 # 축적된 지식 미리보기
tenetx compound --save          # 자동 분석된 패턴 저장
tenetx skill promote <이름>     # 검증된 솔루션을 스킬로 승격
tenetx skill list               # 승격된 스킬 목록
```

### 시스템

```bash
tenetx init                     # 프로젝트 초기화
tenetx doctor                   # 시스템 진단
tenetx config hooks             # 훅 상태 확인
tenetx config hooks --regenerate # 훅 재생성
tenetx mcp                      # MCP 서버 관리
tenetx uninstall                # tenetx 깔끔하게 제거
```

### MCP 도구 (세션 중 Claude가 사용)

| 도구 | 용도 |
|------|------|
| `compound-search` | 축적된 지식을 쿼리로 검색 |
| `compound-read` | 솔루션 전문 읽기 |
| `compound-list` | 필터가 있는 솔루션 목록 |
| `compound-stats` | 통계 요약 |
| `session-search` | 이전 세션 대화 검색 (SQLite FTS5, Node.js 22+) |
| `correction-record` | 사용자 교정을 구조화된 evidence로 기록 |

---

## 아키텍처

```
~/.tenetx/                           개인화 홈
|-- me/
|   |-- forge-profile.json           4축 프로필 (팩 + facet + trust)
|   |-- rules/                       규칙 저장소 (규칙별 JSON 파일)
|   |-- behavior/                    Evidence 저장소 (교정 + 관찰)
|   |-- recommendations/             팩 추천 (온보딩 + mismatch)
|   +-- solutions/                   Compound 지식
|-- state/
|   |-- sessions/                    세션 상태 스냅샷
|   +-- raw-logs/                    Raw 세션 로그 (7일 TTL 자동 정리)
+-- config.json                      글로벌 설정 (locale, trust, packs)

~/.claude/
|-- settings.json                    훅 + 환경변수 (하네스가 주입)
|-- rules/
|   |-- forge-behavioral.md          학습된 행동 패턴 (자동 생성)
|   +-- v1-rules.md                  렌더링된 개인화 규칙 (세션별)
|-- commands/tenetx/                 슬래시 커맨드 (승격된 스킬)
+-- .claude.json                     MCP 서버 등록

~/.compound/                         레거시 compound 홈 (훅/MCP가 아직 참조)
|-- me/
|   |-- solutions/                   축적된 compound 지식
|   |-- behavior/                    행동 패턴
|   +-- skills/                      승격된 스킬
+-- sessions.db                      SQLite 세션 이력 (Node.js 22+)
```

### 데이터 흐름

```
forge-profile.json                   개인화의 단일 진실 원천
        |
        v
preset-manager.ts                    세션 상태 합성:
  글로벌 안전 규칙                       hard constraint (항상 활성)
  + 기본 팩 규칙                         프로필 팩에서
  + 개인 오버레이                        교정 생성 규칙에서
  + 세션 오버레이                        현재 세션 임시 규칙
  + 런타임 능력 감지                     trust 정책 조정
        |
        v
rule-renderer.ts                     Rule[]을 자연어로 변환:
  필터 (active만)                      파이프라인: filter -> dedupe -> group ->
  dedupe (render_key)                  order -> template -> budget (4000자)
  카테고리별 그룹
  순서: Must Not -> Working Defaults -> When To Ask -> How To Validate -> How To Report
        |
        v
~/.claude/rules/v1-rules.md         Claude가 실제로 읽는 파일
```

---

## 안전

안전 훅은 `settings.json`에 자동 등록되며, Claude의 모든 도구 호출 시 실행됩니다.

| 훅 | 트리거 | 기능 |
|----|--------|------|
| **pre-tool-use** | 모든 도구 실행 전 | `rm -rf`, `curl\|sh`, `--force` push, 위험 패턴 차단 |
| **db-guard** | SQL 연산 | `DROP TABLE`, `WHERE` 없는 `DELETE`, `TRUNCATE` 차단 |
| **secret-filter** | 파일 쓰기, 출력 | API 키, 토큰, 자격 증명 노출 시 경고 |
| **slop-detector** | 코드 생성 후 | TODO 잔재, `eslint-disable`, `as any`, `@ts-ignore` 감지 |
| **prompt-injection-filter** | 모든 입력 | 패턴 + 휴리스틱 기반 프롬프트 인젝션 차단 |
| **context-guard** | 세션 중 | 컨텍스트 윈도우 한계 접근 시 경고 |
| **rate-limiter** | MCP 도구 호출 | 과도한 MCP 도구 호출 방지 |

안전 규칙은 **hard constraint**입니다 -- 팩 선택이나 교정으로 재정의할 수 없습니다. 렌더링된 규칙의 "Must Not" 섹션은 프로필과 무관하게 항상 존재합니다.

---

## 핵심 설계 원칙

- **4축 프로필, 선호도 토글이 아님.** 각 축에는 팩(대분류)과 facet(0-1 수치의 세밀한 조정)이 있습니다. 팩은 안정적 행동을 제공하고, facet은 전체 재분류 없이 미세 조정을 가능하게 합니다.

- **Evidence 기반 학습, regex 매칭이 아님.** 교정은 구조화된 데이터(`CorrectionRequest`: kind, axis_hint, message)입니다. Claude가 분류하고, 알고리즘이 적용합니다. 사용자 입력에 대한 패턴 매칭이 없습니다.

- **Pack + overlay 모델.** 기본 팩이 안정적 기본값을 제공합니다. 교정에서 생성된 개인 오버레이가 위에 쌓입니다. 세션 오버레이는 임시 규칙입니다. 충돌 해소: 세션 > 개인 > 팩 (글로벌 안전은 항상 hard constraint).

- **자연어로 렌더링된 규칙.** `v1-rules.md` 파일에는 설정이 아닌 한국어(또는 영어) 문장이 담깁니다. Claude는 "동작하는 코드를 불필요하게 리팩토링하지 마라"같은 지침을 읽습니다 -- 사람 멘토가 가이드를 주는 것과 같은 방식입니다.

- **Mismatch 감지.** 최근 3세션 rolling 분석으로 교정이 지속적으로 현재 팩과 다른 방향을 가리키는지 확인합니다. 감지되면 조용히 drift하지 않고, 팩 재추천을 제안합니다.

- **런타임 trust 계산.** 원하는 trust 정책이 Claude Code의 실제 런타임 권한 모드와 조율됩니다. Claude Code가 `--dangerously-skip-permissions`로 실행되면, tenetx가 effective trust 수준을 그에 맞게 조정합니다.

- **국제화.** 영어와 한국어 완전 지원. 온보딩 시 언어를 선택하면 온보딩 질문, 렌더링된 규칙, CLI 출력 전체에 적용됩니다.

---

## 공존

tenetx는 설치 시 다른 Claude Code 플러그인(oh-my-claudecode, superpowers, claude-mem)을 감지하고 겹치는 훅을 비활성화합니다. 핵심 안전 훅과 compound 훅은 항상 활성 상태를 유지합니다.

---

## 라이선스

MIT
