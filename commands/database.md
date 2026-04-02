---
name: database
description: This skill should be used when the user asks to "database,db 설계,schema,migration,마이그레이션,스키마". Database schema design, migration planning, and optimization
triggers:
  - "database"
  - "db 설계"
  - "schema"
  - "migration"
  - "마이그레이션"
  - "스키마"
---
<!-- tenetx-managed -->

<Purpose>
데이터베이스 스키마 설계와 마이그레이션을 체계적으로 수행합니다.
요구사항 분석부터 정규화, 인덱싱, 마이그레이션 스크립트 작성,
롤백 계획까지 데이터 레이어의 전체 라이프사이클을 다룹니다.
</Purpose>

<Steps>
1. **요구사항 분석**: 데이터 요구사항을 수집하고 정리합니다
   - 비즈니스 엔티티와 관계 식별
   - 읽기/쓰기 비율 추정 (read-heavy vs write-heavy)
   - 예상 데이터 볼륨 추정 (행 수, 증가율)
   - 트랜잭션 요구사항 (ACID, eventual consistency)
   - 보존 정책 (데이터 수명, 아카이빙 규칙)
   - 규제 요구사항 (GDPR, 개인정보보호법)

2. **스키마 설계**: 정규화된 스키마를 설계합니다
   - ERD(Entity-Relationship Diagram) 작성
   - 정규화 수준 결정 (3NF 기본, 필요 시 역정규화)
   - 데이터 타입 선택 (정확한 크기, nullable 여부)
   - 기본 키 전략 (UUID vs auto-increment vs ULID)
   - 외래 키 제약 조건 및 cascade 정책
   - 소프트 삭제(soft delete) vs 하드 삭제 결정
   - 감사(audit) 필드 포함 (created_at, updated_at, created_by)
   - enum 값의 저장 전략 (DB enum vs string vs lookup table)

3. **인덱싱 전략**: 쿼리 성능을 위한 인덱스를 설계합니다
   - 주요 쿼리 패턴 분석 (WHERE, JOIN, ORDER BY)
   - 단일 컬럼 인덱스 vs 복합 인덱스 결정
   - 커버링 인덱스 활용 가능성 검토
   - 부분 인덱스(partial index) 적용 가능성
   - 인덱스 카디널리티와 선택도 분석
   - 인덱스의 쓰기 성능 영향 평가
   - EXPLAIN ANALYZE로 쿼리 플랜 검증 계획

4. **마이그레이션 스크립트 작성**: 안전한 마이그레이션을 구현합니다
   - 마이그레이션 도구 선택 (Prisma, Knex, TypeORM, raw SQL)
   - UP 마이그레이션 작성 (스키마 변경 적용)
   - DOWN 마이그레이션 작성 (변경 롤백)
   - 데이터 마이그레이션 포함 (기존 데이터 변환)
   - 대용량 테이블 변경 시 무중단 전략 (온라인 DDL)
   - 마이그레이션 순서 의존성 확인

5. **롤백 계획**: 장애 시 복구 절차를 수립합니다
   - 롤백 스크립트 테스트 (UP -> DOWN -> UP 사이클)
   - 데이터 손실 없는 롤백 가능 여부 확인
   - 백업/복원 절차 문서화
   - 마이그레이션 실패 시 수동 복구 절차
   - Point-in-Time Recovery 설정 확인

6. **성능 검증**: 스키마 변경의 성능 영향을 검증합니다
   - 마이그레이션 실행 시간 추정
   - 테이블 잠금(lock) 영향 범위 확인
   - 인덱스 생성의 동시성 영향 (CONCURRENTLY 옵션)
   - 스테이징 환경에서 실데이터 볼륨 테스트
</Steps>

## 에이전트 위임

`architect` 에이전트(Opus 모델)에 위임하여 데이터베이스 아키텍처를 설계합니다:

```
Agent(
  subagent_type="architect",
  model="opus",
  prompt="DATABASE DESIGN TASK

데이터베이스 스키마를 설계하고 마이그레이션 계획을 수립하세요.

Domain: [도메인/서비스 설명]
Database: [PostgreSQL / MySQL / MongoDB / etc.]

Design Checklist:
1. ERD 및 엔티티 관계 설계
2. 정규화 및 데이터 타입 결정
3. 인덱싱 전략 수립
4. 마이그레이션 스크립트 (UP/DOWN)
5. 롤백 계획 및 백업 절차
6. 성능 영향 분석

Output: 데이터베이스 설계 문서:
- ERD (텍스트 기반)
- 테이블/컬렉션 정의
- 인덱스 목록
- 마이그레이션 스크립트
- 롤백 절차"
)
```

## External Consultation (Optional)

architect 에이전트는 교차 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 스키마 설계를 먼저 완료** -- 독립적으로 설계 수행
2. **검증을 위한 자문** -- Claude Task 에이전트를 통해 설계 교차 확인
3. **비판적 평가** -- 외부 제안을 맹목적으로 수용하지 않음
4. **우아한 폴백** -- 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 대규모 스키마 마이그레이션 (10+ 테이블 변경)
- 성능이 중요한 인덱싱 전략
- 프로덕션 환경의 무중단 마이그레이션
- 데이터 일관성이 중요한 트랜잭션 설계

### 자문을 생략하는 경우
- 단순 테이블 추가/수정
- 잘 알려진 스키마 패턴 적용
- 개발 환경의 마이그레이션
- 소규모 인덱스 추가

## 데이터베이스 설계 체크리스트

