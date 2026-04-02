---
name: performance
description: This skill should be used when the user asks to "performance,성능,profiling,최적화,프로파일링,bottleneck". Performance profiling, bottleneck identification, and optimization
triggers:
  - "performance"
  - "성능"
  - "profiling"
  - "최적화"
  - "프로파일링"
  - "bottleneck"
---
<!-- tenetx-managed -->

<Purpose>
애플리케이션의 성능을 체계적으로 프로파일링하고 최적화합니다.
측정 기반 접근법으로 병목 지점을 식별하고, 최적화를 적용한 후
개선 효과를 정량적으로 검증합니다.
</Purpose>

<Steps>
1. **베이스라인 측정**: 현재 성능 지표를 수집합니다
   - 응답 시간 측정 (P50, P95, P99)
   - 처리량(throughput) 측정 (RPS, TPS)
   - 메모리 사용량 프로파일링 (힙 크기, GC 빈도)
   - CPU 사용률 측정 (사용자/시스템 시간)
   - I/O 대기 시간 (디스크, 네트워크)
   - 번들 크기 측정 (프론트엔드)
   - Core Web Vitals 수집 (LCP, FID, CLS)
   - 측정 환경 기록 (하드웨어, OS, 런타임 버전)

2. **병목 지점 식별**: 성능 저하의 근본 원인을 찾습니다
   - CPU 프로파일링 (핫 함수 식별)
   - 메모리 프로파일링 (힙 스냅샷, 리크 탐지)
   - 네트워크 분석 (요청 waterfall, 느린 API 호출)
   - 데이터베이스 쿼리 분석 (EXPLAIN, 슬로우 쿼리 로그)
   - N+1 쿼리 패턴 탐지
   - 불필요한 리렌더링 탐지 (React Profiler)
   - 이벤트 루프 블로킹 탐지 (Node.js)
   - 동기/비동기 혼용 문제 확인

3. **최적화 적용**: 식별된 병목을 해결합니다
   - 알고리즘 최적화 (시간/공간 복잡도 개선)
   - 캐싱 전략 적용 (인메모리, Redis, CDN)
   - 쿼리 최적화 (인덱스 추가, 쿼리 리팩토링)
   - 지연 로딩(lazy loading) 적용
   - 코드 스플리팅 (동적 import)
   - 이미지/에셋 최적화 (압축, WebP, CDN)
   - 커넥션 풀링 최적화
   - 비동기/병렬 처리 도입
   - 메모이제이션 적용 (useMemo, React.memo)
   - 불필요한 직렬화/역직렬화 제거

4. **검증**: 최적화 효과를 정량적으로 측정합니다
   - 동일 조건에서 베이스라인 대비 비교
   - 개선율 계산 (% 단위)
   - 회귀 테스트 -- 기능 동작이 변경되지 않았는지 확인
   - 부하 테스트 (k6, Artillery, autocannon)
   - 메모리 리크 없음 확인 (장시간 실행)
   - 엣지 케이스 성능 확인 (빈 데이터, 대용량 데이터)

5. **문서화**: 최적화 결과와 가이드를 기록합니다
   - 이전/이후 성능 비교표
   - 적용한 최적화 기법과 근거
   - 향후 성능 모니터링 포인트
   - 성능 예산(performance budget) 설정
   - 회귀 방지를 위한 성능 테스트 추가
</Steps>

## 에이전트 위임

`performance-reviewer` 에이전트(Opus 모델)에 위임하여 성능 분석을 수행합니다:

```
Agent(
  subagent_type="performance-reviewer",
  model="opus",
  prompt="PERFORMANCE ANALYSIS TASK

성능 프로파일링 및 최적화를 수행하세요.

Target: [분석 대상 코드/서비스]
Concern: [구체적인 성능 문제 또는 전반적 분석]

Analysis Checklist:
1. 베이스라인 측정 (응답 시간, 메모리, CPU)
2. 병목 지점 식별 (프로파일링)
3. 최적화 방안 제시 (우선순위별)
4. 최적화 적용 및 효과 검증
5. 성능 예산 및 모니터링 계획

Output: 성능 분석 리포트:
- 베이스라인 지표
- 병목 지점 목록 (영향도 순)
- 최적화 방안 및 예상 개선율
- 적용 결과 (이전/이후 비교)
- 권장 성능 예산"
)
```

