# tenetx 사용자 여정 시나리오 v5.1

> **검증 원칙: "파일이 존재하는가"가 아니라 "데이터가 흐르는가"를 테스트한다.**
> 각 시나리오는 입력 → 처리 → 출력 → 소비의 전체 체인을 검증한다.

---

## Phase 0: 설치

### S0-1. npm 설치
```
npm i -g tenetx
```

**검증 체인:**
1. postinstall 실행됨
2. `settings.json`에 hook 절대 경로가 있다
3. `~/.claude.json`에 `tenetx-compound` MCP가 있다
4. **hook이 실제로 트리거되는가** → `claude -p`로 프롬프트 전송 → hook stdout에 JSON 응답 확인

---

## Phase 1: 사용자 성향 설정

### S1-1. 인터뷰 → 규칙 생성 → Claude 행동 변경

**검증 체인:**
1. `tenetx forge` → 인터뷰 답변
2. `~/.compound/me/forge-profile.json` 생성 (차원값 0-1)
3. `~/.claude/rules/forge-*.md` 생성
4. **Claude가 이 규칙을 실제로 따르는가** → `claude -p`로 테스트 프롬프트 → 응답이 규칙을 반영

---

## Phase 2: 프로젝트 열기

### S2-1. 프로젝트 팩트 생성 → Claude가 인식

**검증 체인:**
1. `tenetx` (또는 prepareHarness) 실행
2. `.claude/rules/project-context.md` 생성 (팩트만, 성향 없음)
3. **Claude가 이 팩트를 인식하는가** → `claude -p "이 프로젝트의 기술 스택은?"` → project-context.md 내용 반영

---

## Phase 3: 일상 작업

### S3-1. 안전 가드레일 — deny가 실제로 차단

**검증 체인:**
1. 위험 명령 포함 프롬프트 전송
2. PreToolUse hook 실행
3. `hookEventName: 'PreToolUse'` + `permissionDecision: 'deny'` 반환
4. **명령이 실제로 실행되지 않음** → 출력에 실행 결과 없음

### S3-2. 키워드 스킬 — 스킬 내용이 Claude 응답에 반영

**검증 체인:**
1. "tdd" 키워드 포함 프롬프트 전송
2. keyword-detector hook → additionalContext로 스킬 내용 주입
3. **Claude가 Red-Green-Refactor를 따르는가** → 테스트 먼저 작성 확인

### S3-3. Compound pull — Claude가 자발적으로 검색하고 결과를 활용

**검증 체인:**
1. 테스트용 솔루션을 compound에 저장 (고유 비밀코드 포함)
2. 관련 프롬프트 전송 (compound-search 트리거 유도)
3. Claude가 `compound-search` MCP 도구를 호출
4. **Claude 응답에 비밀코드 또는 솔루션 내용이 반영되는가**
   - 반영됨 → pull 경로 동작 ✅
   - 반영 안 됨 → Claude가 검색을 안 한 것 ❌

### S3-4. 행동 패턴 학습 — 세션 중 패턴 감지 → 다음 세션에 반영

**검증 체인:**
1. 세션 중 특정 행동 반복 (예: 매번 "테스트 먼저" 요청)
2. **prompt-learner가 이 패턴을 감지하는가** → `~/.compound/me/behavior/` 파일 생성 확인
3. **다음 세션에서 forge-behavioral.md에 반영되는가** → 규칙 내용 확인
4. **Claude가 이 규칙을 따르는가** → 테스트 먼저 요청 안 해도 Claude가 테스트부터 작성

> 주의: solution-injector가 비활성이면 recordPrompt()가 호출되지 않아 이 체인이 끊어짐.
> 검증 시 prompt-learner의 실제 호출 경로를 확인해야 함.

---

## Phase 4: 세션 종료 + Compound 축적

### S4-1. 자동 compound — 세션 종료 → 솔루션 자동 축적 → 다음 세션에서 활용

