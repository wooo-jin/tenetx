# Tenetx Pack 작성 가이드

팩(Pack)은 팀의 개발 철학, 규칙, 스킬, 에이전트, 워크플로우를 하나의 패키지로 묶어 공유하는 단위입니다. 시니어가 한 번 설계해두면, 팀원 모두가 동일한 AI 작업 환경을 사용할 수 있습니다.

## 팩 디렉토리 구조

```
my-team-pack/
├── pack.json              # 팩 메타데이터 (필수)
├── philosophy.json        # 팀 철학/원칙 정의
├── rules/                 # 팀 규칙 (.md)
│   ├── code-style.md
│   └── review-checklist.md
├── solutions/             # 검증된 솔루션 패턴 (.md)
│   └── api-error-handling.md
├── skills/                # 자동 주입 스킬 (.md)
│   ├── deploy-check.md
│   └── db-migration.md
├── agents/                # 커스텀 에이전트 (.md)
│   └── domain-reviewer.md
└── workflows/             # 커스텀 워크플로우 (.json)
    └── team-review.json
```

## 1. pack.json — 팩 메타데이터

```json
{
  "name": "my-team-pack",
  "version": "1.0.0",
  "remote": {
    "type": "github",
    "url": "https://github.com/org/my-team-pack",
    "auto_sync": true
  },
  "provides": {
    "rules": 2,
    "solutions": 1,
    "skills": 2,
    "agents": 1,
    "workflows": 1
  }
}
```

| 필드 | 설명 |
|------|------|
| `name` | 팩 고유 이름 (영문, 하이픈 허용) |
| `version` | 시맨틱 버저닝 |
| `remote.type` | `github`, `local` |
| `remote.url` | 원격 저장소 URL 또는 로컬 경로 |
| `remote.auto_sync` | 자동 동기화 여부 |
| `provides` | 각 자산 유형별 개수 (자동 갱신됨) |

## 2. philosophy.json — 팀 철학

팀의 핵심 원칙을 선언합니다. 이 원칙은 모델 라우팅, 보안 규칙, 안티패턴 감지 등에 반영됩니다.

```json
{
  "name": "my-team-philosophy",
  "version": "1.0.0",
  "author": "Team Lead",
  "description": "우리 팀의 개발 원칙",
  "principles": {
    "test-before-merge": {
      "belief": "테스트 없이 머지하면 장애가 반복된다",
      "generates": [
        "모든 PR은 테스트 커버리지 80% 이상 필수",
        { "alert": "테스트 없는 코드 변경 감지 시 경고" }
      ]
    },
    "security-first": {
      "belief": "보안은 기능 완성 후가 아니라 설계 시점에 고려한다",
      "generates": [
        "SQL 쿼리는 반드시 파라미터 바인딩 사용",
        { "alert": "하드코딩된 시크릿 감지 시 차단" },
        { "routing": "보안 관련 → Opus 에스컬레이션" }
      ]
    }
  }
}
```

### generates 항목 유형

| 유형 | 예시 | 효과 |
|------|------|------|
| `string` | `"SQL injection 방지"` | golden-principles 규칙에 추가 |
| `{ alert: "..." }` | `{ "alert": "시크릿 노출 경고" }` | security/anti-pattern 규칙 생성 |
| `{ routing: "..." }` | `{ "routing": "보안 → Opus" }` | 모델 라우팅 테이블에 반영 |
| `{ step: "..." }` | `{ "step": "PR 체크리스트 확인" }` | golden-principles에 절차로 추가 |

### 철학 상속

프로젝트의 `.compound/philosophy.json`에서 팩 철학을 상속할 수 있습니다:

```json
{
  "name": "project-philosophy",
  "version": "1.0.0",
  "author": "Dev",
  "extends": "pack:my-team-pack",
  "principles": {
    "project-specific-rule": {
      "belief": "이 프로젝트만의 규칙",
      "generates": ["..."]
    }
  }
}
```

`extends: "pack:팩이름"` → 팩의 principles를 base로 로드 후, 프로젝트 principles를 병합합니다.

## 3. rules/ — 팀 규칙

각 `.md` 파일이 하나의 규칙입니다. Claude Code 세션에서 `.claude/rules/compound.md`에 자동 포함됩니다.

```markdown
# API 응답 형식 표준

모든 API 응답은 다음 형식을 따른다:
- 성공: `{ data: T, meta?: { ... } }`
- 실패: `{ error: { code: string, message: string } }`
- 페이지네이션: `{ data: T[], meta: { total, page, limit } }`
```

**작성 팁:**
- 규칙 하나당 파일 하나 (단일 관심사)
- 첫 줄은 `# 규칙 제목` (목록 표시에 사용됨)
- 구체적이고 실행 가능한 내용으로 작성

## 4. solutions/ — 검증된 솔루션

팀에서 반복적으로 사용하는 해결 패턴을 축적합니다. `tenetx compound` 후 자동 추출되거나 수동으로 작성합니다.

