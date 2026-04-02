#!/bin/bash
# tenetx Docker E2E 테스트 실행기
# 사용법: ./tests/e2e/docker/run-test.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=== tenetx Docker E2E Test ==="
echo "Project: $PROJECT_ROOT"
echo ""

# 1. 빌드
echo ">>> Building tenetx..."
cd "$PROJECT_ROOT"
npm run build

# 2. npm pack으로 tarball 생성 (실제 배포와 동일)
echo ">>> Packing tenetx..."
TARBALL=$(npm pack --pack-destination "$SCRIPT_DIR" 2>&1 | tail -1)
echo "    Packed: $TARBALL"

# 3. Docker 이미지 빌드
echo ">>> Building Docker image..."
docker build -t tenetx-e2e -f "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR"

# 4. 컨테이너 실행
echo ""
echo ">>> Running verification..."
echo ""
docker run --rm tenetx-e2e

# 5. 정리
echo ""
echo ">>> Cleaning up..."
rm -f "$SCRIPT_DIR"/tenetx-*.tgz
echo "Done."
