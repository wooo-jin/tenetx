# Tenetx v2.1 Action Plan — Complete

**Goal**: Open source promotion readiness
**Based on**: [Review Feedback (2026-03-25)](./review-feedback-2026-03-25.md)
**Source reviewers**: oh-my-claudecode (11K stars), oh-my-openagent (43K stars), Every Inc. Compound Engineering (5K stars)

---

## Phase 1: 자기 정합성 (Self-Consistency)

> 핵심 원칙: "자기 규칙을 자기가 지킨다" — 이걸 안 하면 나머지 전부 의미 없음

### 1.1 테스트 실패 수정
- **문제**: slop-detector-main.test.ts 3개 실패. `npm test`가 red.
- **영향**: `git clone → npm test` 하는 첫 기여자가 바로 이탈
- **파일**: `tests/slop-detector-main.test.ts`, `src/hooks/slop-detector.ts`
- **조치**: 훅이 `compound-slop-warning` 로그를 왜 안 찍는지 디버깅. 훅 수정 or 테스트 기대값 수정.
- **검증**: `npm test` → 1548/1548 pass

### 1.2 커버리지 임계값 ↔ 품질 규칙 정합성
- **문제**: `vitest.config.ts`는 lines 40%, branches 34%. `.claude/rules/forge-quality.md`는 85% 요구.
- **영향**: "자기 규칙을 안 지키는 프로젝트" 인식 → Compound Engine 신뢰도 하락
- **조치**:
  - `forge-quality.md`: 목표를 현실적으로 수정 ("60% on changed paths, roadmap to 85%")
  - `vitest.config.ts`: 임계값 상향 (lines: 55, branches: 45, functions: 55)
  - 현재 실제 커버리지 측정 후 통과 가능한 수준으로 조정
- **검증**: `npm run test -- --coverage` 통과

### 1.3 자체 규칙 위반 전수 감사 (Systematic Audit)
- **문제**: 커버리지만 문제가 아님. 여러 자체 규칙을 본인 코드가 위반 중.
- **감사 결과 (2026-03-25 실측)**:

  | 규칙 (출처) | 위반 내용 | 실측 수치 |
  |------------|----------|----------|
  | anti-pattern.md: "빈 catch 블록 금지" | `catch { /* ignore */ }` | **106개** (예상 15개의 7배) |
  | anti-pattern.md: "eslint-disable, @ts-ignore 최소화" | 소스코드 내 사용 | **0개** (깨끗함) |
  | forge-quality.md: "85% 커버리지" | vitest.config.ts 임계값 | **36%** → 규칙을 현실 반영으로 수정 완료 |
  | forge-quality.md: "Zero warnings policy" | biome lint | **70개** (42 warnings + 28 infos) |
  | CONTRIBUTING.md: "No linter yet" | biome.json 존재 | 문서 모순 → **수정 완료** |

- **빈 catch 블록 106개 분류**:
  - 정당한 무시 (~40개): 임시파일 삭제, symlink 존재 확인, tmux 미설치 등. 주석으로 사유 명시하면 OK.
  - 로깅 필요 (~30개): JSON 파싱, 파일 읽기, git 명령 실패. 디버깅 정보 삼킴.
  - 위험한 무시 (~10개): 상태 파일 저장 실패, 카운터 업데이트 실패. 데이터 손실 가능.
  - 판단 필요 (~26개): 맥락에 따라 다름.

- **조치 (단계적)**:
  1. ✅ CONTRIBUTING.md "No linter yet" → biome 사용 명시로 수정 완료
  2. 위험한 무시 ~10개 → debugLog 교체 (우선)
  3. biome lint 70개 → 별도 커밋으로 정리
  4. 나머지 catch 블록 → `/* ignore */`를 구체적 사유 주석으로 교체

