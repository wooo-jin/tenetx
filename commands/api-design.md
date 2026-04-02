---
name: api-design
description: This skill should be used when the user asks to "api design,api 설계,REST,GraphQL,엔드포인트,endpoint". Design REST/GraphQL APIs with resource modeling, error handling, and versioning
triggers:
  - "api design"
  - "api 설계"
  - "REST"
  - "GraphQL"
  - "엔드포인트"
  - "endpoint"
---
<!-- tenetx-managed -->

<Purpose>
REST 또는 GraphQL API를 체계적으로 설계합니다.
리소스 모델링부터 엔드포인트 설계, 에러 핸들링, 버전 관리, 문서화까지
API 라이프사이클 전체를 다룹니다.
</Purpose>

<Steps>
1. **리소스 모델링**: 도메인 엔티티를 API 리소스로 변환합니다
   - 핵심 도메인 엔티티 식별 (명사 기반)
   - 리소스 간 관계 매핑 (1:1, 1:N, N:M)
   - 중첩 리소스 vs 독립 리소스 결정
   - 리소스 표현(representation) 스키마 정의
   - 필수/선택 필드 구분 및 타입 명시

2. **엔드포인트 설계**: URL 구조와 HTTP 메서드를 결정합니다
   - RESTful URL 컨벤션 적용 (복수형 명사, 계층 구조)
   - HTTP 메서드 매핑 (GET/POST/PUT/PATCH/DELETE)
   - 쿼리 파라미터 설계 (필터링, 정렬, 페이지네이션)
   - 페이지네이션 전략 선택 (cursor vs offset)
   - 벌크 작업 엔드포인트 필요 여부 결정
   - HATEOAS 링크 포함 여부 결정
   - GraphQL의 경우: Query/Mutation/Subscription 분리

3. **에러 핸들링**: 일관된 에러 응답 체계를 구축합니다
   - HTTP 상태 코드 매핑 (400, 401, 403, 404, 409, 422, 429, 500)
   - 에러 응답 스키마 정의 (code, message, details, trace_id)
   - 비즈니스 에러 코드 체계 설계
   - 유효성 검증 에러 상세 포맷 (필드별 에러 목록)
   - Rate limiting 응답 헤더 (X-RateLimit-Limit, Remaining, Reset)
   - 에러 메시지의 국제화(i18n) 전략

4. **버전 관리**: API 진화 전략을 수립합니다
   - 버전 관리 방식 선택 (URL path vs Header vs Query param)
   - Breaking change 정의 및 마이그레이션 가이드
   - Deprecation 정책 (최소 6개월 유예기간 권장)
   - Sunset 헤더 및 공지 절차
   - 하위 호환성 유지 전략

5. **보안 설계**: API 보안 정책을 수립합니다
   - 인증 방식 선택 (Bearer Token, API Key, OAuth 2.0)
   - 인가 모델 설계 (RBAC, ABAC, Scope 기반)
   - Rate limiting 정책 (엔드포인트별 차등 적용)
   - CORS 정책 설정
   - 입력 검증 규칙 (크기 제한, 타입 검증, 범위 검증)
   - 민감 데이터 마스킹 규칙

6. **문서화**: API 명세를 작성합니다
   - OpenAPI 3.0+ (REST) 또는 GraphQL Schema 작성
   - 각 엔드포인트별 요청/응답 예시
   - 인증 방법 가이드
   - SDK 코드 샘플 (curl, JavaScript, Python)
   - 변경 이력(changelog) 관리
</Steps>

## 에이전트 위임

`architect` 에이전트(Opus 모델)에 위임하여 API 아키텍처를 설계합니다:

```
Agent(
  subagent_type="architect",
  model="opus",
  prompt="API DESIGN TASK

API를 체계적으로 설계하세요.

Domain: [도메인/서비스 설명]
Type: [REST / GraphQL / Both]

Design Checklist:
1. 리소스 모델링 (엔티티, 관계, 스키마)
2. 엔드포인트 설계 (URL, 메서드, 파라미터)
3. 에러 핸들링 (상태 코드, 에러 스키마)
4. 버전 관리 전략
5. 보안 설계 (인증, 인가, Rate limiting)
6. OpenAPI/GraphQL 스키마 초안

Output: API 설계 문서:
- 리소스 모델 다이어그램
- 엔드포인트 목록 (메서드, URL, 설명)
- 요청/응답 스키마
- 에러 코드 매핑
- 보안 정책 요약"
)
```

## External Consultation (Optional)

architect 에이전트는 교차 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 API 설계를 먼저 완료** -- 독립적으로 설계 수행
2. **검증을 위한 자문** -- Claude Task 에이전트를 통해 설계 교차 확인
3. **비판적 평가** -- 외부 제안을 맹목적으로 수용하지 않음
4. **우아한 폴백** -- 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 대규모 마이크로서비스 간 API 경계 설계
- 복잡한 인증/인가 플로우
- 실시간 통신이 필요한 API (WebSocket, SSE)
- 외부 파트너 공개 API 설계

### 자문을 생략하는 경우
- 단순 CRUD API
- 내부 서비스 간 API
- 잘 알려진 패턴의 적용
- 프로토타입 수준의 API

## API 설계 체크리스트

