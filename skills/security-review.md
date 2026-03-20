---
name: security-review
description: Security-focused code audit with OWASP Top 10 and supply chain checks
triggers:
  - "security review"
  - "보안 리뷰"
  - "보안 검토"
  - "security audit"
  - "취약점 점검"
---

<Purpose>
보안 중심 코드 감사를 수행합니다. OWASP Top 10, 공급망 보안,
시크릿 노출, 안전하지 않은 패턴을 체계적으로 점검합니다.
</Purpose>

<Steps>
1. **OWASP Top 10 전체 스캔**
   - A01: Broken Access Control — 접근 제어 우회, 권한 에스컬레이션
   - A02: Cryptographic Failures — 약한 해싱(MD5/SHA1), 평문 전송, 키 노출
   - A03: Injection — SQL, NoSQL, Command, XSS, LDAP 인젝션
   - A04: Insecure Design — 보안이 고려되지 않은 설계, 위협 모델링 부재
   - A05: Security Misconfiguration — 기본 설정 미변경, 불필요한 기능 활성화, 에러 정보 노출
   - A06: Vulnerable and Outdated Components — 알려진 CVE가 있는 의존성 사용
   - A07: Identification and Authentication Failures — 약한 인증, 세션 고정, 크리덴셜 스터핑
   - A08: Software and Data Integrity Failures — 서명 미검증, 안전하지 않은 역직렬화
   - A09: Security Logging and Monitoring Failures — 로깅 부재, 침입 탐지 미흡
   - A10: Server-Side Request Forgery (SSRF) — 서버에서 외부 URL 요청 시 검증 부재

2. **시크릿 탐지**
   - 하드코딩된 API 키, 비밀번호, 토큰
   - 개인 키(private key)가 레포에 포함되었는지
   - 커넥션 스트링에 시크릿 포함 여부
   - .env, credentials 파일 커밋 여부
   - 로그에 민감 정보 출력

3. **입력 검증**
   - 모든 외부 입력의 살균/검증 확인
   - SQL/NoSQL Injection 방지 (파라미터화 쿼리)
   - Command Injection 방지
   - XSS 방지 (출력 이스케이핑)
   - Path Traversal 방지
   - SSRF 방지 (URL 화이트리스트)

4. **인증/인가**
   - 비밀번호 해싱 (bcrypt, argon2 등 강력한 알고리즘)
   - 세션 관리 보안 (토큰 암호학적 난수 생성)
   - JWT 구현 보안 (서명 검증, 만료 설정)
   - 접근 제어가 모든 보호 리소스에 적용되는지

5. **암호화**
   - 강력한 알고리즘 사용 (AES-256, RSA-2048+)
   - 적절한 키 관리
   - 암호학적으로 안전한 난수 생성
   - TLS/HTTPS 강제 적용

6. **의존성 보안**
   - `npm audit` 실행하여 알려진 취약점 검사
   - 오래된 의존성 확인
   - CRITICAL/HIGH CVE 식별
   - 의존성 출처 검증
   - 의심스러운 패키지, 과도한 권한 요구 점검
</Steps>

## 에이전트 위임

`security-reviewer` 에이전트(Opus 모델)에 위임하여 심층 보안 분석을 수행합니다:

```
Agent(
  subagent_type="security-reviewer",
  model="opus",
  prompt="SECURITY REVIEW TASK

보안 감사를 수행하세요.

Scope: [특정 파일 또는 전체 코드베이스]

Security Checklist:
1. OWASP Top 10 전체 스캔 (A01~A10)
2. 하드코딩된 시크릿 탐지
3. 입력 검증 검토
4. 인증/인가 검토
5. 의존성 취약점 스캔 (npm audit)

Output: 보안 리뷰 리포트:
- 심각도별 발견 사항 요약 (CRITICAL, HIGH, MEDIUM, LOW)
- 구체적인 파일:라인 위치
- CVE 참조 (해당 시)
- 각 이슈별 수정 방안
- 전체 보안 상태 평가"
)
```

## External Consultation (Optional)