### 1.4 README 배지 정확성
- **문제**: `tests-1548-brightgreen` 배지인데 실제 3개 실패
- **영향**: 배지가 거짓말하면 README 전체 신뢰 하락
- **조치**: 1.1 수정 후 배지 유지. 수정 전까지는 배지 제거 or 동적 CI 배지로 교체
- **추가**: CI 배지가 실제 CI 상태를 반영하는지 확인. 로컬에서 실패하는데 CI에서 통과하면 CI 설정 문제.

### 1.5 txd 보안 경고
- **문제**: `txd` = `--dangerously-skip-permissions` 단축. 보안 도구 13개 넣어놓고 안전장치 우회 바이너리를 공식 제공.
- **조치**:
  - `txd` 실행 시 첫 줄에 경고 출력: "⚠ All permission checks disabled"
  - README Advanced Features에 txd 설명 + 위험 경고 추가
  - 선택사항: `TENETX_ALLOW_SKIP_PERMISSIONS=1` 환경변수 필수로 요구

---

## Phase 2: Compound Engine 근본 문제 (Architecture-Level)

> Every Inc. 리뷰어가 가장 깊이 파고든 부분. 이건 "나중에 해도 됨"이 아니라 제품 신뢰성 문제.

### 2.1 Code Reflection False Positive 문제
- **문제**: identifier가 "ErrorBoundary", "useMemo" 같은 일반 단어이면, 솔루션 주입과 무관하게 코드에 자연 출현 → `reflected++` 오증가 → 잘못된 승격
- **출처**: Compound Engineering 리뷰어
- **심각도**: 높음 — evidence-based lifecycle의 신뢰성을 근본적으로 훼손
- **조치 옵션**:
  - (A) identifier에 최소 고유성 요구 — 단어 2개 이상 조합 or camelCase 필수
  - (B) injection-timestamp와 reflection-timestamp 비교 — 주입 후 N초 내 출현만 카운트
  - (C) 주입된 세션에서만 reflection 카운트 (현재 구현 확인 필요)
- **파일**: `src/hooks/pre-tool-use.ts` (Code Reflection 로직), `src/engine/solution-format.ts` (identifier 검증)

### 2.2 자동 추출의 "왜(Why)" 누락
- **문제**: git diff는 "무엇이 바뀌었는가"만 알려줌. 자동 추출 경로에서 "왜 이 결정을 했는가"가 빠짐.
- **출처**: Every Inc. 리뷰어 — "이게 우리가 /ce:compound를 수동으로 만든 이유"
- **심각도**: 중-높 — 솔루션의 장기적 재사용 가치를 크게 떨어뜨림
- **조치**:
  - `compound-extractor.ts`에서 추출 시 `git log --format=%B`로 커밋 메시지를 가져와 솔루션 context에 포함
  - 솔루션 v3 포맷에 `commitMessages: string[]` 필드 추가 고려
  - 수동 `/compound` 실행과 자동 추출의 품질 차이를 문서화

### 2.3 추출 품질 — Positive Filter 필요
- **문제**: 4단계 품질 게이트는 모두 "나쁜 것 거르기" (negative filter). "좋은 패턴 고르기" (positive filter)가 없음.
- **출처**: Every Inc. 리뷰어 + OMO 리뷰어
- **영향**: noise-to-signal 비율이 높아짐. experiment 대부분이 은퇴 → 시스템이 CPU/디스크만 쓰고 가치를 못 만듦
- **조치 옵션**:
  - (A) 추출 시 "이 패턴이 다른 프로젝트에서도 쓸 수 있는가?" 체크 (범용성 점수)
  - (B) 커밋 메시지에 특정 키워드 (pattern:, learned:, decision:) 포함 시에만 추출
  - (C) 추출 정밀도 메트릭 수집 → 데이터 기반으로 게이트 개선
- **최소한**: (C)부터 시작 — `compound-precision` lab 이벤트 추가

