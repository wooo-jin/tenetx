# Compound Engine v3 — Design Specification

> v2 비판 반영: 아키텍처적 제약을 수용한 현실적 설계
> Status: Design Phase | Date: 2026-03-24

---

## v2 → v3 핵심 변경

| v2 (폐기) | v3 | 이유 |
|----------|-----|------|
| Explicit Tagging ([compound:name:used]) | Code Reflection (PreToolUse에서 코드 분석) | Claude 텍스트 응답을 볼 수 있는 훅이 없음 |
| PostToolUse에서 채택 감지 | PreToolUse에서 코드 반영 감지 + PostToolUse에서 부정 신호 | PostToolUse는 도구 출력만 봄, Claude 텍스트 불가 |
| Session-hints (pre-compact) | Pre-compact 정보 메시지만 (강제 불가) | Hook은 정보성 메시지만 반환 가능, Claude에 행동 강제 불가 |
| Lazy Extraction (session log + hints) | Git-diff 기반 추출 (git diff + git log + modified-files) | Session log에 대화 내용 없음, hints 인프라 없음 |
| 한국어 2글자 필터링 | 한글은 1글자 초과로 변경 | "에러", "배포", "인증" 등 유의미한 2글자 단어 보존 |

---

## 1. Architecture (Lab 통합 — 변경 없음)

v2와 동일: Compound 이벤트를 Lab 시스템에 추가.

```typescript
// lab/types.ts에 추가
type LabEventType =
  | 'agent-call' | 'skill-invocation' | 'hook-trigger'
  | 'mode-activation' | 'routing-decision' | 'user-override'
  | 'session-metrics' | 'synthesis' | 'auto-evolve'
  // compound 이벤트
  | 'compound-injected'    // 솔루션 주입됨
  | 'compound-reflected'   // 코드에 솔루션 반영 감지
  | 'compound-negative'    // 부정 신호
  | 'compound-extracted'   // 새 솔루션 추출됨
  | 'compound-promoted'    // 승격
  | 'compound-demoted';    // 강등
```

참고: 콜론(`:`) 대신 하이픈(`-`)으로 변경 — TypeScript 유니온 호환.

---

## 2. Adoption Tracking v3: Code Reflection

### 핵심 원리

Claude의 텍스트 응답은 볼 수 없지만, **Claude가 호출하는 도구의 파라미터는 볼 수 있다.**
Claude가 Edit/Write를 호출할 때 `tool_input`에 작성할 코드가 포함된다.

### Solution Key Identifiers

솔루션 저장 시 tags 외에 `identifiers` 필드를 추가한다.
이것은 해당 솔루션이 반영되었을 때 코드에 나타날 **구체적 식별자**다.

```yaml
---
name: react-error-boundary
tags: [react, error, boundary, api]
identifiers: [ErrorBoundary, componentDidCatch, getDerivedStateFromError]
---
```

- tags: 매칭(주입 결정)에 사용
- identifiers: 반영 감지에 사용 (더 구체적)

### 감지 흐름

```
1. UserPromptSubmit: solution-injector가 솔루션 3개 주입
   → 주입된 솔루션의 identifiers를 세션 메모리에 기록
   → Lab 이벤트: compound-injected

2. PreToolUse: Edit/Write 도구 호출 감지
   → tool_input의 new_string/content에서 identifiers 검색
   → 매칭된 솔루션이 있으면:
     → Lab 이벤트: compound-reflected
     → 해당 솔루션의 evidence.reflected += 1

3. PostToolUse: Bash 도구 실행 후
   → tool_response에 에러 패턴 감지 (exit code != 0, "error", "fail")
   → 최근 5턴 내 주입된 솔루션에 부정 신호:
     → Lab 이벤트: compound-negative
     → 해당 솔루션의 evidence.negative += 1
```

### 귀속 (Attribution) 문제 해결

3개 솔루션 동시 주입 시 빌드 실패하면 누구 탓인가?