security-reviewer 에이전트는 교차 검증을 위해 Claude Task 에이전트에 자문할 수 있습니다.

### Protocol
1. **자체 보안 분석을 먼저 완료** — 독립적으로 리뷰 수행
2. **검증을 위한 자문** — Claude Task 에이전트를 통해 발견 사항 교차 확인
3. **비판적 평가** — 외부 발견 사항을 맹목적으로 수용하지 않음
4. **우아한 폴백** — 위임이 불가능할 경우 절대 차단하지 않음

### 자문이 필요한 경우
- 인증/인가 코드
- 암호화 구현
- 신뢰할 수 없는 데이터의 입력 검증
- 고위험 취약점 패턴
- 프로덕션 배포 코드

### 자문을 생략하는 경우
- 저위험 유틸리티 코드
- 이미 감사된 패턴
- 시간이 촉박한 보안 평가
- 기존 보안 테스트가 있는 코드

**참고:** 보안 세컨드 오피니언은 높은 가치를 가집니다. CRITICAL/HIGH 발견 시 자문을 고려하세요.

## 보안 체크리스트

### 인증 및 인가
- [ ] 비밀번호가 강력한 알고리즘으로 해싱 (bcrypt/argon2)
- [ ] 세션 토큰이 암호학적으로 무작위
- [ ] JWT 토큰이 적절히 서명 및 검증됨
- [ ] 모든 보호 리소스에 접근 제어 적용
- [ ] 인증 우회 취약점 없음

### 입력 검증
- [ ] 모든 사용자 입력이 검증 및 살균됨
- [ ] SQL 쿼리가 파라미터화 사용 (문자열 연결 금지)
- [ ] NoSQL 쿼리 인젝션 방지
- [ ] 파일 업로드 검증 (타입, 크기, 콘텐츠)
- [ ] URL 검증으로 SSRF 방지

### 출력 인코딩
- [ ] HTML 출력이 XSS 방지를 위해 이스케이핑됨
- [ ] JSON 응답이 적절히 인코딩됨
- [ ] 에러 메시지에 사용자 데이터 미포함
- [ ] Content-Security-Policy 헤더 설정

### 시크릿 관리
- [ ] 하드코딩된 API 키 없음
- [ ] 소스 코드에 비밀번호 없음
- [ ] 레포에 개인 키 없음
- [ ] 시크릿은 환경변수로 관리
- [ ] 시크릿이 로그나 에러에 노출되지 않음

### 암호화
- [ ] 강력한 알고리즘 사용 (AES-256, RSA-2048+)
- [ ] 적절한 키 관리
- [ ] 암호학적으로 안전한 난수 생성
- [ ] 민감 데이터에 TLS/HTTPS 강제

### 의존성
- [ ] 의존성에 알려진 취약점 없음
- [ ] 의존성이 최신 상태
- [ ] CRITICAL 또는 HIGH CVE 없음
- [ ] 의존성 출처 검증됨

## 심각도 정의

| 심각도 | 설명 |
|--------|------|
| **CRITICAL** | 악용 가능한 취약점으로 심각한 영향 (데이터 유출, RCE, 크리덴셜 탈취) |
| **HIGH** | 특정 조건이 필요하지만 심각한 영향을 주는 취약점 |
| **MEDIUM** | 제한적 영향 또는 악용이 어려운 보안 약점 |
| **LOW** | 모범 사례 위반 또는 경미한 보안 우려 |

## Remediation Priority (수정 우선순위)

| 우선순위 | 타임라인 | 대상 |
|----------|----------|------|
| 1. 노출된 시크릿 교체 | **즉시 (1시간 이내)** | 하드코딩된 키, 비밀번호, 토큰 |
| 2. CRITICAL 수정 | **긴급 (24시간 이내)** | 악용 가능한 취약점 |
| 3. HIGH 수정 | **중요 (1주일 이내)** | 조건부 취약점 |
| 4. MEDIUM 수정 | **계획 (1개월 이내)** | 보안 약점 |
| 5. LOW 수정 | **백로그 (여유 시)** | 모범 사례 위반 |