## External Consultation (Optional)

performance-reviewer 에이전트는 교차 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 성능 분석을 먼저 완료** -- 독립적으로 프로파일링 수행
2. **검증을 위한 자문** -- Claude Task 에이전트를 통해 최적화 전략 교차 확인
3. **비판적 평가** -- 외부 제안을 맹목적으로 수용하지 않음
4. **우아한 폴백** -- 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 복잡한 알고리즘 최적화 (시간/공간 트레이드오프)
- 데이터베이스 쿼리 튜닝 (복잡한 JOIN, 서브쿼리)
- 분산 시스템의 성능 문제
- 메모리 리크 진단

### 자문을 생략하는 경우
- 단순 캐싱 적용
- 명확한 N+1 쿼리 해결
- 번들 크기 최적화
- 이미지/에셋 최적화

## 성능 분석 체크리스트

### 서버 사이드 (5개)
- [ ] 슬로우 쿼리가 식별되고 최적화됨
- [ ] N+1 쿼리 패턴이 제거됨
- [ ] 적절한 캐싱이 적용됨
- [ ] 커넥션 풀 크기가 적절히 설정됨
- [ ] 비동기 처리가 활용됨 (I/O 바운드 작업)

### 클라이언트 사이드 (5개)
- [ ] Core Web Vitals가 "Good" 등급
- [ ] 번들 크기가 예산 이내
- [ ] 코드 스플리팅이 적용됨
- [ ] 불필요한 리렌더링이 제거됨
- [ ] 이미지가 최적화됨 (WebP, lazy load)

### 인프라 (4개)
- [ ] CDN이 적절히 활용됨
- [ ] 캐시 히트율이 측정됨
- [ ] 오토스케일링 임계값이 설정됨
- [ ] 리소스 사용량이 모니터링됨

### 검증 (4개)
- [ ] 베이스라인 대비 개선율이 측정됨
- [ ] 부하 테스트로 한계 확인됨
- [ ] 메모리 리크가 없음이 확인됨
- [ ] 기능 회귀가 없음이 확인됨

## 성능 등급 기준

| 등급 | 응답 시간 (P95) | 메모리 | 번들 크기 |
|------|-----------------|--------|-----------|
| **EXCELLENT** | < 100ms | 안정적, 리크 없음 | < 200KB (gzip) |
| **GOOD** | < 300ms | 안정적 | < 500KB (gzip) |
| **FAIR** | < 1000ms | 점진적 증가 | < 1MB (gzip) |
| **POOR** | > 1000ms | 리크 의심 | > 1MB (gzip) |

## 최적화 우선순위 가이드

| 우선순위 | 대상 | 예상 효과 |
|----------|------|-----------|
| 1 | 슬로우 쿼리/N+1 제거 | 10x~100x |
| 2 | 캐싱 도입 | 5x~50x |
| 3 | 알고리즘 최적화 | 2x~10x |
| 4 | 번들/에셋 최적화 | 20~50% 감소 |
| 5 | 불필요한 리렌더링 제거 | 체감 개선 |

