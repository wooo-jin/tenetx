---
name: pipeline
description: Sequential multi-stage processing with stage-specific agents
triggers:
  - "pipeline"
  - "파이프라인"
  - "단계별"
---

<Purpose>
Compound Harness Pipeline — 순차 단계별 처리 모드.
각 단계가 이전 단계의 결과를 입력으로 받아 처리합니다.
다단계 변환, 마이그레이션, 리팩토링에 적합.
</Purpose>

<Execution_Policy>
1. 사용자 요청에서 단계 목록 추출 (또는 자동 분해)
2. 각 단계에 최적 에이전트/모델 배정
3. 단계 1부터 순차 실행
4. 각 단계 완료 후 결과 검증
5. 검증 실패 시 해당 단계만 재시도
6. 모든 단계 완료 후 전체 검증

단계 간 핸드오프 문서로 컨텍스트 전달.
</Execution_Policy>

<Stage_Format>
```
Stage N: {title}
  Agent: {agent_type}
  Model: {haiku|sonnet|opus}
  Input: {이전 단계 결과}
  Output: {이 단계 산출물}
  Verify: {검증 기준}
```
</Stage_Format>
