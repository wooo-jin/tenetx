# Tenetx v5.1 — 통합 백로그 (완료)

> 작성일: 2026-04-06
> v5.1.0 릴리스: 2026-04-06

## v5.1.0 변경 사항

### Step 1: Reflection 메커니즘 수리 (Critical)
- compound-read MCP 호출 시 reflected += 1 자동 기록
- compound-search snippet에는 skipEvidence로 오염 방지
- CTA 메시지 한글화

### Step 2: 태그 품질 개선 (High)
- 한국어 조사 strip (stripKoSuffix): "계획에서" -> "계획"
- 영어 추가 스톱워드 6개, MAX_TAGS 10 -> 8
- `tenetx compound retag` CLI 서브커맨드

### Step 3: 스토리지 통합 (Medium)
- 모든 ME_* 경로를 ~/.tenetx/ 기반으로 통합
- ~/.compound/ -> ~/.tenetx/ 자동 마이그레이션
- 하드코딩 경로 수정 (auto-compound-runner, skill-promoter)
- V1_* 상수 deprecated 처리

## 검증 결과
- 빌드: 통과
- 테스트: 1091/1091 통과
- 실제 데이터: 37개 솔루션 retag, reflected 카운터 정상 작동 확인

## 미완료 항목
없음. 이전 백로그 14개 항목 중:
- 8개: 이미 수정됨
- 2개: 폐기 (prompt-learner 삭제, 자동 태그 재생성 불필요)
- 4개: DROP (premature optimization / 해결할 문제 부재)
