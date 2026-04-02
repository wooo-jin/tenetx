# tenetx v4.0.0 — 약점 분석 및 개선 로드맵

> 작성일: 2026-04-02
> 분석 방법: 코드베이스 전수 탐색 + 테스트 커버리지 분석 + 경쟁 제품 비교(ECC, OMC, wshobson, claude-mem, Anthropic Auto-Dream) + **6대 핵심 경로 런타임 추적**
> compound 참조: `hermes-vs-tenetx-improvement-roadmap`, `hermes-inspired-architecture-plan`, `security-first-phase-ordering`(verified)

---

## Executive Summary

tenetx v4.0.0은 **유일한 harness 바이너리 모델**, **복리 지식 엔진**, **Forge 개인화**라는 3대 차별점을 보유하나, **현재 "조립 완성도 80%"** 상태다. 코드 품질(1000개 테스트 통과, 일관된 에러 처리)은 우수하지만, 런타임에서 핵심 기능이 실제로 동작하지 않는 통합 격차가 존재한다.

**가장 심각한 발견**: 플러그인 캐시 디렉터리 부재로 **모든 안전 훅(위험 명령 차단, DB guard, secret filter 등)이 런타임에서 비활성**. `solution-injector`와 `skill-injector`는 hook-registry에서 의도적으로 제외되어 push 방식 지식 주입과 학습 스킬 자동 주입이 동작하지 않음.

이 문서는 W6(Plugin Marketplace), W7(크로스플랫폼)을 제외한 8개 약점 + **신규 발견 W0(런타임 통합 격차)**에 대한 실행 로드맵을 정의한다.

---

## 1. 강점 분석 (현재 경쟁 우위)

| ID | 영역 | 설명 | 경쟁자 대비 |
|----|------|------|-------------|
| S1 | Harness 바이너리 | `tenetx` → `claude` 래핑, 세션 생명주기를 프로세스 수준 제어 | 경쟁자 전원 설정 파일 묶음. 유일한 프로세스 오케스트레이터 |
| S2 | 복리 지식 엔진 | 5단계 생명주기(experiment→mature→retired), MCP pull 모델, Code Reflection 검증 | ECC/OMC에 없는 자동 학습 파이프라인 |
| S3 | Forge 개인화 | 5차원 벡터(risk, autonomy, quality, abstraction, communication) + 인터뷰 → 규칙 자동 생성 | 경쟁자 중 개인화 인터뷰 보유 제품 0 |
| S4 | 보안 훅 아키텍처 | 18개 훅, tier별 분류(compound-core/safety/workflow), 플러그인 공존 감지 | ECC는 OWASP 전체 커버하지만 플러그인 공존 감지는 tenetx만 보유 |
| S5 | 미니멀 의존성 | 프로덕션 의존성 3개(MCP SDK, js-yaml, zod) | 공급망 공격 표면 최소. 경쟁자 대비 설치 속도 우위 |
| S6 | 순수 함수 테스트 | db-guard, secret-filter, rate-limiter, forge 수학 등 핵심 순수 함수 엣지 케이스까지 커버 | — |

---

## 2. 런타임 동작 진단

6대 핵심 경로를 코드 레벨에서 추적한 결과. **테스트 통과와 런타임 동작은 별개.**

### 2.1 경로별 판정

| # | 경로 | 판정 | 근거 |
|---|------|------|------|
| 1 | Harness 기동 | **WORKS** | `prepareHarness()` 13단계 완료, `spawnClaude()` 환경변수 전달 정상, `ENOENT` 에러 핸들링 |
| 2 | 훅 실행 | **PARTIALLY** | 개별 훅 로직 올바름. 그러나 **플러그인 캐시 디렉터리 부재**로 Claude Code에 훅이 도달하지 못함 |
| 3 | Compound 사이클 | **PARTIALLY** | MCP pull(compound-search) 동작. Push 주입(solution-injector) hook-registry 미등록. auto-compound에 보안/품질 격차 |
| 4 | Forge 개인화 | **WORKS** | 인터뷰→프로필→규칙→`.claude/rules/`→Claude 자동 로드. 전체 체인 완성 |
| 5 | MCP 서버 | **WORKS** | `~/.claude.json`에 등록, 5개 도구 정상. session-search는 Node.js 22+ 필요 |
| 6 | 스킬 시스템 | **PARTIALLY** | keyword-detector 등록됨(15/17). skill-injector 미등록 → promote된 스킬 자동 주입 안 됨 |

