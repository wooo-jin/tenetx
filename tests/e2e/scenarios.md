# tenetx 사용자 여정 시나리오

> 이 문서가 tenetx의 동작 검증 기준.
> 모든 기능은 이 시나리오를 통과해야 하며, 시나리오에 없는 기능은 존재하면 안 된다.

---

## Phase 0: 설치

### S0-1. npm 설치
```
npm i -g tenetx
```

**tenetx가 하는 것:**
- postinstall 실행
- `~/.claude/settings.json`에 hooks 등록 (절대 경로)
- `~/.claude.json`에 MCP 서버 등록 (tenetx-compound)
- `~/.claude/commands/tenetx/`에 슬래시 커맨드 설치
- `~/.compound/` 디렉토리 구조 생성

**검증:**
- `settings.json`에 tenetx hook 절대 경로가 있다
- `~/.claude.json`에 `tenetx-compound` MCP가 있다
- `tenetx --version`이 동작한다

---

## Phase 1: 사용자 성향 설정 (1회, 글로벌)

### S1-1. 인터뷰
```
tenetx forge
```

**사용자 행동:** 5개 질문에 답변
**tenetx가 하는 것:**
- 인터뷰 답변 → 차원 벡터 생성 (riskTolerance, autonomyPreference, qualityFocus, abstractionLevel, communicationStyle)
- `~/.compound/me/forge-profile.json` 저장 (글로벌)
- `~/.claude/rules/` 글로벌 규칙 파일 생성 (사용자 성향 기반)

**검증:**
- `forge-profile.json`이 존재하고 차원값이 0-1 범위
- `~/.claude/rules/forge-*.md` 파일이 사용자 성향을 반영
- 예: qualityFocus 높으면 TDD 권장, communicationStyle 높으면 간결한 답변 규칙

**핵심 원칙:**
- 사용자 성향은 **프로젝트 스캔으로 추론하지 않는다**
- 인터뷰와 compound 학습으로만 결정
- 한 번 설정하면 모든 프로젝트에 적용

---

## Phase 2: 프로젝트 열기

### S2-1. Claude Code에서 프로젝트 열기
```
cd my-project && claude
```

**tenetx가 하는 것:**
- 프로젝트 스캔 → 기술 스택 팩트 수집 (TypeScript? Vitest? CI? monorepo?)
- `.claude/rules/project-context.md` 생성 — **팩트만, 성향 추론 없음**
  ```
  # Project Context (auto-detected by tenetx)
  - Language: TypeScript (strict mode)
  - Test: Vitest
  - Linter: ESLint
  - CI: GitHub Actions
  - Structure: monorepo (pnpm workspace)
  ```
- `.claude/agents/` 에 커스텀 에이전트 설치
- auto memory에 compound 포인터 추가

**검증:**
- `.claude/rules/project-context.md`에 프로젝트 팩트가 있다
- 팩트는 사실만 (예: "TypeScript 사용"), 규범 아님 (예: ~~"커버리지 83% 목표"~~)
- 에이전트에 `memory: project` + `mcpServers: tenetx-compound`가 있다

**핵심 원칙:**
- 프로젝트 스캔은 **팩트 수집**이지 **성향 추론**이 아니다
- 사용자 성향 규칙은 Phase 1에서 이미 글로벌로 설정됨
- Claude Code가 팩트 + 성향 규칙을 조합하여 알아서 판단

---

## Phase 3: 일상 작업

### S3-1. 안전 가드레일
**사용자 행동:** Claude에게 위험한 작업 요청
**tenetx가 하는 것:**
- PreToolUse hook → deny (hookEventName 포함)
- settings.json permissions → 위험 명령 차단/확인

**검증:**
- 위험 명령이 차단되거나 확인 요청됨
- 비밀키 노출 시 경고 표시

### S3-2. 키워드 스킬
**사용자 행동:** "tdd 방식으로 만들어줘"
**tenetx가 하는 것:**
- keyword-detector hook → 스킬 내용 주입 (additionalContext)
- Claude가 스킬 지시를 따름

