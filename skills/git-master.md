---
name: git-master
description: Atomic commits, smart rebasing, and history management
triggers:
  - "git-master"
  - "깃마스터"
  - "atomic commit"
---

<Purpose>
원자적 커밋 전략과 체계적인 Git 히스토리 관리를 실행합니다.
Conventional Commits 컨벤션, 인터랙티브 리베이스, 브랜치 전략을 통해
읽기 쉽고 유지보수 가능한 커밋 히스토리를 구축합니다.
</Purpose>

<Steps>
1. **원자적 커밋 전략**
   - 하나의 커밋 = 하나의 논리적 변경 단위
   - 빌드 가능하고 테스트 통과 상태로 유지
   - `git add <specific-files>`로 변경사항을 파일 단위로 선택적 스테이징
   > **Note:** `git add -p`(인터랙티브 패치 모드)와 `git add -i`는 Claude Code에서 지원되지 않습니다. `git add <specific-files>`를 사용하세요.

2. **Conventional Commits 메시지 컨벤션**
   ```
   <type>(<scope>): <subject>

   <body>

   <footer>
   ```
   - **type**: feat, fix, docs, style, refactor, test, chore, perf
   - **scope**: 변경된 모듈/컴포넌트 (선택)
   - **subject**: 현재형 동사로 시작, 50자 이내
   - **Breaking Change**: footer에 `BREAKING CHANGE:` 명시

3. **인터랙티브 리베이스**
   > **Note:** `git rebase -i`는 Claude Code에서 지원되지 않습니다 (인터랙티브 입력 불가). 대신 `git rebase` with explicit commit range 또는 `git commit --fixup` + `git rebase --autosquash`를 사용하세요.
   ```bash
   git rebase -i HEAD~N  # N개 커밋 재정리 (Claude Code 외부에서 실행)
   ```
   - `pick`: 그대로 유지
   - `squash`/`fixup`: 이전 커밋과 합치기
   - `reword`: 메시지만 수정
   - `edit`: 커밋 내용 수정
   - `drop`: 커밋 삭제
   - ⚠ 공유 브랜치에서 리베이스 금지

4. **브랜치 전략**
   - `main/master`: 항상 배포 가능 상태
   - `develop`: 통합 브랜치 (Git Flow)
   - `feature/<ticket>-<short-desc>`: 기능 개발
   - `fix/<ticket>-<short-desc>`: 버그 수정
   - `hotfix/<ticket>`: 긴급 수정
   - 브랜치명에 티켓 번호 포함 권장

5. **Squash & Fixup 워크플로우**
   ```bash
   git commit --fixup <sha>        # 특정 커밋에 fixup 생성
   git rebase -i --autosquash main # fixup 자동 정렬
   ```

6. **Conflict 해결 전략**
   - `git mergetool` 또는 IDE 통합 도구 사용
   - 복잡한 충돌: `git checkout --ours/--theirs <file>` 선택
   - 충돌 해결 후 반드시 테스트 실행
   - `git log --merge`: 충돌에 기여한 커밋 확인
</Steps>

<Policy>
- 공유 브랜치(main, develop)에서 force push 금지
- 커밋 전 `git diff --staged`로 변경사항 최종 확인
- WIP 커밋은 push 전 squash 처리
- 커밋 메시지에 '수정', 'fix', 'update'만 쓰지 않고 구체적 맥락 포함
</Policy>

<Arguments>
## 사용법
`/tenetx:git-master {작업 내용}`

### 예시
- `/tenetx:git-master 3개의 WIP 커밋을 원자적 커밋으로 재정리`
- `/tenetx:git-master feature 브랜치를 main에 리베이스하며 충돌 해결`
- `/tenetx:git-master 커밋 히스토리 클린업 후 PR 준비`

### 인자
- 현재 Git 상태 또는 수행할 작업을 설명
- 브랜치명, 커밋 범위, 목표 브랜치 등 구체적 정보 포함 권장
</Arguments>

$ARGUMENTS
