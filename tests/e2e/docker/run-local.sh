#!/bin/bash
# tenetx 로컬 클린 환경 E2E 테스트 (Docker 없이)
# 임시 HOME에서 npm i -g를 시뮬레이션

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
FAKE_HOME=$(mktemp -d /tmp/tenetx-e2e-home-XXXXXX)
FAKE_PREFIX=$(mktemp -d /tmp/tenetx-e2e-prefix-XXXXXX)

cleanup() {
  rm -rf "$FAKE_HOME" "$FAKE_PREFIX" "$SCRIPT_DIR"/tenetx-*.tgz 2>/dev/null
}
trap cleanup EXIT

echo ""
echo "═══════════════════════════════════════════"
echo "  tenetx — Local Clean Environment E2E"
echo "═══════════════════════════════════════════"
echo ""
echo "  Fake HOME:   $FAKE_HOME"
echo "  Fake PREFIX:  $FAKE_PREFIX"
echo ""

# 1. 빌드 + pack
echo ">>> Step 1: Build & Pack"
cd "$PROJECT_ROOT"
npm run build --silent
TARBALL=$(npm pack --pack-destination "$SCRIPT_DIR" 2>&1 | tail -1)
echo "    Packed: $TARBALL"

# 2. 클린 환경에 글로벌 설치
echo ""
echo ">>> Step 2: Clean install (npm i -g)"
HOME="$FAKE_HOME" npm install -g "$SCRIPT_DIR/$TARBALL" --prefix "$FAKE_PREFIX" 2>&1 | tail -5
echo ""

# 3. 검증
PASS=0
FAIL=0
WARN=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  △ $1"; WARN=$((WARN + 1)); }

PATH="$FAKE_PREFIX/bin:$PATH"
export HOME="$FAKE_HOME"

echo "  [Phase 0: Installation]"

# CLI 존재
if command -v tenetx &>/dev/null; then pass "tenetx CLI in PATH"
else fail "tenetx CLI not found"; fi

if command -v tenetx-mcp &>/dev/null; then pass "tenetx-mcp CLI in PATH"
else fail "tenetx-mcp CLI not found"; fi

# ~/.compound/ 디렉터리
for dir in "$HOME/.compound" "$HOME/.compound/me/solutions" "$HOME/.compound/me/behavior" "$HOME/.compound/me/skills" "$HOME/.compound/sessions" "$HOME/.compound/state"; do
  if [ -d "$dir" ]; then pass "$(echo $dir | sed "s|$HOME|~|") exists"
  else fail "$(echo $dir | sed "s|$HOME|~|") missing"; fi
done

# 플러그인 캐시
PLUGIN_CACHE="$HOME/.claude/plugins/cache/tenetx-local/tenetx"
if [ -d "$PLUGIN_CACHE" ] || [ -L "$PLUGIN_CACHE" ]; then
  VERSION_DIR=$(find "$PLUGIN_CACHE" -mindepth 1 -maxdepth 1 -type d -o -type l 2>/dev/null | head -1)
  if [ -n "$VERSION_DIR" ]; then
    pass "Plugin cache: $VERSION_DIR"
    if [ -f "$VERSION_DIR/hooks/hooks.json" ]; then pass "hooks.json in cache"
    else fail "hooks.json missing in cache"; fi
    if [ -d "$VERSION_DIR/dist/hooks" ]; then
      HC=$(ls "$VERSION_DIR/dist/hooks/"*.js 2>/dev/null | wc -l | tr -d ' ')
      pass "dist/hooks/ has $HC scripts"
    else fail "dist/hooks/ missing in cache"; fi
  else fail "No version dir in plugin cache"; fi
else fail "Plugin cache missing"; fi

# installed_plugins.json
INSTALLED="$HOME/.claude/plugins/installed_plugins.json"
if [ -f "$INSTALLED" ] && grep -q "tenetx@tenetx-local" "$INSTALLED"; then
  pass "tenetx in installed_plugins.json"
  IPATH=$(node -e "const d=JSON.parse(require('fs').readFileSync('$INSTALLED','utf-8'));console.log(d.plugins?.['tenetx@tenetx-local']?.[0]?.installPath||'')" 2>/dev/null)
  if [ -n "$IPATH" ] && ([ -d "$IPATH" ] || [ -L "$IPATH" ]); then
    pass "installPath accessible: $IPATH"
  else fail "installPath not accessible: $IPATH"; fi
else fail "tenetx not in installed_plugins.json"; fi

# MCP 서버 등록
if [ -f "$HOME/.claude.json" ] && grep -q "tenetx-compound" "$HOME/.claude.json"; then
  pass "tenetx-compound MCP in ~/.claude.json"
