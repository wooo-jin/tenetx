# tenetx v5 개선 상세 설계서

> 아키텍트 + 코덱스 심층 토론 결과. 구현 시 이 문서를 기준으로.

## 구현 순서

```
4 (컨텍스트 스캔, 5줄) → 2 (보안 severity) → 5 (검색 결과) → 1 (토큰화 검색) → 3 (스킬 승격)
```

---

## 항목 1: 세션 검색 개선

### 결론
- **FTS5 불가** (node:sqlite 미지원) → 토큰화 LIKE AND 조합
- LIKE '%..%'은 인덱스 안 타지만, **월 4500 메시지 규모에서 수 ms** → 성능 문제 없음
- 앱 레이어 인버티드 인덱스는 과잉 → 보류

### 구현 명세

**session-store.ts `searchSessions()`:**
```typescript
// 쿼리를 토큰으로 분리
const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
// 토큰별 LIKE AND 조건
const conditions = tokens.map(() => 'LOWER(m.content) LIKE ?');
const params = tokens.map(t => `%${t}%`);
```

**컨텍스트 윈도우 (신규 함수):**
```typescript
function extractContextWindow(content: string, tokens: string[], windowSize = 120): string
// 첫 매칭 토큰 위치 기준 ±windowSize 자 추출
// 접두/접미 ... 표시
```

**결과 포맷 개선:**
- 날짜 + 프로젝트명 + 세션 구분자
- 세션별 그루핑 (같은 세션 메시지는 하위로)

### 한국어 처리
- 번역 사전/동의어는 보류
- 사용자가 대화에 사용한 단어와 검색어가 동일할 확률 높음

---

## 항목 2: 보안 스캔 강화

### 결론
- **SecurityPattern 공통 인터페이스** 도입 (block/warn severity)
- 기존 22개 인젝션 패턴을 severity 분류
- hermes에서 **exfiltration + obfuscation만 선별** 도입 (나머지는 false positive 과다)

### 패턴 분류

**block (즉시 차단):**
- `ignore all previous instructions` 류
- `<system>`, `<assistant>` 태그 주입
- `[INST]`, `<<SYS>>` LLM 제어 토큰
- `curl.*$(KEY|TOKEN|SECRET)` — 비밀키 유출
- `echo.*| (bash|sh|python)` — 난독화 실행

**warn (경고 후 통과):**
- `act as`, `pretend to be` — 맥락에 따라 합법적
- `base64 --decode |` — 난독화 가능성
- `cat .env` — 설정 파일 예시일 수 있음

### filterSolutionContent 개선
- 반환값: `{ verdict: 'safe'|'warn'|'block', findings: [...], sanitized: string }`
- block → 내용 제거
- warn → 경고 prefix 추가 후 통과
- MCP compound-read에서 warn 표시

---

## 항목 3: 스킬 수동 승격

### 결론
- **완전 자동 생성은 위험** → `tenetx skill promote` 수동 승격 우선
- verified/mature 솔루션만 승격 가능
- **LLM 변환 없이 단순 래핑** → `<Purpose>/<Steps>` 구조로 감싸기

### 변환 매핑

```
솔루션                   → 스킬
name                    → name
tags (상위 3개)          → triggers
context                 → <Purpose>
content                 → <Steps>
status                  → candidate (스킬 lifecycle)
```

### 스킬 Lifecycle
```
candidate → active (usage_count >= 3) → archived (미사용 30일)
```

### CLI
```bash
tenetx skill promote <solution-name>        # 승격
tenetx skill promote <name> --trigger "키워드"  # 트리거 직접 지정
tenetx skill list                           # 스킬 목록
```

### keyword-detector 통합
- `loadSkillContent()`가 이미 `~/.compound/me/skills/` 검색
- 승격된 스킬이 해당 경로에 있으면 자동 인식
- 추가 코드 변경 불필요

---

## 항목 4: 컨텍스트 파일 인젝션 스캔

### 결론
- **팩 규칙만 스캔** (trusted 매개변수로 구분)
- tenetx 자체 생성 파일 → 신뢰 (스캔 불필요)
- 사용자 직접 작성 파일 → tenetx 책임 범위 밖 (스캔 안 함)

### 구현
```typescript
// config-injector.ts loadRulesFromDir()
function loadRulesFromDir(dir: string, trusted = false): string[]
// trusted=false일 때만 filterSolutionContent 적용

// 호출부
loadRulesFromDir(ME_RULES, true)        // 개인 규칙 — 신뢰
loadRulesFromDir(packRulesDir, false)    // 팩 규칙 — 스캔
```

### 공격 벡터
가장 현실적: 악성 팩 설치 → `~/.compound/packs/*/rules/` 에 인젝션 규칙
loadRulesFromDir가 첫 줄만 추출하므로 위험도는 제한적이지만, 한 줄 인젝션도 가능

---

## 항목 5: 검색 결과 개선

### 결론
- **Claude에게 요약 위임** (도구 description에 "summarize" 지시) — 코드 1줄
- **compound-search에 content snippet 추가** — 상위 5개만 파일 읽기
- **session-search 세션별 그루핑** — 같은 세션 메시지를 묶음
- **MCP에서 claude -p 호출은 하지 않음** — latency 60초 + 재귀 호출 위험

### compound-search snippet
```typescript
// 상위 5개 결과에 대해서만 readSolution → content 첫 2줄 포함
if (i < 5) {
  const detail = readSolution(r.name, ...);
  snippet = detail.content.split('\n').slice(0, 2).join(' ').slice(0, 150);
}
```

### 도구 description 수정
```
compound-search: "...When multiple results are returned, summarize key findings."
session-search: "...When presenting results, summarize rather than listing raw results."
```