<Output>
```
PERFORMANCE REPORT / 성능 분석 리포트
======================================

Target: [분석 대상]
Environment: [Node.js 20 / Chrome 120 / etc.]
Date: YYYY-MM-DDTHH:MM:SSZ

BASELINE / 베이스라인
----------------------
| Metric           | Value    | Grade     |
|------------------|----------|-----------|
| Response (P50)   | 120ms    | GOOD      |
| Response (P95)   | 850ms    | FAIR      |
| Response (P99)   | 2100ms   | POOR      |
| Memory (avg)     | 256MB    | GOOD      |
| CPU (avg)        | 45%      | GOOD      |
| Bundle (gzip)    | 380KB    | GOOD      |

BOTTLENECKS / 병목 지점
-------------------------
1. [CRITICAL] src/api/orders.ts:45 - N+1 쿼리
   Impact: P95 응답 시간의 60%를 차지
   Evidence: 주문 1건당 상품 쿼리 N회 발생
   Fix: JOIN 또는 DataLoader 패턴 적용

2. [HIGH] src/utils/transform.ts:120 - O(n^2) 알고리즘
   Impact: 데이터 1000건 이상에서 급격한 성능 저하
   Evidence: CPU 프로파일링에서 핫스팟
   Fix: Map 기반 O(n) 알고리즘으로 변경

3. [MEDIUM] src/components/List.tsx - 불필요한 리렌더링
   Impact: 스크롤 시 프레임 드롭
   Evidence: React Profiler에서 불필요한 렌더 감지
   Fix: React.memo + useMemo 적용

OPTIMIZATIONS APPLIED / 적용된 최적화
---------------------------------------
1. N+1 쿼리 제거: JOIN 적용
   Before: 850ms (P95)  →  After: 120ms (P95)
   Improvement: 86% 감소

2. 알고리즘 최적화: O(n^2) → O(n)
   Before: 450ms (1000건)  →  After: 12ms (1000건)
   Improvement: 97% 감소

AFTER / 최적화 후
-------------------
| Metric           | Before   | After    | Change   |
|------------------|----------|----------|----------|
| Response (P95)   | 850ms    | 150ms    | -82%     |
| Memory (avg)     | 256MB    | 230MB    | -10%     |
| Bundle (gzip)    | 380KB    | 310KB    | -18%     |

PERFORMANCE BUDGET / 성능 예산
-------------------------------
- API Response (P95): < 200ms
- Bundle Size (gzip): < 400KB
- LCP: < 2.5s
- FID: < 100ms
- CLS: < 0.1

GRADE: [EXCELLENT / GOOD / FAIR / POOR]
```
</Output>

<Policy>
- 추측 기반 최적화 금지 -- 반드시 측정 결과에 근거
- 최적화 전후 비교를 정량적으로 제시합니다
- 가독성/유지보수성을 해치는 미시 최적화는 지양합니다
- 성능 예산을 설정하여 회귀를 방지합니다
- 프로덕션 환경과 유사한 조건에서 측정합니다
- 최적화의 부작용(메모리 증가, 복잡도 증가)을 명시합니다
</Policy>

## 다른 스킬과의 연동

**데이터베이스 연동:**
```
/tenetx:database 슬로우 쿼리 인덱싱
```
쿼리 성능 문제를 인덱스로 해결

**코드 리뷰 연동:**
```
/tenetx:code-review 성능 최적화 코드
```
최적화 코드의 정확성 검증

**TDD 연동:**
```
/tenetx:tdd 성능 회귀 테스트
```
성능 기준을 테스트로 보장

## Best Practices

- **측정 우선** -- "느린 것 같다"는 최적화 근거가 아님
- **큰 것부터** -- 10% 개선보다 10x 개선을 먼저 찾기
- **회귀 방지** -- 성능 테스트를 CI에 포함
- **예산 설정** -- 성능 예산을 팀과 합의
- **지속 모니터링** -- 프로덕션 성능을 실시간 추적

<Arguments>
## 사용법
`/tenetx:performance {분석 대상}`

### 예시
- `/tenetx:performance API 응답 시간 최적화`
- `/tenetx:performance 프론트엔드 번들 크기 분석`
- `/tenetx:performance src/services/order.ts 쿼리 성능`
- `/tenetx:performance 메모리 리크 진단`

### 인자
- 분석할 대상, 성능 문제, 최적화 목표를 설명
- 인자 없으면 프로젝트 전반의 성능을 프로파일링
</Arguments>

$ARGUMENTS
