#!/bin/bash
# tenetx v1 Docker E2E 테스트 실행
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "[tenetx] Building v1 E2E test image..."
docker build -t tenetx-v1-test -f "$SCRIPT_DIR/Dockerfile.v1" "$PROJECT_ROOT"

echo ""
echo "[tenetx] Running v1 E2E verification..."
docker run --rm tenetx-v1-test
