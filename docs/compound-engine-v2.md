# Compound Engine v2 — Design Specification

> Auto-learning system that extracts, validates, and shares coding patterns
> Status: Design Phase | Date: 2026-03-24

---

## 1. Overview

Compound Engine은 코딩 세션에서 재사용 가능한 지식을 자동 추출하고,
다중 신호 기반 생애주기로 검증한 뒤, 마켓플레이스에서 공유하는 시스템이다.

### v1 → v2 변경 사항

| 영역 | v1 (폐기) | v2 |
|------|----------|-----|
| 채택 측정 | Passive Positive (부정 없음=채택) | Explicit Tagging ([compound:name:used]) |
| 피드백 인프라 | 별도 Feedback Engine | Lab 시스템 통합 (이벤트 추가) |
| 추출 트리거 | Pre-compact (토큰 부족 위험) | Session-end + Lazy Extraction |
| 솔루션 포맷 | 단순 .md | YAML frontmatter (version, status, evidence) |
| 매칭 | 전체 내용 키워드 substring | Frontmatter tags 기반 정확 매칭 |
| 버전 관리 | 없음 (파일명 중복이면 skip) | version + supersedes 체인 |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│                    Lab System                    │
│  (events, pattern-detector, auto-learn, scorer)  │
│                                                  │
│  + compound:injected                             │
│  + compound:referenced                           │
│  + compound:negative                             │
│  + compound:extracted                            │
│  + compound:promoted                             │
│  + compound:demoted                              │
└──────────────┬───────────────┬──────────────────┘
               │               │
      ┌────────┴───┐    ┌─────┴──────┐
      │  Extraction │    │  Injection  │
      │  (추출)     │    │  (주입)     │
      └────────┬───┘    └─────┬──────┘
               │               │
               └───────┬───────┘
                       │
              ┌────────┴────────┐
              │  Solution Store  │
              │  (YAML .md)     │
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              │   Marketplace    │
              │   (Pack 공유)    │
              └─────────────────┘
```

별도 "Feedback Engine", "Lifecycle Engine"을 만들지 않는다.
Lab의 기존 인프라(이벤트 → 패턴 감지 → 자동 학습)가 compound 데이터를 함께 처리한다.

---

## 3. Solution Format v2

```markdown
---
name: react-error-boundary
version: 2
status: candidate        # experiment | candidate | verified | mature | retired
confidence: 0.55         # 0.0 - 1.0
type: pattern            # pattern | decision | troubleshoot | anti-pattern
scope: me                # me | project
tags: [react, error, boundary, api, centralized]
evidence:
  injected: 12           # 주입 횟수
  referenced: 5          # [compound:name:used] 감지 횟수
  negative: 0            # 부정 신호 횟수
  sessions: 3            # 채택된 고유 세션 수
created: 2026-03-20
updated: 2026-03-24
supersedes: null         # 이전 버전 name (대체 시)
extractedBy: auto        # auto | manual
---

## Context
React 프로젝트에서 API 호출 에러를 일관되게 처리할 때

## Content
ErrorBoundary 컴포넌트를 루트에 배치하고...
```

### Status 전이

```
experiment (0.2) → candidate (0.5) → verified (0.8) → mature (0.8+)
                                                            ↓
                                                     stale (90일 미매칭)
                                                            ↓
                                                       retired
```

### 버전 업데이트

동일 주제의 새 솔루션 추출 시 (태그 70% 이상 겹침):
1. 기존 솔루션 → status: retired (삭제하지 않음)
2. 새 솔루션 → version: N+1, supersedes: 기존 name
3. 새 것이 verified 도달 전에 폐기되면 → 기존 것 복원

---

## 4. Extraction Engine

### 트리거: Lazy Extraction (다음 세션 시작 시)

Pre-compact 시점의 토큰 부족 문제를 회피한다.

```
세션 N 작업 중
    ↓
Pre-compact 훅: 추출하지 않음
  → 대신 session-hints 메모만 저장
  → { significantChanges: true, errorResolved: true, ... }
    ↓
세션 N 종료
  → session-logger.finalize() → session log 저장
    ↓
세션 N+1 시작
    ↓
SessionStart 훅: "미처리 세션이 있나?"
    ↓ (있으면)
백그라운드 추출:
  Input:
    - git log --since="마지막 추출 시점"
    - git diff (변경 내용)
    - session log (대화 요약)
    - session-hints (pre-compact 메모)
  Process:
    - Haiku 모델로 경량 분석 (비용 최소화)
    - 구조화된 추출 프롬프트 사용
  Output:
    - 0~3개 솔루션 draft
```

### 추출 프롬프트

```xml
<compound-extraction>
아래 세션 데이터를 분석하여 재사용 가능한 지식을 추출하세요.

