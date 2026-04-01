# tenetx E2E 시나리오 정의서

> 각 시나리오는 "실제 Claude Code 세션에서 tenetx가 의미 있는 결과를 내는가"를 검증한다.
> 검증 방법: `claude -p` (non-interactive mode)로 실제 Claude Code를 실행하여 확인.

---

## 시나리오 1: 안전 가드레일 — 위험 명령 차단

**사용자 행동**: Claude에게 `rm -rf /` 실행을 요청
**tenetx 동작**: PreToolUse hook → `checkDangerousCommand()` → `deny()` 반환
**기대 결과**: 명령이 차단되고, Claude가 위험하다고 안내
**검증 방법**: `claude -p`로 위험 명령 실행 요청 → 출력에 "blocked" 또는 "denied" 포함, 명령 미실행

---

## 시나리오 2: 안전 가드레일 — DB 위험 쿼리 차단

**사용자 행동**: Claude에게 `DROP TABLE users` 실행을 요청
**tenetx 동작**: PreToolUse hook (db-guard) → `checkDangerousSql()` → `deny()` 반환
**기대 결과**: SQL 실행이 차단됨
**검증 방법**: `claude -p`로 DROP TABLE 실행 요청 → 차단 확인

---

## 시나리오 3: 컨텍스트 주입 — 솔루션 매칭

**사용자 행동**: 프롬프트에 저장된 솔루션의 키워드가 포함된 질문
**tenetx 동작**: UserPromptSubmit hook → `matchSolutions()` → `approveWithContext()` → additionalContext로 솔루션 요약 주입
**기대 결과**: Claude가 주입된 솔루션 정보를 인식하고 활용
**검증 방법**: 테스트용 솔루션 생성 → 관련 프롬프트 → Claude 응답에 솔루션 내용 반영 여부

---

## 시나리오 4: 컨텍스트 주입 — 키워드 스킬 활성화

**사용자 행동**: 프롬프트에 매직 키워드(예: "tdd") 포함
**tenetx 동작**: UserPromptSubmit hook → keyword-detector → 스킬 파일 로딩 → `approveWithContext()` → 스킬 내용 주입
**기대 결과**: Claude가 스킬 내용을 기반으로 행동
**검증 방법**: 키워드 포함 프롬프트 → Claude 응답이 스킬 지시를 따르는지

---

## 시나리오 5: Forge — 프로젝트 스캔 → 규칙 생성

**사용자 행동**: `tenetx forge` 실행 (TypeScript + ESLint + Vitest 프로젝트에서)
**tenetx 동작**: scanner → 프로젝트 시그널 감지 → 차원 벡터 생성 → rule-tuner → `.claude/rules/forge-*.md` 파일 생성
**기대 결과**: 프로젝트 특성에 맞는 규칙 파일이 생성됨 (예: qualityFocus 높으면 TDD 권장)
**검증 방법**: 임시 프로젝트 생성 → `tenetx forge --scan-only` → 생성된 rules 파일 내용 검증

---

## 시나리오 6: Forge — 생성된 규칙이 Claude에 실제 영향

**사용자 행동**: forge로 생성된 규칙이 있는 프로젝트에서 Claude 사용
**tenetx 동작**: Claude Code가 `.claude/rules/forge-*.md`를 자동 로딩 → system prompt에 포함
**기대 결과**: Claude의 응답 스타일이 규칙에 맞게 변경됨
**검증 방법**: 특정 규칙(예: "Keep responses under 3 sentences") 설정 → `claude -p`로 질문 → 응답이 규칙을 따르는지

---

## 시나리오 7: Compound — 수동 솔루션 저장 → MCP로 조회

**사용자 행동**: `tenetx compound --solution "security-pattern"` 으로 솔루션 저장
**tenetx 동작**: solution-format으로 직렬화 → `~/.compound/me/solutions/` 저장
**기대 결과**: MCP 도구 `compound-search`로 조회 가능
**검증 방법**: 솔루션 저장 → MCP 서버 실행 → `compound-search` 호출 → 결과 반환 확인

---

## 시나리오 8: 세션 복구

**사용자 행동**: 이전 세션에서 ralph 모드 활성화 후 종료 → 새 세션 시작
**tenetx 동작**: SessionStart hook → session-recovery → 활성 모드 상태 파일 확인 → `approveWithContext()` → 복구 메시지 주입
**기대 결과**: 새 세션에서 이전 모드가 자동 복구됨
**검증 방법**: 상태 파일 수동 생성 → `claude -p` 세션 시작 → 응답에 복구 메시지 포함 여부

---

## 시나리오 9: Secret Filter — 비밀키 노출 경고

**사용자 행동**: Claude가 파일을 읽었을 때 API 키가 포함됨
**tenetx 동작**: PostToolUse hook → `detectSecrets()` → `approveWithWarning()` → UI 경고
**기대 결과**: 경고 메시지 표시 (모델에는 전달 안 됨 — UI 전용)
**검증 방법**: API 키 패턴이 포함된 파일 → hook 직접 실행 → JSON 출력에 systemMessage 포함 확인

---

## 시나리오 10: 플러그인 로딩 — plugin.json 유효성

**사용자 행동**: Claude Code가 tenetx 플러그인을 로딩
**tenetx 동작**: plugin.json 파싱 → hooks.json 로딩 → 스킬/에이전트 등록
**기대 결과**: 플러그인이 에러 없이 로딩됨
**검증 방법**: Claude Code 실행 → 에러 로그에 tenetx 관련 에러 없음 확인
