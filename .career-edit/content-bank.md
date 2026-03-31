# Career Content Bank

> Purpose: resume/portfolio drafting source of truth
> Last updated: 2026-03-30

## 1. Target Position

- Target role: Frontend Developer
- Core message: 고객에게 더 유용한 방향을 먼저 고민하고, 사람들과 함께 어려운 문제를 설계 중심으로 풀어가는 프론트엔드 개발자
- Writing priorities:
  - 협업 기반 문제 해결
  - 설계 중심 접근
  - 고객 친화적 제품 개발
  - 복잡한 UI/시각화 문제 해결
  - 공통화와 개발 효율화

## 2. Core Profile

프론트엔드 개발자로서 복잡한 요구사항을 빠르게 구현하는 것보다, 왜 이 문제가 중요한지 먼저 정의하고 더 나은 구조로 풀어내는 것을 중요하게 생각한다. 사용자에게 더 유용한 경험을 만들기 위해 시각화와 UI 구조를 설계해왔고, 팀이 함께 성장할 수 있도록 공통 라이브러리, 점진적 전환 구조, 지식 축적 방식도 함께 고민해왔다. 혼자 정답을 내기보다 사람들과 같이 어려운 문제를 풀며 더 나은 해법을 만드는 과정에서 가장 큰 보람을 느낀다.

## 3. Working Principles

- Customer utility first: 구현보다 먼저 사용자가 이 기능을 왜 필요로 하는지부터 본다.
- Design before build: 바로 코드를 치기보다 구조와 확장 포인트를 먼저 설계한다.
- Solve together: 어려운 문제를 닫아두지 않고 팀과 함께 논의하며 공통 이해를 만든다.
- Build reusable systems: 한 번 푼 문제를 개인 경험으로 끝내지 않고 팀 자산이나 시스템으로 남기려 한다.
- Optimize for sustainable velocity: 당장의 속도보다 반복 가능하고 유지 가능한 개발 효율을 추구한다.

## 4. Career Timeline

| Period | Organization | Role | Context |
| --- | --- | --- | --- |
| 2024.03 ~ Present | (주) 인티그레이션 | Frontend Developer | 시각화 공통화, React 점진 전환, 마이크로 프론트엔드, 내부 개발 생산성 개선 |
| 2021.01 ~ 2023.12 | (주) 테이텀 | Frontend Developer | 클라우드 제품의 시각화, 디자인 시스템, SSR, 문서 출력, 대시보드 개발 |
| 2026 ~ Present | Tenetx | Creator & Maintainer | 개발 철학과 워크플로우를 시스템으로 만드는 오픈소스 AI coding harness |
| 2021 | PICode | Frontend Developer | 공개 SW 개발자 대회 일반부문 금상 |
| 2020 | CRMS | Frontend Developer | 공개 SW 개발자 대회 일반부문 은상 |

## 5. Project Bank

### 5.1 (주) 인티그레이션

#### 시각화 라이브러리 (Intiviz)

- Type: 대표 프로젝트
- Role: 설계 및 구현
- Problem:
  - 제품/스쿼드별 차트 구현이 분산되어 시각화 스타일과 개발 방식이 제각각이었다.
  - 기존 라이브러리는 커스터마이징 한계가 있어 디자인 요구사항 대응 비용이 컸다.
- Why it mattered:
  - 제품 전반에서 공통으로 쓰는 시각화 품질을 높여야 했다.
  - 시각화 구현을 제품별 커스텀 작업이 아니라 공통 기반 위에서 반복 가능하게 바꿀 필요가 있었다.
- Design / Approach:
  - D3.js + 순수 TypeScript 기반의 framework-agnostic 시각화 라이브러리 설계
  - Atomic Design에서 영감을 받은 atom 단위 분해 구조
  - 프레임워크에 종속되지 않는 draw primitive와 고수준 chart component를 분리
- Verified evidence:
  - 3~4개 제품에서 공통 사용
  - `package.json` 기준 버전 `1.1.0`
  - draw layer export 16개
  - chart component export 4개
  - source files 41개, 약 3,305 LOC
  - React/Vue 사용 예시가 README에 존재
- What to emphasize:
  - 어떤 프레임워크에서도 쓸 수 있는 구조
  - atom 단위 모듈화로 커스텀이 자유로운 시각화 기반
- Effect:
  - 시각화 구현을 공통 기반 위에서 재사용 가능하게 바꿈
  - 제품별 요구에 맞춘 커스텀 대응 자유도를 높임
- Resume bullet candidate:
  - 3~4개 제품에서 공통 사용되는 D3 + TypeScript 기반의 framework-agnostic 시각화 라이브러리를 설계·구현하고, atom 단위 모듈화로 커스텀 가능한 시각화 기반을 만들었다.
  - 16개 draw primitive와 4개 chart component로 구성된 공용 라이브러리 구조를 설계해 React/Vue 등 다양한 프레임워크에서 재사용 가능한 시각화 시스템을 구축했다.

#### Vue 3 -> React 점진 전환

- Type: 보조 프로젝트
- Problem:
  - Vue 3 중심 구조로 인해 채용과 유지보수에 대한 팀 내 불안이 존재했다.
  - 전면 리라이트는 비용과 위험이 컸다.