```markdown
# Redis 캐시 무효화 패턴

## 문제
API 응답 캐시가 DB 업데이트 후에도 남아 있어 stale 데이터 반환.

## 솔루션
Write-through + TTL 조합:
- 쓰기 시 캐시 즉시 삭제 (invalidate)
- 읽기 시 캐시 miss면 DB 조회 후 TTL 30분으로 재설정
- 배치 업데이트 시 패턴 키 prefix 기반 일괄 삭제

## 적용 위치
- `src/cache/` 디렉토리의 모든 캐시 래퍼
```

## 5. skills/ — 자동 주입 스킬

사용자 프롬프트에 특정 키워드가 포함되면 자동으로 컨텍스트에 주입되는 스킬입니다.

```markdown
---
name: deploy-check
description: 배포 전 체크리스트를 자동 주입
triggers:
  - "배포"
  - "deploy"
  - "릴리즈"
---
<Purpose>
배포 전 필수 확인 사항을 안내합니다.
</Purpose>

<Steps>
1. `npm test` 전체 통과 확인
2. `npm run build` 성공 확인
3. 환경변수 diff 확인 (.env.example vs 배포 환경)
4. DB 마이그레이션 필요 여부 확인
5. 롤백 계획 수립
</Steps>

<Constraints>
- 프로덕션 배포는 반드시 스테이징 검증 후 진행
- 금요일 오후 배포 금지
</Constraints>
```

### 스킬 우선순위

같은 이름의 스킬이 여러 위치에 있으면, 더 구체적인 것이 우선합니다:

1. **프로젝트** `.compound/skills/` — 이 프로젝트에만 적용
2. **연결된 팩** `skills/` — 팀 공유 스킬
3. **개인** `~/.compound/me/skills/` — 나만의 스킬
4. **글로벌** `~/.compound/skills/` — 모든 프로젝트 공통
5. **내장** tenetx 패키지 기본 스킬

### 스킬 YAML 필드

| 필드 | 필수 | 설명 |
|------|:----:|------|
| `name` | ✅ | 스킬 고유 이름 |
| `description` | ✅ | 한 줄 설명 |
| `triggers` | ✅ | 매칭 키워드 배열 (소문자 비교) |

## 6. agents/ — 커스텀 에이전트

Claude Code의 에이전트 시스템에 팀 전용 에이전트를 추가합니다.

```markdown
---
name: emr-domain-reviewer
description: EMR 도메인 전문 코드 리뷰어
---

당신은 EMR(전자의무기록) 도메인 전문 코드 리뷰어입니다.

## 전문 영역
- FHIR 리소스 구조 검증
- 의료 데이터 보안 규정 (HIPAA, 개인정보보호법)
- HL7 메시지 포맷 검증

## 리뷰 기준
1. 환자 데이터 접근 시 감사 로그 필수
2. 진단 코드(ICD-10) 유효성 검증
3. 의료 용어 다국어 처리 확인
```

팩 설치/동기화 시 프로젝트 `.claude/agents/pack-{팩이름}-{파일명}` 형태로 배포됩니다.

**주의:** 에이전트 파일에 `<!-- tenetx-managed -->` 마커가 포함되면 패키지 업데이트 시 자동 덮어쓰기됩니다. 마커가 없으면 사용자 수정으로 간주하여 보호합니다.

## 7. workflows/ — 커스텀 워크플로우

팀 고유의 작업 파이프라인을 JSON으로 정의합니다. `tenetx` 실행 시 `--{workflow-name}` 플래그로 사용할 수 있습니다.

```json
{
  "name": "emr-review",
  "description": "EMR 코드 리뷰 파이프라인 (보안 + 도메인 + 성능)",
  "claudeArgs": [],
  "envOverrides": {
    "COMPOUND_REVIEW_SCOPE": "security,domain,performance"
  },
  "principle": "understand-before-act",
  "persistent": false,
  "composedOf": ["ralph"]
}
```

### 워크플로우 JSON 필드

| 필드 | 필수 | 기본값 | 설명 |
|------|:----:|--------|------|
| `name` | ✅ | - | 워크플로우 이름 (CLI 플래그로 사용) |
| `description` | ✅ | - | 설명 |
| `claudeArgs` | | `[]` | Claude Code 추가 인자 |
| `envOverrides` | | `{}` | 환경변수 오버라이드 |
| `principle` | | `"-"` | 연결된 철학 원칙 |
| `persistent` | | `false` | 세션 간 상태 유지 |
| `composedOf` | | - | 내부 포함 모드 |

## 8. requires — 외부 의존성 선언

팩이 정상 작동하기 위해 필요한 외부 도구, MCP 서버, 환경변수를 선언합니다. `tenetx pack setup`과 `tenetx doctor`에서 자동으로 검사됩니다.