### 2.4 자동 + 수동 듀얼 패스 명시
- **문제**: Every Inc.는 수동을 선택한 이유가 있음. tenetx는 자동을 선택했지만, 두 경로의 트레이드오프를 사용자에게 설명하지 않음.
- **조치**:
  - README Compound Engine 섹션에 추가:
    - Auto path: SessionStart 훅 → git diff → 4-gate filter → experiment 저장 (편리하지만 precision 낮음)
    - Manual path: `/compound` → 세션 맥락 포함 → 더 높은 품질 (수동이지만 "왜"가 포함됨)
  - 사용자가 auto를 끄고 manual만 쓸 수 있는 옵션 문서화 (`tenetx compound pause-auto`)

### 2.5 솔루션 Staleness 감지
- **문제**: 주입되는 솔루션의 identifier/content가 현재 코드에 더 이상 존재하지 않을 수 있음
- **출처**: OMO 리뷰어 (hash-anchored edits 맥락)
- **조치**:
  - lifecycle 체크 시 identifier가 현재 codebase에 존재하는지 `grep` 검증
  - 존재하지 않으면 `stale` 플래그 → 주입 우선순위 하향
  - 파일: `src/engine/compound-lifecycle.ts`

---

## Phase 3: 비용 · 안전 · 확장성

> OMO $438 사고에서 배운 것 + 1인 개발자 지속가능성

### 3.1 세션당 토큰 주입 상한선
- **문제**: 매 `UserPromptSubmit`마다 4개 훅 + 솔루션 XML 주입. 세션 총 토큰 비용 제한 없음.
- **출처**: OMO 리뷰어 (Gemini 무한루프 → $438 과금)
- **조치**:
  - `solution-injector.ts`: `MAX_INJECTED_CHARS_PER_SESSION = 8000` (~2K tokens)
  - 누적 주입량을 세션 캐시에 기록, 초과 시 주입 skip + debugLog
  - `tenetx cost` 명령에 주입 토큰 비용 포함

### 3.2 대형 파일 분할 계획
- **문제**: harness.ts(34K), agent-tuner.ts(33K), synthesizer.ts(28K), prompt-learner.ts(22K)
- **영향**: 외부 기여자 진입장벽. PR 리뷰 불가능. 한 파일 수정이 전체에 영향.
- **조치**:
  - 즉시: ADR(Architecture Decision Record) 작성 — 각 파일의 책임, 분할 방향, 의존 관계
  - 단기: harness.ts를 3개로 분할 (config-loader, hook-registrar, process-launcher)
  - 중기: agent-tuner.ts를 dimension별 모듈로 분할
- **파일**: `docs/adr/001-large-file-decomposition.md` (신규)

### 3.3 1인 개발 → 커뮤니티 전환 준비
- **문제**: 35K LOC + 97 테스트 파일을 혼자 유지보수하면서 이슈 대응 비현실적
- **출처**: OMO 리뷰어
- **조치**:
  - CONTRIBUTING.md에 아키텍처 개요 추가 (4-engine 다이어그램, 진입점 파일 목록)
  - "Good First Issue" 라벨 붙일 이슈 5개 미리 작성
  - 모듈별 CODEOWNERS 파일 작성 (향후 기여자 배정용)
  - 의존성 최소주의 유지 (현재 3개) — CONTRIBUTING.md에 "새 의존성 추가 시 PR 설명 필수" 명시

### 3.4 plugin.json 스키마 안정성
- **문제**: `$schema: "https://claude.ai/schemas/claude-plugin.json"` — 이 URL이 stable API인지 불명확
- **영향**: Anthropic이 스키마 변경하면 tenetx가 깨짐
- **조치**:
  - Claude Code 문서에서 스키마 버전 관리 방식 확인
  - 스키마 사본을 로컬에 두고, CI에서 원격 스키마와 비교하는 테스트 추가 고려
  - README에 "Tested with Claude Code version X" 명시

---

## Phase 4: 증명 (Evidence)

> "좋은 방법론 제안"에서 "실험 결과 검증"으로 — 모든 리뷰어가 독립적으로 지적

### 4.1 Dogfooding — tenetx로 tenetx 개발
- **목표**: 실제 compound lifecycle 데이터 생성
- **기간**: 최소 1주
- **추적 항목**:
  - 총 experiment 추출 수
  - experiment → candidate 승격률
  - experiment → retired (circuit breaker) 비율
  - candidate → verified 도달 사례
  - Code Reflection 정확도 (true positive vs false positive)
  - Lab 프로필 변화량