### 2.2 근본 원인 2개

**RC-1: 플러그인 캐시 디렉터리 부재** (모든 훅 차단)

`~/.claude/plugins/cache/tenetx-local/tenetx/4.0.0/`이 존재하지 않음. `postinstall.js:140-179`에서 `rmSync(cacheParent)`로 이전 잔재를 제거 후 symlink를 시도하지만, 이후 시점에 깨진 상태. 결과: **모든 안전 훅(pre-tool-use, db-guard, secret-filter 등) 비활성.**

```
postinstall.js:143 → rmSync(cacheParent, { recursive: true, force: true })
postinstall.js:150 → symlinkSync(packageRoot, cachePath)
→ 이후 시점에 symlink/디렉터리 사라짐
→ Claude Code가 hooks.json을 찾지 못함
→ 17개 훅 전부 비활성
```

**RC-2: 의도적 비등록** (push 주입 + 학습 스킬 차단)

`solution-injector`와 `skill-injector`가 `hook-registry.json`에서 제외. MCP pull 방식으로 전환한 설계 결정이지만, 연쇄 효과:
- push 방식 솔루션 주입 미동작 → Claude가 자발적으로 `compound-search`를 호출해야만 지식 활용
- `recordPrompt()` 미호출 (`solution-injector.ts:89`에서만 호출) → prompt-learner 데이터 수집 중단
- `tenetx skill promote`로 생성된 스킬의 자동 주입 미동작

### 2.3 실제 동작 vs 비동작 요약

| 동작함 | 동작하지 않음 |
|--------|-------------|
| `tenetx` 명령으로 claude 기동 (환경변수, 에이전트, 규칙 설치) | 위험 명령 차단 (pre-tool-use) |
| Forge 개인화 (`tenetx forge`) | DB guard, secret filter |
| MCP compound 검색 (Claude가 자발적 호출 시) | 솔루션 자동 주입 (push) |
| 세션 종료 후 auto-compound (10+ 메시지) | 학습된 스킬 자동 주입 |
| 슬래시 명령 (`/tenetx:tdd` 등) | prompt-learner 데이터 수집 (solution-injector 경로) |

---

## 3. 약점 분석

### 3.1 약점 목록

| ID | 영역 | 심각도 | 설명 |
|----|------|--------|------|
| **W0** | **런타임 통합 격차** | **🔴 긴급** | 플러그인 캐시 부재로 모든 훅 비활성 + solution/skill-injector 미등록으로 push 주입 중단. **RC-1, RC-2 참조** |
| W1 | 스킬 콘텐츠 빈약 | 🔴 높음 | `commands/` 9개 + `skills/` 2개. ECC 116개, OMC 28개, wshobson 146개 대비 현저히 부족 |
| W2 | 테스트 커버리지 격차 | 🔴 높음 | 47% 라인(목표 70%). 보안·핵심 경로 미테스트 모듈 다수 |
| W3 | 통합/E2E 테스트 부재 | 🔴 높음 | stdin→JSON→action→stdout 전체 훅 파이프라인 검증 테스트 0건 |
| W4 | 모델 라우팅 미구현 | 🟡 중간 | `harness.ts:692-706`에서 `modelRouting: undefined`, `signalRoutingEnabled: false` 하드코딩. 코드 존재하나 비활성 |
| W5 | 벡터 검색 부재 | 🟡 중간 | 태그+Jaccard 매칭만 존재. 동의어·시맨틱 매칭 불가. claude-mem은 Chroma 임베딩 하이브리드 |
| W8 | Anthropic Auto-Dream 위협 | 🟠 구조적 | Auto-Memory + Auto-Dream이 compound 핵심 가치("세션 간 지식 축적")를 기본 기능으로 흡수 가능 |
| W9 | 깨진 체인 5건 | 🟡 중간 | `e2e/scenarios.md`에 자체 문서화된 broken chain. 보안 우회 포함 |
| W10 | settings-lock 미테스트 | 🔴 높음 | 동시 쓰기 보호 로직 완전 미테스트. race condition에서 설정 파일 손상 가능 |

