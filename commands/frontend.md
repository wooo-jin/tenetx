---
name: frontend
description: This skill should be used when the user asks to "frontend,프론트엔드,component,접근성,accessibility,컴포넌트 설계". Frontend component design, accessibility audit, and responsive implementation
triggers:
  - "frontend"
  - "프론트엔드"
  - "component"
  - "접근성"
  - "accessibility"
  - "컴포넌트 설계"
---
<!-- tenetx-managed -->

<Purpose>
프론트엔드 컴포넌트를 체계적으로 설계하고 구현합니다.
컴포넌트 계층 구조 설계, Props 인터페이스 정의, 접근성 감사,
반응형 레이아웃, 성능 최적화를 포함한 프론트엔드 개발 전체를 다룹니다.
</Purpose>

<Steps>
1. **컴포넌트 계층 구조 설계**: 컴포넌트 트리를 설계합니다
   - 페이지/기능 요구사항 분석
   - Atomic Design 원칙 적용 (Atoms → Molecules → Organisms → Templates → Pages)
   - 컴포넌트 책임 분리 (UI vs 로직)
   - 공유 컴포넌트 vs 도메인 컴포넌트 구분
   - 컴포넌트 트리 다이어그램 작성
   - 상태 관리 위치 결정 (로컬 vs 전역 vs 서버)
   - 데이터 흐름 방향 정의 (단방향 데이터 흐름)

2. **Props 인터페이스 설계**: 컴포넌트 API를 정의합니다
   - TypeScript 인터페이스 정의
   - 필수/선택 Props 구분
   - 기본값 설정 (defaultProps 또는 default parameter)
   - 콜백 Props 네이밍 컨벤션 (onXxx, handleXxx)
   - children 패턴 활용 (합성 패턴)
   - Render Props 또는 Compound Component 패턴 고려
   - Props 과도 확산(prop drilling) 방지 전략
   - Discriminated Union 타입으로 변형(variant) 관리

3. **접근성 감사**: WCAG 2.1 AA 기준으로 접근성을 검증합니다
   - 시맨틱 HTML 사용 (button, nav, main, section, article)
   - ARIA 속성 적절 사용 (aria-label, aria-describedby, role)
   - 키보드 내비게이션 (Tab, Enter, Escape, Arrow keys)
   - 포커스 관리 (포커스 트랩, 포커스 복원)
   - 색상 대비 (최소 4.5:1 for text, 3:1 for large text)
   - 스크린 리더 호환성 (라이브 리전, 상태 알림)
   - 모션 감소 대응 (prefers-reduced-motion)
   - 터치 타겟 크기 (최소 44x44px)
   - 대체 텍스트 (이미지 alt, 아이콘 aria-label)
   - 폼 접근성 (label 연결, 에러 메시지 연결)

4. **반응형 구현**: 다양한 화면 크기를 지원합니다
   - 브레이크포인트 정의 (mobile: 320px, tablet: 768px, desktop: 1024px+)
   - Mobile-first 접근법 적용
   - 유동적 레이아웃 (Flexbox, Grid)
   - 반응형 타이포그래피 (clamp, fluid type)
   - 이미지 반응형 처리 (srcset, picture, next/image)
   - 터치/마우스 인터랙션 차이 대응
   - 가로/세로 모드 대응

5. **성능 최적화**: 렌더링 성능을 최적화합니다
   - React.memo로 불필요한 리렌더링 방지
   - useMemo/useCallback 적절 사용 (남용 방지)
   - 코드 스플리팅 (React.lazy + Suspense)
   - 가상 스크롤 (대량 리스트, react-window)
   - 이미지 지연 로딩 (loading="lazy", Intersection Observer)
   - Web Vitals 모니터링 (LCP, FID, CLS)
   - 번들 분석 (webpack-bundle-analyzer)
</Steps>

## 에이전트 위임

`designer` 에이전트(Sonnet 모델)에 위임하여 컴포넌트를 설계합니다:

```
Agent(
  subagent_type="designer",
  model="sonnet",
  prompt="FRONTEND COMPONENT TASK

프론트엔드 컴포넌트를 설계하고 구현하세요.

Feature: [기능/페이지 설명]
Framework: [React / Vue / Svelte / etc.]
Styling: [Tailwind / CSS Modules / styled-components]

Design Checklist:
1. 컴포넌트 계층 구조 설계
2. Props 인터페이스 (TypeScript)
3. 접근성 감사 (WCAG 2.1 AA)
4. 반응형 레이아웃 (Mobile-first)
5. 성능 최적화 (리렌더링, 코드 스플리팅)

Output: 컴포넌트 설계 문서:
- 컴포넌트 트리
- Props 인터페이스
- 접근성 체크리스트 결과
- 반응형 브레이크포인트
- 성능 최적화 포인트"
)
```

## External Consultation (Optional)

designer 에이전트는 교차 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 설계를 먼저 완료** -- 독립적으로 컴포넌트 설계
2. **검증을 위한 자문** -- Claude Task 에이전트를 통해 접근성/UX 교차 확인
3. **비판적 평가** -- 외부 제안을 맹목적으로 수용하지 않음
4. **우아한 폴백** -- 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 복잡한 인터랙션 패턴 (드래그앤드롭, 가상 스크롤)
- 접근성이 중요한 공개 웹사이트
- 대규모 상태 관리 아키텍처
- 디자인 시스템 구축

### 자문을 생략하는 경우
- 단순 폼 컴포넌트
- 잘 알려진 UI 패턴
- 내부 어드민 도구
- 프로토타입 수준의 UI

## 접근성 체크리스트 (WCAG 2.1 AA)