추출 기준:
- 다른 프로젝트/세션에서도 적용 가능한 것만
- 일회성 우회/핫픽스는 절대 추출하지 마세요
- 추출할 것이 없으면 반드시 "NONE"을 반환

유형:
- pattern: 반복 가능한 코드/설계 패턴
- decision: 기술 선택의 근거
- troubleshoot: 에러 → 원인 → 해결
- anti-pattern: 피해야 할 접근법

출력 형식 (JSON):
[{
  "name": "kebab-case-이름",
  "type": "pattern|decision|troubleshoot|anti-pattern",
  "scope": "me|project",
  "tags": ["최대", "5개", "구체적", "태그"],
  "context": "언제/어디서 적용하는가 (1줄)",
  "content": "실행 가능한 내용 (최대 500자)"
}]

--- Session Data ---
$GIT_DIFF_STAT
$GIT_LOG
$SESSION_HINTS
</compound-extraction>
```

### Quality Gates

```
추출 결과 (0~3개)
    ↓
Gate 1: 구조 검증
  ├─ name이 비어있거나 너무 짧으면 → 거부
  ├─ tags가 0개면 → 거부
  ├─ content가 50자 미만이면 → 거부
  └─ context가 없으면 → 거부
    ↓
Gate 2: 독성 필터
  ├─ Blocklist 단어: @ts-ignore, any-cast, --force, --no-verify,
  │   eslint-disable, TODO, FIXME, HACK, "임시", "나중에", "잘 모르겠"
  ├─ 절대 경로 감지: /Users/, /home/, C:\
  └─ 환경 변수/시크릿 패턴: API_KEY, PASSWORD, TOKEN
    ↓
Gate 3: 중복/모순 검사
  ├─ 기존 솔루션과 태그 70%+ 겹침 → 버전 업데이트로 전환
  ├─ 동일 태그인데 반대 방향 지시 → 모순 플래그
  └─ 유사하지만 다른 context → 별도 저장 허용
    ↓
저장: experiment (0.2)
    ↓
Lab 이벤트: compound:extracted
```

### Manual Extraction (/compound)

```
수동 추출:
  Gate 0: skip (유저가 트리거 판단)
  Gate 1-3: soft warning (override 가능)
  초기 상태: candidate (0.5)
  승격 속도: 채택 1회 → verified
```

---

## 5. Injection Engine

### 매칭 로직 (v2)

```
사용자 프롬프트 입력
    ↓
프롬프트에서 태그 추출:
  "React에서 API 에러 처리" → [react, api, error, 에러, 처리]
    ↓
솔루션 frontmatter의 tags 필드와 교차:
  - retired 제외
  - 태그 교차 수 / 전체 태그 수 = relevance
  - confidence 가중치 적용: final = relevance * confidence
    ↓
final 점수 상위 3개 선택
    ↓
주입 (status + confidence 표시)
```

### 주입 형식

```xml
<compound-solution name="react-error-boundary"
                   status="verified" confidence="0.82"
                   evidence="referenced:8 negative:0">
## Context
React 프로젝트에서 API 호출 에러를 일관되게 처리할 때

## Content
ErrorBoundary 컴포넌트를 루트에 배치하고...

(이 솔루션을 참고했다면: [compound:react-error-boundary:used])
</compound-solution>
```

### 제한

- 회당 최대 3개 주입
- 세션당 최대 10개 (중복 방지)
- 솔루션당 최대 1500자 (초과 시 truncate)
- experiment 솔루션은 최대 1개/회 (검증 안 된 것은 적게)

---

## 6. Adoption Tracking (Lab 통합)

### Explicit Tagging

솔루션 주입 시 `(이 솔루션을 참고했다면: [compound:name:used])` 포함.
PostToolUse 훅에서 Claude 응답을 검사하여 태그 감지.

```
[compound:react-error-boundary:used] 감지
    ↓
Lab 이벤트 기록: compound:referenced
  { solutionName, sessionId, timestamp }
    ↓
솔루션 파일의 evidence.referenced += 1
솔루션 파일의 evidence.sessions에 sessionId 추가
```

### 부정 신호 수집

PostToolUse / PostToolUseFailure 훅에서:

```
솔루션 주입 후 5턴 이내:
  ├─ 빌드 실패 (Bash tool exit code != 0 + "error|fail" 패턴)
  ├─ 테스트 실패 (test 관련 명령어 + 실패)
  ├─ git revert / git checkout -- (변경 취소)
  └─ 유저 거부 키워드 ("아니", "그거 말고", "다시", "wrong", "no not that")
      ↓
  Lab 이벤트 기록: compound:negative
    { solutionName, signal, sessionId, timestamp }
      ↓
  솔루션 파일의 evidence.negative += 1
