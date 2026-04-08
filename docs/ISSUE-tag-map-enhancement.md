# SYNONYM_MAP 고도화 계획

> 생성일: 2026-04-07
> 트리거: 한국어 프롬프트 "에러 핸들링" → 솔루션 매칭 실패 (런타임 검증에서 발견)

## 현재 문제

- `SYNONYM_MAP`이 수작업 하드코딩 사전 (~30개 엔트리)
- 한국어-영어 교차 매핑이 부족했음 (급한 건 5.1.2에서 수정)
- 새 솔루션 축적 시 태그가 맵에 없으면 자동 매칭 불가
- 관리 확장성 없음 — 솔루션이 늘어날수록 누락률 증가

## 고도화 방향

### Phase 1: 자동 태그 확장 (단기)
- 솔루션 저장 시 본문에서 키워드 자동 추출 → tags 보강
- 매칭 실패 로그 수집 → 누락 키워드 자동 보고

### Phase 2: 시맨틱 매칭 (중기)
- 임베딩 기반 유사도 매칭 (Haiku로 경량 임베딩)
- SYNONYM_MAP을 fallback으로 유지하되 주 매칭은 시맨틱

### Phase 3: 사용자 피드백 루프 (장기)
- 솔루션 주입 후 실제 활용 여부 추적
- 활용 안 된 매칭 → false positive 자동 감지
- 활용된 매칭 → 태그 가중치 자동 상향

## 제약 조건
- hook timeout 3초 이내 매칭 완료 필수
- 외부 API 호출 불가 (hook은 오프라인 동작)
- 임베딩 사용 시 로컬 캐시 필수

## Round 3 실행 계획

2026-04-07 결정: Phase 1/2/3를 재정의한 4-step 실행 계획으로 전환.

상세는 `docs/plans/2026-04-07-synonym-map-round3-validation.md` 참고. 요약:

- **T1 — Bootstrap eval infra** ✅ 완료 (2026-04-08)
  - `tests/fixtures/solution-match-bootstrap.json` v1 (15 solutions, 41 positive, 10 paraphrase, 10 negative)
  - `evaluateSolutionMatcher` + `ROUND3_BASELINE` in `src/engine/solution-matcher.ts`
  - Baseline v1: recall=1.0 / mrr=1.0 / noResult=0.0 / negativeAnyResult=0.1
  - 후속 PR의 회귀 가드: `BASELINE_TOLERANCE = 0.05`
- **T2 — Migrate SYNONYM_MAP → indexed matchTerms** ✅ 완료 (2026-04-08)
  - `src/engine/term-normalizer.ts` 신규 (19 canonicals, hash-indexed lookup)
  - 핫패스 정규화는 `defaultNormalizer.normalizeTerms` 1회 호출로 통합
- **T3 — Query normalization + ranking decision logs** ✅ 완료 (2026-04-08)
  - `src/engine/match-eval-log.ts` 신규 (privacy-by-construction: hash + length, 원문 미저장)
- **T3.5 — Fixture v2 expansion** ✅ 완료 (2026-04-08, commit `8858ae2`)
  - 22 hard cases 추가 (12 positive + 6 Korean paraphrase + 4 tricky negative)
  - Baseline v2: recall=1.0 / mrr=0.969 / noResult=0.0 / **negativeAnyResult=0.357** ← v1 0.1에서 3.5× 점프
  - 천장 마스킹 해제: real ranking weakness + false positive weakness 노출
- **T4 — BM25** ⛔ **SKIPPED (2026-04-08)** — `docs/plans/2026-04-08-t4-bm25-skip-adr.md`
  - 4개 BM25 variant (naive / hybrid Jaccard×IDF / precision filter / soft penalty) 모두 baseline 대비 metric 개선 없음
  - 근본 원인: N=15 코퍼스에서 IDF noise 지배 + binary TF 붕괴 + semantic-not-statistical FP + compound-tag 토큰화 아티팩트
  - Reversal triggers (corpus N≥100, compound-tag tokenizer 선행, negativeAnyResult > 0.5, recallAt5 < 0.95) 충족 시 재평가

### Round 4 placeholder (T4 ADR에서 도출된 후속 후보)

Round 3 마무리. Round 4 시작 시 우선순위 매겨서 picking. 모두 ADR에서 detail.

- **R4-T1: Compound-tag tokenizer fix** — `extractTags` 정규식이 하이픈을 strip하는 문제 해결. 4 hard positive ranking failure 직접 해결 예상. 가장 surgical하고 actionable.
- **R4-T2: Phrase/n-gram matcher overlay** — `performance review`, `system architecture` 등 dev-context-killer 2-word phrase 50개 큐레이션 → `negativeAnyResult` 0.357 → ~0.10 예상.
- **R4-T3: Query-side dev specificity classifier** — high-signal vs ambiguous dev term 큐레이션 vocabulary로 query-level filter.
- **(passive) Larger corpus 추적** — production corpus N≥100 도달 시 BM25 재평가. ADR Reversal trigger #1.

기존 Phase 1/2/3는 이 실행 계획의 배경 맥락으로 남김. Round 3은 T1-T3 + T3.5 완료, T4 실증 skip으로 종결.