### 인지 가능 (Perceivable) (5개)
- [ ] 모든 이미지에 대체 텍스트 (alt) 제공
- [ ] 색상 대비 4.5:1 이상 (텍스트), 3:1 이상 (대형 텍스트)
- [ ] 색상만으로 정보를 전달하지 않음 (아이콘/텍스트 병행)
- [ ] 텍스트 크기 200%까지 확대 가능 (레이아웃 깨짐 없이)
- [ ] 자동 재생 미디어에 정지 버튼 제공

### 조작 가능 (Operable) (5개)
- [ ] 모든 기능이 키보드로 접근 가능
- [ ] 포커스 순서가 논리적
- [ ] 포커스 표시가 명확 (outline 제거 금지)
- [ ] 터치 타겟 최소 44x44px
- [ ] 시간 제한이 있는 기능에 연장 옵션 제공

### 이해 가능 (Understandable) (4개)
- [ ] 폼 필드에 label이 연결됨
- [ ] 에러 메시지가 해당 필드 근처에 표시됨
- [ ] 링크 텍스트가 목적지를 설명 ("여기를 클릭" 금지)
- [ ] 언어 속성 (lang)이 설정됨

### 견고함 (Robust) (4개)
- [ ] 시맨틱 HTML 요소 사용 (div 남용 금지)
- [ ] ARIA 속성이 올바르게 사용됨
- [ ] 동적 콘텐츠에 aria-live 적용
- [ ] 커스텀 위젯에 적절한 role 설정

## 컴포넌트 복잡도 가이드

| 복잡도 | Props 수 | 상태 | 패턴 |
|--------|---------|------|------|
| **단순** | 0~3 | Stateless | 함수 컴포넌트 |
| **보통** | 4~8 | 로컬 상태 | useState/useReducer |
| **복잡** | 9+ | 전역 + 로컬 | Compound Component, Context |

<Output>
```
FRONTEND COMPONENT DESIGN / 프론트엔드 컴포넌트 설계
=====================================================

Feature: [기능명]
Framework: [React 18 + TypeScript]
Styling: [Tailwind CSS]

COMPONENT TREE / 컴포넌트 트리
---------------------------------
<ProductPage>
  ├── <ProductHeader>
  │   ├── <Breadcrumb />
  │   └── <ProductTitle />
  ├── <ProductGallery>
  │   ├── <ImageCarousel />
  │   └── <ThumbnailStrip />
  ├── <ProductInfo>
  │   ├── <PriceDisplay />
  │   ├── <VariantSelector />
  │   └── <AddToCartButton />
  └── <ProductReviews>
      ├── <ReviewSummary />
      └── <ReviewList />

PROPS INTERFACES / Props 인터페이스
--------------------------------------
interface ProductInfoProps {
  product: Product;
  selectedVariant: Variant | null;
  onVariantSelect: (variant: Variant) => void;
  onAddToCart: (quantity: number) => void;
  isLoading?: boolean;
}

ACCESSIBILITY AUDIT / 접근성 감사
-----------------------------------
Perceivable:  [5/5 PASS]
Operable:     [4/5 - 터치 타겟 크기 수정 필요]
Understandable: [4/4 PASS]
Robust:       [4/4 PASS]

RESPONSIVE BREAKPOINTS / 반응형 브레이크포인트
-------------------------------------------------
Mobile (< 768px):  단일 컬럼, 갤러리 스와이프
Tablet (768~1024px): 2컬럼 (갤러리 + 정보)
Desktop (> 1024px): 3컬럼 (갤러리 + 정보 + 리뷰)

PERFORMANCE / 성능
-------------------
- ImageCarousel: React.lazy로 지연 로딩
- ReviewList: 가상 스크롤 (react-window)
- 이미지: next/image with srcset
- 번들 기여: ~25KB (gzip)
```
</Output>

<Policy>
- 접근성은 선택이 아닌 기본입니다 -- WCAG 2.1 AA를 항상 충족
- 컴포넌트는 단일 책임 원칙을 따릅니다
- Props 인터페이스는 TypeScript로 명시합니다
- Mobile-first로 설계하고 데스크톱으로 확장합니다
- 성능 최적화는 측정 후 필요한 곳에만 적용합니다 (사전 최적화 금지)
- 디자인 시스템/토큰이 있으면 반드시 활용합니다
</Policy>

## 다른 스킬과의 연동

**성능 연동:**
```
/tenetx:performance 프론트엔드 번들 분석
```
번들 크기와 렌더링 성능 최적화

**TDD 연동:**
```
/tenetx:tdd 컴포넌트 유닛 테스트
```
컴포넌트별 테스트 작성

**코드 리뷰 연동:**
```
/tenetx:code-review src/components/
```
컴포넌트 코드 품질 검증

## Best Practices

- **합성 우선** -- 상속보다 합성(composition) 패턴 사용
- **접근성 내장** -- 나중에 추가하지 않고 처음부터 포함
- **타입 안전** -- Props에 TypeScript 타입을 명시
- **측정 후 최적화** -- React Profiler로 확인 후 최적화
- **일관된 패턴** -- 프로젝트 전체에서 동일한 패턴 유지

<Arguments>
## 사용법
`/tenetx:frontend {설계 대상}`

### 예시
- `/tenetx:frontend 상품 상세 페이지 컴포넌트 설계`
- `/tenetx:frontend 기존 폼 컴포넌트 접근성 개선`
- `/tenetx:frontend 대시보드 레이아웃 반응형 구현`
- `/tenetx:frontend 디자인 시스템 기본 컴포넌트 설계`

### 인자
- 설계할 페이지/기능, 프레임워크, 접근성 요구사항 등을 설명
- 인자 없으면 프로젝트의 프론트엔드 구조를 분석하여 개선점 제시
</Arguments>

$ARGUMENTS