```
규칙:
1. experiment 솔루션은 회당 최대 1개만 주입
2. 부정 신호 발생 시:
   - experiment 솔루션 → 전체 귀속 (confidence -0.3)
   - candidate 솔루션 → 약한 귀속 (confidence -0.1)
   - verified+ 솔루션 → 귀속 안 함 (이미 검증됨)
3. 코드 반영 감지된 솔루션만 귀속 대상
   - 반영 안 된 솔루션은 빌드 실패와 무관
```

### Passive Positive vs Code Reflection 비교

```
Passive Positive (v2, 폐기):
  무시해도 "채택" → 거짓 긍정 다수
  모든 솔루션이 서서히 승격 → 노이즈 누적

Code Reflection (v3):
  코드에 실제로 identifiers가 나타나야 "반영"
  무시하면 카운트 안 됨
  구체적 식별자이므로 오탐 낮음

한계:
  decision/troubleshoot 유형은 코드에 식별자가 안 나타날 수 있음
  → 이 유형은 re-extraction을 긍정 신호로 사용 (Section 5)
```

---

## 3. Solution Format v3

```yaml
---
name: react-error-boundary
version: 2
status: candidate        # experiment | candidate | verified | mature | retired
confidence: 0.55
type: pattern            # pattern | decision | troubleshoot | anti-pattern
scope: me                # me | project
tags: [react, error, boundary, api, centralized]
identifiers: [ErrorBoundary, componentDidCatch, getDerivedStateFromError]
evidence:
  injected: 12
  reflected: 5           # PreToolUse에서 코드 반영 감지 횟수
  negative: 0
  sessions: 3
  reExtracted: 1         # 다른 세션에서 동일 패턴 재추출 횟수
created: 2026-03-20
updated: 2026-03-24
supersedes: null
extractedBy: auto        # auto | manual
---

## Context
React 프로젝트에서 API 호출 에러를 일관되게 처리할 때

## Content
ErrorBoundary 컴포넌트를 루트에 배치하고...
```

### type별 identifiers 전략

| type | identifiers 예시 | 반영 감지 |
|------|-----------------|----------|
| pattern | 클래스명, 함수명, API 호출 | PreToolUse 코드 분석 |
| decision | 패키지명, 설정 키 | PreToolUse (import문, config) |
| troubleshoot | 에러 메시지, 설정 값 | PreToolUse + PostToolUse |
| anti-pattern | (피해야 할 패턴) | 역감지: 나타나면 부정 |

anti-pattern의 identifiers는 **역방향**: 코드에 나타나면 솔루션이 무시된 것.

### YAML 파싱

- 의존성: `js-yaml` 추가 (또는 간단한 YAML frontmatter 파서 직접 구현)
- frontmatter는 `---` 구분자 사이만 파싱하면 되므로 경량 구현 가능

### v1 → v3 마이그레이션

```typescript
function migrateSolution(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');

  // v3 포맷 감지 (YAML frontmatter)
  if (content.startsWith('---')) return; // 이미 v3

  // v1 포맷: "# 제목\n> Type: ...\n> Scope: ..."
  const title = content.match(/^#\s+(.+)/)?.[1] ?? path.basename(filePath, '.md');
  const type = content.match(/>\s*Type:\s*(\w+)/)?.[1] ?? 'pattern';
  const scope = content.match(/>\s*Scope:\s*(\w+)/)?.[1] ?? 'me';
  const body = content.replace(/^#.+\n(>.*\n)*/m, '').trim();

  const v3Content = `---
name: ${slugify(title)}
version: 1
status: candidate
confidence: 0.5
type: ${type}
scope: ${scope}
tags: ${JSON.stringify(extractTags(title + ' ' + body))}
identifiers: []
evidence:
  injected: 0
  reflected: 0
  negative: 0
  sessions: 0
  reExtracted: 0
created: ${new Date().toISOString().split('T')[0]}
updated: ${new Date().toISOString().split('T')[0]}
supersedes: null
extractedBy: manual
---

## Context
(migrated from v1 — context not available)

## Content
${body}
`;

  fs.writeFileSync(filePath, v3Content);
}
```

마이그레이션은 `tenetx init` 또는 첫 세션 시작 시 자동 실행.

