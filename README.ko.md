<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>쓸수록 나를 더 잘 아는 Claude Code harness.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
</p>

<p align="center">
  <a href="#빠른-시작">빠른 시작</a> &middot;
  <a href="#동작-방식">동작 방식</a> &middot;
  <a href="#명령어">명령어</a> &middot;
  <a href="README.md">English</a>
</p>

---

## 쓸수록 나를 더 잘 아는 Claude

Tenetx는 Claude Code를 **개인화 하네스**로 감쌉니다. 4개 축으로 작업 스타일을 프로파일링하고, 교정에서 학습하며, 시간이 지날수록 Claude의 행동을 적응시킵니다.

```bash
npm install -g tenetx
tenetx                    # `claude` 대신 사용
```

---

## 빠른 시작

```bash
# 설치
npm install -g tenetx

# 첫 실행 — 4문항 온보딩 (영어/한국어 선택)
tenetx

# 매일 사용 (`claude` 대신)
tenetx
```

### 사전 요구사항

- **Node.js** >= 20 (세션 검색은 >= 22 권장)
- **Claude Code** 설치 및 인증 (`npm i -g @anthropic-ai/claude-code`)

---

## 동작 방식

### 4축 개인화

| 축 | 팩 | 제어 대상 |
|---|---|---|
| **품질/안전** | 보수형 / 균형형 / 속도형 | 검증 깊이, 중단 임계값, 변경 범위 |
| **자율성** | 확인 우선형 / 균형형 / 자율 실행형 | 확인 빈도, 범위 확장, 가정 허용 |
| **판단 철학** | 최소변경형 / 균형형 / 구조적접근형 | 리팩토링 성향, 추상화 선호도 |
| **커뮤니케이션** | 간결형 / 균형형 / 상세형 | 설명 깊이, 보고 구조, 교육적 스타일 |

### 학습 루프

```
온보딩 (4문항)
    → 프로필 생성 (팩 + facet + trust policy)
    → .claude/rules/v1-rules.md에 규칙 렌더링

세션 진행
    → Claude가 개인화 규칙을 따름
    → 사용자 교정 → correction-record MCP → Evidence 저장
    → 행동 패턴 관찰

세션 종료
    → 자동 compound: 솔루션 + 세션 학습 요약 추출
    → facet 미세 조정 (프로필 자동 업데이트)
    → 워크플로우 패턴 누적

다음 세션
    → 업데이트된 규칙 렌더링 (교정 반영)
    → Mismatch 감지 (최근 3세션 rolling 분석)
    → Compound 지식 MCP로 검색 가능
```

---

## 명령어

```bash
tenetx                          # 개인화된 Claude Code 시작
tenetx onboarding               # 4문항 온보딩 실행
tenetx forge                    # 프로필 관리 (--profile, --export, --reset)
tenetx inspect profile          # 4축 프로필 + facet 확인
tenetx inspect rules            # 활성/비활성 규칙 확인
tenetx inspect evidence         # 교정 기록 확인
tenetx inspect session          # 현재 세션 상태 확인
tenetx compound                 # 축적된 지식 관리
tenetx compound --save          # 자동 분석된 패턴 저장
tenetx skill promote <name>     # 솔루션을 스킬로 승격
tenetx init                     # 프로젝트 초기화
tenetx doctor                   # 시스템 진단
tenetx uninstall                # tenetx 제거
```

### MCP 도구 (세션 중 Claude가 사용)

| 도구 | 용도 |
|------|------|
| `compound-search` | 축적된 지식 검색 |
| `compound-read` | 솔루션 전문 읽기 |
| `compound-list` | 솔루션 목록 필터링 |
| `compound-stats` | 통계 요약 |
| `session-search` | 이전 세션 대화 검색 |
| `correction-record` | 사용자 교정을 evidence로 기록 |

---

## 아키텍처

```
~/.tenetx/                       ← v1 개인화 홈
├── me/
│   ├── forge-profile.json       ← 4축 프로필 (팩 + facet + trust)
│   ├── rules/                   ← Rule 저장소 (규칙별 JSON)
│   ├── behavior/                ← Evidence 저장소 (교정 + 관찰)
│   ├── recommendations/         ← 팩 추천 (온보딩 + mismatch)
│   └── solutions/               ← Compound 지식
├── state/
│   ├── sessions/                ← 세션 상태 스냅샷
│   └── raw-logs/                ← Raw 세션 로그 (7일 TTL)
└── config.json                  ← 글로벌 설정 (locale, trust, packs)
```

### 핵심 설계 원칙

- **4축 개인화** — 단순 선호가 아닌, 팩 + facet 구조의 정밀한 프로파일링
- **Evidence 기반 학습** — 교정은 구조화된 데이터, regex 패턴 매칭이 아님
- **AI 판단 경계** — Hook은 수집, Claude는 해석, 알고리즘은 적용
- **Pack + Overlay** — 안정적 베이스 팩 위에 facet 미세 조정으로 개인화
- **Mismatch 감지** — 최근 3세션 분석으로 팩 부적합 자동 감지
- **i18n** — 영어/한국어, 온보딩 시 선택

---

## 안전

자동 등록되는 보안 훅:

| 훅 | 기능 |
|---|---|
| `pre-tool-use` | 위험 명령 차단 (rm -rf, curl\|sh, force-push) |
| `db-guard` | 위험 SQL 차단 (DROP TABLE, WHERE 없는 DELETE) |
| `secret-filter` | API 키 노출 경고 |
| `slop-detector` | AI slop 감지 (TODO 잔재, eslint-disable, as any) |
| `prompt-injection-filter` | 프롬프트 인젝션 차단 |

---

## 라이선스

MIT