### 3.2 제외 약점

| ID | 영역 | 제외 사유 |
|----|------|-----------|
| W6 | Plugin Marketplace | 현 시점 포지셔닝 결정 보류 |
| W7 | 크로스플랫폼 | Claude Code 전용 하네스로 집중 |

---

## 3. 미테스트 고위험 모듈 상세

테스트가 전혀 없거나 부분적인 모듈 중 위험도 높음 이상.

### 3.1 보안 핵심 (테스트 0)

| 파일 | 라인 | 의존성 | 위험 |
|------|------|--------|------|
| `src/hooks/prompt-injection-filter.ts` | 290 | **0개** (순수 함수) | 25개 보안 패턴(injection 17, exfiltration 2, obfuscation 2, warn 4) 전체 미검증. auto-compound 경로에서 우회됨(W9 체인 4) |
| `src/core/settings-lock.ts` | 121 | fs, logger, paths | `acquireLock()` wx 플래그, stale lock 감지, `Atomics.wait` 재시도, `rollbackSettings` 백업 미생성 버그 |

### 3.2 핵심 기능 경로 (테스트 0)

| 파일 | 라인 | 의존성 수 | 위험 |
|------|------|-----------|------|
| `src/hooks/keyword-detector.ts` | 446 | 14개 | 35개 regex 패턴, 5단계 스킬 파일 탐색, cancel/inject/skill 3분기. 스킬 시스템의 주요 진입점 |
| `src/hooks/solution-injector.ts` | 206 | 13개 | 세션 캐시 TTL, Progressive Disclosure 3-tier, `recordPrompt` 호출 여부(W9 체인 1의 원인) |
| `src/hooks/intent-classifier.ts` | 85 | 3개 | `classifyIntent` 미export — 테스트 불가. 8-intent 분류 |

### 3.3 테스트 가능성 평가

| 파일 | 모킹 난이도 | 순수 함수 추출 가능 | 즉시 테스트 가능 |
|------|------------|-------------------|----------------|
| `prompt-injection-filter.ts` | **없음** | 전체가 순수 함수 | ✅ 즉시 |
| `intent-classifier.ts` | 낮음 | `classifyIntent` export 추가 필요 | ✅ 리팩터 1줄 |
| `settings-lock.ts` | 중간 | `acquireLock/releaseLock` 자체는 테스트 가능, `Atomics.wait` 모킹 필요 | ⚠️ 동시성 시뮬레이션 |
| `keyword-detector.ts` | 높음 | `detectKeyword` 추출 가능, `loadSkillContent`는 fs 의존 | ⚠️ 14개 모킹 |
| `solution-injector.ts` | 높음 | 세션 캐시 로직 추출 가능, 나머지 fs+matcher 의존 | ⚠️ 13개 모킹 |

---

## 4. 깨진 체인 상세 (W9)

`tests/e2e/scenarios.md`에 문서화된 5건.

| # | 체인 | 끊어진 지점 | 원인 | 보안 영향 |
|---|------|------------|------|-----------|
| 1 | prompt-learner → forge-behavioral.md | `recordPrompt()` 미호출 | `solution-injector.ts:89` — 훅 비활성 시 `recordPrompt` 호출 안 됨 | 없음 (기능 저하) |
| 2 | USER.md → Claude | Claude가 읽는 경로 없음 | `config-injector`에 USER.md 주입 경로 미구현 | 없음 (기능 부재) |
| 3 | auto-compound → quality gate3 | gate3 미적용 | auto-compound가 별도 경로 사용 | 낮음 (품질 저하) |
| 4 | auto-compound → injection defense | `filterSolutionContent` 미적용 | transcript가 raw로 전달 | **🔴 높음** — 프롬프트 인젝션 방어 우회 |
| 5 | skill promote → auto-inject | skill-injector 비활성 | `hook-registry.json`에 skill-injector 미등록 | 없음 (기능 부재) |