```

### 무관 주입 처리

솔루션이 주입됐지만 실제 작업과 무관한 경우:
- 5턴 내에 referenced도 negative도 아님
- → 카운트 안 함 (injected만 증가)
- 관련성 매칭의 부정확성에 의한 오탐으로 간주

---

## 7. Lifecycle (Lab Pattern Detector 확장)

### Compound 전용 패턴 규칙

```typescript
// pattern-detector.ts에 추가할 규칙

compound-promotion-ready:
  조건: referenced >= 2 AND negative == 0 AND sessions >= 2
  액션: status 승격 (experiment→candidate, candidate→verified)

compound-demotion-needed:
  조건: negative >= 1 AND confidence > 0.2
  액션: confidence -= 0.3

compound-circuit-breaker:
  조건: 최근 3회 주입 중 negative >= 2
  액션: status → experiment, confidence = 0.1, 24시간 주입 중단

compound-stale:
  조건: 90일간 injected == 0
  액션: status → retired

compound-version-conflict:
  조건: supersedes 체인에서 새 버전이 폐기됨
  액션: 이전 버전 복원 (retired → 이전 status)
```

### 승격 조건 상세

```
experiment (0.2) → candidate (0.5):
  - referenced >= 2
  - negative == 0
  - sessions >= 2 (2개 이상 다른 세션에서 채택)

candidate (0.5) → verified (0.8):
  - referenced >= 4
  - negative == 0
  - sessions >= 3

verified (0.8) → mature (0.85):
  - referenced >= 8
  - negative <= 1 (1회까지 허용)
  - sessions >= 5
  - 30일 이상 verified 유지

수동 추출 (/compound):
  candidate (0.5) 시작
  → referenced >= 1이면 즉시 verified
```

---

## 8. Safety Mechanisms

### Extraction Blocklist

```json
{
  "patterns": [
    "@ts-ignore", "@ts-nocheck", "as any", "any\\)",
    "--force", "--no-verify", "--skip-ci",
    "eslint-disable", "prettier-ignore", "noqa",
    "TODO", "FIXME", "HACK", "XXX",
    "임시", "나중에", "일단", "잘 모르겠",
    "\\.(env|pem|key|secret|credential)",
    "password", "api.key", "token.*=",
    "/Users/", "/home/", "C:\\\\Users"
  ]
}
```

### Circuit Breaker

```
연속 2회 부정 신호 감지
    ↓
즉시 조치:
  1. status → experiment
  2. confidence = 0.1
  3. 24시간 주입 중단
  4. Lab 이벤트: compound:demoted (circuit-breaker)
  5. tenetx me에서 경고 표시:
     "⚠ 'react-error-boundary' 비활성화됨 (연속 부정 신호)"
```

### Rollback

```bash
# 특정 날짜 이후 자동 추출 전부 제거
tenetx compound rollback --since 2026-03-20

# 특정 솔루션 삭제
tenetx compound remove react-error-boundary

# 자동 추출 일시 중단 (수동만 허용)
tenetx compound pause-auto
tenetx compound resume-auto
```

### Contradiction Detection

```
새 솔루션 태그: [react, state, zustand, global]
기존 솔루션 태그: [react, state, redux, global]

태그 겹침 > 70% + 내용이 반대 방향
    ↓
두 솔루션 모두 플래그:
  1. 새 솔루션 저장은 진행 (experiment)
  2. 기존 솔루션에 contradiction: [새 솔루션 name] 추가
  3. tenetx me에서 표시:
     "⚠ 모순 감지: 'use-zustand' vs 'use-redux' — 검토 필요"
  4. 둘 중 referenced가 높은 쪽이 자연스럽게 승격
```

---

## 9. Sharing (Marketplace)

### 공유 조건

- **verified 이상**만 pack publish 가능
- evidence 데이터는 포함하되, 설치 시 로컬 evidence는 0으로 초기화
- 설치된 솔루션은 candidate 상태로 시작 (커뮤니티 검증 ≠ 개인 검증)

### Pack Publishing

```bash
# verified 솔루션만 패키징
tenetx pack publish my-react-patterns
  → ~/.compound/me/solutions/ 에서 verified+ 필터
  → agents/, skills/ 포함 여부 선택
  → GitHub repo로 push
  → 마켓플레이스 등록

# 설치
tenetx marketplace install react-patterns
  → solutions/를 ~/.compound/packs/react-patterns/solutions/로
  → 모든 솔루션 status: candidate, evidence: {0,0,0,0}
  → 로컬에서 다시 검증 시작
