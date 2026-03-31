# Tenetx Phase 1 & Phase 2 — 종합 설계 문서

> 작성일: 2026-03-31
> 총괄 아키텍트: Claude Opus 4.6
> 입력: AI 박사(이론 기반), AI 엔지니어(구현 아키텍처), 하네스 개발자(현재 상태 진단)
> 교차 검증 완료 — 충돌 3건 해소, 합의 도출
> **Rev 2 (2026-03-31)**: 3인 팀 리뷰 결과 7건 반영 — 진단 정정 3건, LOC 재산정, arm 수 보정, 테스트 계획 추가, Negative Transfer 강화, Schon 규칙 보강, CDN fallback

---

## Executive Summary

tenetx의 개인화 엔진(forge v2)은 설계상 Thompson Sampling, BKT, OPRO 등 정교한 학습 알고리즘을 갖추고 있으나, **실제 데이터 파이프라인이 작동하지 않는다.** `forge-profile.json`, `thompson-state.json`, `preference-state.json`, `opro-state.json` 모두 미생성 상태이며, `auto-learn`은 null 체크에서 조기 종료된다. 세션 로그 31개는 시작 메타데이터만 기록하고 종료/결과를 담지 않는다. lab events는 테스트 데이터 6줄뿐이다.

이 문서는 세 전문가의 분석을 교차 검증하여 **Phase 0(데이터 파이프라인 활성화) → Phase 1(이해 레이어) → Phase 2(개인화 오케스트레이션)** 순서의 실행 가능한 로드맵을 제시한다. 핵심 원칙은 "이론은 데이터가 뒷받침될 때만 의미있다"이며, 각 Phase 진입의 게이트 조건을 명시하여 조기 구현으로 인한 낭비를 방지한다.

---

## 1. 현재 상태 진단

### 1.1 데이터 인벤토리

하네스 개발자가 `~/.compound/` 디렉터리를 전수 조사한 결과:

| 데이터 소스 | 기대 상태 | 실제 상태 | 심각도 |
|---|---|---|---|
| `me/forge-profile.json` | 5차원 벡터 + 메타데이터 | **미생성** | CRITICAL |
| `lab/thompson-state.json` | posterior 분포 5개 + observations | **미생성** | CRITICAL |
| `lab/preference-state.json` | BKT P(known) 5차원 | **미생성** | CRITICAL |
| `lab/opro-state.json` | OPRO 최적화 상태 | **미생성** | CRITICAL |
| `lab/events.jsonl` | 세션별 행동 이벤트 스트림 | **6줄 (테스트 데이터)** | CRITICAL |
| `sessions/*.json` | 세션 시작/종료/결과 | 31개, **시작만 기록** (endTime 없음) | HIGH |
| `me/solutions/` | 축적된 솔루션 | 20개 (대부분 candidate, confidence 0.5) | MEDIUM |
| `me/rules/` | 축적된 규칙 | 1개 | LOW |
| `me/patterns/` | 행동 패턴 | **0개** | HIGH |
| `lab/experiments/` | 실험 기록 | 2,652개 **빈 파일** | LOW |

**근본 원인**: `shouldAutoLearnRun()` (`auto-learn.ts:541-557`)는 forge profile을 확인하지 않는다 — 마지막 실행 시각과 이벤트 수만 확인한다. forge profile 부재로 인한 조기 종료는 `runEvolveCycle()` 내부 step 3 (`auto-learn.ts:309-323`)에서 발생한다. `loadForgeProfile()`이 `null`을 반환하면 `'No forge profile found'` 메시지와 함께 `changed: false`를 반환하여 전체 v2 파이프라인이 한 번도 실행되지 않았다.

### 1.2 핵심 갭 (3명 교차 검증)

세 전문가 모두 동일한 결론에 도달했다:

**갭 1: 데이터 수집 파이프라인 단절**
- 이벤트가 기록되지 않으면 패턴 감지가 불가하고, 패턴이 없으면 차원 조정이 없고, 차원이 없으면 에이전트 튜닝이 의미없다.
- `auto-learn` → `pattern-detector` → `thompson-sampling` → `agent-tuner` 체인의 첫 링크가 끊어져 있다.

**갭 2: 세션 완결성 부재**
- `session-logger.ts`의 `startSessionLog()`는 호출되지만, `endSessionLog()`가 프로세스 종료 시 안정적으로 호출되지 않는다.
- 세션 duration, 결과, 보상 계산의 기반 데이터가 없다.

**갭 3: agent-tuner 출력의 실전 주입 경로 부재**
- `agent-tuner.ts`는 10개 에이전트에 대한 정교한 오버레이를 생성하지만, 이 출력이 실제 에이전트 호출 시 주입되는 경로가 없다.
- Plugin SDK 제약: tool input을 직접 수정할 수 없고, `approve(message)`로 힌트만 전달 가능하다.

**교차 검증에서 발견한 충돌과 해소:**

| 충돌 | AI 박사 / AI 엔지니어 | 하네스 개발자 (현실) | 해소 |
|---|---|---|---|
| Evolution Timeline 설계 | 30세션 sparkline 시각화 | forge 데이터 0, timeline 불가 | **Phase 0에서 forge 초기화 선행** |
| Surprise Detection | Thompson reward baseline 이탈 포착 | events.jsonl 6줄, baseline 없음 | **Phase 1.5로 이동, Phase 1.0은 수집+정적 시각화** |
| Contextual Bandit 648 arm | Beta-TS, 3-bin 양자화, 648 arm | arm당 10+ trials 필요 = 6,480 결정 | **Phase 2는 30+ 세션 후에만 의미** |

---

## 2. Phase 0: 선행 조건 — 데이터 파이프라인 활성화

Phase 0의 목표는 단 하나: **forge v2 파이프라인이 작동하여 데이터가 축적되기 시작하는 것.**

### 2.1 forge 초기화 자동화

**현재 문제**: `forge-profile.json`이 없으면 `runEvolveCycle()` 내부 (`auto-learn.ts:309-323`)에서 조기 종료. `shouldAutoLearnRun()` 자체는 통과하지만, 실제 학습 로직에 도달하지 못한다.

