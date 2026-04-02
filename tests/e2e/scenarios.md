# tenetx 사용자 여정 시나리오 v5

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
- 인터뷰 답변 → 차원 벡터 생성
- `~/.compound/me/forge-profile.json` 저장 (글로벌)
- `~/.claude/rules/forge-*.md` 글로벌 규칙 파일 생성 (사용자 성향 기반)

**검증:**
- `forge-profile.json`이 존재하고 차원값이 0-1 범위
- `~/.claude/rules/forge-*.md` 파일이 사용자 성향을 반영
- 이 규칙은 모든 프로젝트에 적용됨

**핵심 원칙:**
- 사용자 성향은 **프로젝트 스캔으로 추론하지 않는다**
- 인터뷰와 compound 학습으로만 결정
- 한 번 설정하면 모든 프로젝트에 적용

---

## Phase 2: 프로젝트에서 작업 시작

### S2-1. tenetx로 세션 시작 (하네스 모드)
```
cd my-project
tenetx
```

**tenetx가 하는 것:**
1. 프로젝트 스캔 → `.claude/rules/project-context.md` 생성 (**팩트만**)
   ```
   # Project Context (auto-detected by tenetx)
   - Stack: TypeScript, Vitest, ESLint
   - Git: 42 commits, trunk strategy
   - CI: GitHub Actions
   - Package manager: pnpm
   ```
2. `.claude/agents/` 에 커스텀 에이전트 설치
3. MEMORY.md에 compound 포인터 추가
4. `claude` 프로세스를 spawn하여 실행
5. 세션 대화를 SQLite에 기록 시작

**검증:**
- `project-context.md`에 팩트만 있다 (성향 추론 없음)
- `claude` 프로세스가 정상 실행되고, 사용자가 평소처럼 사용 가능
- SQLite에 세션 기록이 쌓인다

**핵심 원칙:**
- `tenetx`가 곧 하네스 모드 — claude를 감싸서 실행
- 프로젝트 스캔은 **팩트 수집**이지 **성향 추론**이 아니다

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

### S3-3. Compound Knowledge 활용 (Claude 주도 pull)
**사용자 행동:** 이전에 해결한 적 있는 문제를 다시 만남
**tenetx가 하는 것:**
- MCP instructions가 Claude에게 compound-search 사용을 안내
- Claude가 자발적으로 compound-search → compound-read 호출

**검증:**
- Claude가 이전 세션의 솔루션을 참조하여 답변

### S3-4. 과거 세션 검색 (FTS5)
**사용자 행동:** "저번에 이 문제 어떻게 해결했더라?"
**tenetx가 하는 것:**
- MCP `session-search` 도구가 SQLite FTS5로 과거 세션 검색
- 검색 결과를 Claude가 요약하여 답변

**검증:**
- 과거 세션의 대화 내용이 검색됨
- Claude가 해당 내용을 참조하여 답변

---

## Phase 4: 세션 종료 + 자동 Compound

### S4-1. 세션 종료 시 자동 compound
**사용자 행동:** 의미 있는 작업 후 세션 종료 (Ctrl+C 또는 /exit)
**tenetx가 하는 것 (하네스 모드):**
1. claude 프로세스 종료 감지
2. 세션이 10+ 프롬프트였으면 자동 compound 실행
3. Claude에게 "이 세션을 분석하여 패턴/솔루션을 추출해"라는 마지막 프롬프트 주입
4. 추출된 솔루션을 `~/.compound/me/solutions/`에 저장
5. USER.md 업데이트 (이 세션에서 관찰된 사용자 패턴)

**검증:**
- 사용자가 `/compound`를 치지 않아도 솔루션이 자동 축적됨
- 축적된 솔루션에 "왜"가 포함됨

**핵심 원칙:**
- **자동이어야 함** — 사용자 개입 없이 지식이 축적
- Claude가 추출기 — regex 아님
- 하네스가 세션 종료를 감지하므로 가능 (플러그인에서는 불가능했던 것)

### S4-2. 수동 compound (선택적)
**사용자 행동:** 세션 중 `/compound` 실행
**tenetx가 하는 것:**
- Claude가 세션 대화 전체를 분석하여 즉시 추출

**검증:**
- 자동 compound와 동일한 품질의 솔루션 추출

---

## Phase 5: 다음 세션

### S5-1. 세션 시작 → 이전 지식 활용
**사용자 행동:** 새 세션 시작 (`tenetx`)
**tenetx가 하는 것:**
- SessionStart hook → 세션 복구
- MCP instructions → Claude에게 compound-search 안내
- auto memory → compound 존재 인지
- FTS5에 이전 세션 기록 존재 → session-search로 검색 가능

**검증:**
- Claude가 이전 세션의 솔루션을 참조하여 답변
- "이전에 비슷한 패턴을 해결한 적이 있습니다"

### S5-2. 점진적 개선
**사용자 행동:** 여러 세션에 걸쳐 작업
**tenetx가 하는 것:**
- 매 세션 종료마다 자동 compound → 솔루션 축적
- FTS5에 세션 기록 축적 → 검색 정확도 향상
- USER.md에 사용자 패턴 축적 → 개인화 심화

**검증:**
- compound-stats에서 솔루션 수가 세션마다 증가
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
| 플러그인 전용 모드 | `tenetx` 하네스 모드가 기본. claude 직접 실행 시 hooks/MCP는 작동하되 자동 compound/FTS5는 비활성 |

---

## v4 대비 v5 변경점

| 항목 | v4 | v5 |
|------|----|----|
| 실행 방식 | `claude` (tenetx는 플러그인) | **`tenetx`** (claude를 래핑) |
| compound 축적 | 수동 (`/compound`) | **자동** (세션 종료 시) |
| 세션 검색 | 없음 | **SQLite FTS5** |
| 사용자 모델 | forge-profile.json만 | **USER.md** 추가 |
| 솔루션 검색 | 태그 매칭 (regex) | **MCP pull** (Claude 주도) |