<Output>
```
SECURITY REVIEW REPORT / 보안 리뷰 리포트
==========================================

Scope: [전체 코드베이스 / 특정 디렉토리] (N개 파일 스캔)
Scan Date: YYYY-MM-DDTHH:MM:SSZ

CRITICAL (N)
------------
1. src/api/auth.ts:89 - 하드코딩된 API 키
   Finding: AWS API 키가 소스 코드에 하드코딩됨
   Impact: 코드 공개 또는 유출 시 크리덴셜 노출
   Remediation: 환경변수로 이동, 키 즉시 교체
   Reference: OWASP A02:2021 - Cryptographic Failures
   CVE: (해당 시 CVE 번호)

2. src/db/query.ts:45 - SQL Injection 취약점
   Finding: 사용자 입력이 SQL 쿼리에 직접 연결됨
   Impact: 공격자가 임의의 SQL 명령을 실행 가능
   Remediation: 파라미터화 쿼리 또는 ORM 사용
   Reference: OWASP A03:2021 - Injection

HIGH (N)
--------
...

MEDIUM (N)
----------
...

LOW (N)
-------
...

DEPENDENCY VULNERABILITIES / 의존성 취약점
------------------------------------------
Found N vulnerabilities via npm audit:

CRITICAL: axios@0.21.0 - Server-Side Request Forgery (CVE-2021-3749)
  Installed: axios@0.21.0
  Fix: npm install axios@0.21.2

HIGH: lodash@4.17.19 - Prototype Pollution (CVE-2020-8203)
  Installed: lodash@4.17.19
  Fix: npm install lodash@4.17.21

...

OVERALL ASSESSMENT / 종합 평가
-------------------------------
Security Posture: [EXCELLENT / GOOD / FAIR / POOR]
(N CRITICAL, N HIGH issues)

Immediate Actions Required:
1. [즉시 조치 사항]
2. [긴급 수정 사항]

Recommendation: [배포 가능 / CRITICAL 및 HIGH 이슈 해결 전 배포 금지]
```
</Output>

<Policy>
- 취약점 발견 시 구체적인 공격 시나리오와 수정 방안을 함께 제시
- False positive를 최소화하되, 의심스러운 패턴은 빠짐없이 보고
- 보안 수정은 기능 동작에 영향을 주지 않도록 주의
- OWASP A01~A10 각 항목에 대해 명시적으로 검사 수행
- npm audit을 반드시 실행하여 의존성 취약점을 정량적으로 보고
- CVE 참조를 가능한 한 포함하여 추적 가능성 확보
</Policy>

## 다른 스킬과의 연동

**Pipeline 연동:**
```
/tenetx:pipeline security "인증 모듈 리뷰"
```
사용 흐름: explore -> security-reviewer -> executor -> security-reviewer (재검증)

**팀 기반 병렬 리뷰:**
```
/tenetx:team 4:security-reviewer "모든 API 엔드포인트 감사"
```
여러 엔드포인트에 대해 병렬 보안 리뷰 수행

## Best Practices

- **조기 리뷰** — 보안은 사후 점검이 아닌 설계 단계부터
- **자주 리뷰** — 주요 기능 변경이나 API 변경마다
- **자동화** — CI/CD 파이프라인에서 보안 스캔 실행
- **즉시 수정** — 보안 부채를 축적하지 않음
- **수정 검증** — 수정 후 반드시 보안 리뷰 재실행

<Arguments>
## 사용법
`/tenetx:security-review {점검 대상}`

### 예시
- `/tenetx:security-review` (기본: 전체 프로젝트)
- `/tenetx:security-review src/api/`
- `/tenetx:security-review 인증 관련 코드만 집중 점검`
- `/tenetx:security-review 최근 변경사항의 보안 영향 분석`

### 인자
- 디렉토리, 파일, 또는 관심 영역을 지정
- 인자 없으면 프로젝트 전체를 점검
</Arguments>

$ARGUMENTS