**해결 방안**: `harness.ts`의 `prepareHarness()` Step 8 이전에 forge profile 존재를 확인하고, 없으면 `signalsToDimensions()`로 자동 생성.

```typescript
// src/core/harness.ts — prepareHarness() 내부 추가
interface ForgeBootstrapResult {
  created: boolean;
  source: 'existing' | 'default' | 'interview' | 'scan';
}

async function ensureForgeProfile(cwd: string): Promise<ForgeBootstrapResult> {
  if (fs.existsSync(GLOBAL_FORGE_PROFILE)) {
    return { created: false, source: 'existing' };
  }
  // 1순위: project signals 스캔으로 초기값 추정
  const signals = await scanProject(cwd);
  const dimensions = signalsToDimensions(signals);
  const profile: ForgeProfile = {
    dimensions,
    createdAt: new Date().toISOString(),
    source: 'auto-scan',
    version: 1,
  };
  await atomicWriteJSON(GLOBAL_FORGE_PROFILE, profile);
  return { created: true, source: 'scan' };
}
```

**설계 결정**: 인터뷰(`forge interviewer`) 없이 스캔 기반 자동 생성을 선택한다. 이유:
- 인터뷰는 사용자 상호작용이 필요하여 자동화 파이프라인을 차단함
- `signalsToDimensions()`는 이미 구현되어 있고, 13개 프로젝트 신호를 차원으로 매핑함
- 초기값의 정확도는 중요하지 않음 — Thompson Sampling이 20-30세션 내에 수렴하도록 설계되었으므로 `sigma^2 = 0.04`의 넓은 탐색 범위가 오차를 흡수

### 2.2 이벤트 수집 파이프라인 완성

**현재 문제**: `lab/tracker.ts`의 `track()` 함수는 구현되어 있지만, 호출 지점이 불충분하다.

**필수 이벤트 수집 지점**:

| 이벤트 타입 | 수집 지점 | 현재 상태 | 필요 조치 |
|---|---|---|---|
| `agent-call` | `subagent-tracker.ts:16` | **구현됨** (model tier 포함) | SubAgentTool 감지를 `pre-tool-use.ts`에도 추가 (Phase 2 overlay 주입용) |
| `routing-decision` | `router.ts:151,165,171` | **구현됨** | 정상 작동 확인 |
| `user-override` | `permission-handler.ts:117` | **부분 구현** | `post-tool-use.ts`에서 reject 시 추가 track 필요 |
| `compound-injected` | `solution-injector.ts` | **구현됨** | 정상 작동 확인 |
| `compound-reflected` | `pre-tool-use.ts:241` | **구현됨** | 정상 작동 확인 |
| `session-metrics` | `post-tool-use.ts:162` | **구현됨** (50회 도구 호출마다) | 세션 종료 시 최종 집계 추가 (§2.3) |

**최소 이벤트 볼륨 목표**: `auto-learn.ts`의 `MIN_EVENTS_THRESHOLD = 30`을 만족시키려면 약 5-10세션의 정상 사용이 필요하다. (세션당 평균 3-6개 행동 이벤트 가정)

### 2.3 세션 종료 데이터 수집

**현재 문제**: `session-logger.ts`의 `endSessionLog()`가 프로세스 종료 시 안정적으로 호출되지 않는다. Claude Code 플러그인은 프로세스 생명주기를 제어하지 못하므로, `process.on('exit')` / `process.on('SIGINT')` 리스너에 의존하는데, 이 리스너가 비동기 I/O를 완료하기 전에 프로세스가 종료될 수 있다.

**해결 방안**: 두 가지 보완 전략

1. **Sync write on exit**: `endSessionLog()`에서 `fs.writeFileSync()`를 사용하여 동기적 파일 쓰기. `process.on('exit')` 콜백은 동기 코드만 실행할 수 있으므로 이 방식이 유일한 안정적 경로.

2. **Next-session recovery**: 다음 세션 시작 시 `endTime`이 없는 이전 세션 파일을 감지하고, 파일의 `mtime`을 `endTime`으로 역추산(backfill). 정확도는 낮지만 duration 추정을 0에서 "대략적 값"으로 개선.

```typescript
interface SessionRecovery {
  sessionId: string;
  estimatedEndTime: string;    // file mtime 기반
  estimatedDurationMs: number;
  recoverySource: 'file-mtime';
}
```

### 2.4 빈 실험 파일 정리

`lab/experiments/` 디렉터리에 2,652개의 빈 파일이 존재한다. 이는 `experiment.ts`의 초기화 버그로 추정되며, 파일명만 생성하고 내용을 쓰지 않은 것이다.

**조치**:
- 0바이트 파일 일괄 삭제 (데이터 손실 없음 — 빈 파일이므로)
- `experiment.ts`의 `createExperiment()` 함수에서 atomicWrite를 사용하여 원자적 생성 보장

**Phase 0 완료 게이트**:
- [ ] `forge-profile.json` 자동 생성 확인
- [ ] 5세션 실행 후 `events.jsonl`에 30+ 이벤트 축적
- [ ] 세션 파일에 `endTime` 필드 포함
- [ ] `auto-learn` 1회 이상 정상 실행 (EMA 경로)
- [ ] 빈 실험 파일 0개

---

## 3. Phase 1: 이해 레이어 (Understanding Layer)

Phase 1의 목표: **축적된 데이터를 사용자가 이해할 수 있는 형태로 시각화하여, "시스템이 나를 어떻게 이해하고 있는지" 투명하게 보여주는 것.**

### 3.1 이론적 근거

Phase 1은 세 가지 학술 기반 위에 설계된다:

**Shneiderman의 Visual Information-Seeking Mantra (1996)**: "Overview first, zoom and filter, then details-on-demand." 현재 `me-dashboard.ts`는 Level 1(Overview)만 제공한다. Phase 1은 Level 2(차원별 상세)와 Level 3(세션별 상세)을 추가한다.

**Schon의 Reflective Practice (1983)**: 현재 `compound-reflection.ts`는 "추출 중심(extraction-oriented)"이다. 솔루션과 패턴을 저장하지만, "왜 이렇게 했는지", "다음에 무엇을 다르게 할 수 있는지"를 제시하지 않는다. Phase 1은 추출 이후의 **해석 단계(interpretive phase)**를 추가한다.