> **체인 4는 보안 이슈.** `security-first-phase-ordering`(verified) 원칙에 따라 최우선 수리 대상.

---

## 5. 경쟁 환경 요약

### 5.1 주요 경쟁자

| 제품 | 포지셔닝 | 스킬 수 | 에이전트 | 모델 라우팅 | 벡터 검색 |
|------|---------|---------|---------|-----------|----------|
| **ECC** | Agent harness optimization (82K stars) | 116+ | 28 | ✅ | ❌ |
| **OMC** | Teams-first orchestration | 28 | 19 | ✅ | ❌ |
| **wshobson/agents** | Composable plugin system | 146 | 112 | ✅ 4-tier | ❌ |
| **claude-mem** | Session memory specialist | — | — | ❌ | ✅ Chroma |
| **Anthropic Auto-Dream** | Native memory management | — | — | — | — |
| **tenetx** | Personal harness + compound learning | 11 | 19 | ❌ (코드 있으나 비활성) | ❌ |

### 5.2 tenetx 고유 차별점

1. **유일한 harness 바이너리** — 프로세스 수준 세션 제어
2. **Forge 개인화 인터뷰** — 경쟁자 중 유일
3. **플러그인 공존 감지** — OMC/superpowers/claude-mem 충돌 자동 처리
4. **MCP pull 모델** — Claude가 직접 compound 지식 검색 (경쟁자는 push 방식)

### 5.3 구조적 위협: Anthropic Auto-Dream

Auto-Memory(2026.02 출시) + Auto-Dream(준비 중)이 "세션 간 지식 축적"을 기본 기능으로 제공하면 compound의 핵심 가치가 희석된다. **대응 전략: "Auto-Dream은 기억(what happened), Forge는 이해(who you are)"로 축 분리.**

---

## 6. 실행 로드맵

### 6.0 Phase 순서 원칙

- **보안은 Phase 1** (`security-first-phase-ordering`, verified)
- **테스트 안전망 → 기능 수리 → 콘텐츠 확충 → 신규 기능** 순서
- Phase 3, 4는 독립 — 병렬 가능

```
Phase 0 (런타임 복원) ──→ Phase 1 (보안+품질) ──→ Phase 2 (체인 수리) ──→ Phase 3 (스킬 확충)
       W0                  W2, W3, W10            W9                        W1   ↕ 병렬
                                                                          Phase 4 (라우팅 엔진)
                                                                            W4   ↓
                                                                          Phase 5 (차별화 강화)
                                                                            W5, W8
```

---

### Phase 0: 런타임 통합 복원 (W0) — 긴급

> 목표: "코드는 있는데 실행이 안 되는" 상태를 해소. 모든 훅 활성화 + push 주입 경로 복원.

#### 0-A. 플러그인 캐시 복원 (RC-1 해결)

**즉시 조치**: `npm run build && node scripts/postinstall.js` 실행으로 플러그인 캐시 재생성. 이것만으로 17개 훅이 즉시 활성화.

**영구 조치**:
- `tenetx doctor`에 플러그인 캐시 존재 여부 검증 추가
- `prepareHarness()`에서 캐시 health check → 누락 시 자동 복원
- `postinstall.js`의 `rmSync` → symlink 패턴에 검증 단계 추가 (symlink 후 존재 확인)

#### 0-B. solution-injector hook-registry 등록 (RC-2 해결 — 설계 결정 필요)

**트레이드오프**:

| 옵션 | 장점 | 단점 |
|------|------|------|
| A: MCP pull만 유지 (현재) | 토큰 절약, 불필요한 주입 방지 | Claude가 검색을 안 할 수 있음, prompt-learner 끊김 |
| B: solution-injector 복원 (push+pull 하이브리드) | 축적 지식 활용률 증가, prompt-learner 복원 | 세션당 토큰 소비 증가 |
| C: recordPrompt만 별도 훅으로 분리 | prompt-learner만 복원, 토큰 영향 없음 | push 주입은 여전히 안 됨 |

