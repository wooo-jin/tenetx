---
name: pack-builder
description: 팩 생성/편집을 AI가 대화하며 도와주는 가이드
triggers:
  - "팩 채워"
  - "팩 만들"
  - "팩 생성"
  - "팩 편집"
  - "fill pack"
  - "build pack"
  - "create pack"
  - "edit pack"
  - "pack 작성"
---
<Purpose>
사용자가 tenetx 팩(Pack)을 만들거나 채울 때, **사용자의 현재 프로젝트(cwd)**를 분석하여 대화하며 도와줍니다.
팩은 팀의 개발 규칙, 스킬, 에이전트, 워크플로우를 공유하는 패키지입니다.

중요: 이 스킬은 "팩의 내용물을 사용자 프로젝트에 맞게 채우는 것"입니다.
tenetx의 compound loop(세션 인사이트 추출)과는 완전히 다른 기능입니다.
분석 대상은 항상 사용자의 프로젝트이며, tenetx(하네스 도구) 자체가 아닙니다.
</Purpose>

<Steps>
1. **현재 프로젝트를 분석합니다** (가장 중요한 단계):
   - 현재 작업 디렉토리(cwd)의 package.json, tsconfig.json, 프로젝트 구조를 탐색
   - 사용하는 프레임워크, 라이브러리, 빌드 도구, 테스트 도구 파악
   - 기존 CLAUDE.md, .eslintrc, .prettierrc 등 컨벤션 파일 확인
   - `_context.md`가 있으면 함께 참고 (tenetx pack init --from-project로 생성됨)
   - **주의: tenetx(하네스 도구) 자체의 코드나 기능이 아닌, 사용자의 프로젝트를 분석해야 합니다**

2. 대상 팩 디렉토리를 확인합니다:
   - `~/.compound/packs/` 아래에 대상 팩이 있는지 확인
   - 이미 있는 규칙/스킬이 있으면 중복 생성하지 않음

3. 사용자에게 팩의 목적을 질문합니다:
   - "이 팩은 어떤 팀/프로젝트를 위한 건가요?"
   - "가장 중요한 규칙이나 원칙이 있나요?"
   - "팀에서 반복되는 작업이 있나요? (배포, 리뷰, 마이그레이션 등)"

4. 대화를 통해 수집한 정보로 파일을 생성합니다:

   **rules/*.md** — 팀 규칙
   - 파일 하나당 규칙 하나 (단일 관심사)
   - 첫 줄은 `# 규칙 제목`
   - 구체적이고 실행 가능한 내용

   **skills/*.md** — 자동 주입 스킬
   - YAML frontmatter: name, description, triggers (한국어+영어)
   - Purpose, Steps, Constraints 구조
   - triggers는 사용자가 실제로 쓸 키워드

   **agents/*.md** — 도메인 전문 에이전트
   - 역할, 전문 영역, 판단 기준 명시
   - `<!-- tenetx-managed -->` 마커 포함

   **workflows/*.json** — 작업 파이프라인
   - name, description, principle, envOverrides

   **philosophy.json** — 팀 철학 (선택)
   - principles 각각에 belief + generates 배열

5. 생성 후 사용자에게 확인을 받고, 필요하면 수정합니다.

6. 완료 후 안내:
   - `tenetx pack lock` — 버전 고정
   - GitHub에 push → 팀원에게 `tenetx pack setup org/repo` 안내
</Steps>

<Constraints>
- **절대로 tenetx(하네스 도구) 자체의 내부 코드, 기능, 구현을 참고하여 팩을 채우지 말 것** — 사용자의 현재 프로젝트(cwd)만 분석 대상
- 사용자의 도메인 지식을 존중하고, AI가 모르는 팀 컨텍스트는 반드시 질문
- 규칙은 과도하게 만들지 말 것 — 3~5개 핵심 규칙부터 시작
- 스킬 triggers에 한국어와 영어 키워드 모두 포함
- philosophy.json은 사용자가 원할 때만 생성
- 기존 _context.md가 있으면 반드시 먼저 읽을 것
- "compound"는 tenetx의 compound loop 기능이 아닌, 사용자 프로젝트의 패턴/규칙을 채우는 것임을 구분할 것
</Constraints>

<Reference>
팩 디렉토리 구조:
```
pack-name/
  pack.json           # 메타데이터 (자동 생성됨)
  _context.md         # 프로젝트 분석 브리핑 (--from-project로 생성)
  philosophy.json     # 팀 철학/원칙
  rules/*.md          # 팀 규칙
  solutions/*.md      # 검증된 솔루션 패턴
  skills/*.md         # 자동 주입 스킬
  agents/*.md         # 커스텀 에이전트
  workflows/*.json    # 커스텀 워크플로우
```

스킬 파일 포맷:
```yaml
---
name: skill-name
description: 한 줄 설명
triggers:
  - "한국어 키워드"
  - "english keyword"
---
<Purpose>...</Purpose>
<Steps>...</Steps>
<Constraints>...</Constraints>
```

워크플로우 JSON 포맷:
```json
{
  "name": "workflow-name",
  "description": "설명",
  "claudeArgs": [],
  "envOverrides": {},
  "principle": "understand-before-act",
  "persistent": false
}
```
</Reference>