**TS-Insight (arXiv:2507.19898, 2025)**: Thompson Sampling의 posterior 분포를 HDR(Highest Density Region) Plot으로 시각화하여 알고리즘의 검증가능성과 설명가능성을 확보한다. 사용자가 "시스템이 나를 이해해가는 과정"을 직관적으로 체감할 수 있다.

### 3.2 아키텍처 설계

모든 Phase 1 모듈은 **LLM 호출 0, 외부 의존성 0 (CDN 허용)** 원칙을 따른다. 이는 토큰 비용 없이 순수 데이터 변환만으로 시각화를 생성하기 위함이다.

#### 3.2.1 Knowledge Map (`src/insight/knowledge-map.ts`)

솔루션 간 관계를 그래프로 표현한다. PKM의 Knowledge Graph 접근법(Paranyushkin, 2019)을 tenetx 솔루션에 적용.

**데이터 흐름**:
```
~/.compound/me/solutions/*.md
  → frontmatter 파싱 (tags, identifiers, relatedPatterns, status, confidence)
  → Jaccard similarity 계산 (tag 집합 간)
  → 엣지 임계값 적용 (similarity > 0.3)
  → 노드-엣지 그래프 JSON 출력
```

**노드 속성**: id, title, status(실선/점선 구분), confidence(노드 크기), tag count(색상 농도)
**엣지 속성**: 두 솔루션 간 Jaccard similarity(엣지 두께)

Jaccard similarity 선택 이유: 솔루션 태그는 소규모 집합(평균 3-5개)이므로 cosine similarity 대비 계산이 단순하고, 집합 교집합의 직관적 해석이 가능하다. `detectContradictions()`가 이미 70% 태그 중첩을 기준으로 모순을 감지하므로, 동일한 유사도 척도를 공유하면 일관성이 높다.

#### 3.2.2 Evolution Timeline (`src/insight/evolution-timeline.ts`)

차원 벡터의 시간축 변화를 sparkline + small multiples(Tufte, 2006)로 시각화한다.

**데이터 소스**:
- `lab/thompson-state.json`의 `observations` 배열 (최대 200개, `{ dimensionValues, reward, timestamp }`)
- `lab/evolution-history.json`의 변화 이력

**시각화 모드**:
1. **ASCII Sparkline** (터미널): 차원별 30-세션 추이를 유니코드 블록 문자(`▁▂▃▄▅▆▇█`)로 표현
2. **HTML Chart** (브라우저): Chart.js CDN으로 인터랙티브 라인 차트 생성

**Phase 0 데이터 부재 대응**: observations가 0이면 "데이터 수집 중" 메시지를 표시하고, 최소 5세션 후부터 sparkline을 렌더링. 이는 하네스 개발자의 "forge 데이터 0" 문제를 명시적으로 처리한다.

#### 3.2.3 Session Retrospective (`src/insight/session-retrospective.ts`)

세션 종료 후 자동 회고를 생성한다. Schon의 reflection-on-action을 구현.

**설계 결정: LLM 호출 0, 패턴 매칭 기반**

LLM 호출을 사용하지 않는 이유:
- 세션 종료 시 추가 API 호출은 토큰 비용과 지연을 발생시킴
- 패턴 매칭만으로도 유의미한 회고를 생성할 수 있음 (아래 규칙 참조)

**회고 규칙 엔진**:

```
규칙 1: 솔루션 주입 후 override 발생
  → "주입된 솔루션 '{title}'이 거부되었습니다. 이 솔루션의 적합성을 재검토하세요."
  → evidence.negative 증가 트리거

규칙 2: 같은 에이전트 3회 이상 연속 호출
  → "'{agent}' 에이전트를 {n}회 반복 호출했습니다. 파이프라인 순서를 조정하면 효율적일 수 있습니다."

규칙 3: 세션 duration이 이전 30세션 평균의 2배 초과
  → "이번 세션은 평소보다 {ratio}배 길었습니다. 작업을 분할하면 집중도가 높아집니다."

규칙 4: reward가 baseline보다 1.5σ 이상 벗어남 (Surprise Detection)
  → "이번 세션은 평소와 다른 패턴을 보였습니다." (Phase 1.5, 30+ 세션 이후 활성화)

규칙 5: 과거 성공 패턴과의 비교 — Frame 재구성 (Rev 2 추가)
  → "최근 3세션에서 '{agent}'를 사용하지 않았습니다. 이전에 이 에이전트를 사용했던 성공 사례(솔루션 '{title}')가 있습니다. 이 패턴 변화가 의도적인지 확인하세요."
  → Schon의 "seeing-as": 현재 행동을 과거 레퍼토리와 비교하여 불일치 시 성찰 유도
  → 조건: injection-cache 히스토리에서 과거 3세션 내 사용된 에이전트가 현재 세션에서 0회 호출
```

규칙 1, 4, 5가 Schon의 reflective practice에 해당하고 (surprise → frame 재구성 → 실험), 규칙 2, 3은 usage analytics이다. Phase 1.0은 규칙 1-3, 5를 포함하고, 규칙 4(Surprise Detection)는 baseline 데이터가 필요하므로 Phase 1.5로 분류한다.

#### 3.2.4 HTML Dashboard (`src/insight/html-generator.ts`)

단일 HTML 파일로 Phase 1의 모든 시각화를 통합한다.

**기술 선택: Vanilla HTML + CDN**

| 선택지 | 장점 | 단점 | 결정 |
|---|---|---|---|
| Chart.js CDN | 가볍고, 번들 불필요, 반응형 | 오프라인 미지원 | **채택** |
| D3.js CDN | 유연하고 강력 | 학습 곡선, 코드량 증가 | 기각 |
| 번들(esbuild) | 오프라인 지원 | 빌드 단계 추가, 유지보수 비용 | 기각 |
| ASCII Only | 의존성 0 | 인터랙션 불가, 표현력 제한 | 터미널용으로만 |

CDN 채택 이유: tenetx는 개발자 도구이므로 인터넷 연결을 가정할 수 있고, Chart.js의 50KB는 네트워크 비용이 무시할 수준.

