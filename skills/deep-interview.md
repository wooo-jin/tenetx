---
name: deep-interview
description: Socratic questioning for requirement clarification with mathematical ambiguity scoring
triggers:
  - "deep-interview"
  - "딥인터뷰"
  - "요구사항 명확화"
---

<Purpose>
Compound Harness Deep Interview — 소크라테스식 요구사항 명확화.
수학적 모호성 점수를 계산하며, 임계값(≤20%) 이하가 될 때까지
질문을 반복하여 완전한 스펙을 도출합니다.
"understand-before-act" 원칙의 극대화.
</Purpose>

<Execution_Protocol>

## 초기화
1. 프로젝트 타입 감지:
   - **Greenfield**: 새 프로젝트 (코드베이스 없음 또는 초기)
   - **Brownfield**: 기존 프로젝트 (코드베이스 존재)
2. Brownfield인 경우 탐색 에이전트로 현재 아키텍처 파악
3. 초기 모호성 점수 계산

## 반복 루프 (Round 1~N)
매 라운드:
1. 현재 가장 약한 차원(goal/constraints/criteria/context) 식별
2. 해당 차원에 대한 **단 하나의 질문** 제시
   - 절대 한 번에 여러 질문 금지
   - 질문은 구체적이고 답변 가능해야 함
3. 사용자 답변 수신
4. 차원별 점수 업데이트
5. 모호성 재계산

## 도전 에이전트 (고급 라운드)
- **Round 4+**: Contrarian Mode — 가정 도전 ("정말 그게 필요한가요?")
- **Round 6+**: Simplifier Mode — 복잡성 제거 ("이걸 빼면 어떨까요?")
- **Round 8+**: Ontologist Mode — 본질 재정의 ("핵심이 뭔가요?")

## 모호성 계산
**Greenfield**:
```
ambiguity = 1 - (goal × 0.4 + constraints × 0.3 + criteria × 0.3)
```

**Brownfield**:
```
ambiguity = 1 - (goal × 0.35 + constraints × 0.25 + criteria × 0.25 + context × 0.15)
```

각 차원 점수: 0.0 (완전 모호) ~ 1.0 (완전 명확)

## 종료 조건
- ambiguity ≤ 0.20 (20% 이하) → 스펙 생성
- Round 3 이후 조기 종료 가능 (사용자 요청 시)
- Round 10: 소프트 경고 ("충분한 정보가 수집되었습니다")
- Round 20: 하드 상한 (강제 스펙 생성)

</Execution_Protocol>

<Output>
스펙 파일 생성: .compound/specs/deep-interview-{slug}.md

```markdown
# Spec: {title}

## 목표
{goal — 한 문장}

## 상세 요구사항
{numbered list}

## 제약 조건
{constraints}

## 수용 기준
{acceptance criteria — 검증 가능한 형태}

## 아키텍처 결정
{brownfield인 경우 기존 구조와의 관계}

## 모호성 점수
최종: {score}%
차원별: goal={g}, constraints={c}, criteria={cr}, context={cx}
라운드 수: {N}
```
</Output>

<Integration>
Deep Interview 완료 후:
- autopilot: 생성된 스펙을 Phase 0에서 자동 활용
- ralph: PRD 생성 시 스펙 참조
- ralplan: Planner의 입력으로 사용
</Integration>