---

## 4. Extraction Engine v3

### 입력 데이터 (현실적)

사용 가능한 데이터만:
1. `git diff --stat HEAD~N` — 변경 파일 목록
2. `git diff HEAD~N` — 실제 코드 변경
3. `git log --oneline -N` — 커밋 메시지
4. `~/.compound/state/modified-files-{sessionId}.json` — 세션 중 수정된 파일 추적

사용 불가능 (v2에서 제거):
- ~~session-hints~~ (인프라 없음)
- ~~대화 요약~~ (session-logger에 없음)

### 추출 트리거: SessionStart Lazy Extraction

```
다음 세션 시작
    ↓
SessionStart 훅:
  1. ~/.compound/state/last-extraction.json에서 마지막 추출 커밋 SHA 확인
  2. git log --oneline {lastSHA}..HEAD로 새 커밋 확인
  3. 변경량이 Gate 0 기준을 넘는가?
     ↓ (yes)
  4. 백그라운드에서 추출 실행 (사용자 작업 차단 없음)
  5. 추출 완료 후 last-extraction.json 업데이트
```

### 추출 상태 파일

```json
// ~/.compound/state/last-extraction.json
{
  "lastCommitSha": "abc1234",
  "lastExtractedAt": "2026-03-24T10:00:00Z",
  "extractionsToday": 2
}
```

### Gate 0: 추출 가치 판단

```
git diff --stat HEAD~N 분석:
  - 변경 파일 3개 미만 AND 변경 줄 30줄 미만 → SKIP
  - 변경이 .md/.json 설정 파일만 → SKIP
  - 코드 파일(.ts, .tsx, .py, .rs 등) 변경 있음 → PROCEED
```

### 추출 프롬프트 (git diff 기반)

```
아래 git diff와 커밋 메시지를 분석하여 재사용 가능한 코딩 패턴을 추출하세요.

추출 기준:
- 다른 프로젝트에서도 적용 가능한 구조적 패턴만
- 프로젝트 고유 로직(비즈니스 로직, 특정 API 엔드포인트)은 제외
- 일회성 수정, 타이포 수정, 설정 변경은 제외
- 추출할 것이 없으면 반드시 빈 배열 [] 반환

각 솔루션:
{
  "name": "kebab-case",
  "type": "pattern|decision|troubleshoot|anti-pattern",
  "tags": ["최대 5개"],
  "identifiers": ["코드에 나타날 구체적 클래스/함수/API명, 4글자 이상, import문 포함"],
  "context": "적용 상황 1줄",
  "content": "실행 가능한 내용 (최대 500자)"
}

--- Git Log ---
$GIT_LOG

--- Git Diff ---
$GIT_DIFF (최대 3000자로 truncate)
```

### 추출 모델

- 기본: Haiku (비용 최소화, $0.80/1M input)
- 복잡한 diff (>1000줄): Sonnet으로 에스컬레이션
- 비용 상한: 세션당 추출 1회, 일일 최대 5회

### Quality Gates (v2와 동일 + 강화)

```
Gate 1: 구조 검증
  - name 비어있음 → 거부
  - tags 0개 → 거부
  - content 50자 미만 → 거부
  - identifiers 0개 (pattern/troubleshoot type) → 경고 (저장은 함)

Gate 2: 독성 필터 (blocklist.json)
  - @ts-ignore, any-cast, --force, --no-verify
  - eslint-disable, TODO, FIXME, HACK
  - 절대 경로, 시크릿 패턴

Gate 3: 중복/모순 검사
  - 기존 솔루션과 tags 70%+ 겹침 → 버전 업데이트
  - 동일 tags + 반대 identifiers → 모순 플래그

Gate 4: 재추출 검증 (NEW)
  - 기존 솔루션과 tags 70%+ 겹침 + 기존이 experiment
  → 중복이 아니라 "재추출" = 긍정 신호
  → 기존 솔루션의 evidence.reExtracted += 1
  → 새 추출은 저장하지 않음 (기존 것을 강화)
```

---

## 5. Lifecycle v3