- Design / Approach:
  - 페이지 단위 공존 전략으로 점진 마이그레이션 방향 제안
  - React 버전 공통 모듈을 분리 구축하고 전환 가이드 문서화
- Effect:
  - 전면 재작성 없이 React 전환 경로를 확보
  - 팀이 단계적으로 React 기반 개발 역량을 가져갈 수 있는 기반 마련

#### Module Federation 기반 마이크로 프론트엔드

- Type: 대표 프로젝트
- Role: 구조 설계 및 구현
- Problem:
  - Vue 3 기반 서비스에 React를 도입해야 했지만, 전면 전환은 부담이 컸다.
  - iframe은 보안 제약으로 사용하기 어려웠다.
- Why it mattered:
  - 채용/유지보수 리스크를 낮추면서 React 전환 경로를 실무적으로 열어야 했다.
- Design / Approach:
  - Vue 3 host에 React remote app 2개를 붙이는 구조 설계
  - Module Federation 기반으로 독립 배포 가능한 공존 구조 구성
- Effect:
  - 전면 리라이트 없이 React를 점진 도입
  - 독립 배포 구조 확보
  - 팀이 React로 이동할 수 있는 실질적 전환 경로 마련
- Resume bullet candidate:
  - Vue 3 host에 React remote app 2개를 Module Federation으로 통합해 iframe 없이 React를 점진 도입할 수 있는 마이크로 프론트엔드 구조를 설계했다.
  - 전면 재작성 없이 독립 배포와 공존 구조를 만들고, Vue 3 중심 환경에서 React 전환 경로를 실무적으로 열었다.

#### 사내 지식 하네스

- Type: 보조 프로젝트
- Public framing: 내부 개발 하네스 / 내부 지식 축적 시스템
- Problem:
  - 좋은 방법이 개인 경험으로만 남고 팀 자산으로 축적되기 어려웠다.
  - AI 활용 방식과 개발 방법론에 개인별 편차가 존재했다.
- Design / Approach:
  - 팀별/역할별 공통 지식을 축적하고 공유할 수 있는 하네스 설계
  - 자유로운 의견 제안과 검토/채택 구조를 통해 팀 자산으로 누적되도록 구성
- Effect:
  - 좋은 방법이 개인 경험으로 끝나지 않고 팀 자산이 되도록 기반 마련
  - AI 활용 편차를 줄이는 공통 기반 형성
- Resume bullet candidate:
  - 팀별·역할별 공통 지식을 축적·공유하는 내부 개발 하네스를 설계해, 개인 경험에 머물던 좋은 방법이 팀 자산으로 누적되도록 만들고 AI 활용 편차를 줄이는 기반을 구축했다.

### 5.2 (주) 테이텀

#### 아키텍처 시각화 개발 (FE)

- Type: 대표 프로젝트
- Role: 설계 및 구현
- Problem:
  - 클라우드 리소스가 분산되어 있어 전체 구조를 한눈에 파악하기 어려웠다.
  - 복잡한 인프라를 사용자 친화적으로 탐색할 수 있는 시각화가 필요했다.
  - 리소스를 빠르게 확인할 수 있다면 불필요한 리소스나 아키텍처 구조를 판단하는 데 큰 이점이 있었다.
- Technical challenges:
  - 시각화에 맞는 데이터 컨버팅과 기획 구조를 먼저 정리해야 했다.
  - 리소스 수 증가로 인한 렌더링 성능 저하
  - 줌/드래그/호버 등 인터랙션 시 추가 성능 저하
  - 배치 알고리즘 한계로 구조 파악이 직관적이지 않음
- Design / Approach:
  - 기획 단계에서 정보 노출 수준과 사용자 판단 흐름 정리
  - 시각화 데이터 컨버팅 작업 수행
  - 임계치 기반 축약/클러스터링 적용
  - interaction layer와 visualization layer 분리
  - 레이아웃/배치 규칙 직접 조정
- Effect:
  - 전체 구조를 더 빠르게 파악할 수 있는 UX 제공
  - 불필요한 리소스와 연결 관계를 더 쉽게 판단할 수 있게 함
  - 성능을 개선해 실제 사용 가능한 수준으로 끌어올림
- Resume bullet candidate:
  - 분산된 클라우드 리소스를 사용자 친화적으로 탐색할 수 있는 아키텍처 시각화 기능을 개발하고, 축약/클러스터링과 레이어 분리로 대규모 렌더링 및 인터랙션 성능 문제를 해결했다.

#### SSR 개발 경험

- Type: 보조 프로젝트
- Problem:
  - FOUC로 초기 로딩 경험이 저하되었다.
  - i18n을 클라이언트에서 처리하면서 초기 화면에 원문이 노출되었다.
- Approach:
  - 서버 사이드에서 대용량 데이터와 i18n을 처리
  - 초기 렌더링 품질과 보안 측면을 함께 개선
- Effect:
  - 초기 화면 품질 개선
  - 서버 중심 처리로 민감 데이터 노출 완화