### 리소스 설계 (5개)
- [ ] 리소스 명명이 복수형 명사로 일관됨
- [ ] 리소스 간 관계가 명확히 정의됨
- [ ] 필수/선택 필드가 구분됨
- [ ] 데이터 타입과 포맷이 명시됨 (ISO 8601 날짜 등)
- [ ] 리소스 표현이 과도한 중첩 없이 평탄화됨

### 엔드포인트 설계 (5개)
- [ ] HTTP 메서드가 의미에 맞게 사용됨
- [ ] URL 경로가 계층적이고 예측 가능함
- [ ] 페이지네이션이 목록 엔드포인트에 적용됨
- [ ] 필터링/정렬 파라미터가 일관됨
- [ ] 멱등성(idempotency)이 보장됨 (PUT, DELETE)

### 에러 핸들링 (4개)
- [ ] HTTP 상태 코드가 의미에 맞게 사용됨
- [ ] 에러 응답 포맷이 전체 API에서 일관됨
- [ ] 유효성 검증 에러에 필드별 상세 정보 포함
- [ ] 비즈니스 에러 코드가 체계적으로 분류됨

### 보안 (4개)
- [ ] 인증 방식이 결정되고 문서화됨
- [ ] Rate limiting이 적용됨
- [ ] 입력 크기 제한이 설정됨
- [ ] CORS 정책이 명시됨

<Output>
```
API DESIGN DOCUMENT / API 설계 문서
====================================

Service: [서비스명]
API Type: [REST / GraphQL]
Version: v1
Base URL: https://api.example.com/v1

RESOURCE MODEL / 리소스 모델
-----------------------------
1. [Resource Name]
   - id: string (UUID)
   - name: string (required, max 255)
   - created_at: string (ISO 8601)
   - [관계]: [관계 타입] -> [대상 리소스]

ENDPOINTS / 엔드포인트
-----------------------
| Method | Path                  | Description       | Auth |
|--------|-----------------------|-------------------|------|
| GET    | /resources            | 리소스 목록 조회   | Yes  |
| POST   | /resources            | 리소스 생성        | Yes  |
| GET    | /resources/:id        | 리소스 상세 조회   | Yes  |
| PUT    | /resources/:id        | 리소스 전체 수정   | Yes  |
| DELETE | /resources/:id        | 리소스 삭제        | Yes  |

ERROR SCHEMA / 에러 스키마
---------------------------
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력 데이터가 유효하지 않습니다",
    "details": [
      { "field": "email", "message": "유효한 이메일 형식이 아닙니다" }
    ],
    "trace_id": "abc-123"
  }
}

ERROR CODES / 에러 코드
-------------------------
| HTTP | Code               | Description              |
|------|--------------------|--------------------------|
| 400  | VALIDATION_ERROR   | 입력 유효성 검증 실패     |
| 401  | UNAUTHORIZED       | 인증 필요                |
| 403  | FORBIDDEN          | 권한 부족                |
| 404  | NOT_FOUND          | 리소스 없음              |
| 409  | CONFLICT           | 리소스 충돌              |
| 429  | RATE_LIMITED       | 요청 한도 초과           |

VERSIONING / 버전 관리
-----------------------
Strategy: [URL path / Header / Query param]
Current: v1
Deprecation Policy: [정책 설명]

SECURITY / 보안
----------------
Authentication: [Bearer Token / API Key / OAuth 2.0]
Rate Limiting: [요청/분]
CORS: [허용 도메인]
```
</Output>

<Policy>
- RESTful 원칙을 준수하되 실용성을 우선합니다
- 일관성이 가장 중요합니다 -- 예외 없는 규칙이 이해하기 쉬운 API를 만듭니다
- 에러 응답은 클라이언트가 자동으로 처리할 수 있을 만큼 구조화합니다
- 보안은 설계 단계에서 반드시 포함합니다 (사후 추가 금지)
- OpenAPI 스키마는 코드와 동기화 상태를 유지합니다
- Breaking change는 반드시 버전 업과 마이그레이션 가이드를 동반합니다
</Policy>

## 다른 스킬과의 연동

**코드 리뷰 연동:**
```
/tenetx:code-review src/api/
```
설계된 API의 구현 코드를 리뷰

**보안 리뷰 연동:**
```
/tenetx:security-review src/api/
```
API 엔드포인트의 보안 취약점 점검

**TDD 연동:**
```
/tenetx:tdd API 엔드포인트 통합 테스트
```
API 엔드포인트별 테스트 작성

## Best Practices

- **API 먼저 설계** -- 구현 전에 명세를 확정
- **일관된 컨벤션** -- 네이밍, 에러 포맷, 페이지네이션을 통일
- **하위 호환성** -- 기존 클라이언트를 깨뜨리지 않는 변경
- **적절한 상태 코드** -- 200으로 모든 것을 처리하지 않음
- **과도한 노출 방지** -- 필요한 필드만 응답에 포함

<Arguments>
## 사용법
`/tenetx:api-design {설계 대상}`

### 예시
- `/tenetx:api-design 사용자 관리 REST API`
- `/tenetx:api-design 상품 주문 시스템 GraphQL API`
- `/tenetx:api-design 기존 /api/users 엔드포인트 v2 설계`
- `/tenetx:api-design 외부 파트너용 공개 API`

### 인자
- 설계할 API의 도메인, 타입(REST/GraphQL), 요구사항을 설명
- 인자 없으면 프로젝트 컨텍스트에서 API 설계 요구사항을 파악
</Arguments>

$ARGUMENTS
