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
사용자가 tenetx 팩(Pack)을 만들거나 채울 때, 프로젝트 컨텍스트를 기반으로 대화하며 도와줍니다.
팩은 팀의 개발 규칙, 스킬, 에이전트, 워크플로우를 공유하는 패키지입니다.
</Purpose>

<Steps>
1. 먼저 팩 디렉토리를 확인합니다:
   - `~/.compound/packs/` 아래에 팩이 있는지 확인
   - `_context.md`가 있으면 읽어서 프로젝트 분석 결과를 파악

2. 사용자에게 팩의 목적을 질문합니다:
   - "이 팩은 어떤 팀/프로젝트를 위한 건가요?"
   - "가장 중요한 규칙이나 원칙이 있나요?"
   - "팀에서 반복되는 작업이 있나요? (배포, 리뷰, 마이그레이션 등)"

3. 대화를 통해 수집한 정보로 파일을 생성합니다:

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

4. 생성 후 사용자에게 확인을 받고, 필요하면 수정합니다.

5. 완료 후 안내:
   - `tenetx pack lock` — 버전 고정
   - GitHub에 push → 팀원에게 `tenetx pack setup org/repo` 안내
</Steps>

<Constraints>
- 사용자의 도메인 지식을 존중하고, AI가 모르는 팀 컨텍스트는 반드시 질문
- 규칙은 과도하게 만들지 말 것 — 3~5개 핵심 규칙부터 시작
- 스킬 triggers에 한국어와 영어 키워드 모두 포함
- philosophy.json은 사용자가 원할 때만 생성
- 기존 _context.md가 있으면 반드시 먼저 읽을 것
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