### 승격/강등 (Lab pattern-detector 규칙)

```
experiment (0.3) → candidate (0.6):
  조건 A: reflected >= 2 AND negative == 0 AND sessions >= 2
  조건 B: reExtracted >= 1 AND negative == 0
  (A 또는 B 충족 시 승격)

candidate (0.6) → verified (0.8):
  조건 A: reflected >= 4 AND negative == 0 AND sessions >= 3
  조건 B: reExtracted >= 2 AND negative == 0
  (A 또는 B 충족 시 승격)

verified (0.8) → mature (0.85):
  reflected >= 8 AND negative <= 1 AND sessions >= 5
  AND verified 상태로 30일 이상 유지

강등:
  negative 1회 → confidence -= 0.3
  negative 연속 2회 → status → experiment, confidence = 0.1
  circuit breaker: experiment에서 negative 2회 → retired (완전 폐기)

stale:
  90일간 injected == 0 → retired

수동 추출:
  candidate (0.5) 시작
  reflected 1회 → verified (수동은 빠른 경로)
```

### type별 승격 전략

```
pattern, troubleshoot:
  → identifiers가 있으므로 code reflection 기반 (조건 A 위주)

decision:
  → identifiers를 import문까지 확장: import ... from 'zustand' 감지
  → 추가 승격 경로 C: 수동 검증 `tenetx compound verify <name>`
    → 즉시 verified로 승격 (사용자가 유효성을 직접 확인)
  → re-extraction은 보조 경로 (B)
  → 예: "Zustand 선택" → import 'zustand' 감지 또는 재추출

anti-pattern:
  → 역감지: identifiers가 코드에 나타나면 negative
  → identifiers가 안 나타나면 reflected (올바르게 회피)
```

### confidence-status 정합성 규칙

```
confidence가 status 하한 아래로 떨어지면 자동 강등:
  mature(0.85): confidence < 0.75 → verified로 강등
  verified(0.8): confidence < 0.5 → candidate로 강등
  candidate(0.6): confidence < 0.2 → experiment로 강등
  experiment(0.3): confidence < 0.05 → retired
```

---

## 6. Injection Engine v3

### 매칭: Frontmatter tags 기반

```typescript
function matchSolutions(prompt: string, solutions: Solution[]): ScoredSolution[] {
  const promptTags = extractTags(prompt); // 한글 1글자초과, 영문 2글자초과

  return solutions
    .filter(s => s.status !== 'retired')
    .map(s => {
      const intersection = s.tags.filter(t => promptTags.includes(t));
      const relevance = intersection.length / Math.max(s.tags.length, 1);
      const score = relevance * s.confidence;
      return { ...s, score, matchedTags: intersection };
    })
    .filter(s => s.matchedTags.length >= 2) // 최소 2개 태그 매칭
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // 상위 3개
}
```

### extractTags 한국어 수정

```typescript
function extractTags(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^가-힣a-z0-9\s]/g, ' ')
    .split(/\s+/);

  return [...new Set(words.filter(w => {
    // 한글: 1글자 초과 (2글자 이상 보존: 에러, 배포, 인증)
    if (/[가-힣]/.test(w)) return w.length > 1;
    // 영문: 2글자 초과
    return w.length > 2;
  }))];
}
```

### 주입 제한

```
verified/mature: 최대 2개/회
candidate: 최대 1개/회
experiment: 최대 1개/회 (attribution 명확화)
→ 총 최대 4개/회 (하지만 보통 2-3개)

세션당 총 주입: 최대 10개
솔루션당 최대 길이: 1500자
```

### 주입 형식

```xml
<compound-solution name="react-error-boundary"
                   status="verified" confidence="0.82"
                   type="pattern"
                   evidence="reflected:8 negative:0 sessions:5">

Context: React 프로젝트에서 API 호출 에러를 일관되게 처리할 때

Content:
ErrorBoundary 컴포넌트를 루트에 배치하고...

</compound-solution>
```

v2의 `(이 솔루션을 참고했다면: [compound:name:used])` 제거.
→ Claude에 메타 작업 요청 불필요. PreToolUse가 코드에서 자동 감지.

