<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>코딩 패턴을 학습하는 Claude Code 플러그인.</strong>
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> &middot;
  <a href="#어떻게-동작하는가">동작 방식</a> &middot;
  <a href="#명령어">명령어</a>
</p>

---

## 테넷엑스란?

tenetx는 Claude Code 사용 방식을 관찰하고, **자동으로 나에게 맞는 규칙을 생성**합니다.

```bash
npm install -g tenetx
tenetx                    # Claude Code를 학습 모드로 시작
```

설정 필요 없음. 평소처럼 Claude Code를 사용하면 됩니다 — tenetx가 백그라운드에서 학습합니다.

- **1일차**: 훅이 조용히 관찰 시작. 프로젝트 스캔으로 Forge 프로파일 자동 생성.
- **1주차** (~5세션): 첫 패턴 감지 → `.claude/rules/` 자동 생성
- **2주차+** (~15세션): 솔루션 축적, 에이전트 튜닝 활성화
- **지속**: 패턴이 증거를 축적. 좋은 패턴은 승급, 나쁜 패턴은 자동 퇴출.

### 하네스 + 플러그인

- **하네스 모드** (`tenetx`): 풀 경험 — 매 세션마다 프로필 갱신, 규칙 생성, 패턴 추출
- **플러그인 모드** (`claude` 직접): 훅 + MCP가 계속 동작. 하네스 실행 사이에도 학습 지속.

다른 플러그인(OMC, superpowers, claude-mem)과 함께 사용 가능 — 중복 기능은 자동 양보.

---

## 어떻게 동작하는가

```
평소처럼 코딩
    ↓
최대 19개 훅이 조용히 관찰 (프롬프트 패턴, 도구 사용, 코드 반영)
    ↓
패턴 감지 → 솔루션 저장 → 증거 추적
    ↓
컨텍스트 압축 시 → Claude가 사고 패턴 분석 (추가 API 비용 0)
    ↓
다음 세션: 개인화 규칙 자동 생성 + 피드백 표시
```

### 복리화 루프

기술 솔루션은 실사용을 통해 신뢰를 얻습니다:

| 상태 | 신뢰도 | 조건 |
|------|--------|------|
| experiment | 0.3 | git diff 또는 Claude 분석에서 자동 추출 |
| candidate | 0.55 | reflected >= 3 and sessions >= 3, 또는 reExtracted >= 2 and reflected >= 1 |
| verified | 0.75 | reflected >= 4 and sessions >= 3, 또는 reExtracted >= 2 |
| mature | 0.90 | reflected >= 8, sessions >= 5, negative <= 1, 7일 이상 유지 |

**Code Reflection**이 Claude가 실제로 패턴을 사용했는지 감지합니다. 빌드/테스트 실패 시 자동 강등. 2회 이상 실패한 experiment는 자동 퇴출.

행동 패턴 학습은 `~/.compound/me/behavior/`에 따로 저장되고 `.claude/rules/` 생성에만 사용됩니다. 기술 compound 지식은 계속 `~/.compound/me/solutions/`에 저장됩니다.

### 학습하는 것

표면적 선호("한글로")만이 아닌, **사고 패턴**:

- "이 사용자는 항상 검증을 요구한다" → 비관적 리뷰 모드
- "이 사용자는 속도보다 품질을 우선한다" → 철저한 테스트 규칙
- "이 사용자는 계획 없이 구현하지 않는다" → 설계 우선 워크플로우
- "이 사용자는 직관보다 근거를 원한다" → 데이터 기반 의사결정

50개 이상 내장 패턴 감지기 (행동/선호/사고) + 컨텍스트 압축 시 Claude 의미 분석. 실제 사용 패턴에 따라 사용자별로 활성화됩니다.

---

## 빠른 시작

```bash
# 설치
npm install -g tenetx

# 방법 A: 하네스 모드 (권장)
tenetx                    # 풀 학습으로 Claude Code 실행
tenetx forge              # 작업 스타일 프로파일링 (선택, 학습 품질 향상)

# 방법 B: 플러그인 모드 (claude를 직접 실행하고 싶을 때)
# 설치 시 훅과 MCP 서버가 자동 등록됩니다. 평소처럼 claude를 사용하면 됩니다.
```

### 요구사항

- **Node.js** >= 20
- **Claude Code** 설치 및 인증 완료

---

## 명령어

```bash
tenetx                    # Claude Code를 하네스로 시작
tenetx forge              # 작업 스타일 프로파일링 (스캔 + 인터뷰)
tenetx me                 # 개인 대시보드 (프로필, 패턴, 비용)
tenetx me --html          # 브라우저에서 HTML 대시보드 열기
tenetx pipeline           # 프로파일 기반 파이프라인 추천
tenetx compound           # 자동 compound 분석 미리보기
tenetx compound --save    # 미리본 기술 인사이트 저장
tenetx compound map       # 지식 맵 시각화
tenetx compound interactive # TTY에서 수동 인사이트 수집
tenetx lab                # 적응형 최적화 지표
tenetx cost               # 세션 비용 추적
tenetx config hooks       # 훅 관리
tenetx mcp                # MCP 서버 관리
tenetx notepad            # 세션 메모장
tenetx doctor             # 시스템 진단
tenetx init               # 프로젝트 초기화
tenetx uninstall          # tenetx 제거
```