### 4.2 추출 정밀도 메트릭 구현
- **파일**: `src/engine/compound-extractor.ts`, `src/lab/types.ts`
- **조치**:
  - `compound-precision` 이벤트 타입 추가
  - lifecycle 체크 시 정밀도 계산: `(promoted + active) / total_extracted`
  - `tenetx compound stats`에 정밀도 표시

### 4.3 Case Study 문서
- **파일**: `docs/case-study.md`
- **내용**:
  - 프로젝트 컨텍스트 (tenetx 자체)
  - Forge 프로필 스냅샷 (5차원 값)
  - Lab 진화 기록 (N일간 차원 변화)
  - 솔루션 생애주기 사례 (experiment→candidate, experiment→retired)
  - 추출 정밀도 수치
  - Before/After 비교 (솔루션 주입 전후 Claude 응답 품질)

### 4.4 Forge 5차원 검증
- **문제**: riskTolerance, autonomyPreference, qualityFocus, abstractionLevel, communicationStyle — 이 5개가 실제로 "올바른" 차원인지 검증 데이터 없음
- **출처**: 암묵적 — 모든 개인화 시스템의 근본 질문
- **조치**:
  - dogfooding 중 "이 차원이 실제 행동과 얼마나 상관되는가" 정성 기록
  - 인터뷰 10개 질문이 차원 값을 의미있게 분화시키는지 확인
  - 최소 3명의 다른 사용자에게 forge를 돌려달라고 부탁 → 프로필이 실제로 다른지 확인

### 4.5 EMA 학습률 검증
- **문제**: `LEARNING_RATE = 0.25`, `MAX_DELTA = 0.15` — 이 값들이 튜닝된 건지 임의로 정한 건지
- **조치**:
  - dogfooding 데이터로 실제 차원 변화 추이 그래프 생성
  - 변화가 너무 느리면 학습률 상향, 너무 빠르면 하향
  - 값 선택 근거를 `docs/adr/002-learning-rate-tuning.md`에 기록

---

## Phase 5: 홍보 준비

> "Adaptive AI Coding"이라는 새 카테고리 생성

### 5.1 포지셔닝 정립
- **하지 말 것**:
  - "OMC 대체재" — 11K 커뮤니티와 정면 경쟁 무모
  - 숫자 마케팅 ("1548 tests!") — 커버리지 40%와 모순
  - "모든 AI 코딩 도구를 대체" — Claude Code 전용
- **할 것**:
  - **새 카테고리**: "Adaptive AI Coding" — 도구가 사용자에게 적응
  - **OMC 공존**: "OMC의 오케스트레이션 + tenetx의 개인화"
  - **증거 기반**: case study 데이터로 뒷받침

### 5.2 README 개선
- **차별화 테이블 추가**:
  ```
  |                        | Generic AI | oh-my-claudecode | tenetx       |
  |------------------------|-----------|-----------------|--------------|
  | Same for everyone      | Yes       | Yes             | No           |
  | Learns from you        | No        | No              | Yes          |
  | Evidence-based         | No        | No              | Yes          |
  | Auto-retires bad       | No        | No              | Yes          |
  | Runtime dependencies   | varies    | many            | 3            |
  ```
- **vendor 의존성 공지**: Prerequisites에 "Claude Code 필수, API 변경 영향 가능" 추가
- **"When to use tenetx"** 섹션 추가:
  - 적합: 장기 프로젝트, 반복 패턴이 많은 코드베이스, 개인 워크플로우 최적화
  - 부적합: 일회성 스크립트, Claude Code 없는 환경, 팀 전체 표준화 목적
- **4개 언어 README 동기화** 확인 — v2.0 이후 EN/KO/ZH/JA 모두 최신인지 검증