```json
{
  "name": "emr-pack",
  "version": "1.0.0",
  "requires": {
    "mcpServers": [
      {
        "name": "serena",
        "pip": "serena",
        "description": "코드 시맨틱 분석 MCP 서버"
      },
      {
        "name": "context7",
        "npm": "@context7/mcp-server",
        "description": "라이브러리 문서 검색"
      }
    ],
    "tools": [
      {
        "name": "gh",
        "installCmd": "brew install gh",
        "description": "GitHub CLI (팀 PR 기능)"
      }
    ],
    "envVars": [
      {
        "name": "ANTHROPIC_API_KEY",
        "description": "Claude API 키",
        "required": true
      },
      {
        "name": "OPENAI_API_KEY",
        "description": "OpenAI API 키 (ccg 모드용)",
        "required": false
      }
    ]
  }
}
```

### requires 필드

| 필드 | 설명 |
|------|------|
| `mcpServers[].name` | Claude Code settings.json에 등록된 MCP 서버 이름 |
| `mcpServers[].npm` | npm 패키지명 (설치 안내용) |
| `mcpServers[].pip` | pip 패키지명 (설치 안내용) |
| `mcpServers[].installCmd` | 커스텀 설치 명령어 |
| `tools[].name` | PATH에서 찾을 CLI 명령어 |
| `tools[].installCmd` | 설치 안내 명령어 |
| `envVars[].name` | 환경변수 이름 |
| `envVars[].required` | 필수 여부 (기본: true) |

`tenetx pack setup`을 실행하면 이 의존성을 자동으로 검사하고, 미충족 항목을 안내합니다.

## 빠른 시작

### 팩 생성

```bash
# 새 팩 초기화
tenetx pack init my-team-pack

# 디렉토리 구조가 자동 생성됨
# ~/.compound/packs/my-team-pack/
#   pack.json, rules/, solutions/, skills/, agents/, workflows/
```

### 팩을 GitHub에 배포

```bash
cd ~/.compound/packs/my-team-pack
git init && git add . && git commit -m "Initial pack"
gh repo create org/my-team-pack --push --source .
```

### 프로젝트에 팩 연결 (원클릭)

```bash
# 원클릭 셋업: 설치 + 연결 + 동기화 + 의존성 검사
tenetx pack setup org/my-team-pack

# 복수 팩도 차례로 셋업
tenetx pack setup org/shared-rules
tenetx pack setup org/emr-domain

# 연결 상태 확인
tenetx pack connected
```

### 수동 연결 (개별 단계)

```bash
# 1. 팩 설치
tenetx pack install org/my-team-pack

# 2. 프로젝트에 연결
tenetx pack add my-team-pack --repo org/my-team-pack

# 3. 동기화
tenetx pack sync my-team-pack
```

## 설계 원칙

### 1. 한 팩에 하나의 관심사

```
✅ 좋은 예:
  emr-security-pack/     — EMR 보안 규칙만
  api-standards-pack/    — API 설계 표준만

❌ 나쁜 예:
  everything-pack/       — 모든 것을 넣은 팩
```

### 2. 작은 것부터 시작

처음부터 모든 자산을 채울 필요 없습니다:

```
1단계: rules/ + philosophy.json     ← 팀 규칙 표준화
2단계: + solutions/                 ← 검증된 패턴 축적
3단계: + skills/                    ← 반복 작업 자동화
4단계: + agents/ + workflows/       ← 팀 전용 워크플로우
```

### 3. 팩 조합

프로젝트에 복수 팩을 연결하여 레이어링할 수 있습니다:

```
프로젝트 A:
  ├── org-standards      (조직 공통: 코드 스타일, 보안)
  ├── emr-domain         (EMR 도메인: 의료 용어, FHIR)
  └── team-workflows     (우리 팀 워크플로우)

프로젝트 B:
  ├── org-standards      (동일 조직 공통)
  ├── fintech-domain     (핀테크 도메인: PCI-DSS, 결제)
  └── team-workflows     (동일 팀 워크플로우)
```

### 4. 충돌 해소

같은 이름의 자산이 여러 팩에 있으면 먼저 연결된 팩이 우선합니다:

```bash
# 연결 순서가 우선순위를 결정
tenetx pack add high-priority --repo org/important   # 이게 우선
tenetx pack add low-priority --repo org/fallback
```

## FAQ

**Q: 팩을 비공개 레포로 운영할 수 있나요?**
A: 네. `gh auth login`으로 인증된 GitHub 계정이 접근 가능한 레포면 됩니다.

**Q: 팩 업데이트는 어떻게 배포하나요?**
A: 팩 레포에 push하면, 팀원들이 `tenetx pack sync`로 받습니다. `auto_sync: true`면 세션 시작 시 자동 동기화됩니다.

**Q: 기존 팩 에이전트를 팀원이 커스터마이즈할 수 있나요?**
A: 네. `.claude/agents/pack-{name}-{file}.md`를 직접 수정하면 해시 보호로 인해 이후 sync에서 덮어쓰지 않습니다.

**Q: 스킬과 에이전트의 차이는?**
A: 스킬은 프롬프트에 키워드가 매칭되면 자동 주입되는 컨텍스트이고, 에이전트는 Claude Code의 Agent 도구로 명시적으로 호출하는 전문 역할입니다.