**추천: B** — Progressive Disclosure 전략(요약만 push, 전문은 MCP pull)이 이미 구현되어 있으므로 토큰 영향 제한적.

#### 0-C. skill-injector hook-registry 등록

`hook-registry.json`에 skill-injector 엔트리 추가. keyword-detector와의 이중 매칭은 `skill-injector.ts:47-51`의 `KEYWORD_DETECTOR_SKILL_NAMES` dedup 로직으로 이미 방지됨.

#### 0-D. 복원 검증

복원 후 검증 체크리스트:
- [ ] `tenetx doctor` 실행 → 플러그인 캐시 존재 확인
- [ ] 위험 명령(`rm -rf /`) 입력 → pre-tool-use 차단 확인
- [ ] `sk_live_test` 포함 코드 작성 → secret-filter 경고 확인
- [ ] 프롬프트 입력 → solution-injector가 관련 솔루션 주입 확인
- [ ] promote된 스킬 트리거 → skill-injector 자동 주입 확인

---

### Phase 1: 보안 + 품질 기반 (W2, W3, W10)

> 목표: 보안 핵심 경로 테스트 확보 + 커버리지 47% → 60%

#### 1-A. 순수 함수 테스트 — 즉시 착수 가능

| 대상 | 예상 테스트 | 모킹 | 예상 작업량 |
|------|-----------|------|-----------|
| `prompt-injection-filter.ts` | 25개 패턴 개별 검증, Unicode 우회 시도, `escapeAllXmlTags` 엣지케이스, mixed verdict(block+warn), `normalizeForInjectionCheck` 정규화 검증 | 없음 | ~200줄 |
| `intent-classifier.ts` | `classifyIntent` export 추가(1줄) → 7개 intent 분류 테스트, 경계 케이스, 미매칭 → 'general' 폴백 | 없음 | ~80줄 |

#### 1-B. settings-lock 동시성 테스트

| 시나리오 | 검증 포인트 |
|---------|-----------|
| 정상 lock/unlock | `wx` 플래그로 파일 생성, PID 기록, `releaseLock`로 삭제 |
| 이미 잠긴 상태 | `Atomics.wait` 재시도 루프, 3초 타임아웃 |
| stale lock (죽은 프로세스) | `process.kill(pid, 0)` 실패 → 강제 획득 |
| `atomicWriteFileSync` | tmp 쓰기 → `renameSync` 원자성 |
| `writeSettings` 전체 흐름 | lock → backup → atomic write → release (try/finally) |
| `rollbackSettings` 버그 | 현재 설정 백업 미생성 → **수정 필요** |

모킹: `Atomics.wait`(3초 대기 회피), `process.kill`, `fs` (tmp 디렉터리), paths 상수 리디렉션

#### 1-C. 핵심 훅 테스트

**keyword-detector.ts** — `detectKeyword()` 추출 테스트:
- 35개 regex 패턴 매칭 (cancel 2개, inject 11개, skill 8개 등)
- `sanitizeForDetection` 전처리 후 매칭
- 우선순위: cancel > inject > skill
- `loadSkillContent` 5단계 경로 탐색 (fs 모킹)
- ralph 상태 파일 생성/삭제

**solution-injector.ts** — 세션 캐시 + 주입 로직:
- 세션 캐시 TTL (24시간 만료)
- experiment 솔루션 throttling (프롬프트당 max 1)
- Progressive Disclosure 3-tier 동작
- `recordPrompt` 호출 검증 (W9 체인 1 관련)
- 플러그인 감지 시 budget 축소

#### 1-D. 훅 파이프라인 통합 테스트

실제 훅을 `child_process.fork()`로 실행, stdin에 JSON 주입, stdout에서 응답 검증.

```typescript
// 테스트 헬퍼 설계
async function runHook(hookPath: string, input: HookInput): Promise<HookResponse> {
  const child = fork(hookPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin!.write(JSON.stringify(input));
  child.stdin!.end();
  // stdout에서 JSON 파싱 → approve/deny/context 응답 검증
}
```