**오프라인/에어갭 대응 (Rev 2)**: CDN 로드 실패 시 `<noscript>` 태그 + ASCII 테이블 fallback을 HTML 내에 포함한다 (~30 LOC). Chart.js가 로드되지 않으면 자동으로 `<pre>` 기반 ASCII 테이블이 표시된다. 터미널 `tenetx me` 명령은 CDN 의존성이 없으므로 항상 작동한다.

**대시보드 구조 (Shneiderman 3계층)**:

```
Level 1 — Overview (기본 화면)
├── 5차원 Radar Chart (현재 프로파일)
├── Solution Maturity Pie Chart (experiment/candidate/verified/mature 비율)
├── 최근 7일 활동 요약 (세션 수, 이벤트 수, 보상 평균)
└── 경고 패널 (모순 감지, staleness, 낮은 confidence)

Level 2 — Zoom & Filter (차원 클릭 시)
├── 선택 차원의 Posterior Distribution (ASCII HDR Plot)
├── 30-세션 Sparkline 추이
├── 관련 패턴 목록
└── 이 차원에 영향을 준 이벤트 필터링

Level 3 — Details-on-Demand (세션 클릭 시)
├── 세션 타임라인 (이벤트 순서)
├── 주입된 솔루션 목록 + 결과
├── 보상 분해 (5개 구성요소)
└── 에이전트 오버레이 전문
```

### 3.3 Shneiderman 3계층 적용

현재 `me-dashboard.ts`의 5개 섹션(Profile, Evolution, Patterns, Agent Tuning, Cost)을 Shneiderman 만트라에 재배치:

| 현재 섹션 | Level 1 (Overview) | Level 2 (Zoom) | Level 3 (Detail) |
|---|---|---|---|
| Profile | 레이더 차트 | 차원별 posterior + CI | P(known) 이력 |
| Evolution | 최근 변화 요약 | 30-세션 sparkline | 개별 관측치 |
| Patterns | 패턴 수/유형 | 패턴별 confidence + 추세 | 패턴 증거 이벤트 |
| Agent Tuning | 활성 에이전트 수 | 에이전트별 파라미터 | 오버레이 전문 |
| Cost | 총 비용 | 차원 변화 vs 비용 상관 | 세션별 비용 상세 |

핵심 추가 요소: **Solution Topology Map** (Knowledge Map의 그래프 뷰)를 Level 1에 배치하여, 지식 구조의 전체 형태를 한 눈에 파악할 수 있게 한다.

**CLI 인터페이스 분리 (Rev 2)**:
- `tenetx me` — 터미널 ASCII 대시보드 (기존 `me-dashboard.ts`, CDN 무관)
- `tenetx me --html` — 브라우저 HTML 대시보드 (신규 `html-generator.ts`, CDN 사용)
- `tenetx compound map` — Knowledge Map HTML 생성 → 브라우저 오픈
- `tenetx compound map --mermaid` — Mermaid 텍스트 출력 (터미널/MCP용)

### 3.4 인터페이스 정의

```typescript
// src/insight/types.ts

/** Knowledge Map 노드 */
interface KnowledgeNode {
  id: string;                          // solution slug
  title: string;
  status: 'experiment' | 'candidate' | 'verified' | 'mature' | 'retired';
  confidence: number;                  // 0.0 ~ 1.0
  tags: string[];
  lastUpdated: string;                 // ISO 8601
}

/** Knowledge Map 엣지 */
interface KnowledgeEdge {
  source: string;                      // node id
  target: string;                      // node id
  similarity: number;                  // Jaccard, 0.0 ~ 1.0
}

/** Knowledge Map 전체 구조 */
interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  metadata: {
    generatedAt: string;
    totalSolutions: number;
    avgConfidence: number;
    statusDistribution: Record<string, number>;
  };
}

/** Evolution Timeline 데이터 포인트 */
interface TimelinePoint {
  timestamp: string;
  dimensions: Record<string, number>;  // 5차원 벡터 스냅샷
  reward: number;
  sessionId?: string;
}

/** Session Retrospective 결과 */
interface RetrospectiveResult {
  sessionId: string;
  duration: { actual: number; avgLast30: number; ratio: number };
  insights: RetrospectiveInsight[];
  surpriseDetected: boolean;           // Phase 1.5
}

interface RetrospectiveInsight {
  rule: string;                        // 규칙 ID (e.g., "override-after-injection")
  severity: 'info' | 'warn' | 'action';
  message: string;
  relatedSolution?: string;            // 관련 솔루션 slug
}

/** HTML Dashboard 생성 입력 */
interface DashboardInput {
  graph: KnowledgeGraph;
  timeline: TimelinePoint[];
  retrospectives: RetrospectiveResult[];
  currentProfile: DimensionVector;
  posteriors: Record<string, GaussianPosterior>;
  solutionCount: number;
  sessionCount: number;
}
```

### 3.5 기존 코드 연결점

Phase 1 모듈이 의존하는 기존 코드:

| Phase 1 모듈 | 의존하는 기존 코드 | 연결 방식 |
|---|---|---|
| knowledge-map | `engine/solution-format.ts` (SolutionV3 타입), `engine/solution-index.ts` (인덱스) | frontmatter 파싱 재사용 |
| evolution-timeline | `lab/thompson-sampling.ts` (ThompsonState), `lab/auto-learn.ts` (evolution history) | 파일 읽기 (`safeReadJSON`) |
| session-retrospective | `lab/reward.ts` (computeRewardComponents), `session-logger.ts` (SessionLog) | 보상 계산 재사용 |
| html-generator | `forge/me-dashboard.ts` (기존 ASCII 렌더링 참조) | 새 모듈, 기존 데이터 소스 공유 |

---

## 4. Phase 2: 개인화 오케스트레이션

Phase 2의 목표: **축적된 개인화 프로파일과 지식을 기반으로, 에이전트 조합과 워크플로를 동적으로 최적화하는 것.**

### 4.1 이론적 근거

**Multi-Agent Orchestration**: Gartner 보고(2025)에 따르면 multi-agent 시스템 문의가 1,445% 급증했고, orchestrator-worker 패턴이 가장 많이 배포되었다. tenetx에서 Claude Code가 이미 supervisor 역할을 하므로, tenetx는 "개인화된 오케스트레이션 지침을 supervisor에 주입"하는 구조가 자연스럽다.