### 5.3 데모 영상 (90초)
- **스토리보드**:
  1. `npm install -g tenetx` (5s)
  2. `tenetx forge` → 인터뷰 → 차원 시각화 (20s)
  3. 코딩 세션 + 솔루션 주입이 보이는 장면 (20s)
  4. `tenetx me` → 프로필 + 학습된 패턴 (15s)
  5. `tenetx compound list` → lifecycle 테이블 (15s)
  6. 다음 세션 시작 시 Lab 진화 알림 (15s)

### 5.4 OMC + tenetx 공존 가이드
- **파일**: `docs/with-omc.md`
- **내용**: 실제 테스트 결과 기반 — 훅 충돌 여부, 설정 병합 방법, 어떤 기능이 겹치는지
- **중요**: 실제로 OMC와 tenetx를 동시에 설치해서 테스트해야 함. 문서만 쓰면 안 됨.

### 5.5 런치 채널별 메시지
| 채널 | 메시지 포커스 |
|------|-------------|
| **Hacker News (Show HN)** | Compound Engine v3의 evidence-based lifecycle — 기술적 노벨티 |
| **Reddit r/ClaudeAI** | "Claude Code가 내 코딩 스타일을 배운다" — 실용적 가치 |
| **GeekNews (news.hada.io)** | 복리 엔지니어링의 한국어 구현 — 커뮤니티 관심사 연결 |
| **GitHub README** | 차별화 테이블 + Quick Start 30초 |

### 5.6 "Why not both?" 가 아닌 독자적 가치 정립
- **문제**: OMC와 공존을 강조하면 "그럼 OMC만 써도 되는 거 아님?" 반응 가능
- **조치**: tenetx만으로 충분한 시나리오 명확히:
  - OMC 없이 tenetx만 쓰는 경우: 가벼운 개인화 + 패턴 학습
  - OMC + tenetx: 오케스트레이션 + 개인화
  - 선택은 사용자에게. 강요하지 않음.

---

## Phase 6: 커뮤니티 · 생태계

### 6.1 Pack 마켓플레이스 검증
- **문제**: `wooo-jin/tenetx-registry` 레포가 비어있으면 "마켓플레이스" 라벨이 과대광고
- **조치**:
  - 레지스트리 실제 내용 확인
  - 비어있으면: 빌트인 5개 팩(backend, frontend, security, data, devops)을 레지스트리에 등록
  - `tenetx pack search` 실행 시 결과가 나오는지 E2E 확인

### 6.2 커뮤니티 학습 vs 개인 학습 갭
- **문제**: `~/.compound/`는 개인에 갇힘. Pack이 브릿지지만 현재 비어있음.
- **출처**: Every Inc. 리뷰어 — "우리는 docs/solutions/를 git에 커밋해 팀이 함께 학습"
- **조치**:
  - `tenetx compound export` → 특정 솔루션을 프로젝트 내 `docs/solutions/`로 복사하는 명령 추가 고려
  - 팀 사용 시나리오 문서화: scope=project 솔루션이 어떻게 팀원과 공유되는지

### 6.3 Good First Issues 준비
- GitHub에 5~10개 이슈 미리 생성:
  - "Replace empty catch blocks with debugLog" (difficulty: easy)
  - "Add architecture diagram to CONTRIBUTING.md" (difficulty: easy)
  - "Test: E2E hook stdin/stdout pipeline" (difficulty: medium)
  - "Feature: compound stats precision tracking" (difficulty: medium)
  - "Docs: document auto vs manual extraction tradeoffs" (difficulty: easy)

---

## Phase 7: 기술적 개선 (Medium-term)

### 7.1 E2E 훅 파이프라인 테스트
- **파일**: `tests/e2e/hook-pipeline.test.ts` (신규)
- **내용**: 실제 훅 스크립트를 spawn → stdin에 JSON 파이프 → stdout 검증
- **대상 훅**: solution-injector, keyword-detector, pre-tool-use (최소 3개)

