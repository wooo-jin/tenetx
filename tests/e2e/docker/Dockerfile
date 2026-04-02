FROM node:22-slim

# git 설치 (postinstall에서 git 사용)
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Claude Code CLI 설치
RUN npm i -g @anthropic-ai/claude-code@latest 2>/dev/null || echo "Claude CLI install skipped (may need auth)"

# 작업 디렉터리
WORKDIR /workspace

# tenetx 패키지 복사 (npm pack으로 생성한 tarball)
COPY tenetx-*.tgz /tmp/tenetx.tgz

# 글로벌 설치 — 실제 사용자 환경과 동일
RUN npm i -g /tmp/tenetx.tgz

# 테스트 스크립트 복사
COPY verify.sh /workspace/verify.sh
RUN chmod +x /workspace/verify.sh

# 테스트 프로젝트 초기화
RUN mkdir -p /workspace/test-project && \
    cd /workspace/test-project && \
    git init && \
    npm init -y && \
    echo '{}' > tsconfig.json

WORKDIR /workspace/test-project

ENTRYPOINT ["/workspace/verify.sh"]