**Contextual Bandit**: Li et al.(2010)의 LinUCB와 Desai et al.(2025)의 Thompson Sampling + contextual bandit 연구가 기반이다. 현재 tenetx의 Thompson Sampling은 차원 벡터만 학습하지만, Phase 2에서 에이전트 조합 선택으로 확장한다.

**Knowledge-Driven Orchestration**: OSC(2025)의 "knowledge-aware orchestration" — 각 에이전트가 무엇을 알고 있는지 모델링하고, cognitive gap을 식별하여 동적으로 커뮤니케이션을 조정한다. tenetx의 compound knowledge가 이 역할을 수행.

### 4.2 오케스트레이션 패턴: Personalized Supervisor-Expert Pipeline

6가지 오케스트레이션 패턴을 tenetx 제약 조건에 비추어 평가한 결과, 최적 조합:

```
Primary: Supervisor (Claude Code = 중앙 감독자)
    + Expert Pool (agent-tuner = 전문가 동적 선택)
    + Pipeline (태스크별 에이전트 체이닝)
    + Generate-Verify (품질 게이트)
```

**기각한 패턴**:
- Fan-out/Fan-in: Claude Code sub-agent가 직렬 호출만 지원하므로 실제 병렬 실행 불가
- Hierarchical: 단일 사용자 환경에서 다층 계층은 과도한 복잡성

**구체적 파이프라인 설계**:

```
Feature Pipeline:  architect → executor → test-engineer → code-reviewer
Bug Fix Pipeline:  debugger → executor → test-engineer
Refactor Pipeline: critic → refactoring-expert → test-engineer → code-reviewer
Quick Fix Pipeline: executor (단독)
```

파이프라인 선택 기준: 태스크 카테고리(`router.ts inferCategory()`)와 사용자 차원 벡터의 교차.

| 조건 | 파이프라인 | 이유 |
|---|---|---|
| qualityFocus >= 0.7 AND 카테고리 = feature | Feature (4단계) | 품질 중심 사용자의 feature 작업 |
| qualityFocus < 0.4 AND 카테고리 = bugfix | Quick Fix (1단계) | 속도 중심 사용자의 버그 수정 |
| riskTolerance < 0.3 | 모든 파이프라인에 security-reviewer 추가 | 위험 회피 사용자 |

### 4.3 Contextual Bandit 동적 라우팅

#### 4.3.1 Context 설계

| 컨텍스트 차원 | 소스 | 양자화 | 의미 |
|---|---|---|---|
| qualityFocus | forge profile | 3-bin (low/mid/high) | 사용자 품질 선호 |
| autonomyPreference | forge profile | 3-bin | 사용자 자율성 선호 |
| riskTolerance | forge profile | 3-bin | 사용자 위험 수용도 |
| taskCategory | `router.ts` | 6-categorical | 작업 유형 |
| solutionDensity | compound search | 3-bin (sparse/moderate/dense) | 관련 지식 양 |
| timeOfDay | Date | 3-bin (morning/afternoon/evening) | 시간 컨텍스트 |

5차원 중 `abstractionLevel`과 `communicationStyle`은 에이전트 **선택**이 아니라 에이전트 **행동 조정**에 영향을 주므로, 컨텍스트에서 제외하고 agent-tuner의 오버레이로 처리한다.

#### 4.3.2 Arm 설계 (Factored Bandit)

**문제**: 10개 에이전트의 모든 조합 = 2^10 = 1,024 arm. arm당 10+ trials이 필요하면 10,240 결정이 필요한데, 현실적으로 수백 세션이 소요된다.

**해결: Factored Bandit (Kveton et al., 2015)**

각 에이전트의 포함 여부를 독립적으로 학습한다:

```
P(include_i | context) ~ Beta(alpha_i(ctx), beta_i(ctx))

총 arm 수: 10 에이전트 × 컨텍스트 조합
           = 10 × (3 × 3 × 3 × 6 × 3 × 3)
           = 10 × 486
           = 4,860 (각각 독립 Beta 분포)
```

그러나 AI 엔지니어가 제안한 648 arm(양자화 축소) 대신, 더 보수적으로 접근한다:

**채택 설계**: executor는 항상 포함(고정), 나머지 9개 에이전트 중 태스크 카테고리별로 관련 있는 3-4개만 후보로 포함하여 실질적 arm 수를 줄인다.

```
Feature 태스크: executor(고정) + {architect?, test-engineer?, code-reviewer?} = 2^3 = 8 arm
Bugfix 태스크:  executor(고정) + {debugger?, test-engineer?} = 2^2 = 4 arm
Review 태스크:  {code-reviewer(고정), security-reviewer?, performance-reviewer?} = 2^2 = 4 arm
```

태스크 카테고리별 후보 에이전트를 사전 지식으로 고정. 단, Refactor 태스크는 후보가 4개(critic, refactoring-expert, test-engineer, code-reviewer)이므로 2^4=16 arm이다.

**보정된 arm 수 (Rev 2)**:
```
Feature:   2^3 =  8 arm
Bugfix:    2^2 =  4 arm
Review:    2^2 =  4 arm
Refactor:  2^3 =  8 arm  (code-reviewer 고정, 나머지 3개 선택)
Explore:   2^1 =  2 arm
Design:    2^2 =  4 arm
합계:           ~30 arm
```

arm당 10 trials = 약 300 결정 = 약 60-100 세션. **게이트 조건: "200+ 결정 또는 각 에이전트당 최소 5 trials 중 먼저 달성하는 조건".**

Factored Bandit의 핵심 이점은 에이전트별 독립 학습이므로, 실질 수렴 속도는 카테고리별 arm 수가 아니라 에이전트 수(10개)에 비례한다. 에이전트당 10 trials = 100 결정이면 대부분 수렴하지만, 희소 에이전트(performance-reviewer 등)는 편향된 호출 분포에서 더 오래 걸릴 수 있다.

#### 4.3.3 Cold Start 전략

세 가지 전략을 순서대로 적용한다:

**전략 1: Cross-Project Transfer**
사용자의 forge profile은 프로젝트 독립적(`~/.compound/me/`)이므로, 새 프로젝트에서 기존 프로파일을 warm prior로 사용. 단, 프로젝트 특성(philosophy.yaml)에 따른 discount factor를 적용하여 negative transfer를 방지.

```typescript
interface TransferConfig {
  /** dimension-aware discount (Rev 2: 균일 discount → 차원별 차등) */
  dimensionDiscount: Record<string, number>;
  // 프로젝트 독립 차원: communicationStyle(0.9), abstractionLevel(0.9)
  // 프로젝트 의존 차원: riskTolerance(0.5), qualityFocus(0.5), autonomyPreference(0.7)
  // philosophy.yaml에서 명시적 선호가 있으면 해당 차원 discount를 0.3으로 추가 하향
  minSessions: number;     // 전이 전 최소 세션 수 (5)
}
```

**차원별 차등 discount 근거 (Rev 2)**: `communicationStyle`(간결/상세)은 사용자 고유 선호로 프로젝트와 무관하다. 반면 `riskTolerance`는 프로젝트 phase(MVP vs 운영)에 크게 좌우된다. 균일 discount는 이 차이를 무시하므로, 프로젝트 독립 차원은 높은 전이율(0.9), 의존 차원은 낮은 전이율(0.5)을 적용한다.

**전략 2: Bayesian Warm Start**
Thompson Sampling의 초기 mu를 `defaultDimensionVector()`의 0.5 대신, 이전 프로젝트들의 수렴 mu 가중 평균으로 설정. sigma^2는 그대로 0.04을 유지하여 탐색 범위를 보장.

**전략 3: Exploration Budget**
초기 10세션은 "학습 기간"으로 지정. 이 기간 동안 epsilon-greedy(epsilon=0.3)로 다양한 조합을 시도하고, 사용자에게 "아직 최적화 중입니다. 10세션 후 개인화된 경험을 제공합니다"라는 투명한 메시지를 표시. Phase 1의 대시보드에서 학습 진행률을 시각화.

### 4.4 Agent Tuner 실전 연결

**현재 문제**: `agent-tuner.ts`의 출력(`AgentOverlay`)이 실제 에이전트 호출에 주입되는 경로가 없다.

**Plugin SDK 제약**: PreToolUse 훅에서 tool input을 직접 수정할 수 없다. `approve(message)`로 decision과 메시지만 전달 가능.

**해결 방안: `approve(message)` 기반 힌트 주입**

```typescript
// src/hooks/pre-tool-use.ts — SubAgentTool 감지 시

interface AgentHintInjection {
  agentName: string;
  overlay: AgentOverlay;
  injectionMethod: 'approve-message';
}

// approve의 message에 오버레이를 마크다운으로 포맷하여 전달
// Claude Code가 이 메시지를 sub-agent 컨텍스트에 포함
function injectAgentOverlay(overlay: AgentOverlay): string {
  return [
    `## Agent Behavior Overlay for ${overlay.agentName}`,
    ...overlay.behaviorModifiers.map(m => `- ${m}`),
  ].join('\n');
}
```

**트레이드오프**: `approve(message)`는 힌트이므로 Claude Code가 반드시 따르지 않을 수 있다. 그러나 이 방식은 Plugin SDK의 안정적 API를 사용하므로 호환성이 보장된다. tool input 직접 수정은 SDK가 허용하지 않으므로 기각한다.

### 4.5 Compound-Driven Pipeline

compound knowledge가 오케스트레이션에 영향을 주는 세 가지 경로:

**경로 1: Solution-Informed Agent Selection**
`solution-matcher.ts`가 현재 태스크에 관련된 솔루션을 검색하고, 솔루션의 태그가 특정 에이전트 도메인(architecture, performance, security 등)에 해당하면 해당 에이전트의 포함 우선순위를 높인다.

```
솔루션 "Strategy Pattern for Payment" (mature, 0.90)
  → tags: [design-pattern, architecture]
  → architect 에이전트 포함 확률 boost (+0.2)
```

**경로 2: Pattern-Driven Workflow Selection**
`auto-learn.ts`가 감지한 행동 패턴이 워크플로 선택에 영향:
- `frequent-tdd` 패턴 → test-engineer를 executor보다 앞에 배치 (Red → Green → Refactor)
- `high-override-rate` 패턴 → autonomy 파라미터 하향, Generate-Verify 강화

**경로 3: Confidence-Weighted Exploration**
주입할 솔루션의 평균 confidence가 높으면 exploitation(검증된 패턴 따르기), 낮으면 exploration(explore 에이전트 우선, 넓은 대안 탐색).

### 4.6 인터페이스 정의

```typescript
// src/orchestration/types.ts

/** 오케스트레이션 컨텍스트 */
interface OrchestrationContext {
  userDimensions: Pick<DimensionVector,
    'qualityFocus' | 'autonomyPreference' | 'riskTolerance'>;
  taskCategory: TaskCategory;
  solutionDensity: 'sparse' | 'moderate' | 'dense';
  timeOfDay: 'morning' | 'afternoon' | 'evening';
}

type TaskCategory =
  | 'feature' | 'bugfix' | 'refactor'
  | 'review' | 'explore' | 'design';

/** 오케스트레이션 결정 */
interface OrchestrationDecision {
  pipeline: PipelineStep[];
  confidence: number;               // bandit의 exploitation 확신도
  explorationReason?: string;       // exploration일 때 이유
}

interface PipelineStep {
  agentName: string;
  modelTier: 'haiku' | 'sonnet' | 'opus';
  overlay: AgentOverlay;
  isRequired: boolean;              // false면 스킵 가능
}

/** Factored Bandit 상태 */
interface FactoredBanditState {
  /** 에이전트별, 컨텍스트별 Beta 분포 */
  agents: Record<string, Record<string, BetaDistribution>>;
  totalDecisions: number;
  explorationBudgetRemaining: number;
}

interface BetaDistribution {
  alpha: number;  // 성공 카운트 + prior
  beta: number;   // 실패 카운트 + prior
}