```

### 마켓플레이스 보안

- pack.json에 sha256 체크섬 포함
- 솔루션 내용에 Gate 2 (독성 필터) 적용 후 설치
- 프롬프트 인젝션 방어: XML 이스케이프 + 알려진 인젝션 패턴 차단

---

## 10. Observable Intelligence

### tenetx me (대시보드)

```
$ tenetx me

 Forge Profile: Me(47)
 ├─ Solutions
 │  ├─ mature:     4 (confidence avg: 0.91)
 │  ├─ verified:   8 (confidence avg: 0.82)
 │  ├─ candidate:  5 (confidence avg: 0.55)
 │  ├─ experiment: 3 (trending: 2↑ 1→)
 │  └─ retired:    7
 │
 ├─ This Week
 │  ├─ Injected: 34 times
 │  ├─ Referenced: 21 times (adoption: 62%)
 │  ├─ Negative: 1 (build fail after 'css-grid-layout')
 │  └─ Extracted: 4 new (2 auto, 2 manual)
 │
 ├─ Promotions
 │  ├─ 'react-error-boundary' → mature (referenced 12x, 0 negative)
 │  └─ 'api-retry-pattern' → verified (referenced 5x)
 │
 └─ Warnings
    └─ ⚠ Contradiction: 'use-zustand' vs 'use-redux' — review needed

 Learning curve: ▁▂▃▄▅▆▇ (+12 solutions in 30 days, adoption 58%)
```

### tenetx lab metrics (상세)

```
$ tenetx lab metrics --compound

 Solution Effectiveness:
 ├─ react-error-boundary  score: 0.94  (ref: 12, neg: 0, sessions: 8)
 ├─ api-retry-pattern     score: 0.78  (ref: 5, neg: 0, sessions: 3)
 ├─ css-grid-layout       score: 0.31  (ref: 2, neg: 1, sessions: 2) ⚠
 └─ ts-strict-mode        score: 0.22  (ref: 1, neg: 0, sessions: 1) new

 Extraction Quality:
 ├─ Auto extractions: 23 total, 14 survived (61% retention)
 ├─ Manual extractions: 8 total, 7 survived (88% retention)
 └─ Avg time to verified: 12 days (auto), 5 days (manual)
```

---

## 11. Implementation Priority

```
Phase 1: Foundation (솔루션 포맷 v2 + Lab 이벤트)
  ├─ Solution Format v2 with YAML frontmatter
  ├─ Lab event types 추가 (6개)
  ├─ solution-injector 수정 (explicit tagging, frontmatter 매칭)
  └─ PostToolUse에서 [compound:name:used] 감지

Phase 2: Lifecycle (Lab pattern-detector 확장)
  ├─ compound 전용 패턴 규칙 5개
  ├─ auto-learn에 compound 데이터 통합
  ├─ 승격/강등 로직
  └─ circuit breaker

Phase 3: Extraction (자동 추출)
  ├─ Pre-compact hints 저장
  ├─ SessionStart lazy extraction
  ├─ Quality gates (Gate 1-3)
  ├─ Extraction blocklist
  └─ tenetx compound pause-auto / resume-auto

Phase 4: Observability (대시보드)
  ├─ tenetx me에 compound 섹션 추가
  ├─ tenetx lab metrics --compound
  ├─ Contradiction detection + 경고
  └─ tenetx compound rollback

Phase 5: Sharing (마켓플레이스)
  ├─ tenetx pack publish (verified+ 필터)
  ├─ 설치 시 candidate 초기화
  ├─ 보안 검증 (Gate 2 + checksum)
  └─ 마켓플레이스 검색/평가
```

---

## 12. v1 비판 대응 매핑

| 비판 | 심각도 | v2 대응 |
|------|--------|---------|
| Passive Positive 결함 | SERIOUS | Explicit Tagging으로 전환 |
| Lab-Compound 분리 낭비 | SERIOUS | Lab 위에 통합 (이벤트 추가만) |
| Pre-compact 토큰 부족 | SERIOUS | Lazy Extraction (다음 세션 시작 시) |
| 솔루션 버전 관리 없음 | SERIOUS | version + supersedes 체인 |
| 키워드 매칭 정밀도 | SERIOUS | Frontmatter tags 기반 정확 매칭 |
| Quality Gates 미구현 | FATAL | Gate 1-3 명세 (독성 필터, 중복/모순) |
| Lifecycle 미구현 | FATAL | Lab pattern-detector 규칙으로 구현 |
| 프롬프트 인젝션 | SERIOUS | XML 이스케이프 + 인젝션 패턴 차단 |
| 솔루션 관리 UX 없음 | MODERATE | tenetx me + rollback + remove |
| Claude 자체 메모리 경쟁 | SERIOUS | 차별점: 생애주기 + 공유 생태계 + 관찰 가능성 |