---

## 7. Safety Mechanisms (v2 + 강화)

### 독성 필터 (blocklist.json)

```json
{
  "codePatterns": [
    "@ts-ignore", "@ts-nocheck", "as any", "as unknown as",
    "--force", "--no-verify", "--skip-ci",
    "eslint-disable", "prettier-ignore", "noqa",
    "TODO:", "FIXME:", "HACK:", "XXX:"
  ],
  "uncertaintyPatterns": [
    "임시", "나중에", "일단", "잘 모르겠",
    "maybe", "probably", "not sure", "hack"
  ],
  "secretPatterns": [
    "\\.env", "\\.pem", "\\.key",
    "password", "api[_-]?key", "token\\s*=",
    "secret", "credential"
  ],
  "pathPatterns": [
    "/Users/", "/home/", "C:\\\\Users"
  ]
}
```

### Circuit Breaker

```
experiment에서 negative 2회 → retired (완전 폐기)
candidate에서 negative 연속 2회 → experiment로 강등
verified에서 negative 연속 3회 → candidate로 강등

모든 강등/폐기 시:
  Lab 이벤트: compound-demoted
  tenetx me에 경고 표시
```

### 모순 감지

```
새 솔루션 tags: [react, state, zustand, global]
기존 솔루션 tags: [react, state, redux, global]

tags 겹침 = 3/4 = 75% > 70%

모순 판단: tags는 겹치지만 identifiers가 완전히 다름
  새: [useStore, create, zustand]
  기존: [createStore, combineReducers, redux]
  → identifiers 겹침 = 0% → 모순 가능성 높음

조치:
  1. 둘 다 저장 유지 (경쟁)
  2. contradiction 필드에 상대방 name 기록
  3. tenetx me에 "⚠ 모순: use-zustand vs use-redux" 경고
  4. 두 솔루션 중 reflected가 높은 쪽이 자연스럽게 승격
```

### 롤백

```bash
tenetx compound rollback --since 2026-03-20  # 날짜 이후 자동 추출 제거
tenetx compound remove <name>                 # 특정 솔루션 삭제
tenetx compound pause-auto                    # 자동 추출 중단
tenetx compound resume-auto                   # 자동 추출 재개
tenetx compound list                          # 전체 솔루션 목록 + 상태
tenetx compound inspect <name>                # 솔루션 상세 (evidence 포함)
```

---

## 8. Observable Intelligence

### tenetx me

```
$ tenetx me

 Compound: Me(47)
 ├─ mature:     4 (avg confidence: 0.91)
 ├─ verified:   8 (avg confidence: 0.82)
 ├─ candidate:  5 (avg confidence: 0.55)
 ├─ experiment: 3 (trending: 2↑ 1→)
 └─ retired:    7

 This Week:
 ├─ Injected: 34 | Reflected: 21 (62%)
 ├─ Negative: 1 (build fail → 'css-grid-layout')
 ├─ Extracted: 4 new (3 auto, 1 manual)
 └─ Re-extracted: 2 (validated existing solutions)

 Promotions:
 ├─ 'react-error-boundary' → mature (reflected 12x, sessions 8)
 └─ 'api-retry-pattern' → verified (re-extracted 3x)

 Warnings:
 └─ ⚠ Contradiction: 'use-zustand' vs 'use-redux'
```

---

## 9. Implementation Priority