/** 파이프라인 추천 결과 */
interface PipelineRecommendation {
  recommended: PipelineStep[];
  alternatives: PipelineStep[][];     // 대안 파이프라인
  reasoning: string;                  // 규칙 기반 추천 이유
}
```

---

## 5. 구현 로드맵

### 5.1 Phase 0 → 1 → 2 순서와 게이트 조건

```
Phase 0: 데이터 파이프라인 활성화
  ├── 0.1 forge 초기화 자동화          (1일)
  ├── 0.2 이벤트 수집 지점 보완         (1일)
  ├── 0.3 세션 종료 데이터 수집         (1일)
  └── 0.4 빈 실험 파일 정리            (0.5일)
  
  게이트: forge-profile.json 존재 + events.jsonl 30+ 이벤트 + auto-learn 1회 실행
  예상 소요: 코드 작업 3-4일 + 데이터 축적 대기 5-10 세션 (1-2주)

      ↓ 게이트 통과

Phase 1.0: 정적 시각화 (데이터 있는 것만)
  ├── 1.1 knowledge-map.ts             (1일)
  ├── 1.2 evolution-timeline.ts        (1일)
  ├── 1.3 session-retrospective.ts     (1일, 규칙 1-3만)
  └── 1.4 html-generator.ts           (4일)  ← Rev 2: 2→4일 (5섹션+CDN fallback+XSS 방어)
  
  게이트: 대시보드 렌더링 성공 + 솔루션 5개 이상 + 타임라인 5+ 포인트

      ↓ 30+ 세션 축적

Phase 1.5: 동적 분석 (충분한 baseline 필요)
  ├── 1.5.1 Surprise Detection (규칙 4)  (0.5일)
  └── 1.5.2 Preference Stability Curve   (0.5일)

  게이트: thompson-state.json observations 30+ 개 + P(known) 계산 가능

      ↓ 게이트 통과

Phase 2.0: 규칙 기반 오케스트레이션
  ├── 2.1 pipeline-recommender.ts       (1일)
  ├── 2.2 agent-overlay-injector.ts     (1일)
  └── 2.3 compound-driven pipeline      (1일)

  게이트: 3개 파이프라인 작동 + overlay 주입 확인

      ↓ 200+ 결정 축적 (또는 각 에이전트당 5+ trials)

Phase 2.5: 학습 기반 오케스트레이션
  ├── 2.4 contextual-bandit.ts          (3일)  ← Rev 2: 2→3일
  └── 2.5 cold-start 전략 통합          (1일)

  게이트: 에이전트당 5+ trials + bandit reward 수렴 추세
```

### 5.2 각 단계별 파일 구조

```
src/
├── insight/                          # Phase 1 (새 디렉터리)
│   ├── types.ts                      # KnowledgeGraph, TimelinePoint, ...
│   ├── knowledge-map.ts              # Jaccard similarity 그래프
│   ├── evolution-timeline.ts         # sparkline + Chart.js
│   ├── session-retrospective.ts      # 패턴 매칭 기반 회고
│   └── html-generator.ts            # 단일 HTML 파일 생성
│
├── orchestration/                    # Phase 2 (새 디렉터리)
│   ├── types.ts                      # OrchestrationContext, PipelineStep, ...
│   ├── pipeline-recommender.ts       # 규칙 기반 파이프라인 추천
│   ├── contextual-bandit.ts          # Factored Beta-TS
│   └── agent-overlay-injector.ts     # approve(message) 기반 주입
│
├── core/
│   └── harness.ts                    # Phase 0: ensureForgeProfile() 추가
│
├── hooks/
│   └── pre-tool-use.ts               # Phase 2: overlay injection 연결
│
└── lab/
    └── auto-learn.ts                 # Phase 0: 이벤트 수집 보완