else fail "tenetx-compound not in ~/.claude.json"; fi

# 슬래시 커맨드
CMD_DIR="$HOME/.claude/commands/tenetx"
if [ -d "$CMD_DIR" ]; then
  CC=$(ls "$CMD_DIR/"*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$CC" -ge 19 ]; then pass "$CC slash commands installed"
  else warn "Only $CC commands (expected 19)"; fi
else fail "Commands dir missing"; fi

echo ""
echo "  [Phase 1: Hook Execution]"

# 훅 스크립트 위치
if [ -n "$VERSION_DIR" ]; then
  HDIR="$VERSION_DIR/dist/hooks"
else
  HDIR="$FAKE_PREFIX/lib/node_modules/tenetx/dist/hooks"
fi

# pre-tool-use: 차단
if [ -f "$HDIR/pre-tool-use.js" ]; then
  R=$(echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"},"session_id":"test"}' | node "$HDIR/pre-tool-use.js" 2>/dev/null)
  if echo "$R" | grep -q '"continue":false'; then pass "pre-tool-use blocks rm -rf /"
  else fail "pre-tool-use did NOT block rm -rf /"; fi
else fail "pre-tool-use.js not found"; fi

# pre-tool-use: 허용
if [ -f "$HDIR/pre-tool-use.js" ]; then
  R=$(echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"session_id":"test"}' | node "$HDIR/pre-tool-use.js" 2>/dev/null)
  if echo "$R" | grep -q '"continue":true'; then pass "pre-tool-use allows ls"
  else fail "pre-tool-use blocked ls"; fi
fi

# db-guard
if [ -f "$HDIR/db-guard.js" ]; then
  R=$(echo '{"tool_name":"Bash","tool_input":{"command":"DROP TABLE users"},"session_id":"t"}' | node "$HDIR/db-guard.js" 2>/dev/null)
  if echo "$R" | grep -q '"continue":false'; then pass "db-guard blocks DROP TABLE"
  else fail "db-guard did not block DROP TABLE"; fi
fi

# intent-classifier
if [ -f "$HDIR/intent-classifier.js" ]; then
  R=$(echo '{"prompt":"버그 고쳐줘","session_id":"t"}' | node "$HDIR/intent-classifier.js" 2>/dev/null)
  if echo "$R" | grep -q '"continue":true'; then pass "intent-classifier responds"
  else fail "intent-classifier failed"; fi
fi

# secret-filter
if [ -f "$HDIR/secret-filter.js" ]; then
  R=$(echo '{"tool_name":"Bash","tool_input":{"command":"echo"},"tool_response":"API_KEY=sk-ant-api03-xxxx","session_id":"t"}' | node "$HDIR/secret-filter.js" 2>/dev/null)
  if echo "$R" | grep -q '"continue":true'; then pass "secret-filter processes response"
  else fail "secret-filter failed"; fi
fi

echo ""
echo "  [Phase 2: Starter Knowledge Pack]"

SOLUTIONS_DIR="$HOME/.compound/me/solutions"
if [ -d "$SOLUTIONS_DIR" ]; then
  SOL_COUNT=$(ls "$SOLUTIONS_DIR/"*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$SOL_COUNT" -ge 10 ]; then
    pass "Starter pack: $SOL_COUNT solutions installed"
  elif [ "$SOL_COUNT" -gt 0 ]; then
    warn "Only $SOL_COUNT starter solutions (expected 15)"
  else
    fail "No starter solutions installed"
  fi

  # 솔루션 포맷 검증 (첫 번째 파일)
  FIRST=$(ls "$SOLUTIONS_DIR/"*.md 2>/dev/null | head -1)
  if [ -n "$FIRST" ]; then
    if head -1 "$FIRST" | grep -q "^---"; then
      pass "Solution frontmatter format OK"
    else
      fail "Solution missing YAML frontmatter"
    fi
  fi
else
  fail "Solutions directory missing"
fi

echo ""
echo "  [Phase 3: tenetx doctor]"

DOCTOR=$(HOME="$FAKE_HOME" tenetx doctor 2>&1 || true)
if echo "$DOCTOR" | grep -q "Diagnostics"; then
  pass "tenetx doctor runs"
  if echo "$DOCTOR" | grep -q "✓.*tenetx plugin cache"; then
    pass "doctor: plugin cache OK"
  else warn "doctor: plugin cache not verified"; fi
else fail "tenetx doctor failed"; fi

# ── Summary ──
echo ""
echo "═══════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "═══════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  ❌ VERIFICATION FAILED"
  exit 1
else
  echo "  ✅ ALL CHECKS PASSED"
  exit 0
fi
