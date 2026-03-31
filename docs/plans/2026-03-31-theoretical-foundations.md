# Tenetx Phase 1/2 이론적 기반 연구

> 작성일: 2026-03-31
> 목적: Phase 1(이해 레이어)과 Phase 2(개인화 오케스트레이션) 설계를 위한 학술적 근거 구축

---

## 목차

1. [Phase 1: 이해 레이어 (Understanding Layer)](#phase-1-이해-레이어)
   - 1.1 Knowledge Visualization 이론
   - 1.2 Developer Learning & Reflection
   - 1.3 Temporal Visualization
2. [Phase 2: 개인화 오케스트레이션 (Personalized Orchestration)](#phase-2-개인화-오케스트레이션)
   - 2.1 Multi-Agent Orchestration 이론
   - 2.2 Personalized Agent Routing
   - 2.3 Knowledge-Driven Orchestration

---

# Phase 1: 이해 레이어

## 1.1 Knowledge Visualization 이론

### 1.1.1 Personal Knowledge Management (PKM) 시스템의 시각화 접근법

**핵심 이론: Connected Knowledge as Graph**

PKM 시스템의 시각화 연구는 지식을 노드(개념)와 엣지(관계)로 표현하는 그래프 기반 접근법을 중심으로 발전해왔다. Obsidian의 Graph View는 마크다운 파일 간 링크를 자동 추출하여 지식 구조를 시각화하며, Roam Research는 양방향 링크(bi-directional linking)를 통해 비계층적(non-hierarchical) 네트워크 탐색을 가능하게 한다.

InfraNodus(Paranyushkin, 2019)는 텍스트 네트워크 분석(Text Network Analysis)을 PKM에 적용한 도구로, 지식 그래프의 구조적 공백(structural gaps)을 탐지하고 아이디어 생성을 지원한다. 2024년에 Obsidian 전용 플러그인이 출시되어 PKM 생태계와 직접 통합되었다.

**tenetx 적용 근거:**

tenetx의 compound engine은 `~/.compound/me/solutions/`에 솔루션을 마크다운으로 저장하고, 각 솔루션은 `tags`, `identifiers`, `relatedPatterns` 프론트매터를 가진다. 이는 본질적으로 **지식 그래프의 원재료**이다. 현재 `compound-search`/`compound-list` MCP 도구는 텍스트 검색만 지원하지만, 솔루션 간 태그 공유, 식별자 교차, 상태 전이(experiment -> candidate -> verified -> mature)를 그래프로 시각화하면 다음을 실현할 수 있다:

1. **Solution Topology Map**: 솔루션 간 관계를 그래프로 표현. `detectContradictions()`이 이미 태그 중첩률 70% 이상인 솔루션 쌍을 감지하므로, 이를 시각적 경고로 표시 가능
2. **Knowledge Maturity Heatmap**: solution lifecycle의 상태 분포를 색상 코딩. `statusConfidence()` 함수의 0.3/0.55/0.75/0.90 구간을 그라데이션으로 매핑
3. **Structural Gap Detection**: InfraNodus의 접근법을 차용하여, 태그는 많지만 솔루션이 없는 영역(지식 공백)을 식별

이 접근법이 Notion이나 일반 PKM보다 tenetx에 적합한 이유는, tenetx 솔루션이 **증거 기반 생명주기**(evidence-based lifecycle)를 가지기 때문이다. 일반 노트는 생성 후 갱신 여부를 알 수 없지만, tenetx 솔루션은 `reflected`, `reExtracted`, `injected`, `negative` 증거 카운터를 가지므로 시각화의 신뢰도 축을 확보할 수 있다.

**관련 연구:**
- Paranyushkin, D. (2019). InfraNodus: Generating Insight Using Text Network Analysis. *Proceedings of the Web Conference*.
- Obsidian Graph View: [https://forum.obsidian.md/t/personal-knowledge-graphs/69264](https://forum.obsidian.md/t/personal-knowledge-graphs/69264)
- InfraNodus Obsidian Plugin (2024): [https://infranodus.com/use-case/visualize-knowledge-graphs-pkm](https://infranodus.com/use-case/visualize-knowledge-graphs-pkm)

---

### 1.1.2 개발자 도구에서의 정보 시각화

**핵심 이론: Developer Intelligence Dashboards**

GitHub Copilot Metrics Dashboard(2025 public preview, 2026 GA)는 개발자 도구 시각화의 산업 표준을 형성하고 있다. 이 대시보드는 다음 메트릭 카테고리를 제공한다:

- **Adoption**: 일일/주간 활성 사용자 수
- **Engagement**: 기능별(completions, chat, agent) 사용 빈도
- **Acceptance Rate**: 제안 수락률
- **Lines of Code**: 제안/추가/삭제된 코드 라인
- **PR Lifecycle**: 풀 리퀘스트 생성~머지까지의 메트릭

접근 레벨은 Enterprise(전체 조직), Organization(팀), User(개인) 3단계로 구성된다.

**tenetx 적용 근거:**

현재 `me-dashboard.ts`는 ASCII 기반 터미널 대시보드로, 5개 섹션(Profile, Evolution, Patterns, Agent Tuning, Cost)을 표시한다. Copilot Metrics의 3-tier 접근 모델을 참고하되, tenetx는 **개인 전용 도구**이므로 다른 계층 구조가 필요하다:

| Copilot Metrics 계층 | tenetx 대응 | 의미 |
|---|---|---|
| Enterprise (조직 전체) | **Cross-Project** | 프로젝트 간 패턴 비교 |
| Organization (팀) | **Project Context** | 프로젝트별 솔루션/패턴 분포 |
| User (개인) | **Session** | 세션별 상세 행동 |

현재 `me-dashboard`에서 누락된 핵심 시각화:
1. **모델 라우팅 효율성**: `router.ts`의 `trackRoutingDecision()`이 이미 라우팅 결정을 기록하고 있으므로, signal/category/philosophy 소스별 분포와 에스컬레이션 빈도를 시각화 가능
2. **솔루션 주입 효과**: `solution-injector.ts`가 솔루션을 주입한 후 세션 결과가 개선되었는지 A/B 비교
3. **토큰 경제성**: `cost-tracker.ts` 데이터를 차원 변화와 상관 분석하여 "이 설정이 토큰을 절약했는가?" 시각화

**관련 연구:**
- GitHub Copilot Metrics Dashboard: [https://github.blog/changelog/2025-10-28-copilot-usage-metrics-dashboard-and-api-in-public-preview/](https://github.blog/changelog/2025-10-28-copilot-usage-metrics-dashboard-and-api-in-public-preview/)
- Microsoft Copilot Metrics Dashboard (오픈소스): [https://github.com/microsoft/copilot-metrics-dashboard](https://github.com/microsoft/copilot-metrics-dashboard)

---

### 1.1.3 Shneiderman의 Visual Information-Seeking Mantra

**핵심 이론: "Overview first, zoom and filter, then details-on-demand"**

Shneiderman(1996)의 정보 탐색 만트라는 정보 시각화의 가장 영향력 있는 설계 원칙이다. 세 단계로 구성된다:

1. **Overview First**: 전체 데이터셋을 한 화면에 요약. 스캐터플롯, 트리맵 등으로 전체 구조를 파악
2. **Zoom and Filter**: 관심 영역을 확대하고 불필요한 데이터를 필터링. 속성 기반 필터링으로 표시 단순화
3. **Details-on-Demand**: 특정 항목 선택 시 상세 정보 제공. 클릭, 호버 등의 인터랙션으로 세부사항 탐색

이 원칙은 Recorded Future의 사이버 인텔리전스 대시보드에서도 적용되어, "all things, some things, one thing" 패턴으로 재해석되었다.

**tenetx 적용 설계:**

tenetx 대시보드에 Shneiderman 만트라를 적용하면 다음 3계층 구조가 된다:

**Level 1 — Overview (tenetx me)**
```
현재 상태: 5차원 레이더 차트 + 솔루션 성숙도 파이 차트
한 눈에: "나는 품질 중심(0.78), 자율적(0.71), 간결한(0.65) 개발자"
경고: 2개 솔루션 모순 감지, 1개 솔루션 staleness 경고
```

**Level 2 — Zoom & Filter (tenetx me --dimension qualityFocus)**
```
qualityFocus 차원 상세: posterior 분포 곡선, 최근 30 세션 추이
필터: 이 차원에 영향을 준 패턴만 표시 (frequent-tdd, low-review-acceptance)
비교: 이 차원의 상위/하위 5세션 성과 비교
```

**Level 3 — Details-on-Demand (tenetx me --session abc123)**
```
특정 세션 복원: 어떤 솔루션이 주입되었고, 어떤 보상을 받았고, 어떤 차원이 변화했는지
에이전트 오버레이: 이 세션에서 각 에이전트가 받은 behaviorModifiers 전문
```

이 계층 구조가 tenetx에 특히 적합한 이유: 현재 `me-dashboard.ts`는 Level 1만 제공하며 Level 2/3이 완전히 빠져있다. Thompson Sampling의 `posteriors` 데이터, `observations` 이력, `preference-state`의 BKT 추적 데이터가 이미 파일 시스템에 축적되고 있지만, 접근 수단이 없다. Shneiderman 만트라는 이 데이터를 **점진적 공개(progressive disclosure)** 패턴으로 노출하는 설계 프레임워크를 제공한다.

**관련 연구:**
- Shneiderman, B. (1996). The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations. *IEEE Symposium on Visual Languages*. [https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf](https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf)
- Recorded Future의 Information-Seeking Mantra 적용: [https://www.recordedfuture.com/blog/information-seeking-mantra](https://www.recordedfuture.com/blog/information-seeking-mantra)

---

## 1.2 Developer Learning & Reflection

### 1.2.1 Schon의 Reflective Practice와 개발자 도구

**핵심 이론: Reflection-in-Action vs. Reflection-on-Action**

Donald Schon(1983)은 전문가의 사고 과정을 두 가지 성찰 유형으로 구분했다:

1. **Reflection-in-Action** (행동 중 성찰): 작업을 수행하는 도중에 상황을 해석하고, 실험하고, 전략을 수정하는 과정. "이 코드가 왜 이상하지?"라고 느끼는 순간의 직관적 판단
2. **Reflection-on-Action** (행동 후 성찰): 작업 완료 후 경험을 돌아보며 학습하는 과정. 스프린트 회고, 포스트모템, 코드 리뷰가 여기에 해당

van Amstel(2020)은 소프트웨어 개발 스튜디오에서 Schon의 이론을 적용하며, 개발 환경이 Schon이 말한 "reflective practicum" — 연습을 통해 실천을 학습하는 설계된 환경 — 과 동형임을 보였다.

Tryskiel(2024)은 애자일 소프트웨어 개발에서의 Reflective Practice를 분석하며, **Reflective Agile Learning Model (REALM)**을 제안했다. 릴리스 계획 미팅은 reflection-in-action에, 스프린트 회고는 reflection-on-action에 대응한다.

**tenetx 적용 근거:**

tenetx의 compound engine은 이미 두 가지 성찰 메커니즘을 구현하고 있다:

| Schon의 개념 | tenetx 현재 구현 | 제안하는 Phase 1 확장 |
|---|---|---|
| Reflection-in-Action | `solution-injector.ts`: 코딩 중 관련 솔루션을 컨텍스트에 주입 | **Contextual Nudge**: 현재 작업에서 과거 패턴과 일치/불일치하는 행동을 실시간 표시 |
| Reflection-on-Action | `compound-reflection.ts`: 세션 종료 시 패턴/솔루션 추출 | **Session Debrief**: 세션 종료 시 "이번 세션에서 배운 것" 자동 생성 |

핵심 통찰은, 현재 compound engine의 성찰이 **추출 중심(extraction-oriented)**이라는 것이다. 솔루션과 패턴을 추출하여 저장하지만, 사용자에게 "왜 이렇게 했는지" "다음에 뭘 다르게 할 수 있는지"를 제시하지 않는다. Schon의 프레임워크를 적용하면, 추출 단계 이후에 **해석 단계(interpretive phase)**를 추가해야 한다.

구체적으로:
- **Repertoire Building**: Schon은 전문가가 과거 경험의 레퍼토리를 축적하고, 새로운 상황을 레퍼토리와 비교(seeing-as)한다고 설명했다. tenetx의 `solutions/` 디렉터리가 바로 이 레퍼토리이며, `solution-matcher.ts`의 매칭 점수가 "seeing-as"의 계산적 구현이다.
- **Surprise Detection**: Schon의 reflection-in-action은 "surprise"에 의해 트리거된다 — 기대와 다른 결과가 나올 때. tenetx에서 이는 Thompson Sampling의 reward가 baseline보다 크게 벗어날 때(`advantage = r - baseline`이 극단적일 때)에 해당한다. 이 순간을 포착하여 "이번 세션은 평소와 다른 패턴을 보였습니다"라는 알림을 생성할 수 있다.

**관련 연구:**
- Schon, D.A. (1983). *The Reflective Practitioner: How Professionals Think in Action*. Basic Books.
- van Amstel, F. (2020). Reflective Practice in Software Development Studios. [https://fredvanamstel.com/wp-content/uploads/2020/08/reflective_practice_software_studio.pdf](https://fredvanamstel.com/wp-content/uploads/2020/08/reflective_practice_software_studio.pdf)
- Dyba, T. et al. Embedding Reflection and Learning into Agile Software Development. *InfoQ*. [https://www.infoq.com/articles/embedding-reflection-and-learning-into-agile-development/](https://www.infoq.com/articles/embedding-reflection-and-learning-into-agile-development/)

---

### 1.2.2 Spaced Repetition과 Active Recall의 코딩 패턴 학습 적용

**핵심 이론: Spacing Effect + Retrieval Practice**

간격 반복(Spaced Repetition)은 Ebbinghaus(1885)의 망각 곡선 연구에 기반하며, 기억이 사라지기 직전에 복습하면 장기 기억 형성이 최적화된다는 원리이다. 능동적 회상(Active Recall)은 정보를 메모리에서 직접 인출하는 행위가 학습을 강화한다는 원리이다(Roediger & Butler, 2011).

2025년 연구에서 주목할 발전:
- FSRS5 알고리즘(Anki에서 사용)이 사용자별 망각 곡선을 개인화하여 최적 복습 간격을 계산 (ASEE 2025)
- LLM 기반 복습 시스템이 능동적 회상과 간격 반복을 결합하여 공학 교육에서 성과 향상 (Peer.asee.org, 2025)
- 인지심리학 관점에서 간격 반복과 인출 연습의 통합 프레임워크 제안 (IJASSR, 2025)

**tenetx 적용 근거:**

tenetx의 solution lifecycle은 이미 **간격 반복의 구조적 골격**을 가지고 있다. 각 솔루션의 `evidence.injected` 카운터는 "이 솔루션이 몇 번 복습되었는가"이고, `MIN_AGE_FOR_PROMOTION`은 "최소 숙성 기간"이다:

```
experiment → (7일 최소) → candidate → (14일 최소) → verified → (7일 최소) → mature
```

그러나 현재 시스템에 빠져있는 것은 **능동적 회상(Active Recall)** 메커니즘이다. 솔루션 주입(`solution-injector.ts`)은 수동적으로 컨텍스트에 삽입될 뿐, 사용자가 스스로 회상하도록 유도하지 않는다.

Phase 1에서 제안하는 "Claude Teacher 프롬프트" 개념은 이 격차를 해결한다:

**Claude Teacher 프롬프트 설계:**

```
세션 종료 시 (compound-reflection 후):
1. 이번 세션에서 적용된 솔루션 목록 표시
2. 핵심 질문 생성: "이 세션에서 왜 Strategy 패턴을 선택했는가?"
3. 사용자 응답 없이도, 자동 해설 생성:
   - 어떤 대안이 있었는지
   - 이 선택의 트레이드오프
   - 관련된 미래 시나리오
```

이 설계가 효과적인 이유:
- **Self-explanation effect** (Chi et al., 1989): 자기 설명은 학습을 촉진한다. LLM이 사용자의 행동을 설명해주는 것은 "대리 자기설명(vicarious self-explanation)"에 해당
- **Generation effect** (Slamecka & Graf, 1978): 정보를 단순히 읽는 것보다 생성하는 것이 기억에 더 효과적. Claude Teacher가 질문을 던져 사용자가 이유를 생각하게 만드는 것이 핵심
- 2025년 LLM 튜터링 연구: "AI tutors improve practice, understanding, and time spent on learning when aligned with curriculum and providing clear feedback" (Microsoft GenAI Learning Outcomes Report, 2025)

주의점: 2025 연구에서 LLM 힌트의 35%가 "너무 일반적이거나, 부정확하거나, 정답을 직접 알려준다"는 문제가 보고되었다. tenetx Claude Teacher는 프로젝트의 실제 코드와 솔루션 데이터에 기반하므로 이 문제를 완화할 수 있지만, 생성된 해설의 품질 검증 메커니즘이 필요하다.

**관련 연구:**
- ASEE (2025). Enhancing Active Recall and Spaced Repetition with LLM-Augmented Review Systems. [https://peer.asee.org/board-101-work-in-progress-enhancing-active-recall-and-spaced-repetition-with-llm-augmented-review-systems.pdf](https://peer.asee.org/board-101-work-in-progress-enhancing-active-recall-and-spaced-repetition-with-llm-augmented-review-systems.pdf)
- Microsoft (2025). Learning Outcomes with GenAI in the Classroom. [https://www.microsoft.com/en-us/research/wp-content/uploads/2025/10/GenAILearningOutcomes-Report-published-10-07-2025.pdf](https://www.microsoft.com/en-us/research/wp-content/uploads/2025/10/GenAILearningOutcomes-Report-published-10-07-2025.pdf)
- LPITutor (2025): LLM based personalized intelligent tutoring system using RAG. [https://pmc.ncbi.nlm.nih.gov/articles/PMC12453719/](https://pmc.ncbi.nlm.nih.gov/articles/PMC12453719/)

---

## 1.3 Temporal Visualization

### 1.3.1 사용자 행동 변화의 시간축 시각화

**핵심 이론: Progression Timeline + Small Multiples**

행동 변화의 시간축 시각화는 두 가지 접근법이 주류이다:

1. **Sparkline 패턴** (Tufte, 2006): 최소한의 공간에서 시간 추이를 표시. 텍스트 인라인으로 삽입 가능한 초소형 차트
2. **Small Multiples** (Tufte, 1990): 동일한 시각 구조를 반복하여 차원 간 비교를 용이하게 함

**tenetx 적용 설계:**

현재 `me-dashboard.ts`의 `renderEvolution()`은 최근 5개 변화 이력을 텍스트로 표시한다:
```
8h ago  qualityFocus           0.65 → 0.68  (+0.030)
2d ago  autonomyPreference     0.58 → 0.61  (+0.030)
```

이를 Sparkline + Small Multiples로 확장:

```
  qualityFocus       [··#########] 0.78  ▁▂▃▄▅▆▇█▇█  (30 sessions)
  autonomyPreference [·····#####] 0.71  ▁▁▂▃▃▅▆▇▇█  (30 sessions)
  communicationStyle [······####] 0.65  ▃▃▃▄▅▅▅▆▆▆  (30 sessions)
  riskTolerance      [····######] 0.42  ▇▆▅▄▃▃▃▃▃▃  (30 sessions)
  abstractionLevel   [·····#####] 0.55  ▃▃▃▄▅▅▅▅▅▅  (30 sessions)
```

Thompson Sampling의 `observations` 배열이 `{ dimensionValues, reward, timestamp }` 형태로 최대 200개를 보관하므로, 이 데이터로 sparkline을 생성할 수 있다. `riskTolerance`의 하향 추세(▇→▃)와 `qualityFocus`의 상향 추세(▁→█)가 역상관(dimension-correlation.ts의 공분산 행렬에서 확인 가능)임을 시각적으로 표현할 수 있다.

---

### 1.3.2 스킬 성장 곡선과 학습 궤적 시각화

**핵심 이론: Learning Curve + Competence Visualization**

학습 궤적 시각화의 best practice:
- **S-curve (sigmoid)**: 초기 느린 성장 → 급격한 향상 → 플래토 패턴. BKT의 P(known) 추이가 이 형태를 따른다
- **Radar/Spider Chart**: 다차원 역량을 동시에 비교. 시점 간 오버레이로 성장 시각화
- **UX Skills Self-Assessment Matrix** (Maigen Thomas): 역량 영역별 자기 평가를 그리드로 시각화

**tenetx 적용 근거:**

tenetx의 5차원 프로파일은 "스킬"이라기보다 "선호"에 가깝지만, `preference-tracer.ts`의 P(known) 추이는 정확히 **선호 안정성의 성장 곡선**이다. P(known)이 0.3에서 0.8로 올라가는 과정은 "시스템이 사용자를 이해하는 속도"를 반영한다.

두 가지 성장 곡선을 분리하여 시각화할 것을 제안한다:

1. **Preference Stability Curve** (시스템의 학습): `preference-tracer.ts`의 P(known) 추이
   - X축: 관측 수 (세션 수)
   - Y축: P(known) [0, 1]
   - 의미: "시스템이 이 차원의 선호를 얼마나 확신하는가"
   - 실용성: P(known) < 0.5인 차원은 "아직 학습 중" 배지 표시, 사용자가 명시적 피드백을 줄 수 있는 인터페이스 제공

2. **Solution Maturity Funnel** (지식의 성장): solution lifecycle 전이율
   - 깔때기 시각화: experiment(100%) → candidate(?) → verified(?) → mature(?)
   - 각 단계의 통과율과 평균 체류 기간 표시
   - `circuit-breaker`로 retired된 비율도 표시하여 "지식의 사멸률" 파악

---

### 1.3.3 Thompson Sampling Posterior Distribution 시각화

**핵심 이론: TS-Insight (2025)**

TS-Insight(arXiv:2507.19898)는 Thompson Sampling의 내부 의사결정 메커니즘을 시각화하기 위해 설계된 visual analytics 도구이다. 주요 구성 요소:

1. **Highest Density Region (HDR) Plot**: 각 arm의 posterior 분포에서 가장 확률이 높은 영역을 시각화. 샘플이 HDR 밖에 떨어지면 희귀 사건(탐색적 행동)으로 표시
2. **Arm-wise Synchronized Subplots**: 각 arm을 행(row)으로 배치하고, posterior 변화/증거 카운트/샘플링 결과를 3개 동기화된 서브플롯으로 표시
3. **Temporal Posterior Evolution**: 시간에 따른 posterior 분포의 변화를 트레이스

이 도구는 Thompson Sampling 알고리즘의 검증(verification)과 설명가능성(XAI)을 지원한다.

**tenetx 적용 설계:**

tenetx의 Gaussian Thompson Sampling(`thompson-sampling.ts`)은 5개 차원 각각에 Normal(mu, sigma^2) posterior를 유지한다. TS-Insight의 접근법을 터미널 환경에 적응시키면:

**ASCII Posterior Visualization:**
```
qualityFocus  mu=0.78  sigma=0.09  n=47
              ··|····[====#====]····|··     (95% CI: 0.60 — 0.96)
              0.0            0.5            1.0

              Last sample: 0.82 (within HDR)
              Trend: mu +0.03 over last 10 sessions
```

`sigma^2` 감쇠 공식 `BASE_SIGMA2 / (1 + n / SIGMA2_DECAY_SCALE)`에서:
- n=0: sigma=0.20 (넓은 탐색) → 시각적으로 넓은 구간
- n=30: sigma=0.14 (수렴 중) → 구간 축소
- n=100: sigma=0.10 (안정) → 좁은 구간

이 축소 과정을 시간 슬라이더로 애니메이션하면, 사용자가 "시스템이 나를 이해해가는 과정"을 직관적으로 체감할 수 있다.

BKT와의 통합 시각화: `adjustSigmaWithBKT()`가 P(known)에 따라 sigma를 조절하므로, P(known)과 sigma의 상호작용을 이중 축 차트로 표시:
- 좌축: sigma (탐색 강도) — 낮을수록 활용(exploitation)
- 우축: P(known) (선호 안정성) — 높을수록 확신

두 곡선이 교차하는 지점이 "수렴 시점"이며, 이 시점 이후의 행동은 주로 exploitation에 해당한다.

**관련 연구:**
- TS-Insight (2025). Visualizing Thompson Sampling for Verification and XAI. [https://arxiv.org/html/2507.19898](https://arxiv.org/html/2507.19898)
- van den Burg, G. An Exploration of Thompson Sampling (Interactive). [https://gertjanvandenburg.com/blog/thompson_sampling/](https://gertjanvandenburg.com/blog/thompson_sampling/)

---

# Phase 2: 개인화 오케스트레이션

## 2.1 Multi-Agent Orchestration 이론

### 2.1.1 LLM 기반 Multi-Agent 시스템의 최신 연구

**핵심 프레임워크 비교 (2024-2026)**

| 프레임워크 | 아키텍처 패러다임 | 핵심 추상화 | 적합한 시나리오 |
|---|---|---|---|
| **LangGraph** | 그래프 기반 상태 머신 | 노드, 엣지, 조건부 라우팅 | 복잡한 다단계 추론, 도구 오케스트레이션 |
| **CrewAI** | 역할 기반 팀 조직 | Agent, Task, Crew | 팀워크 지향 워크플로, 역할 분담 |
| **AutoGen/AG2** | 대화 기반 협업 | 대화 프로토콜, 협상, 합의 | 다회전 협상, 토론, 합성 |
| **MetaGPT** | 소프트웨어 프로세스 시뮬레이션 | SOP(Standard Operating Procedure) | 소프트웨어 개발 파이프라인 |

Gartner는 2024 Q1 대비 2025 Q2에 multi-agent 시스템 문의가 **1,445% 급증**했다고 보고했다. 실제 배포 환경에서 multi-agent 아키텍처를 사용하는 기업은 단일 에이전트 대비 **3배 빠른 태스크 완료**와 **60% 높은 정확도**를 기록했다.

가장 많이 배포된 패턴은 **orchestrator-worker**: 중앙 오케스트레이터가 태스크를 수신 → 의도 분류 → 서브태스크 분해 → 전문 worker 에이전트에 라우팅 → 결과 합성.

**tenetx 적용 근거:**

현재 tenetx의 `agent-tuner.ts`는 10개 에이전트(code-reviewer, security-reviewer, executor, explore, architect, test-engineer, critic, refactoring-expert, performance-reviewer, debugger)에 대한 **개별 튜닝**을 제공하지만, 에이전트 간 **오케스트레이션**은 없다. 각 에이전트는 독립적으로 호출되며, 결과의 조합이나 순서는 사용자 또는 Claude Code가 결정한다.

Phase 2에서 오케스트레이션을 도입할 때, tenetx의 고유한 제약을 고려해야 한다:

1. **Claude Code 플러그인 제약**: tenetx는 독립 실행 프레임워크가 아니라 Claude Code의 플러그인이다. LangGraph나 CrewAI처럼 에이전트를 직접 생성/실행하는 것이 아니라, Claude Code가 사용하는 sub-agent에 **프롬프트 오버레이를 주입**하는 방식이다.
2. **단일 사용자 환경**: 엔터프라이즈 multi-agent 시스템은 여러 사용자의 요청을 처리하지만, tenetx는 한 명의 개발자를 위한 시스템이다. 이는 오케스트레이션의 목적이 "처리량 최적화"가 아니라 "결과 품질 최적화"임을 의미한다.
3. **Knowledge-Augmented**: 일반 multi-agent 시스템과 달리, tenetx는 compound knowledge base라는 고유한 지식 저장소를 가진다. 오케스트레이션 결정에 이 지식을 활용할 수 있다.

**관련 연구:**
- Agentic AI: A Comprehensive Survey (2025). [https://arxiv.org/html/2510.25445v1](https://arxiv.org/html/2510.25445v1)
- The Orchestration of Multi-Agent Systems (2026). [https://arxiv.org/html/2601.13671v1](https://arxiv.org/html/2601.13671v1)
- Kore.ai: Choosing the Right Orchestration Pattern. [https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)

---

### 2.1.2 6가지 오케스트레이션 패턴과 tenetx 적합성 분석

각 패턴을 tenetx의 현재 아키텍처와 제약 조건에 비추어 평가한다.

#### Pattern 1: Pipeline (직렬 처리)

**정의**: A → B → C 순서로 에이전트를 체이닝. 각 에이전트의 출력이 다음 에이전트의 입력이 된다.

**tenetx 적합성: 높음**

이유: tenetx의 코딩 워크플로는 자연스럽게 파이프라인 구조를 가진다. 예를 들어 `architect → executor → test-engineer → code-reviewer` 순서가 TDD 사이클과 일치한다.

현재 `agent-tuner.ts`의 10개 에이전트 중, 다음 파이프라인이 자연스럽다:
- **Feature Pipeline**: architect → executor → test-engineer → code-reviewer
- **Bug Fix Pipeline**: debugger → executor → test-engineer
- **Refactor Pipeline**: critic → refactoring-expert → test-engineer → code-reviewer

적용 방안: 사용자의 `qualityFocus` 차원에 따라 파이프라인 길이를 조절. qualityFocus >= 0.7이면 전체 4단계, <= 0.3이면 executor만 사용.

#### Pattern 2: Fan-out/Fan-in (병렬 분산-수집)

**정의**: 하나의 태스크를 여러 에이전트에 동시 분배(fan-out), 결과를 수집하여 합성(fan-in).

**tenetx 적합성: 중간**

이유: 코드 리뷰 시 `code-reviewer`, `security-reviewer`, `performance-reviewer`를 병렬 실행하여 각자의 관점에서 분석한 후, 결과를 통합하는 것이 자연스럽다. 그러나 Claude Code의 sub-agent는 현재 직렬 호출만 지원하므로, 실제 병렬 실행은 기술적 제약이 있다.

적용 방안: 병렬 실행이 불가하더라도, fan-out 패턴의 **논리적 구조**를 유지하되 직렬로 순차 호출하고 결과를 합성하는 "pseudo fan-out" 구현. `riskTolerance`가 낮은 사용자에게는 security-reviewer를 반드시 포함, 높은 사용자에게는 생략.

#### Pattern 3: Expert Pool (전문가 풀)

**정의**: 에이전트 풀에서 태스크 특성에 맞는 전문가를 동적 선택.

**tenetx 적합성: 매우 높음**

이유: 이것이 현재 `router.ts` + `agent-tuner.ts`의 조합이 지향하는 정확한 패턴이다. `ModelRouter.route()`가 프롬프트에서 태스크 카테고리를 추론하고, `generateAgentOverlays()`가 선택된 에이전트에 사용자 프로파일 기반 오버레이를 적용한다.

Phase 2 확장: 현재 선택 기준은 **태스크 카테고리(정적)**이지만, **compound knowledge(동적)**를 추가 신호로 활용. 예를 들어 "이 프로젝트에서 Strategy 패턴 솔루션이 3회 성공했으므로 architect 에이전트를 우선 추천" 같은 지식 기반 라우팅.

#### Pattern 4: Generate-Verify (생성-검증)

**정의**: Producer가 결과를 생성하고, Reviewer가 검증하여 품질 게이트 역할.

**tenetx 적합성: 높음**

이유: executor → code-reviewer 또는 executor → critic 패턴이 정확히 이 구조이다. compound engine의 solution lifecycle도 이 패턴을 따른다: 솔루션 추출(generate) → 반복 검증(verify) → 상태 승격.

적용 방안: `qualityFocus` 차원에 따라 검증 강도를 조절. qualityFocus >= 0.8이면 critic + code-reviewer + test-engineer 3중 검증, <= 0.3이면 검증 없이 직접 적용.

#### Pattern 5: Supervisor (감독자)

**정의**: 중앙 감독자가 모든 에이전트를 조율. 태스크 분해, 에이전트 할당, 진행 모니터링, 결과 합성을 담당.

**tenetx 적합성: 구조적으로 가장 자연스러움**

이유: Claude Code 자체가 이미 supervisor 역할을 하고 있다. tenetx는 이 supervisor에게 **개인화된 오케스트레이션 지침**을 주입하는 구조이다. Phase 2에서는 이 지침의 정교함을 높이는 것이 핵심이다.

적용 방안: `skill-injector.ts`가 세션 시작 시 주입하는 컨텍스트에 "오케스트레이션 정책"을 추가. 예: "이 사용자는 품질 중심이므로, 구현 후 반드시 code-review와 test를 수행하세요. 단, 커뮤니케이션은 간결하게."

#### Pattern 6: Hierarchical (계층적 위임)

**정의**: 트리 구조의 다층 감독. 매니저가 서브매니저에게 위임, 서브매니저가 worker에게 위임.

**tenetx 적합성: 낮음 (현재 단계에서)**

이유: 단일 사용자를 위한 코딩 하네스에서 다층 계층은 과도한 복잡성을 추가한다. Claude Code의 sub-agent 깊이 제한도 있다.

적용 방안: 당장은 불필요하나, 향후 "프로젝트 매니저 에이전트"가 여러 서브 프로젝트를 관리하는 시나리오에서 고려 가능.

**결론: tenetx Phase 2의 최적 오케스트레이션 조합**

```
Primary: Supervisor (Claude Code = 중앙 감독자)
    + Expert Pool (agent-tuner = 전문가 선택)
    + Pipeline (태스크별 에이전트 체이닝)
    + Generate-Verify (품질 게이트)
```

이 조합은 "Personalized Supervisor-Expert Pipeline with Quality Gates" 패턴으로 명명할 수 있다.

**관련 연구:**
- Multi-Agent Orchestration Patterns Complete Guide: [https://www.askaibrain.com/en/posts/11-multi-agent-orchestration-patterns-complete-guide](https://www.askaibrain.com/en/posts/11-multi-agent-orchestration-patterns-complete-guide)
- AI Wiki Multi-Agent Orchestration (2025): [https://artificial-intelligence-wiki.com/agentic-ai/agent-architectures-and-components/multi-agent-orchestration/](https://artificial-intelligence-wiki.com/agentic-ai/agent-architectures-and-components/multi-agent-orchestration/)
- Digital Applied AI Agent Orchestration Guide: [https://www.digitalapplied.com/blog/ai-agent-orchestration-workflows-guide](https://www.digitalapplied.com/blog/ai-agent-orchestration-workflows-guide)

---

## 2.2 Personalized Agent Routing

### 2.2.1 Contextual Bandit 기반 동적 라우팅

**핵심 이론: Contextual Multi-Armed Bandits (CMABs)**

Contextual Bandit은 표준 MAB를 확장하여, 각 의사결정 시점에서 **컨텍스트 정보(context)**를 관측하고 이를 기반으로 행동(arm)을 선택하는 프레임워크이다(Li et al., 2010, LinUCB). 수식으로:

```
매 라운드 t:
1. 컨텍스트 x_t 관측 (사용자 프로파일 + 태스크 특성)
2. 정책 pi(x_t)에 따라 행동 a_t 선택 (에이전트 조합)
3. 보상 r_t 관측 (세션 결과)
4. 정책 업데이트
```

Optimizely(2025)는 contextual bandit을 "treatment personalization"에 적용하여, "어떤 처리가 누구에게 효과적인지"를 동적으로 학습한다고 설명한다.

2025년 주목할 연구:
- **In-Context Dueling Bandits with LLM Agents** (ACL Findings 2025): LLM 에이전트가 bandit 문제를 in-context로 해결하는 연구. 쌍대 비교(dueling)를 통해 선호를 학습
- **EVOLvE: Evaluating and Optimizing LLMs For Exploration** (arXiv 2024): LLM의 탐색 능력을 평가하는 벤치마크(banditbench)

**tenetx 적용 근거:**

tenetx는 이미 Thompson Sampling 기반 contextual bandit을 `thompson-sampling.ts`에 구현하고 있다. 그러나 현재 구현은 **차원 벡터(dimension vector)**만 학습하며, **에이전트 라우팅**에는 적용되지 않는다.

현재 구조:
```
Thompson Sampling → 차원 벡터 학습 → agent-tuner가 차원으로 오버레이 생성
```

제안하는 Phase 2 확장:
```
Thompson Sampling → 차원 벡터 학습 ─┐
                                     ├→ Orchestration Policy 생성
Contextual Bandit → 에이전트 조합 학습 ─┘
```

구체적인 컨텍스트 설계:

| 컨텍스트 차원 | 소스 | 의미 |
|---|---|---|
| 사용자 차원 벡터 (5D) | `forge profile` | 현재 사용자 선호 |
| 태스크 카테고리 | `router.ts inferCategory()` | 현재 작업 유형 |
| 프로젝트 메타데이터 | `philosophy.yaml` | 프로젝트 특성 |
| 솔루션 밀도 | `compound-search` | 관련 지식 양 |
| 시간대 | `Date` | 시간 컨텍스트 |

행동 공간(arms):
- 에이전트 조합: `{executor}`, `{architect, executor}`, `{architect, executor, test-engineer, code-reviewer}` 등
- 각 에이전트의 모델 티어: `{executor:sonnet}`, `{executor:opus}` 등

보상 신호: 현재 `reward.ts`의 `SessionReward`를 확장하여, 에이전트 조합별 보상을 분리 추적.

### 2.2.2 사용자 선호 + 태스크 특성 = 최적 에이전트 조합 추천

**이론적 프레임워크: Factored Action Space**

에이전트 10개의 모든 조합을 탐색하면 2^10 = 1024개 arm이 되어 데이터 효율이 극히 나쁘다. 이를 해결하는 접근법:

1. **Factored Bandit** (Kveton et al., 2015): 행동 공간을 독립적인 인수(factor)로 분해. 각 에이전트의 포함 여부를 독립적으로 학습
2. **Combinatorial Bandit** (Chen et al., 2013): 슈퍼암(super-arm) = 기본 암의 부분집합. 기본 암의 보상을 학습하고 조합 최적화

tenetx에 적합한 접근: **Factored Bandit + 차원 기반 사전 지식(prior)**

```
각 에이전트 i의 포함 확률: P(include_i | context) = sigma(w_i^T * context + b_i)

사전 지식 (prior):
- executor: 항상 포함 (base agent)
- code-reviewer: qualityFocus > 0.5이면 높은 prior
- security-reviewer: riskTolerance < 0.4이면 높은 prior
- architect: abstractionLevel > 0.6 AND 태스크 = 'design'이면 높은 prior
```

이 사전 지식은 현재 `agent-tuner.ts`의 차원→파라미터 매핑에서 직접 도출할 수 있다. 예를 들어 `security-reviewer` 생성자에서 `risk < 0.5`일 때 상세한 스캔이 활성화되므로, `riskTolerance < 0.5`는 security-reviewer 포함의 강한 사전 신호이다.

### 2.2.3 Cold Start 문제와 Exploration-Exploitation 트레이드오프

**핵심 문제: 새 사용자, 새 프로젝트에서의 초기 학습**

Cold start는 두 가지 수준에서 발생한다:

1. **New User Cold Start**: tenetx를 처음 설치한 사용자. forge profile이 없고, compound knowledge가 비어있다
2. **New Project Cold Start**: 기존 사용자가 새 프로젝트를 시작. 프로젝트 특성이 이전과 다를 수 있다

**기존 연구의 해결책:**
- Esmeli et al. (2024): 이전 세션 데이터, 시간적 특징, 컨텍스트 통합으로 e-커머스 cold start 개선
- Zawia et al. (2025): Model-Agnostic Meta-Learning (MAML)을 추천 시스템에 적용
- Khaledian et al. (2025): 클러스터링 + 연관 규칙 마이닝으로 희소 환경에서 협업 필터링 강화
- Walmart (2023): explore-exploit 모델링의 산업 적용 교훈 — "warm start" 모델로 새 콘텐츠를 부트스트랩

**tenetx의 현재 cold start 대응:**

tenetx는 이미 cold start에 대한 방어 메커니즘을 가지고 있다:

1. `defaultDimensionVector()`: 모든 차원을 0.5(중립)로 초기화
2. `initThompsonState()`: sigma^2 = 0.04 (sigma = 0.2)로 초기 탐색 범위를 넓게 설정. 95% CI = +/-0.4
3. `forge interviewer`: 5개 질문으로 초기 프로파일 수집 (명시적 cold start 해소)
4. `philosophy-loader.ts`: 프로젝트의 philosophy.yaml에서 선언적 선호 추출

**Phase 2에서 제안하는 cold start 전략:**

**전략 1: Cross-Project Transfer (프로젝트 간 전이)**

사용자의 forge profile(차원 벡터)은 프로젝트 독립적이다. 새 프로젝트를 시작할 때 기존 프로파일을 "warm prior"로 사용하되, 프로젝트 특성에 따라 조정:

```typescript
function transferProfile(
  userProfile: DimensionVector,     // 기존 프로파일
  projectPhilosophy: Philosophy,    // 새 프로젝트의 선언적 특성
): DimensionVector {
  // 1. 기존 프로파일을 prior로 사용
  const prior = { ...userProfile };
  
  // 2. philosophy에서 추출한 차원 조정 적용
  // 예: "thorough-quality" 원칙 → qualityFocus += 0.1
  const philosophyDeltas = extractDimensionDeltas(projectPhilosophy);
  
  // 3. transfer_strength = min(0.3, sessions / 50)
  // 기존 프로파일에 대한 확신이 높을수록 전이 강도 증가
  return applyDeltas(prior, philosophyDeltas);
}
```

**전략 2: Bayesian Warm Start**

Thompson Sampling의 초기 posterior를 `defaultDimensionVector()`의 균일 초기화 대신, 기존 사용자 데이터에서 학습한 **population prior**로 설정:

```
New user prior: Normal(mu_population, sigma^2_initial)
where mu_population = 기존 사용자들의 평균 차원 벡터 (tenetx가 단일 사용자이므로, 이전 프로젝트들의 평균)
```

이는 Walmart의 "warm start" 접근법과 유사하며, Zhou et al.(2024)의 PSI-KT가 "hierarchical generative model로 scalable personalization"을 달성한 것과 맥을 같이 한다.

**전략 3: Exploration Budget**

초기 N 세션(예: N=10)은 "exploration budget"으로 지정. 이 기간 동안은 다양한 에이전트 조합과 차원 설정을 의도적으로 시도하되, 사용자에게 "아직 학습 중입니다. 10세션 후 최적화된 경험을 제공합니다"라는 투명한 메시지를 표시.

이 접근법의 핵심 이점은 **투명성(transparency)**이다. 대부분의 추천 시스템은 exploration을 사용자 모르게 수행하지만, tenetx는 개발자 도구이므로 사용자가 시스템의 학습 과정을 이해하고 신뢰할 수 있어야 한다. Phase 1의 TS-Insight 시각화가 이 투명성을 지원한다.

**관련 연구:**
- Li, L. et al. (2010). A Contextual-Bandit Approach to Personalized News Article Recommendation. *WWW*.
- Neural Contextual Bandits for Personalized Recommendation (WWW 2024 Tutorial): [https://www2024.thewebconf.org/docs/tutorial-slides/neural-contextual-bandits.pdf](https://www2024.thewebconf.org/docs/tutorial-slides/neural-contextual-bandits.pdf)
- Walmart: Lessons from Adopting Explore-Exploit Modeling: [https://medium.com/walmartglobaltech/lessons-from-adopting-explore-exploit-modeling-in-industrial-scale-recommender-systems-5be25dbda8d0](https://medium.com/walmartglobaltech/lessons-from-adopting-explore-exploit-modeling-in-industrial-scale-recommender-systems-5be25dbda8d0)
- Zhou et al. (2024). PSI-KT: Scalable Bayesian Inference for Knowledge Tracing.

---

## 2.3 Knowledge-Driven Orchestration

### 2.3.1 축적된 Compound Knowledge가 오케스트레이션에 영향을 주는 메커니즘

**핵심 이론: Knowledge-Aware Orchestration**

OSC(Orchestrating Cognitive Synergy, 2025) 프레임워크는 "knowledge-aware orchestration"을 제안한다: 각 에이전트가 **무엇을 알고 있는지** 모델링하고, 에이전트 간 "cognitive gap"을 식별하여, 올바른 지식이 올바른 시점에 공유되도록 동적으로 커뮤니케이션을 조정한다.

MCP(Model Context Protocol) 기반 multi-agent 시스템 연구(arXiv:2504.21030, 2025)는 **persistent memory**를 통한 cross-agent context sharing이 시간에 걸쳐 지식을 정제하고 재사용할 수 있게 한다고 보고한다.

**tenetx 적용 근거:**

tenetx의 compound knowledge는 다음 계층 구조를 가진다:

```
~/.compound/me/
  solutions/     ← 솔루션 (마크다운 + 프론트매터)
  rules/         ← 규칙 (마크다운 + 프론트매터)
  patterns/      ← 행동 패턴 (JSON)
  lab/
    thompson-state.json      ← Thompson Sampling posterior
    preference-state.json    ← BKT 선호 추적
    dimension-correlation.json ← 차원 공분산
    evolution-history.json   ← 차원 변화 이력
```

이 지식이 오케스트레이션에 영향을 주는 구체적 경로:

**경로 1: Solution-Informed Agent Selection**

`solution-matcher.ts`가 현재 태스크에 관련된 솔루션을 검색한다. 이 솔루션의 메타데이터가 에이전트 선택에 영향:

```
솔루션 "Strategy Pattern for Payment" (status: mature, confidence: 0.90)
  → tags: [design-pattern, architecture, payment]
  → 이 솔루션이 매칭되면 architect 에이전트의 우선순위 증가
  → 솔루션의 content를 architect 에이전트의 컨텍스트에 주입
```

```
솔루션 "N+1 Query Fix in User Module" (status: verified, confidence: 0.75)
  → tags: [performance, database, optimization]
  → 유사 패턴 감지 시 performance-reviewer 에이전트 자동 포함
```

**경로 2: Pattern-Driven Workflow Selection**

`auto-learn.ts`가 감지한 행동 패턴이 워크플로 선택에 영향:

```
패턴 "frequent-tdd" (confidence: 0.85)
  → test-engineer 에이전트를 executor보다 먼저 배치 (TDD pipeline)
  → Pipeline: test-engineer → executor → test-engineer (Red-Green-Refactor)

패턴 "high-override-rate" (confidence: 0.72)
  → autonomy 매개변수를 낮추고 확인 단계 추가
  → Generate-Verify 패턴 강화
```

**경로 3: Confidence-Weighted Injection**

현재 `solution-injector.ts`는 매칭 점수와 status confidence를 곱하여 주입 여부를 결정한다. 이를 오케스트레이션에 확장:

```
주입할 솔루션의 평균 confidence가 높으면:
  → "이 영역은 잘 알려진 영역" → exploitation 모드
  → 검증된 패턴을 따르는 에이전트 체인 사용

주입할 솔루션의 평균 confidence가 낮으면:
  → "이 영역은 탐험 영역" → exploration 모드
  → explore 에이전트 먼저 실행, 더 넓은 대안 탐색
```

### 2.3.2 성공 패턴 활용 vs. 새 조합 시도의 밸런스

**핵심 이론: Exploitation-Exploration in Knowledge Reuse**

이 문제는 "이 패턴이 성공했으니 다음에도 이 순서로" (exploitation) vs. "새로운 조합을 시도해봐야" (exploration)의 트레이드오프이다.

tenetx는 이미 이 밸런스를 두 가지 메커니즘으로 구현하고 있다:

1. **Thompson Sampling의 sigma^2** (`thompson-sampling.ts`):
   - sigma^2이 크면 exploration (넓은 posterior에서 샘플링)
   - sigma^2이 작으면 exploitation (좁은 posterior, mu 근처 샘플링)
   - `MIN_SIGMA2 = 0.001`로 완전 수렴 후에도 약간의 탐색 유지

2. **BKT의 pForget** (`preference-tracer.ts`):
   - pForget = 0.02 (50세션에 1번 선호 변화)
   - 이는 "안정된 선호도 잊어버리기"로, exploitation에서 벗어나는 메커니즘
   - `reEstimateParameters()`가 최근 일관성이 전체보다 낮으면 pForget을 증가시켜 선호 변화를 감지

**Phase 2에서 제안하는 추가 메커니즘:**

**메커니즘 1: Orchestration Entropy Monitoring**

오케스트레이션 결정의 엔트로피를 모니터링하여, 너무 획일화되면 강제 탐색:

```
엔트로피 계산:
  H = -sum(P(agent_combo_i) * log(P(agent_combo_i)))

if H < threshold (너무 획일적):
  → epsilon-greedy 전략으로 강제 탐색
  → "최근 20세션에서 항상 같은 에이전트 조합을 사용했습니다. 
     다른 조합을 시도해볼까요?"

if H > threshold (너무 산만):
  → exploitation 강화
  → 가장 성공적이었던 조합 가중치 증가
```

**메커니즘 2: Solution Lifecycle as Exploration Signal**

compound solution의 lifecycle 상태가 exploration 필요성을 신호:

```
experiment 솔루션 비율 높음 → 탐색 영역이 많음 → exploration 모드
mature 솔루션 비율 높음 → 안정된 영역 → exploitation 모드

retired 솔루션 급증 → 환경 변화 감지 → exploration budget 재충전
```

이는 `runLifecycleCheck()`의 결과를 오케스트레이션 정책에 피드백하는 것이다. `LifecycleResult`의 `promoted`, `demoted`, `retired` 카운터가 환경의 안정성/변동성 지표가 된다.

### 2.3.3 Transfer Learning 관점에서 Cross-Project Knowledge 활용

**핵심 이론: Domain Adaptation + Meta-Learning**

Cross-project knowledge transfer의 핵심 도전:
1. **Negative Transfer**: 프로젝트 A의 패턴이 프로젝트 B에서 해로울 수 있음
2. **Domain Shift**: 프로젝트의 언어, 프레임워크, 아키텍처가 다를 수 있음
3. **Context Mismatch**: 같은 패턴 이름이라도 컨텍스트가 다를 수 있음

**tenetx 적용 설계:**

tenetx의 compound knowledge는 **프로젝트 독립적**(~/.compound/me/)에 저장되므로, cross-project transfer가 기본 동작이다. 이는 장점이자 위험이다.

**Negative Transfer 방지 전략:**

1. **Solution Tags에 프로젝트 컨텍스트 추가**:
   ```yaml
   tags: [design-pattern, strategy, payment]
   project: tenetx           # 추가
   language: typescript       # 추가
   framework: node            # 추가
   ```
   `solution-matcher.ts`의 매칭 시 프로젝트 컨텍스트가 다르면 confidence를 감소(discount factor).

2. **Identifier Staleness as Transfer Signal**:
   현재 `checkIdentifierStaleness()`가 현재 프로젝트에서 식별자를 grep한다. 다른 프로젝트에서는 당연히 식별자가 없으므로, 이를 **stale이 아니라 transfer candidate**로 재해석:
   ```
   식별자가 현재 프로젝트에 없고, 솔루션이 다른 프로젝트에서 mature:
     → 이 솔루션의 "원리"는 적용 가능하지만 "구체적 코드"는 적용 불가
     → 솔루션의 body(설명)만 주입하고, 코드 스니펫은 제외
   ```

3. **차원 공분산의 프로젝트별 분리**:
   `dimension-correlation.ts`의 공분산 행렬은 프로젝트 간에 다를 수 있다. 예를 들어 오픈소스 프로젝트에서는 qualityFocus↑와 communicationStyle(verbose)↓가 상관관계를 가지지만, 개인 프로젝트에서는 그렇지 않을 수 있다.
   
   해결: 프로젝트별 공분산 행렬을 유지하되, 기본값은 전체 평균 공분산을 사용.

**Meta-Learning 접근: Learning to Orchestrate**

Zawia et al.(2025)의 MAML 접근법을 오케스트레이션에 적용:

```
Meta-objective: 새 프로젝트에서 K세션 내에 최적 오케스트레이션 정책에 수렴

Meta-parameter: 오케스트레이션 정책의 초기 가중치
  → 여러 프로젝트의 최적 정책을 학습한 "좋은 초기값"

Fine-tuning: 새 프로젝트의 첫 K세션에서 빠르게 적응

tenetx에서의 실현:
  → forge profile의 초기 차원 벡터 = meta-learned prior
  → Thompson Sampling의 초기 mu = 이전 프로젝트들의 수렴 mu의 가중 평균
  → 가중치 = 프로젝트 유사도 (language, framework, team-size)
```

**관련 연구:**
- OSC Framework (2025): Knowledge-aware orchestration. [https://arxiv.org/html/2503.13754v2](https://arxiv.org/html/2503.13754v2)
- Advancing Multi-Agent Systems Through MCP (2025). [https://arxiv.org/html/2504.21030v1](https://arxiv.org/html/2504.21030v1)
- Adaptive BKT Based on Personalized Characteristics (IEEE, 2024). [https://ieeexplore.ieee.org/document/10761945/](https://ieeexplore.ieee.org/document/10761945/)
- Deep Knowledge Tracing with Cognitive Load (Nature Scientific Reports, 2025). [https://www.nature.com/articles/s41598-025-10497-x](https://www.nature.com/articles/s41598-025-10497-x)

---

# 종합: tenetx Phase 1/2 이론-구현 매핑

| 이론/프레임워크 | tenetx 현재 구현 | Phase 1 확장 | Phase 2 확장 |
|---|---|---|---|
| PKM Knowledge Graph | solution frontmatter (tags, identifiers) | Solution Topology Map, Maturity Heatmap | Knowledge-informed routing |
| Shneiderman Mantra | me-dashboard (Level 1만) | 3-level progressive disclosure | Orchestration dashboard |
| Schon Reflective Practice | compound-reflection (추출 중심) | Session Debrief, Surprise Detection | Pattern-driven workflow selection |
| Spaced Repetition | solution lifecycle timing | Claude Teacher prompt | Confidence-weighted injection |
| Thompson Sampling | dimension vector learning | TS-Insight visualization | Orchestration policy bandit |
| BKT | preference-tracer (선호 안정성) | P(known) stability curve | Exploration budget management |
| Dimension Correlation | Welford covariance matrix | Coupled dimension visualization | Project-specific covariance |
| Contextual Bandit | model routing (signal scoring) | - | Agent combination bandit |
| Multi-Agent Orchestration | agent-tuner (개별 튜닝) | - | Supervisor-Expert Pipeline |
| Transfer Learning | project-independent solutions | - | Cross-project transfer with discount |

---

# 참고문헌

## Phase 1

1. Shneiderman, B. (1996). The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations. *IEEE Symposium on Visual Languages*.
2. Schon, D.A. (1983). *The Reflective Practitioner: How Professionals Think in Action*. Basic Books.
3. Paranyushkin, D. (2019). InfraNodus: Generating Insight Using Text Network Analysis. *Proceedings of the Web Conference*.
4. Tufte, E. (2006). *Beautiful Evidence*. Graphics Press.
5. Chi, M.T.H. et al. (1989). Self-explanations: How students study and use examples in learning to solve problems. *Cognitive Science*, 13(2), 145-182.
6. Roediger, H.L. & Butler, A.C. (2011). The critical role of retrieval practice in long-term retention. *Trends in Cognitive Sciences*, 15(1), 20-27.
7. TS-Insight (2025). Visualizing Thompson Sampling for Verification and XAI. *arXiv:2507.19898*.
8. ASEE (2025). Enhancing Active Recall and Spaced Repetition with LLM-Augmented Review Systems.
9. Microsoft (2025). Learning Outcomes with GenAI in the Classroom.
10. LPITutor (2025). LLM based Personalized Intelligent Tutoring System using RAG. *PMC*.

## Phase 2

11. Li, L. et al. (2010). A Contextual-Bandit Approach to Personalized News Article Recommendation. *WWW*.
12. Agrawal, S. & Goyal, N. (2013). Thompson Sampling for Contextual Bandits with Linear Payoffs. *ICML*.
13. Williams, R.J. (1992). Simple Statistical Gradient-Following Algorithms for Connectionist Reinforcement Learning. *Machine Learning*, 8, 229-256.
14. Corbett, A.T. & Anderson, J.R. (1994). Knowledge tracing: Modeling the acquisition of procedural knowledge. *User Modeling and User-Adapted Interaction*, 4(4), 253-278.
15. Kveton, B. et al. (2015). Cascading Bandits: Learning to Rank in the Cascade Model. *ICML*.
16. Zhou, C. et al. (2024). PSI-KT: Scalable Bayesian Inference for Knowledge Tracing.
17. Esmeli, R. et al. (2024). Session-aware Cold Start in E-commerce Recommender Systems.
18. Zawia, M. et al. (2025). Meta-Learning Methods for Recommender Systems: Systematic Review.
19. The Orchestration of Multi-Agent Systems (2026). *arXiv:2601.13671*.
20. OSC: Orchestrating Cognitive Synergy (2025). *arXiv:2503.13754*.
21. Advancing Multi-Agent Systems Through MCP (2025). *arXiv:2504.21030*.
22. Desai et al. (2025). Thompson Sampling + Contextual Bandit for Adaptive Systems.