```
Phase 1: Foundation
  ├─ js-yaml 의존성 추가 (또는 경량 frontmatter 파서)
  ├─ Solution Format v3 (YAML frontmatter + identifiers)
  ├─ v1 → v3 마이그레이션 함수
  ├─ LabEventType에 compound 이벤트 6개 추가
  ├─ extractTags 한국어 수정 (1글자 초과)
  └─ solution-matcher를 tags 기반으로 변경

Phase 2: Injection + Code Reflection
  ├─ solution-injector: frontmatter 기반 매칭
  ├─ PreToolUse: code reflection 감지 (identifiers 매칭)
  ├─ PostToolUse: 부정 신호 감지 (에러 패턴)
  ├─ Lab 이벤트 기록 (injected, reflected, negative)
  └─ evidence 업데이트 (솔루션 파일 수정)

Phase 3: Extraction
  ├─ SessionStart lazy extraction
  ├─ Gate 0-4 구현
  ├─ Haiku 기반 추출 프롬프트
  ├─ blocklist.json 독성 필터
  └─ tenetx compound pause-auto / resume-auto

Phase 4: Lifecycle
  ├─ pattern-detector에 compound 규칙 추가
  ├─ 승격/강등 로직
  ├─ Circuit breaker
  ├─ 모순 감지
  └─ 버전 관리 (supersedes 체인)

Phase 5: Observability + Sharing
  ├─ tenetx me 대시보드
  ├─ tenetx compound list/inspect/remove/rollback
  ├─ tenetx pack publish (verified+ 필터)
  └─ 마켓플레이스 보안 (Gate 2 + checksum)
```

---

## 10. v2 비판 대응 매핑

| # | v2 비판 | 심각도 | v3 대응 | 해결 여부 |
|---|--------|--------|---------|----------|
| 1 | Claude 텍스트 응답 볼 수 없음 | FATAL | PreToolUse의 tool_input에서 코드 분석 (Code Reflection) | 해결 |
| 2 | session-hints 미존재 | FATAL | hints 의존 제거, git diff + git log만으로 추출 | 해결 |
| 3 | LabEventType 비호환 | SERIOUS | 콜론→하이픈 변경, 유니온에 직접 추가 | 해결 |
| 4 | YAML 파서 없음 + v1 마이그레이션 | SERIOUS | js-yaml 추가 + 마이그레이션 함수 명세 | 해결 |
| 5 | 한국어 2글자 필터링 | SERIOUS | 한글 1글자 초과로 변경 | 해결 |
| 6 | 3개 솔루션 귀속 불가 | SERIOUS | experiment 1개/회 + 반영 감지된 것만 귀속 | 해결 |
| 7 | Claude 아첨으로 태그 남발 | SERIOUS | Explicit Tagging 폐기, 코드 반영으로 전환 | 해결 |
| 8 | CompoundInsight 인터페이스 불일치 | SERIOUS | 새 SolutionV3 인터페이스 정의 (마이그레이션 포함) | 해결 |
| 9 | 모순 감지 알고리즘 미정의 | MODERATE | tags 겹침 + identifiers 불일치로 판단 | 해결 |
| 10 | 구현 복잡도 과소평가 | MODERATE | 5 Phase 분리, Phase 1은 포맷+타입만 | 부분 해결 |
| 11 | "무관 주입" 논리 허점 | MODERATE | reflected도 negative도 아님 → injected만 증가 (카운트 제외) | 해결 |
| 12 | 1500자 truncate 문제 | MINOR | type=troubleshoot는 2000자로 확장 | 해결 |
| 13 | supersedes 복원 루프 | MINOR | 복원은 최대 1회, 2회째 재추출 시 새 솔루션으로 취급 | 해결 |

---

## 11. 알려진 한계 (Known Limitations)

### Code Reflection의 한계
- Edit 도구는 부분 교체(new_string)만 포함하므로 전체 파일 대비 recall이 낮을 수 있음
  → Write 도구(전체 파일)에서의 매칭을 우선 경로로 활용
- decision 유형은 코드 반영이 약함
  → import문 감지 + 수동 verify 명령 + re-extraction 3중 경로로 보완
- 짧은 identifiers ("use", "get")는 오탐 가능
  → identifiers는 최소 4글자 이상으로 제한 (추출 프롬프트 + Gate 1에서 검증)

### 세션 메모리 (identifiers 캐시)

주입된 솔루션의 identifiers를 세션 내에서 추적:

```json
// ~/.compound/state/injection-cache-{sessionId}.json
{
  "injectedSolutions": [
    {
      "name": "react-error-boundary",
      "identifiers": ["ErrorBoundary", "componentDidCatch"],
      "injectedAt": "2026-03-24T10:05:00Z",
      "status": "experiment"
    }
  ],
  "updatedAt": "2026-03-24T10:05:00Z"
}
```

