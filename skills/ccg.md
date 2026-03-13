---
name: ccg
description: Claude-Codex-Gemini tri-model synthesis for cross-validation
triggers:
  - "ccg"
  - "크로스검증"
  - "3모델"
---

<Purpose>
Compound Harness CCG — 3-모델 합성 모드.
Claude, Codex(OpenAI), Gemini 세 AI의 응답을 수집하고
Claude가 최종 합성하여 최선의 결과를 도출합니다.
</Purpose>

<Execution_Steps>

## Step 1 — 병렬 질의
`ch ask --all` 을 활용하여 세 프로바이더에 동시 질의:
- Claude: 직접 실행 (현재 세션)
- OpenAI: `ch ask --provider openai "prompt"` (OPENAI_API_KEY 필요)
- Gemini: `ch ask --provider gemini "prompt"` (GEMINI_API_KEY 필요)

## Step 2 — 응답 수집
각 프로바이더의 응답을 .compound/artifacts/ask/ 에 저장:
- claude-{timestamp}.md
- openai-{timestamp}.md
- gemini-{timestamp}.md

## Step 3 — 합성
Claude가 세 응답을 분석:
1. 공통점 추출 (높은 신뢰도)
2. 차이점 식별 (검토 필요)
3. 각 응답의 강점/약점 평가
4. 최종 합성 결과 생성

## Step 4 — 결과 적용
합성된 최선의 접근법으로 실행.

</Execution_Steps>

<Fallback>
API 키가 없는 프로바이더는 건너뛰고 가용한 프로바이더로만 진행.
최소 2개 이상의 응답이 있어야 합성 가능.
1개만 가능하면 단일 응답으로 진행.
</Fallback>