### 7.2 OMC에서 배울 훅들 검토
- **OMC에 있고 tenetx에 없는 것**:
  - `preemptive-compaction` — 컨텍스트 압축 방지
  - `todo-continuation` — TODO 자동 이어가기
  - `thinking-block-validator` — 사고 블록 검증
- **조치**: 각각 tenetx에 필요한지 평가. 필요하면 P2로 구현 계획.

### 7.3 다국어 README 동기화
- **문제**: v2.0 변경사항이 EN/KO/ZH/JA 4개 언어에 모두 반영됐는지 미확인
- **조치**: 각 README의 마지막 업데이트 버전 확인, 차이 있으면 동기화

### 7.4 dashboard 커버리지 제외 사유 문서화
- **문제**: `vitest.config.ts`에서 `src/dashboard/**` 제외. 이유 미기록.
- **조치**: 설정 파일에 주석으로 사유 추가 (Ink/React TUI는 단위테스트 부적합 등)

### 7.5 synthesizer.ts (28K) ROI 검증
- **문제**: 멀티모델 합성 엔진이 28K인데, 이 기능의 실제 사용 빈도와 가치가 검증되지 않음
- **조치**: dogfooding 중 실제로 `tenetx ask --all`을 써보고 가치 평가. 쓰지 않으면 README에서 강조 줄이기.

---

## 실행 순서 (Execution Order)

```
즉시 (Day 1):
  1.1  테스트 실패 수정
  1.2  커버리지 임계값 조정
  1.4  README 배지 수정
  1.5  txd 경고 추가

Day 2-3:
  1.3  자체 규칙 위반 전수 감사 (빈 catch, biome lint, ts-ignore)
  2.1  Code Reflection false positive 분석 + 최소 수정
  3.1  토큰 주입 상한선 추가

Week 1:
  2.2  자동 추출에 커밋 메시지 컨텍스트 추가
  2.4  auto/manual 듀얼 패스 문서화
  3.3  CONTRIBUTING.md 아키텍처 개요 추가
  4.1  dogfooding 시작

Week 2:
  2.3  추출 정밀도 메트릭 구현
  2.5  솔루션 staleness 감지
  3.2  대형 파일 분할 ADR 작성
  5.2  README 개선 (차별화 테이블, vendor 공지, when-to-use)

Week 3:
  4.2-4.3  정밀도 데이터 수집 + case study 초안
  5.3  데모 영상 촬영
  5.4  OMC 공존 실제 테스트 + 가이드
  6.1  Pack 레지스트리 검증 + 시딩

Week 4:
  4.4  Forge 5차원 검증 (외부 사용자 3명)
  5.5  런치 (HN, Reddit, GeekNews)
  6.3  Good First Issues 등록

Ongoing:
  3.4  plugin.json 스키마 모니터링
  4.5  EMA 학습률 데이터 기반 튜닝
  7.1-7.5  기술적 개선
```

---

## 성공 기준 (Success Criteria)

### Launch Gate (홍보 전 필수)
- [ ] `npm test` → 0 failures
- [ ] 커버리지 임계값이 자체 규칙과 일치
- [ ] 빈 catch 블록 0개
- [ ] `biome lint src/` 경고 0개
- [ ] README에 vendor lock-in 공지 존재
- [ ] txd에 보안 경고 존재
- [ ] 최소 1개 솔루션이 experiment → candidate 실제 도달
- [ ] README 4개 언어 동기화 완료

### Quality Gate (런치 후 1주 내)
- [ ] Case study 문서 완성
- [ ] 데모 영상 완성
- [ ] 추출 정밀도 메트릭 실제 데이터 1주치
- [ ] CONTRIBUTING.md에 아키텍처 섹션 존재
- [ ] Good First Issues 5개 이상 등록
- [ ] OMC 공존 실제 테스트 완료

### Long-term Health
- [ ] Forge 5차원 외부 사용자 검증 (3명+)
- [ ] EMA 학습률 데이터 기반 조정
- [ ] 대형 파일 1개 이상 분할 완료
- [ ] Pack 레지스트리에 실제 커뮤니티 팩 1개+