```

### 5.3 예상 규모와 의존성

| 모듈 | 구현 LOC | 테스트 LOC | 신규 의존성 | 기존 의존성 |
|---|---|---|---|---|
| insight/knowledge-map | ~120 | ~80 | 없음 | solution-format, solution-index |
| insight/evolution-timeline | ~180 | ~100 | 없음 (Chart.js CDN) | thompson-sampling, auto-learn |
| insight/session-retrospective | ~110 | ~90 | 없음 | reward, session-logger |
| insight/html-generator | ~600 | ~150 | 없음 | knowledge-map, evolution-timeline |
| orchestration/pipeline-recommender | ~120 | ~80 | 없음 | router, agent-tuner |
| orchestration/contextual-bandit | ~350 | ~200 | 없음 | thompson-sampling (구조 참고) |
| orchestration/agent-overlay-injector | ~140 | ~80 | 없음 | agent-tuner, hook-response |
| Phase 0 수정 | ~50 | ~40 | 없음 | harness, session-logger, tracker |

**총 구현 코드**: ~1,670 LOC (Rev 1의 ~1,060에서 +58% 보정)
**총 테스트 코드**: ~820 LOC
**총 작업량**: ~2,490 LOC
**신규 외부 의존성**: 0개 (Chart.js는 런타임 CDN)

### 5.4 테스트 전략 (Rev 2 추가)

프로젝트 규칙 `forge-quality.md`에 따라 **변경 코드 경로 85% 커버리지** 목표.

**Phase 0 테스트** (~40 LOC):
- `ensureForgeProfile()`: 파일 존재/미존재/권한 에러 3케이스
- 이벤트 수집: 기존 `tracker.test.ts` 확장 (새 수집 지점 검증)

**Phase 1 테스트** (~420 LOC):
- knowledge-map: Jaccard 정확성 (0/1/부분 겹침), 빈 솔루션, edge 임계값 경계
- evolution-timeline: sparkline 렌더링, observations 0 fallback, 200개 처리
- session-retrospective: 규칙별 trigger/non-trigger, 통계 경계값
- html-generator: HTML 구조 유효성, **XSS 방어** (사용자 데이터가 HTML에 삽입되므로 escape 검증 필수), CDN fallback 동작

**Phase 2 테스트** (~360 LOC):
- pipeline-recommender: 6 카테고리 × 차원 조합, 경계값
- contextual-bandit: Beta 분포 수렴, cold start, arm 선택
- agent-overlay-injector: **SubAgentTool 감지** (현재 pre-tool-use.ts에 없으므로 새로 추가 필요), 포맷팅, approve 출력

**기존 테스트 영향**: Phase 0에서 `harness.test.ts` 2-3개 수정, Phase 2에서 `pre-tool-use-main.test.ts` 2-3개 수정. 나머지 1,481개 테스트에는 영향 없음 (새 디렉터리에 격리).

---

## 6. 트레이드오프와 결정 근거

### 6.1 채택한 결정과 기각한 대안

| 결정 | 채택 | 기각한 대안 | 근거 |
|---|---|---|---|
| Phase 0 선행 | Phase 0 → 1 → 2 순차 | Phase 1/2 동시 개발 | 데이터 없이 시각화/bandit은 빈 화면. 하네스 개발자의 진단이 결정적. |
| Bandit 알고리즘 | Beta-Bernoulli TS | LinUCB | Beta-TS는 구현이 단순하고, 차원 벡터의 비선형 관계를 사전 지식(prior)으로 인코딩 가능. LinUCB는 선형 보상 가정이 필요한데, 에이전트 조합의 보상이 선형이라는 보장이 없음. |
| 시각화 라이브러리 | Chart.js CDN | D3.js, 번들, ASCII only | 개발 비용 대비 표현력 최적. 터미널은 ASCII 병행. |
| Agent 주입 방식 | approve(message) 힌트 | tool input 직접 수정 | Plugin SDK가 tool input 수정을 지원하지 않음. approve(message)는 안정적 API. |
| Arm 공간 | Factored + 사전 지식 축소 (~30 arm) | 전체 2^10 = 1,024 arm | 1,024 arm은 10,240 결정 필요. Factored Bandit으로 에이전트별 독립 학습, 실질 수렴은 에이전트당 10 trials ≈ 100-200 결정. |
| Session 종료 | sync write + next-session recovery | async write only | process.on('exit')에서 async I/O 불가. 동기 쓰기가 유일한 안정적 경로. |
| LLM 호출 in Phase 1 | 0회 (패턴 매칭만) | LLM 기반 회고 생성 | 토큰 비용 0 유지. 패턴 매칭으로도 유의미한 회고 가능. |

### 6.2 위험과 완화 전략

**위험 1: approve(message) 힌트가 무시될 수 있음**
- 확률: 중간. Claude Code가 approve message를 항상 sub-agent 컨텍스트에 포함하는지는 Plugin SDK 동작에 의존.
- 완화: Phase 2.0을 규칙 기반으로 먼저 구현하여, 힌트 주입 없이도 파이프라인 추천이 작동하도록 설계. 힌트 주입은 추가 최적화.
- 측정: overlay 주입 후 에이전트 행동 변화를 reward 분해로 추적.

**위험 2: 솔루션 100개 하드캡에 도달**
- 확률: 낮음 (현재 20개). 장기적으로 1-2년 후 가능.
- 완화: `solution-index.ts`의 하드캡 경고를 Phase 1 대시보드에 표시. 파일 기반 저장은 현재 규모에서 문제없으나, 500+ 솔루션 시 인덱싱 성능 모니터링 필요.

**위험 3: Phase 0 데이터 축적이 예상보다 느림**
- 확률: 중간. MIN_EVENTS_THRESHOLD = 30 이벤트가 5-10세션에 축적된다는 가정인데, 사용 빈도에 의존.
- 완화: MIN_EVENTS_THRESHOLD를 15로 낮추는 옵션을 환경변수로 제공. 단, 30 미만에서 auto-learn의 패턴 감지 정확도가 떨어질 수 있으므로 기본값은 유지.

**위험 4: Negative Transfer (Cross-Project)**
- 확률: 중간. 프로젝트 A의 패턴이 프로젝트 B에서 해로울 수 있음.
- 완화: discount factor 적용. 솔루션 태그에 프로젝트 컨텍스트 추가. `checkIdentifierStaleness()`가 다른 프로젝트에서 식별자를 찾지 못하면 코드 스니펫 제외, 원리만 주입.

---

## 7. 참고 문헌

### Phase 1 (이해 레이어)

1. Shneiderman, B. (1996). The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations. *IEEE Symposium on Visual Languages*.
2. Schon, D.A. (1983). *The Reflective Practitioner: How Professionals Think in Action*. Basic Books.
3. Paranyushkin, D. (2019). InfraNodus: Generating Insight Using Text Network Analysis. *Proceedings of the Web Conference*.
4. Tufte, E. (2006). *Beautiful Evidence*. Graphics Press.
5. TS-Insight (2025). Visualizing Thompson Sampling for Verification and XAI. *arXiv:2507.19898*.
6. Chi, M.T.H. et al. (1989). Self-explanations: How students study and use examples in learning to solve problems. *Cognitive Science*, 13(2), 145-182.
7. Roediger, H.L. & Butler, A.C. (2011). The critical role of retrieval practice in long-term retention. *Trends in Cognitive Sciences*, 15(1), 20-27.
8. GitHub Copilot Metrics Dashboard (2025). *GitHub Blog*.

### Phase 2 (개인화 오케스트레이션)

9. Li, L. et al. (2010). A Contextual-Bandit Approach to Personalized News Article Recommendation. *WWW*.
10. Agrawal, S. & Goyal, N. (2013). Thompson Sampling for Contextual Bandits with Linear Payoffs. *ICML*.
11. Kveton, B. et al. (2015). Cascading Bandits: Learning to Rank in the Cascade Model. *ICML*.
12. Desai et al. (2025). Thompson Sampling + Contextual Bandit for Adaptive Systems.
13. OSC Framework (2025). Orchestrating Cognitive Synergy. *arXiv:2503.13754*.
14. The Orchestration of Multi-Agent Systems (2026). *arXiv:2601.13671*.
15. Advancing Multi-Agent Systems Through MCP (2025). *arXiv:2504.21030*.
16. Zhou, C. et al. (2024). PSI-KT: Scalable Bayesian Inference for Knowledge Tracing.
17. Walmart (2023). Lessons from Adopting Explore-Exploit Modeling. *Medium/WalmartGlobalTech*.
18. Esmeli, R. et al. (2024). Session-aware Cold Start in E-commerce Recommender Systems.
19. Zawia, M. et al. (2025). Meta-Learning Methods for Recommender Systems: Systematic Review.