대상 훅 5개: `pre-tool-use`, `db-guard`, `secret-filter`, `keyword-detector`, `solution-injector`

---

### Phase 2: 깨진 체인 수리 (W9)

> 전제: Phase 1의 테스트가 안전망 역할

#### 2-0. 체인 4 — 보안 우회 수리 (최우선)

**문제**: `auto-compound-runner.ts`에서 transcript → `claude -p` 분석 시 `filterSolutionContent()` 미적용. 악의적 프롬프트가 compound 지식에 저장될 수 있음.

**수리**: `auto-compound-runner.ts`에서 추출 결과를 `filterSolutionContent()`로 필터링한 후 저장. verdict가 `block`이면 해당 솔루션 폐기.

**테스트**: 프롬프트 인젝션이 포함된 transcript → 추출 → 저장 차단 검증

#### 2-1. 체인 1 — prompt-learner 연결

**문제**: `solution-injector.ts:89`에서만 `recordPrompt()` 호출. 훅 비활성 시 prompt-learner 데이터 수집 중단.

**수리 옵션**:
- A) `keyword-detector`에서도 `recordPrompt()` 호출 (간단, 중복)
- B) `recordPrompt`를 독립 훅으로 분리 (깔끔, 작업량 큼)
- **추천: A** — `keyword-detector.ts` main()에 `recordPrompt(prompt)` 1줄 추가

#### 2-2. 체인 2 — USER.md 주입 경로

**문제**: `USER.md` 파일이 존재해도 Claude가 읽는 경로가 없음.

**수리**: `config-injector.ts`의 규칙 주입 로직에 `~/.compound/me/USER.md` → `.claude/rules/` 복사 추가. 기존 `RULE_FILE_CAPS` (3000자/파일) 적용.

#### 2-3. 체인 3 — auto-compound gate3

**문제**: auto-compound 경로에서 gate3(품질 검증) 미적용.

**수리**: `auto-compound-runner.ts`에서 추출 후 `compound-extractor.ts`의 gate3 로직을 호출하도록 파이프라인 수정.

#### 2-4. 체인 5 — skill-injector 등록

**문제**: `skill-injector`가 `hook-registry.json`에 미등록. promote된 스킬이 자동 주입 안 됨.

**수리**: `hooks/hook-registry.json`에 skill-injector 엔트리 추가. `hooks-generator.ts`가 자동으로 `hooks.json`에 반영.

---

### Phase 3: 스킬 콘텐츠 확충 (W1)

> 목표: 11개 → 21개 (핵심 도메인 10개 추가)
> 병렬 가능: Phase 4와 독립

#### 추가 스킬 목록

기존 `commands/code-review.md`(234줄) 포맷 준수: YAML frontmatter(`name`, `description`, `triggers`) + `<Purpose>` + `<Steps>` + Agent 위임 + `<Output>` + `<Arguments>`

| # | 스킬명 | 도메인 | triggers (자동 매칭) | 위임 에이전트 |
|---|--------|--------|---------------------|-------------|
| 1 | `api-design` | backend | `["api design", "api 설계", "REST", "GraphQL"]` | architect |
| 2 | `database` | backend | `["database", "db 설계", "schema", "migration"]` | backend-architect |
| 3 | `performance` | cross | `["performance", "성능", "profiling", "최적화"]` | performance-reviewer |
| 4 | `testing-strategy` | quality | `["testing strategy", "테스트 전략", "test plan"]` | test-engineer |
| 5 | `ci-cd` | devops | `["ci cd", "ci/cd", "파이프라인", "github actions"]` | executor |
| 6 | `docker` | devops | `["docker", "container", "컨테이너"]` | executor |
| 7 | `frontend` | frontend | `["frontend", "프론트엔드", "component", "접근성"]` | designer |
| 8 | `documentation` | cross | `["documentation", "문서화", "docs", "기술 문서"]` | writer |
| 9 | `incident-response` | ops | `["incident", "장애 대응", "postmortem"]` | debugger |
| 10 | `architecture-decision` | design | `["adr", "architecture decision", "아키텍처 결정"]` | architect |