### MCP 도구 (세션 중 Claude가 사용 가능)

| 도구 | 용도 |
|------|------|
| `compound-search` | 쿼리로 축적된 지식 검색 |
| `compound-list` | 필터링된 솔루션 목록 |
| `compound-read` | 솔루션 전문 읽기 (축약 없음) |
| `compound-stats` | 통계 요약 |

Claude가 MCP로 지식을 온디맨드로 가져옵니다. 훅은 요약만 자동 push (Progressive Disclosure).

---

## 아키텍처

| 계층 | 역할 | 구성 |
|------|------|------|
| **관찰** | 작업 방식 관찰 | 최대 19개 훅 (compound-core 8, safety 4, workflow 7) |
| **추출** | 패턴 발견 | prompt-learner (50개+ behavioral 감지기) + compound-extractor (기술 솔루션) + Claude 분석 (pre-compact) |
| **프로파일** | 스타일 모델링 | Forge (5차원) + Lab (적응형 최적화) |
| **주입** | 지식 적용 | .claude/rules/ + solution-injector (push) + MCP (pull) |
| **측정** | 증거 추적 | Code Reflection, lifecycle 승급, 세션 추적 |

### Forge — 5차원 프로필

```
품질 초점    [########--] 0.80    자율성       [####------] 0.45
위험 감수도  [######----] 0.62    추상화       [#######---] 0.70
커뮤니케이션 [#########-] 0.88
```

Lab이 관찰된 행동에 기반해 매일 자동 조정 (EMA α=0.15, 최대 ±0.1/일).

### 플러그인 공존

| 다른 플러그인 | tenetx 동작 |
|---|---|
| oh-my-claudecode | 중복 스킬 11개 양보, 훅 3개 양보. Compound-core는 유지. |
| superpowers | 중복 스킬 4개 양보. 훅 충돌 없음. |
| claude-mem | 충돌 없음. 컨텍스트 예산 50% 축소로 협력. |
| 미등록 플러그인 | ~/.claude/plugins/에서 감지. 보수적 예산 적용. |

### 토큰 효율

- **Progressive Disclosure**: 1줄 요약만 push (~200 토큰), 전문은 MCP로 pull (상시 비용 0)
- **조건부 규칙**: `.claude/rules/` 파일에 `paths` frontmatter — 관련 파일 작업 시에만 로드
- **프롬프트 캐싱**: Claude Code가 규칙을 자동 캐시 (첫 턴 이후 10% 비용)

---

## 안전

훅 시스템이 기본 보안을 제공합니다:

- **secret-filter**: 도구 출력에서 API 키, 토큰 마스킹
- **db-guard**: DROP TABLE, TRUNCATE 등 위험 SQL 차단
- **pre-tool-use**: 위험 쉘 명령 차단 (rm -rf /, git push --force main)
- **rate-limiter**: 과도한 도구 호출 방지
- **slop-detector**: 뻔한/저품질 응답 경고
- **symlink 보호**: symlink을 통한 임의 파일 읽기 차단 (8곳)

모든 훅은 에러 시 fail-open (Claude Code를 깨뜨리지 않음). 타임아웃: 훅당 2-5초.

---

## 통계

| 지표 | 수치 |
|------|------|
| 소스 코드 | ~26K줄 |
| 테스트 | 100파일, 1,561개 |
| 훅 레지스트리 | 19개 (충돌 플러그인 감지 시 일부 workflow 훅 자동 비활성화) |
| 패턴 감지기 | 50개+ (사용자별 실제 사용에 따라 활성화) |
| MCP 도구 | 4개 |
| 의존성 | 3개 (js-yaml, @modelcontextprotocol/sdk, zod) |

---

## 감사의 말

[oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (Yeachan Heo)에서 영감을 받았습니다. 멀티 에이전트 오케스트레이션, 매직 키워드 시스템, 하네스를 통한 Claude Code 강화 비전은 OMC의 선구적 작업에 깊은 영향을 받았습니다.

**차별점:** OMC는 강력한 범용 도구를 제공합니다. tenetx는 그 도구를 **개인화**합니다 — 사용 방식을 관찰하고 자동으로 적응합니다.

---

## 연락처

- **제작자:** 장우진
- **LinkedIn:** [linkedin.com/in/우진-장-1567aa294](https://www.linkedin.com/in/%EC%9A%B0%EC%A7%84-%EC%9E%A5-1567aa294/)
- **GitHub:** [@wooo-jin](https://github.com/wooo-jin)

---

## 라이선스

MIT
