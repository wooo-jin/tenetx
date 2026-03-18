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
Claude(현재 세션), Codex(자율 에이전트), Gemini(API) 세 AI의 응답을 수집하고
Claude가 최종 합성하여 최선의 결과를 도출합니다.
</Purpose>

<Execution_Steps>

## Step 1 — 환경 감지 및 프로바이더 결정

사용 가능한 프로바이더를 확인합니다:

```bash
tenetx providers
```

각 프로바이더의 실행 방식:
- **Claude**: 현재 세션에서 직접 응답 (항상 가용)
- **Codex**: 환경에 따라 분기
  - tmux O + Codex CLI 설치됨 → `codex exec --full-auto`로 **tmux 패널에 에이전트 스폰** (진짜 자율 실행)
  - tmux X 또는 Codex CLI 없음 → `ch ask --provider codex` (OpenAI API 폴백)
- **Gemini**: `ch ask --provider gemini` (Google AI API, GEMINI_API_KEY 필요)

## Step 2 — 병렬 질의 실행

### 2a. Claude 응답 (현재 세션)
현재 세션에서 직접 사용자 질문에 대한 응답을 생성합니다.
`.compound/artifacts/ccg/claude-{timestamp}.md`에 저장합니다.

### 2b. Codex 응답 (에이전트 스폰 또는 API 폴백)

**tmux 환경일 때** (우선):
```bash
# Codex를 tmux 패널에 자율 에이전트로 스폰 (출력 캡처 모드)
tenetx codex-spawn --model o4-mini "사용자 질문"
# → 출력이 ~/.compound/state/codex-{ts}.output.md에 자동 캡처됨
# → 완료 마커: ~/.compound/state/codex-{ts}.done
```
스폰된 Codex가 **독립적으로 사고하고 코드를 분석**합니다.
완료될 때까지 대기 후 캡처 파일을 읽습니다.

**tmux가 아닐 때** (폴백):
```bash
ch ask --provider codex "사용자 질문"
```
OpenAI API로 단발 질의합니다. 에이전트 수준의 깊이는 없지만 응답은 받을 수 있습니다.

### 2c. Gemini 응답 (API)
```bash
ch ask --provider gemini "사용자 질문"
```

## Step 3 — 응답 수집 및 합성

모든 응답을 `.compound/artifacts/ccg/` 에 저장:
- `claude-{timestamp}.md`
- `codex-{timestamp}.md` (tmux 스폰이면 에이전트 전체 출력)
- `gemini-{timestamp}.md`

Claude가 수집된 응답을 분석:
1. **공통점 추출** — 세 모델이 합의한 부분 (높은 신뢰도)
2. **차이점 식별** — 모델별 고유 관점 (검토 필요)
3. **강점/약점 평가** — 각 응답의 품질, 깊이, 정확성
4. **최종 합성 결과** — 최선의 접근법 도출

### 합성 출력 형식

```markdown
## CCG 합성 결과

### 합의 사항 (높은 신뢰도)
- [세 모델이 동의한 핵심 포인트]

### 차이점 분석
| 주제 | Claude | Codex | Gemini |
|---|---|---|---|
| ... | ... | ... | ... |

### 최종 권고
[합성된 최선의 접근법]
```

## Step 4 — 결과 적용
합성된 접근법을 기반으로 실행합니다.

</Execution_Steps>

<Fallback>
프로바이더 가용성에 따라 자동 폴백:
- 3개 모두 가용 → 완전한 3-모델 합성
- 2개 가용 → 2-모델 비교 합성
- 1개만 가용 → 단일 응답으로 진행 (합성 불가 안내)

Codex 특별 폴백:
- tmux + Codex CLI → 자율 에이전트 스폰 (최고 품질)
- tmux 없음 + Codex CLI → `codex -q` 단발 질의
- Codex CLI 없음 + OAuth/API 키 → OpenAI API 직접 호출
- 모두 불가 → Codex 건너뛰기
</Fallback>

<Arguments>
## 사용법
`/tenetx:ccg {질문 또는 설계 문제}`

### 예시
- `/tenetx:ccg 이 API의 에러 핸들링 전략을 어떻게 설계해야 할까?`
- `/tenetx:ccg 캐시 무효화 로직을 가장 안전하게 구현하는 방법`
- `/tenetx:ccg 이 함수의 시간복잡도를 개선할 수 있을까?`

### 요구사항
- Codex: `codex` CLI 설치 + tmux 환경 (최적) 또는 OPENAI_API_KEY (폴백)
- Gemini: GEMINI_API_KEY 환경변수

### 프로바이더 설정
```bash
tenetx providers                          # 상태 확인
tenetx providers enable codex             # Codex 활성화
tenetx providers enable gemini            # Gemini 활성화
tenetx providers auth oauth               # Codex OAuth 모드 (기본)
tenetx providers model gemini gemini-2.5-pro  # Gemini 모델 변경
```
</Arguments>

$ARGUMENTS