#### 스킬 품질 기준

- 각 스킬은 150-250줄
- `<Steps>` 섹션에 구체적 체크리스트 포함
- Agent 위임 블록에 `model` 명시
- 한/영 이중 trigger 지원
- `$ARGUMENTS` 플레이스홀더 포함

---

### Phase 4: 모델 라우팅 엔진 활성화 (W4)

> 병렬 가능: Phase 3과 독립

#### 4.1 현재 상태

```typescript
// harness.ts:692-706 — 현재 코드
modelRouting: undefined,          // 항상 undefined
signalRoutingEnabled: false,      // 항상 false
routingPreset: routingPreset ?? 'default',
```

- `config-injector.ts:211`의 `generateRoutingRules()` — 코드 존재하나 입력이 undefined라 placeholder 출력
- `forge/generator.ts:131`의 `resolveRoutingPreset()` — preset 계산은 되지만 실제 적용 안 됨
- 에이전트 `.md` 파일의 `model:` 필드가 유일한 현재 라우팅

#### 4.2 활성화 계획

**Step 1: 정적 라우팅 테이블 연결**
- `harness.ts`에서 `modelRouting`을 forge preset 기반으로 설정
- `generateRoutingRules()`가 실제 라우팅 테이블을 `.claude/rules/routing.md`에 출력
- 3가지 preset: `default`, `cost-saving`, `max-quality`

**Step 2: 동적 에스컬레이션 활성화**
- `signalRoutingEnabled: true`로 전환
- 키워드 감지 (config-injector에 이미 코드 존재):
  - `architecture`, `security`, `cross-file` → opus 에스컬레이션
  - `explore`, `simple-qa` → haiku 디에스컬레이션
- 실패 카운터 (`post-tool-failure.ts`에 주석으로 계획됨):
  - 연속 3회 실패 → 상위 모델 에스컬레이션

**Step 3: 에이전트 model 동적 오버라이드**
- `src/core/routing-engine.ts` 신규 모듈
- 입력: task type + complexity signals + forge preset + failure count
- 출력: recommended model
- 에이전트 설치 시 또는 `.claude/rules/routing.md`를 통해 지시

#### 4.3 테스트 계획

- `resolveRoutingPreset()` 단위 테스트 (이미 generator.test.ts에 부분 존재)
- `generateRoutingRules()` 출력 검증 — 3 preset별 라우팅 테이블
- `routing-engine.ts` 순수 함수 테스트 — 시그널 조합별 모델 선택
- 에스컬레이션/디에스컬레이션 경계 조건

---

### Phase 5: 차별화 강화 (W5, W8)

#### 5-A. 검색 품질 개선 (W5) — ✅ 구현 완료

`src/engine/solution-matcher.ts`에 동의어 사전 + TF-IDF 가중치 적용.

**구현된 것**:
- `SYNONYM_MAP`: 15개 주제 (영어 12 + 한국어 3), 각 주제당 3-5개 동의어
- `expandTagsWithSynonyms()`: 정방향 + 역방향 lookup으로 태그 확장
- `tagWeight()`: common tag(typescript, fix, 코드 등) 0.5 가중치, rare tag 1.0
- `calculateRelevance()`에 synonym 확장 + 가중 점수 적용
- 테스트: `tests/synonym-tfidf.test.ts` (19 tests passed, 기존 matcher 테스트 무손상)

**미래 개선 (미구현)**:

| 단계 | 내용 | 의존성 추가 |
|------|------|-----------|
| 3. N-gram 매칭 | 2-gram, 3-gram 부분 매칭으로 오타·변형 대응 | 없음 |
| 4. 로컬 임베딩 (opt-in) | Ollama + nomic-embed 등. 의존성 최소화 원칙과 충돌 → opt-in 플러그인 | ollama (optional) |

> compound 참조: `hermes-vs-tenetx-improvement-roadmap` — "검색 결과 LLM 요약" 항목과 연계 가능

#### 5-B. Auto-Dream 대응 (W8)

**핵심 전략**: 축 분리

