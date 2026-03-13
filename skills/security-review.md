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
1. **입력 검증**: 모든 외부 입력의 살균/검증 확인
   - SQL Injection, XSS, Command Injection
   - Path Traversal, SSRF
   - 파라미터 타입 강제

2. **인증/인가**: 접근 제어 로직 점검
   - 인증 우회 가능성
   - 권한 에스컬레이션
   - 세션 관리 보안

3. **시크릿 관리**: 민감 정보 노출 점검
   - 하드코딩된 API 키, 비밀번호, 토큰
   - .env, credentials 파일 커밋 여부
   - 로그에 민감 정보 출력

4. **의존성 보안**: 공급망 위험 평가
   - 알려진 취약점 (CVE)
   - 의심스러운 패키지
   - 과도한 권한 요구

5. **암호화**: 데이터 보호 수준 점검
   - 전송 중 암호화 (TLS)
   - 저장 시 암호화
   - 약한 알고리즘 사용
</Steps>

<Output>
### 🔴 Critical Vulnerability (즉시 수정)
### 🟠 High Risk (빠른 수정 필요)
### 🟡 Medium Risk (계획된 수정)
### 🔵 Informational (참고)
</Output>

<Policy>
- 취약점 발견 시 구체적인 공격 시나리오와 수정 방안을 함께 제시
- False positive를 최소화하되, 의심스러운 패턴은 빠짐없이 보고
- 보안 수정은 기능 동작에 영향을 주지 않도록 주의
</Policy>