#### 대시보드 시각화 라이브러리 제작

- Type: 보조 프로젝트
- Problem:
  - 클라우드 리소스 정보를 한 화면에서 빠르게 파악할 수 있는 대시보드가 필요했다.
  - 정보가 많아 함축적으로 보여줄 시각화 방식과 우선순위 정리가 필요했다.
- Approach:
  - 데이터/차트 유형과 화면별 우선순위 재정리
  - 시각화 전용 디자인 시스템과 재사용 가능한 컴포넌트 구조 설계
  - 시각화 컴포넌트 시스템 작업을 통해 재사용성 문제 해결 시도
- Effect:
  - 화면/기능 확장 시 재사용 가능한 시각화 기반 마련

#### 디자인 시스템 구축 작업

- Type: 보조 프로젝트
- Problem:
  - 기능 확장에 따라 컴포넌트 중복과 UI 불일치가 발생했다.
  - 기존 디자인 시스템이 있었지만 문제가 있어 재개편이 필요했다.
- Approach:
  - 디자인팀과 공통 원칙 및 비전 합의
  - 좋은 컴포넌트 디자인 패턴 조사 및 시스템 재구성
- Effect:
  - 일관성, 확장성, 개발 효율을 위한 공통 기준 정립

#### 문서 출력 개발 (BE)

- Type: 보조 프로젝트
- Problem:
  - 화면 데이터를 문서로 출력해 외부 공유 및 감사 대응이 가능해야 했다.
  - 출력 결과를 증적으로 남길 수 있어야 했다.
- Approach:
  - 기능 책임이 들어갈 서버를 구분해 아키텍처 설계
  - 포맷별 문서 출력 기능과 export 플로우 구현
- Effect:
  - 출력 흐름 안정화
  - 병목과 메모리 누수 문제 개선

### 5.3 Open Source / Early Projects

#### Tenetx

- Type: 오픈소스 / 개인 프로젝트
- Public framing:
  - 개인의 코딩 패턴과 개발 철학을 학습해 워크플로우를 조정하는 AI coding harness
- Verified evidence from repo:
  - npm package 배포
  - CI badge 및 MIT 라이선스 운영
  - 19 agent docs
  - 21 command docs
  - README 기준 42 commands
  - README badge 기준 tests 1,855 across 107 files
- What to emphasize:
  - 개발 철학과 방법론을 시스템으로 만든 경험
  - 개인/팀의 반복되는 문제를 구조로 바꾸는 성향

#### PICode

- Type: 초기 프로젝트
- Context:
  - 공개 SW 개발자 대회 일반부문 금상
- Problem:
  - Slack, Git, Notion 등 다양한 도구로 인해 정보가 산재되는 문제를 해결하고 싶었다.
- Approach:
  - 문서 편집, Docker 시각화, 코드 동시 편집 기능 구현
  - 동시 편집 시 사용자 간 충돌 문제를 다루며 협업 기능 고도화
- Effect:
  - 분산된 협업 도구 경험을 하나의 서비스로 통합하려는 시도

#### CRMS

- Type: 초기 프로젝트
- Context:
  - 공개 SW 개발자 대회 일반부문 은상
- Problem:
  - 공부용으로 생성된 클라우드 리소스를 한 번에 확인하고 관리하기 어려웠다.
  - 여러 페이지를 오가며 리소스를 확인해야 하는 불편함이 컸다.
- Approach:
  - 대시보드, 아키텍처 시각화, 데이터 그리드 구현
  - 다양한 유형의 데이터를 다루는 UI 구조 설계
- Effect:
  - 초기부터 시각화와 구조 파악 문제에 관심을 두고 해결한 경험

## 6. Skills Bank

- Frontend: React, Next.js, Vue 3, TypeScript, JavaScript
- Visualization: D3, Canvas, WebGL
- Build: Vite, Webpack, Rollup, Babel
- Styling: CSS, Emotion, MUI, Tailwind
- Testing: Jest, React Testing Library, Cypress, Playwright
- Backend / Infra: Node.js, Express, NestJS, MySQL, MongoDB, DynamoDB, AWS, Azure, GCP, Docker, Nginx, GitHub Actions

## 7. Education / Awards

- 광운대학교 시스템소프트웨어학과 학사, 2017.03 ~ 2021.02
- 제4대 소프트웨어융합대학 학생회장
- Best of the Best 수료, 보안제품개발 트랙, 2020.08 ~ 2021.02
- 성균관대학교 정보통신대학원 빅데이터학과 석사 졸업, 2022.03 ~ 2024.09
- 2021 공개 SW 개발자 대회 일반부문 금상, PICode
- 2020 공개 SW 개발자 대회 일반부문 은상, CRMS

## 8. Open Questions For Final Editing

- Intiviz의 적용 제품명 또는 화면 범위 중 외부 공개 가능한 수준
- Module Federation 프로젝트의 실제 배포/운영 범위
- 사내 하네스의 공개 가능한 표현 수위
- 각 프로젝트에서 넣을 수 있는 추가 수치:
  - 성능 개선 수치
  - 개발 시간 단축
  - 사용자/팀 범위
  - 배포 단위 수