| | Auto-Dream | tenetx Forge |
|---|-----------|-------------|
| 대상 | 세션 내용 (what happened) | 사용자 작업 스타일 (who you are) |
| 방법 | 메모리 자동 정리·합병 | 5차원 프로필 + 행동 패턴 학습 |
| 시점 | 20+ 세션 후 서버사이드 | 매 세션 실시간 |
| 범위 | 사실 기억 | 판단 기준·원칙·선호 |

**강화 포인트**:

1. **Forge 자동 조정** — 현재 인터뷰 1회성 → 세션 행동에서 5차원 벡터를 점진적으로 업데이트
   - compound 참조: `hermes-inspired-architecture-plan` — "에이전트 자율 compound" 방향
2. **Decision Rationale Engine** — "왜 이 결정을 했는지" 추적. `<decision>` 태그로 의사결정 로그 축적
3. **팀 컨텍스트 학습** — 개인을 넘어 팀의 코드 스타일·리뷰 기준 학습. pack 시스템 활용

---

## 7. 품질 게이트

각 Phase 완료 조건:

| Phase | 완료 조건 |
|-------|----------|
| 1 | 미테스트 고위험 5개 모듈 테스트 추가, 커버리지 60%+, 훅 파이프라인 통합 테스트 5개, `rollbackSettings` 버그 수정 |
| 2 | 깨진 체인 5건 전부 수리, 각 체인에 대한 회귀 테스트, 체인 4 보안 수리 검증 |
| 3 | 스킬 21개 도달, 각 스킬 `triggers` 매칭 테스트, 한/영 이중 trigger 검증 |
| 4 | 3 preset 라우팅 테이블 출력 검증, 에스컬레이션/디에스컬레이션 테스트, 기존 에이전트 동작 무손상 |
| 5 | 동의어 사전 + TF-IDF 적용 후 검색 품질 A/B 비교, Forge 자동 조정 프로토타입 |

---

## 8. 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| Phase 1 테스트 작성 중 기존 버그 대량 발견 | 일정 지연 | 발견 즉시 이슈화, critical만 즉시 수정 |
| 모델 라우팅 활성화 시 기존 사용자 경험 변화 | 혼란 | `routingPreset: 'default'` 유지, opt-in 전환 |
| Auto-Dream 일반 출시 시점 예측 불가 | compound 가치 희석 | Phase 5-B를 Phase 2 이후로 앞당길 수 있음 |
| 스킬 10개 추가 시 keyword-detector 패턴 충돌 | 오매칭 | 스킬별 trigger 유니크니스 테스트 추가 |

---

## Appendix A: 참조 compound 지식

| 이름 | 상태 | 핵심 내용 |
|------|------|----------|
| `hermes-vs-tenetx-improvement-roadmap` | candidate | FTS5 전환, 솔루션 보안 스캔, 에이전트 주도 스킬 생성, 검색 LLM 요약, 스킬 허브 |
| `hermes-inspired-architecture-plan` | candidate | MEMORY/USER 분리, 자율 compound, SQLite FTS5, Progressive Disclosure 체계화 |
| `security-first-phase-ordering` | **verified** | 모든 멀티-Phase 계획에서 '보안은 Phase 1'. RCE급 취약점은 작업량 무관 즉시 수정 |

## Appendix B: 경쟁자 상세 데이터

| 제품 | Stars | 스킬 | 에이전트 | 라우팅 | 벡터검색 | 고유 기능 |
|------|-------|------|---------|--------|---------|----------|
| ECC | 82K+ | 116+ | 28 | ✅ | ❌ | AgentShield (912 테스트), NanoClaw v2, 멀티플랫폼 |
| OMC | — | 28 | 19 | ✅ | ❌ | 위임 중심, completion guarantee, Plugin Marketplace |
| wshobson | — | 146 | 112 | ✅ 4-tier | ❌ | 컴포저블 플러그인, 16개 워크플로 오케스트레이터 |
| claude-mem | — | — | — | ❌ | ✅ Chroma | 28개 언어, 웹 메모리 뷰어, Mode System |