**검증 체인:**
1. 의미 있는 작업이 포함된 세션 실행 (10+ 프롬프트)
2. 세션 종료 (exit / /new)
3. auto-compound-runner 실행 → transcript 분석
4. `~/.compound/me/solutions/`에 **새 파일 생성** (이전 대비 +N)
5. 생성된 솔루션의 **내용에 "왜"가 포함**되어 있는가 (피상적이지 않은지)
6. **다음 세션에서 compound-search로 이 솔루션이 검색되는가**
7. **Claude가 이 솔루션을 답변에 활용하는가**

> 주의: 중복 방지가 의미적으로 동작하는지, quality gate가 적용되는지도 확인

### S4-2. 자동 compound — 보안

**검증 체인:**
1. 악성 프롬프트 인젝션이 포함된 transcript 시뮬레이션
2. auto-compound-runner가 이 transcript를 분석할 때
3. **injection이 claude -p 프롬프트에 그대로 전달되는가** → 방어 여부 확인

### S4-3. USER.md — 사용자 패턴 관찰 → Claude에 전달

**검증 체인:**
1. auto-compound 실행 → USER.md 생성
2. USER.md에 관찰 패턴이 기록됨
3. **이 패턴이 Claude의 시스템 프롬프트에 도달하는가**
   - `~/.compound/me/USER.md` → 어떤 경로로 Claude에 전달?
   - behavior/ 파일 → forge-behavioral.md → `.claude/rules/` → Claude ✅
   - USER.md 직접 → ??? (경로 불명확)
4. **다음 세션에서 Claude 응답이 관찰된 패턴을 반영하는가**

---

## Phase 5: 다음 세션

### S5-1. 축적된 지식이 실제로 활용되는가

**검증 체인:**
1. 이전 세션에서 축적된 솔루션이 있음
2. 새 세션 시작
3. 관련 주제에 대해 질문
4. **Claude가 compound-search를 호출하는가** (MCP 도구 사용 로그 확인)
5. **검색 결과를 답변에 반영하는가** (이전 세션 솔루션의 구체적 내용이 포함)

### S5-2. 스킬 승격 → 실행

**검증 체인:**
1. verified 솔루션이 있음
2. `tenetx skill promote <name>` 실행
3. `.compound/me/skills/<name>.md` 생성
4. **다음 세션에서 트리거 키워드 사용 시 이 스킬이 주입되는가**
5. **Claude가 스킬 내용을 따르는가**

> 주의: skill-injector가 hook-registry에서 비활성이면 자동 주입 안 됨.
> keyword-detector의 loadSkillContent가 이 경로를 커버하는지 확인 필요.

---

## 검증 방법론

### 표면 검증 (이전 방식 — 불충분)
```
파일이 존재하는가? → ✅
```

### 흐름 검증 (이번 방식 — 필수)
```
입력(프롬프트) → 처리(hook/compound) → 출력(파일/MCP) → 소비(Claude가 읽고 활용) → ✅
```

### 각 시나리오의 "끊어지는 지점" 체크
- hook이 트리거되는가?
- hook의 출력이 Claude에 도달하는가? (additionalContext vs systemMessage)
- 생성된 파일을 누가 읽는가? (Claude가 읽는 경로가 있는가?)
- Claude가 읽은 내용을 실제로 활용하는가?

---

## 현재 알려진 끊어진 체인

| 체인 | 끊어진 지점 | 원인 |
|------|-----------|------|
| prompt-learner → behavioral → forge-behavioral.md | recordPrompt() 미호출 | solution-injector 비활성 |
| USER.md → Claude | USER.md → ??? | Claude가 읽는 경로 없음 |
| auto-compound → quality gate | gate3 미적용 | auto-compound가 별도 경로 |
| auto-compound → injection 방어 | transcript 원문 그대로 프롬프트에 | filterSolutionContent 미적용 |
| skill promote → 자동 주입 | skill-injector 비활성 | hook-registry에 없음 |

---

## 시나리오에 없는 것 (의도적 제외)

| 제외 항목 | 이유 |
|-----------|------|
| regex 기반 자동 추출 | AI 추출로 대체 |
| 태그 매칭 push 주입 | MCP pull로 대체 (의도적 비활성) |
| Thompson Sampling / BKT | 제거됨 |
| HTML 대시보드 | 제거됨 |
| 프로젝트 스캔 → 성향 추론 | 팩트만 수집 |