**검증:**
- "tdd" 키워드 → Red-Green-Refactor 사이클 수행
- 스킬 내용이 Claude 응답에 반영

### S3-3. Compound Knowledge 활용 (Claude 주도 pull)
**사용자 행동:** 이전에 해결한 적 있는 문제를 다시 만남
**tenetx가 하는 것:**
- MCP instructions가 Claude에게 compound-search 사용을 안내
- auto memory에 compound 포인터가 있어서 Claude가 존재를 인지
- Claude가 자발적으로 compound-search → compound-read 호출

**검증:**
- Claude 응답에 "compound knowledge에서 확인된 패턴" 류의 인용이 있다
- Claude가 이전 세션의 솔루션을 활용하여 답변

---

## Phase 4: 세션 종료 + Compound 축적

### S4-1. 세션 종료 시 compound 안내
**사용자 행동:** 의미 있는 작업 후 세션 종료
**tenetx가 하는 것:**
- context-guard Stop hook → 10+ 프롬프트이면 `/compound` 실행 안내
- PreCompact hook → 컨텍스트 압축 전 행동 패턴 추출 안내

**검증:**
- "이 세션에서 N개의 프롬프트를 처리했습니다. /compound를 실행하면..." 메시지

### S4-2. Compound 추출 (/compound 스킬)
**사용자 행동:** `/compound` 실행
**tenetx가 하는 것:**
- Claude가 세션 대화 전체를 분석
- 패턴, 트러블슈팅, 의사결정, 안티패턴 식별
- `tenetx compound --solution "제목" "내용"` CLI로 저장
- MCP compound-list로 기존 솔루션과 중복 확인

**검증:**
- Claude가 구체적이고 재사용 가능한 솔루션을 추출
- "왜"가 포함된 솔루션 (not "test(39회)")
- `~/.compound/me/solutions/`에 파일 생성됨

**핵심 원칙:**
- **Claude가 추출기** — regex 아님
- Claude는 대화 맥락을 이해하므로 "왜 이 결정을 했는지"를 포함할 수 있음
- 어떤 언어, 어떤 코딩 스타일이든 동작

---

## Phase 5: 다음 세션

### S5-1. 세션 시작 → 이전 지식 활용
**사용자 행동:** 새 세션 시작
**tenetx가 하는 것:**
- SessionStart hook → 세션 복구 (이전 모드 상태 등)
- MCP instructions → Claude에게 compound-search 안내
- auto memory → compound 존재 인지

**검증:**
- Claude가 이전 세션에서 축적된 솔루션을 참조하여 답변
- "이전에 비슷한 패턴을 해결한 적이 있습니다"

### S5-2. 점진적 개선
**사용자 행동:** 여러 세션에 걸쳐 작업
**tenetx가 하는 것:**
- 솔루션이 축적될수록 compound knowledge가 풍부해짐
- Claude가 더 정확한 compound-search 결과를 얻음
- 프로젝트/사용자별 맞춤 지식 베이스 형성

**검증:**
- compound-stats에서 솔루션 수가 증가
- 새 세션에서 이전 솔루션이 실제로 활용됨

---

## 시나리오에 없는 것 (의도적 제외)

| 제외 항목 | 이유 |
|-----------|------|
| regex 기반 자동 추출 | 피상적 결과, 언어/스타일 독립 불가 |
| 태그 매칭 push 주입 (solution-injector) | MCP pull 모델로 대체 |
| Thompson Sampling / BKT / Bandit | 데이터 부족으로 실효성 없음 |
| HTML 대시보드 | CLI 도구에서 불필요 |
| 모델 라우팅 엔진 | `.claude/rules/routing.md`로 충분 |
| 프로젝트 스캔 → 사용자 성향 추론 | 사용자 성향은 인터뷰/compound로만 결정 |
