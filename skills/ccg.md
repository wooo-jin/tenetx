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

## Step 2 — 작업 분해 및 팀 시작

요청을 역할별로 분해합니다:
- **Codex 태스크**: 코드 분석, 아키텍처 리뷰, 백엔드 로직, 보안 검토, 테스트 전략
- **Gemini 태스크**: UI/UX 설계, 문서화, 비주얼 분석, 대용량 컨텍스트 파일 리뷰
- **합성 태스크**: Claude가 결과를 종합 (항상 Claude가 직접 처리)

짧은 `teamName` 슬러그를 선택합니다 (예: `ccg-auth-review`).

### 2a. tmux 팀 오케스트레이션 (우선, tmux 환경)

```
# 팀 생성
TeamCreate(name="ccg-{slug}", description="CCG 교차 검증")

# Codex 태스크: tenetx codex-spawn으로 별도 프로세스 스폰 (기존 Codex_Delegation 패턴)
tenetx codex-spawn "분석 작업 전체 설명..."

# Gemini 태스크: Claude Task 에이전트로 위임
TaskCreate(team="ccg-{slug}", agent="executor", model="sonnet", prompt="디자인/UI 작업 전체 설명...")
```

### 2b. 결과 수집 및 정리

```
# 태스크 결과 확인
TaskOutput(task_id="...")

# 팀 정리
TeamDelete(team="ccg-{slug}")
```

> **타임아웃 가이드**: TaskOutput 호출로 결과를 폴링합니다.
> **취소 시** TeamDelete로 팀을 삭제하고 codex-spawn 프로세스는 tmux 패널에서 종료합니다.

### 2c. 비tmux 환경 — API 폴백

**tmux가 아닐 때**:

```bash
# Codex: API 단발 질의
ch ask --provider codex "사용자 질문"

# Gemini: API 질의
ch ask --provider gemini "사용자 질문"
```

> OpenAI/Google API로 단발 질의합니다. 에이전트 수준의 깊이는 없지만 응답은 받을 수 있습니다.

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
- 3개 모두 가용 → 완전한 3-모델 합성 (tmux 팀 오케스트레이션)
- 2개 가용 → 2-모델 비교 합성
- 1개만 가용 → 단일 응답으로 진행 (합성 불가 안내)

Codex 4단계 폴백 (tenetx 고유):
1. tmux + Codex CLI → `TeamCreate` + `tenetx codex-spawn`으로 tmux 팀에 에이전트 스폰 (최고 품질)
2. tmux O + Codex CLI → `tenetx codex-spawn --model o4-mini` 직접 스폰
3. tmux 없음 + Codex CLI → `codex -q` 단발 질의
4. Codex CLI 없음 + OAuth/API 키 → OpenAI API 직접 호출
5. 모두 불가 → Codex 건너뛰기, Claude Task 에이전트 대체:
   ```
   Task(subagent_type="tenetx:executor", model="sonnet", ...)  # 분석 태스크
   Task(subagent_type="tenetx:designer", model="sonnet", ...)  # 디자인 태스크
   ```

CLI 미설치 시 출력:
```
[CCG] Codex/Gemini CLI not found. Falling back to Claude-only execution.
```
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
