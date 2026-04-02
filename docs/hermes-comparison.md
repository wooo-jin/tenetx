# Hermes Agent vs Tenetx — 비교 분석 및 개선 로드맵

## 개요

| 항목 | tenetx | hermes-agent |
|------|--------|-------------|
| 정체성 | Claude Code 하네스 (15K줄) | 독립 에이전트 플랫폼 (run_agent.py 440KB) |
| LLM | Claude 전용 | OpenAI-compatible 모든 LLM |
| 언어 | TypeScript | Python |
| 학습 | Claude가 /compound로 추출 + USER.md 자동 | 에이전트 자율 스킬 생성 + RL 훈련 |
| 메모리 | compound MCP + USER.md + SQLite | MEMORY.md + USER.md + SQLite FTS5 + Honcho |
| 플랫폼 | CLI (Claude Code) | 14개 (Telegram, Discord, Slack...) |

## tenetx의 강점 (hermes 대비)

1. **경량** — Claude Code가 무거운 일을 담당, tenetx는 설정/후크/지식 관리만
2. **투명한 개인화** — 차원 벡터 → 규칙 파일이 보이고 편집 가능
3. **hooks 시스템** — Claude Code 이벤트에 프로그래밍 가능한 개입
4. **프롬프트 인젝션 방어** — NFKC 정규화 + 제로 폭 문자 제거 (hermes와 동등)

## hermes에서 배울 수 있는 개선점

### 우선순위 1: FTS5 세션 검색 (난이도: 낮음, 효과: 높음)

**현재**: `WHERE content LIKE '%query%'` — 연속 문자열만 매칭
**목표**: `WHERE messages_fts MATCH 'query'` — 토큰 기반 전문 검색

hermes 참고: `tools/session_search_tool.py:279-286`
- FTS5로 50건 검색 → 세션별 그루핑 → LLM 요약

tenetx 적용:
```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(content);
-- 검색: SELECT * FROM messages_fts WHERE messages_fts MATCH ?;
```

### 우선순위 2: 솔루션 콘텐츠 보안 스캔 (난이도: 낮음, 효과: 중간)

**현재**: 프롬프트 인젝션만 감지 (22개 패턴)
**목표**: exfiltration, destructive, persistence 패턴도 감지

hermes 참고: `tools/skills_guard.py:82-196` — 80+ 위협 패턴, 6개 카테고리

tenetx 적용: `prompt-injection-filter.ts`에 추가
- `curl.*\$.*KEY`, `cat.*\.env`, `rm -rf /`
- compound 솔루션 주입 전 검사

### 우선순위 3: 에이전트 주도 스킬 생성 (난이도: 중간, 효과: 높음)

**현재**: `compound --solution` → 선언적 지식 (패턴 설명)
**목표**: `.claude/skills/` → 절차적 지식 (재실행 가능한 워크플로우)

hermes 참고: `tools/skill_manager_tool.py:279-333`
- 에이전트가 5+ 도구 호출 후 자율적으로 SKILL.md 생성
- 보안 스캔 후 차단 시 롤백

tenetx 적용:
- auto-compound-runner에 "스킬 후보 생성" 로직 추가
- 복잡한 작업 완료 후 `.compound/me/skills/` 에 SKILL.md 자동 생성
- solution(선언적) + skill(절차적) 이중 축적

### 우선순위 4: 컨텍스트 파일 인젝션 스캔 (난이도: 낮음, 효과: 중간)

hermes 참고: `agent/prompt_builder.py:36-73`
- AGENTS.md, .cursorrules 등 외부 파일에서 인젝션 탐지
- 발견 시 "[BLOCKED]"로 대체

tenetx 적용: `.claude/rules/*.md` 로딩 시 `filterSolutionContent()` 적용

### 우선순위 5: 검색 결과 LLM 요약 (난이도: 중간, 효과: 중간)

hermes 참고: `tools/session_search_tool.py:125-172`
- Gemini Flash 등 보조 LLM으로 세션별 요약
- 비동기 병렬 처리

tenetx 적용: MCP session-search에서 `claude -p`로 결과 정제

### 우선순위 6: 스킬 허브 (난이도: 높음, 효과: 높음, 중장기)

hermes 참고: `tools/skills_hub.py:252-298`
- GitHub Contents API 기반 원격 스킬 소스
- agentskills.io 오픈 표준 호환
- 보안 스캔 필수

tenetx 적용: `tenetx hub search/install` CLI

## 적용하지 않는 것

| hermes 기능 | 이유 |
|-------------|------|
| RL 훈련 파이프라인 | Claude Code 위에서는 모델 훈련 불가 |
| 14개 플랫폼 게이트웨이 | tenetx는 CLI 전용, 플랫폼 확장은 범위 밖 |
| Honcho 외부 API | 외부 의존성 + 비용. USER.md 로컬 방식이 충분 |
| 서브에이전트 위임 | Claude Code 자체 SubAgent가 더 적합 |
| 자체 에이전트 루프 | Claude Code가 이미 제공 |