PreToolUse가 이 캐시를 읽어 identifiers를 검색한다.

### Git Diff 기반 추출의 한계
- 대화에서 논의된 "왜" (결정 근거)는 추출 불가
  → decision 유형의 context 필드는 diff에서 추론 가능한 범위로 한정
  → 상세한 결정 근거는 수동 /compound로 보완

### 비용
- SessionStart마다 Haiku 호출 (추출 대상 있을 때만)
  → 일일 최대 5회, Haiku 기준 약 $0.01/일
  → tenetx compound pause-auto로 비용 절약 가능

### 마켓플레이스 보안
- 악의적 팩의 솔루션이 Gate 2를 우회할 수 있음
  → 프롬프트 인젝션 패턴 차단 추가 필요 (Phase 5에서 강화)

---

## 12. Implementation Caveats (비판 라운드에서 도출)

### 설계 검증 이력
- v1: 설계만 존재, 구현 없음 → REJECTED
- v2: Explicit Tagging 방식 → REJECTED (Claude 텍스트 응답 볼 수 없는 FATAL)
- v3 Round 1: ACCEPTABLE (조건부) — 5개 조건 제시
- v3 Round 2: APPROVED — 조건 모두 해결 확인

### 구현 시 반드시 확인할 사항

1. **Gate 1에 identifier 길이 검증 구현**
   추출 프롬프트에서 "4글자 이상"을 지시해도 LLM이 무시할 수 있음.
   Gate 1 코드에서 `identifier.length < 4`인 항목을 필터링 필수.

2. **Auto-extraction 초기 confidence = 0.3**
   v2의 0.2에서 변경됨. 코드에서 상수로 선언 시 확인 필요.
   수동 추출은 candidate(0.5), auto는 experiment(0.3).

3. **injection-cache와 solution-cache는 별개 파일**
   - `solution-cache-{sessionId}.json`: 중복 주입 방지 (기존)
   - `injection-cache-{sessionId}.json`: identifier 추적 (신규)
   목적이 다르므로 병합하지 않음.

4. **Lab 이벤트 기록 함수 참조**
   설계에서 LabEventType 추가만 명시. 실제 이벤트 기록은
   `lab/tracker.ts`의 `track()` 함수 패턴을 따를 것.

### 설계 결정의 근거 (왜 이렇게 했는가)

| 결정 | 대안 | 선택 이유 |
|------|------|----------|
| Code Reflection (PreToolUse) | Explicit Tagging (PostToolUse) | Claude 텍스트 응답을 볼 수 있는 훅이 없음. PreToolUse만 tool_input 접근 가능 |
| Git-diff 기반 추출 | Session log + hints | Session log에 대화 내용 없음, hints 인프라 없음. Git은 항상 존재 |
| Lab 통합 (이벤트 추가) | 별도 Feedback Engine | Lab에 이벤트/패턴/스코어러가 이미 있음. 중복 구축은 낭비 |
| YAML frontmatter | 별도 DB/JSON | .md 파일 유지 = 사람이 읽기 쉬움, git 추적 가능, 기존 솔루션과 호환 |
| experiment 1개/회 제한 | 무제한 주입 | 빌드 실패 시 귀속(attribution) 명확화. 검증 안 된 것은 1개만 |
| re-extraction = 긍정 | 채택 횟수만 사용 | decision 유형은 코드 반영이 불가. 반복 추출이 패턴 유효성의 증거 |
| 수동 verify 명령 | 자동 승격만 | decision 유형의 자동 승격이 비현실적. 사용자 판단이 가장 정확 |
| 하이픈 이벤트명 (compound-injected) | 콜론 (compound:injected) | LabEventType이 string literal union. 콜론은 관례에 어긋남 |
| 한글 1글자 초과 필터 | 2글자 초과 (기존) | "에러", "배포", "인증" 등 한글 2글자 단어가 유의미 |
| Haiku 모델 추출 | Opus/Sonnet | 비용 최소화 ($0.01/일). diff 분석은 Haiku로 충분 |