### 스키마 설계 (6개)
- [ ] 모든 테이블에 적절한 기본 키 존재
- [ ] 외래 키 제약 조건이 설정됨
- [ ] 데이터 타입이 정확한 크기로 선택됨
- [ ] nullable 필드가 명시적으로 결정됨
- [ ] 감사 필드 포함 (created_at, updated_at)
- [ ] 소프트 삭제 전략이 결정됨

### 인덱싱 (4개)
- [ ] 주요 쿼리 패턴에 인덱스 적용됨
- [ ] 복합 인덱스의 컬럼 순서가 최적화됨
- [ ] 과도한 인덱스로 인한 쓰기 성능 저하 없음
- [ ] 유니크 제약 조건이 비즈니스 규칙과 일치

### 마이그레이션 (4개)
- [ ] UP/DOWN 마이그레이션 모두 작성됨
- [ ] 데이터 마이그레이션이 포함됨 (필요 시)
- [ ] 롤백 테스트 완료
- [ ] 마이그레이션 실행 시간이 허용 범위 내

### 보안 (4개)
- [ ] 민감 데이터가 암호화됨
- [ ] 접근 권한이 최소 권한 원칙으로 설정됨
- [ ] PII 데이터의 보존/삭제 정책이 정의됨
- [ ] 감사 로그가 중요 변경에 대해 기록됨

<Output>
```
DATABASE DESIGN DOCUMENT / 데이터베이스 설계 문서
==================================================

Service: [서비스명]
Database: [PostgreSQL / MySQL / MongoDB]
Migration Tool: [Prisma / Knex / TypeORM]

ERD / 엔티티 관계
-------------------
[User] 1---N [Order] N---M [Product]
  |                         |
  1---N [Address]           1---N [Review]

TABLES / 테이블 정의
---------------------
Table: users
  id          UUID        PK, DEFAULT gen_random_uuid()
  email       VARCHAR(255) NOT NULL, UNIQUE
  name        VARCHAR(100) NOT NULL
  password    VARCHAR(255) NOT NULL
  role        VARCHAR(20)  NOT NULL, DEFAULT 'user'
  created_at  TIMESTAMPTZ  NOT NULL, DEFAULT NOW()
  updated_at  TIMESTAMPTZ  NOT NULL, DEFAULT NOW()
  deleted_at  TIMESTAMPTZ  NULL

INDEXES / 인덱스
-----------------
| Table  | Name                | Columns        | Type   | Reason              |
|--------|---------------------|----------------|--------|---------------------|
| users  | idx_users_email     | email          | UNIQUE | 로그인 조회          |
| orders | idx_orders_user_date| user_id, date  | BTREE  | 사용자별 주문 조회   |

MIGRATION / 마이그레이션
-------------------------
File: 20260402_001_create_users.sql

-- UP
CREATE TABLE users ( ... );
CREATE INDEX idx_users_email ON users(email);

-- DOWN
DROP TABLE IF EXISTS users;

ROLLBACK PLAN / 롤백 계획
---------------------------
1. 마이그레이션 실패 시: DOWN 스크립트 실행
2. 데이터 손실 위험 시: pg_dump 백업에서 복원
3. 긴급 시: Point-in-Time Recovery 사용

PERFORMANCE IMPACT / 성능 영향
-------------------------------
- 마이그레이션 예상 시간: [N분]
- 테이블 잠금: [있음/없음]
- 인덱스 생성: [CONCURRENTLY 사용 여부]
```
</Output>

<Policy>
- 마이그레이션은 반드시 UP/DOWN 양방향으로 작성합니다
- 프로덕션 마이그레이션 전 스테이징에서 실행 테스트 필수
- 데이터 손실 가능성이 있는 변경은 백업 확인 후 진행
- 인덱스 변경은 EXPLAIN ANALYZE로 효과를 검증합니다
- 대용량 테이블의 ALTER는 무중단 전략을 사용합니다
- 롤백 불가능한 마이그레이션은 명시적으로 경고합니다
</Policy>

## 다른 스킬과의 연동

**API 설계 연동:**
```
/tenetx:api-design 데이터 모델 기반 REST API
```
데이터베이스 스키마와 일관된 API 설계

**보안 리뷰 연동:**
```
/tenetx:security-review 마이그레이션 스크립트
```
마이그레이션의 보안 영향 점검

**성능 최적화 연동:**
```
/tenetx:performance 쿼리 성능 분석
```
인덱스 효과 및 쿼리 최적화

## Best Practices

- **점진적 마이그레이션** -- 대규모 변경을 작은 단계로 분할
- **데이터 먼저 백업** -- 프로덕션 변경 전 반드시 백업
- **테스트 환경 검증** -- 실 데이터 볼륨으로 성능 확인
- **문서화** -- 스키마 변경 이유와 영향을 기록
- **무중단 우선** -- 서비스 중단 없는 마이그레이션 전략

<Arguments>
## 사용법
`/tenetx:database {설계/마이그레이션 대상}`

### 예시
- `/tenetx:database 사용자 관리 시스템 스키마 설계`
- `/tenetx:database orders 테이블에 discount 컬럼 추가 마이그레이션`
- `/tenetx:database 기존 스키마의 인덱싱 최적화`
- `/tenetx:database PostgreSQL에서 MongoDB로 마이그레이션 계획`

### 인자
- 설계할 도메인, 변경할 스키마, 마이그레이션 목적 등을 설명
- 인자 없으면 프로젝트의 현재 스키마를 분석
</Arguments>

$ARGUMENTS
