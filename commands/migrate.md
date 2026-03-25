---
name: migrate
description: Safe migration workflow for DB, API, and framework upgrades
triggers:
  - "migrate"
  - "마이그레이션"
  - "업그레이드"
  - "upgrade"
---

<Purpose>
데이터베이스 스키마 변경, API 버전 업그레이드, 프레임워크 마이그레이션을
안전하게 수행하는 5단계 워크플로우를 제공합니다.
각 단계에서 롤백 지점을 확보하여 위험을 최소화합니다.
</Purpose>

<Steps>
1. **분석 (Analyze)**
   - 현재 상태 스냅샷: 의존성 트리, 스키마 버전, API 계약 문서화
   - 변경 영향 범위 파악: `grep -r "import.*{패키지}" --include="*.ts"`
   - Breaking Change 목록 작성 (CHANGELOG, 공식 마이그레이션 가이드 확인)
   - 영향받는 파일/컴포넌트/테이블 전수 조사

2. **계획 (Plan)**
   - 마이그레이션 단계를 원자적 작업으로 분해
   - 각 단계별 성공 기준(Done Criteria) 정의
   - 롤백 트리거 조건 명시 (에러율 > N%, 레이턴시 > Nms)
   - 다운타임 허용 여부 결정 → Zero-downtime 전략 수립

3. **백업 (Backup)**
   ```bash
   # DB 백업
   pg_dump -h localhost -U user dbname > backup_$(date +%Y%m%d_%H%M%S).sql
   mysqldump -u user -p dbname > backup_$(date +%Y%m%d_%H%M%S).sql

   # 코드 상태 태깅
   git tag pre-migration-$(date +%Y%m%d) -m "Migration 전 백업 포인트"
   git push origin --tags
   ```

4. **실행 (Execute)**
   - **DB 마이그레이션**: 스키마 변경 → 데이터 변환 → 인덱스 재구성
     ```sql
     -- Expand-Contract 패턴 (Zero-downtime)
     -- Phase 1: 새 컬럼 추가 (nullable)
     ALTER TABLE users ADD COLUMN new_field VARCHAR(255);
     -- Phase 2: 데이터 채우기 (백그라운드)
     UPDATE users SET new_field = legacy_field WHERE new_field IS NULL;
     -- Phase 3: 애플리케이션 배포 후 기존 컬럼 제거
     ALTER TABLE users DROP COLUMN legacy_field;
     ```
   - **API 업그레이드**: 하위호환성 레이어 → 새 버전 배포 → 구버전 deprecation
   - **프레임워크 업그레이드**:
     ```bash
     npx npm-check-updates -u     # 의존성 일괄 업데이트 확인
     npx <framework> codemods     # 공식 코드모드 실행
     ```

5. **검증 (Verify)**
   - 마이그레이션 전후 데이터 무결성 검증
   - E2E 테스트 전체 실행
   - 성능 회귀 벤치마크 (p95 레이턴시 비교)
   - 롤백 절차 실제 테스트 (스테이징 환경)

### 롤백 전략
```bash
# DB 롤백
psql -h localhost -U user dbname < backup_20240101_120000.sql

# 코드 롤백
git checkout pre-migration-20240101
git push --force-with-lease origin main  # 팀 동의 후만

# 컨테이너/배포 롤백
kubectl rollout undo deployment/app-name
```
</Steps>

<Policy>
- 프로덕션 마이그레이션 전 스테이징에서 반드시 전체 절차 검증
- 대용량 테이블 마이그레이션은 배치 처리로 분할 (한 번에 MAX 10,000행)
- Breaking Change는 최소 한 버전 deprecation 기간 제공
- 마이그레이션 스크립트는 멱등성(idempotent) 보장
</Policy>

<Arguments>
## 사용법
`/tenetx:migrate {마이그레이션 대상}`

### 예시
- `/tenetx:migrate PostgreSQL users 테이블 스키마 변경 (email 컬럼 unique 추가)`
- `/tenetx:migrate React 17 → 19 업그레이드`
- `/tenetx:migrate REST API v1 → v2 마이그레이션 계획`

### 인자
- 마이그레이션 대상 (DB/API/프레임워크)
- 현재 버전과 목표 버전
- 다운타임 허용 여부 등 제약 조건
</Arguments>

$ARGUMENTS
