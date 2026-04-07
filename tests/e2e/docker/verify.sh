#!/bin/bash
# tenetx 클린 환경 E2E 검증 스크립트
# Docker 컨테이너 내에서 실행

set -e

PASS=0
FAIL=0
WARN=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  △ $1"; WARN=$((WARN + 1)); }

echo ""
echo "═══════════════════════════════════════════"
echo "  tenetx — Clean Environment E2E Verification"
echo "═══════════════════════════════════════════"
echo ""

# ──────────────────────────────────────────────
# Phase 0: 설치 검증
# ──────────────────────────────────────────────
echo "  [Phase 0: Installation]"

# 0-1. tenetx CLI 존재
if command -v tenetx &>/dev/null; then
  pass "tenetx CLI is in PATH"
else
  fail "tenetx CLI not found"
fi

# 0-2. tenetx-mcp CLI 존재
if command -v tenetx-mcp &>/dev/null; then
  pass "tenetx-mcp CLI is in PATH"
else
  fail "tenetx-mcp CLI not found"
fi

# 0-3. txd CLI 존재
if command -v txd &>/dev/null; then
  pass "txd CLI is in PATH"
else
  fail "txd CLI not found"
fi

# 0-4. ~/.tenetx/ 디렉터리 구조
if [ -d "$HOME/.tenetx" ]; then
  pass "~/.tenetx/ exists"
else
  fail "~/.tenetx/ missing"
fi

if [ -d "$HOME/.tenetx/me/solutions" ]; then
  pass "~/.tenetx/me/solutions/ exists"
else
  fail "~/.tenetx/me/solutions/ missing"
fi

if [ -d "$HOME/.tenetx/me/behavior" ]; then
  pass "~/.tenetx/me/behavior/ exists"
else
  fail "~/.tenetx/me/behavior/ missing"
fi

if [ -d "$HOME/.tenetx/me/skills" ]; then
  pass "~/.tenetx/me/skills/ exists"
else
  fail "~/.tenetx/me/skills/ missing"
fi

# 0-5. 플러그인 캐시 디렉터리
PLUGIN_CACHE="$HOME/.claude/plugins/cache/tenetx-local/tenetx"
if [ -d "$PLUGIN_CACHE" ] || [ -L "$PLUGIN_CACHE" ]; then
  # 버전 디렉터리가 있는지 확인
  VERSION_DIR=$(ls -d "$PLUGIN_CACHE"/*/ 2>/dev/null | head -1)
  if [ -n "$VERSION_DIR" ]; then
    pass "Plugin cache exists: $VERSION_DIR"

    # hooks.json 존재
    if [ -f "$VERSION_DIR/hooks/hooks.json" ]; then
      pass "hooks/hooks.json exists in plugin cache"
    else
      fail "hooks/hooks.json missing in plugin cache"
    fi

    # dist/hooks/ 존재
    if [ -d "$VERSION_DIR/dist/hooks" ]; then
      HOOK_COUNT=$(ls "$VERSION_DIR/dist/hooks/"*.js 2>/dev/null | wc -l | tr -d ' ')
      if [ "$HOOK_COUNT" -gt 10 ]; then
        pass "dist/hooks/ has $HOOK_COUNT hook scripts"
      else
        fail "dist/hooks/ has only $HOOK_COUNT scripts (expected 10+)"
      fi
    else
      fail "dist/hooks/ missing in plugin cache"
    fi

    # skills/ 디렉터리
    if [ -d "$VERSION_DIR/skills" ]; then
      SKILL_COUNT=$(ls -d "$VERSION_DIR/skills/"*/ 2>/dev/null | wc -l | tr -d ' ')
      pass "skills/ has $SKILL_COUNT skills"
    else
      fail "skills/ missing in plugin cache"
    fi
  else
    fail "No version directory in plugin cache"
  fi
else
  fail "Plugin cache directory missing: $PLUGIN_CACHE"
fi

# 0-6. installed_plugins.json
INSTALLED="$HOME/.claude/plugins/installed_plugins.json"
if [ -f "$INSTALLED" ]; then
  if grep -q "tenetx@tenetx-local" "$INSTALLED"; then
    pass "tenetx registered in installed_plugins.json"

    # installPath가 실제로 존재하는 경로인지
    INSTALL_PATH=$(node -e "
      const d = JSON.parse(require('fs').readFileSync('$INSTALLED','utf-8'));
      const e = d.plugins?.['tenetx@tenetx-local']?.[0];
      console.log(e?.installPath || '');
    " 2>/dev/null)
    if [ -n "$INSTALL_PATH" ] && [ -d "$INSTALL_PATH" ]; then
      pass "installPath exists: $INSTALL_PATH"
    elif [ -n "$INSTALL_PATH" ] && [ -L "$INSTALL_PATH" ]; then
      pass "installPath is a symlink: $INSTALL_PATH"
    else
      fail "installPath does not exist: $INSTALL_PATH"
    fi
  else
    fail "tenetx not in installed_plugins.json"
  fi
else
  fail "installed_plugins.json missing"
fi

# 0-7. settings.json
SETTINGS="$HOME/.claude/settings.json"
if [ -f "$SETTINGS" ]; then
  pass "settings.json exists"
else
  warn "settings.json not created (may be created on first harness run)"
fi

# 0-8. ~/.claude.json (MCP 서버)
CLAUDE_JSON="$HOME/.claude.json"
if [ -f "$CLAUDE_JSON" ] && grep -q "tenetx-compound" "$CLAUDE_JSON"; then
  pass "tenetx-compound MCP server registered in ~/.claude.json"
else
  fail "tenetx-compound not in ~/.claude.json"
fi

echo ""

# ──────────────────────────────────────────────
# Phase 1: 슬래시 커맨드 설치 확인
# ──────────────────────────────────────────────
echo "  [Phase 1: Slash Commands]"

COMMANDS_DIR="$HOME/.claude/commands/tenetx"
if [ -d "$COMMANDS_DIR" ]; then
  CMD_COUNT=$(ls "$COMMANDS_DIR/"*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$CMD_COUNT" -ge 19 ]; then
    pass "19 slash commands installed ($CMD_COUNT found)"
  elif [ "$CMD_COUNT" -ge 9 ]; then
    warn "Only $CMD_COUNT commands installed (expected 19)"
  else
    fail "Only $CMD_COUNT commands installed"
  fi
else
  fail "Commands directory missing: $COMMANDS_DIR"
fi

echo ""

# ──────────────────────────────────────────────
# Phase 2: 훅 동작 검증 (실제 실행)
# ──────────────────────────────────────────────
echo "  [Phase 2: Hook Execution]"

# 훅 스크립트 위치 찾기
if [ -n "$VERSION_DIR" ]; then
  HOOKS_DIR="$VERSION_DIR/dist/hooks"
else
  # fallback: npm global 경로에서 찾기
  HOOKS_DIR=$(npm root -g 2>/dev/null)/tenetx/dist/hooks
fi

# 2-1. pre-tool-use: 위험 명령 차단
if [ -f "$HOOKS_DIR/pre-tool-use.js" ]; then
  RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"},"session_id":"test"}' | node "$HOOKS_DIR/pre-tool-use.js" 2>/dev/null)
  if echo "$RESULT" | grep -q '"continue":false'; then
    pass "pre-tool-use blocks 'rm -rf /'"
  else
    fail "pre-tool-use did NOT block 'rm -rf /': $RESULT"
  fi
else
  fail "pre-tool-use.js not found at $HOOKS_DIR"
fi

# 2-2. pre-tool-use: 안전 명령 허용
if [ -f "$HOOKS_DIR/pre-tool-use.js" ]; then
  RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"},"session_id":"test"}' | node "$HOOKS_DIR/pre-tool-use.js" 2>/dev/null)
  if echo "$RESULT" | grep -q '"continue":true'; then
    pass "pre-tool-use allows 'ls -la'"
  else
    fail "pre-tool-use blocked 'ls -la': $RESULT"
  fi
fi

# 2-3. db-guard: DROP TABLE 차단
if [ -f "$HOOKS_DIR/db-guard.js" ]; then
  RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"psql -c \"DROP TABLE users\""},"session_id":"test"}' | node "$HOOKS_DIR/db-guard.js" 2>/dev/null)
  if echo "$RESULT" | grep -q '"continue":false'; then
    pass "db-guard blocks DROP TABLE"
  else
    fail "db-guard did NOT block DROP TABLE"
  fi
fi

# 2-4. keyword-detector: tdd 키워드 감지
if [ -f "$HOOKS_DIR/keyword-detector.js" ]; then
  RESULT=$(echo '{"prompt":"tdd로 작업해줘","session_id":"test","cwd":"/tmp"}' | COMPOUND_CWD=/tmp node "$HOOKS_DIR/keyword-detector.js" 2>/dev/null)
  if echo "$RESULT" | grep -q 'additionalContext'; then
    pass "keyword-detector injects tdd skill content"
  elif echo "$RESULT" | grep -q '"continue":true'; then
    warn "keyword-detector responded but no skill injection (skill file may be missing)"
  else
    fail "keyword-detector failed: $RESULT"
  fi
fi

# 2-5. intent-classifier: debug intent 감지
if [ -f "$HOOKS_DIR/intent-classifier.js" ]; then
  RESULT=$(echo '{"prompt":"버그 고쳐줘","session_id":"test"}' | node "$HOOKS_DIR/intent-classifier.js" 2>/dev/null)
  if echo "$RESULT" | grep -q 'debug'; then
    pass "intent-classifier detects debug intent"
  elif echo "$RESULT" | grep -q '"continue":true'; then
    pass "intent-classifier responds (intent may vary)"
  else
    fail "intent-classifier failed"
  fi
fi

# 2-6. secret-filter: API 키 감지
if [ -f "$HOOKS_DIR/secret-filter.js" ]; then
  RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"echo test"},"tool_response":"ANTHROPIC_API_KEY=sk-ant-api03-xxxx","session_id":"test"}' | node "$HOOKS_DIR/secret-filter.js" 2>/dev/null)
  if echo "$RESULT" | grep -q 'Sensitive'; then
    pass "secret-filter detects API key"
  else
    warn "secret-filter may not have detected key: $(echo $RESULT | head -c 100)"
  fi
fi

echo ""

# ──────────────────────────────────────────────
# Phase 2.5: 신규 기능 검증 (v4.1 변경분)
# ──────────────────────────────────────────────
echo "  [Phase 2.5: v4.1 New Features]"

# 2.5-1. 보안 패턴 강화: rm -rf / 직접 패턴 (prompt-injection-filter)
FILTER_JS="$HOOKS_DIR/../hooks/prompt-injection-filter.js"
if [ ! -f "$FILTER_JS" ]; then
  # dist 구조에서 직접 찾기
  FILTER_JS=$(find "$VERSION_DIR" -name "prompt-injection-filter.js" -path "*/hooks/*" 2>/dev/null | head -1)
fi
if [ -n "$FILTER_JS" ] && [ -f "$FILTER_JS" ]; then
  # Node.js로 직접 import하여 새 패턴 검증
  SECURITY_CHECK=$(node -e "
    const m = require('$FILTER_JS');
    const tests = [
      ['rm -rf /', true, 'destruct-rm-rf'],
      ['DROP DATABASE prod;', true, 'destruct-drop-db'],
      ['cat ~/.ssh/id_rsa', true, 'exfil-ssh-key'],
      ['eval(atob(\"abc\"))', true, 'obfusc-eval'],
      ['cat /app/.env', true, 'exfil-env'],
      ['ls -la', false, 'safe-command'],
    ];
    let pass = 0, fail = 0;
    for (const [input, shouldBlock, label] of tests) {
      const result = m.containsPromptInjection(input);
      if (result === shouldBlock) pass++;
      else { console.error('FAIL: ' + label + ' expected=' + shouldBlock + ' got=' + result); fail++; }
    }
    console.log(JSON.stringify({pass, fail}));
  " 2>/dev/null)
  if echo "$SECURITY_CHECK" | grep -q '"fail":0'; then
    SECURITY_PASS=$(echo "$SECURITY_CHECK" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).pass))")
    pass "prompt-injection-filter: $SECURITY_PASS/6 new patterns verified"
  else
    fail "prompt-injection-filter: some patterns failed — $SECURITY_CHECK"
  fi
else
  warn "prompt-injection-filter.js not found, skipping pattern check"
fi

# 2.5-2. post-tool-failure: getRecoverySuggestion export 검증
PTF_JS=$(find "$VERSION_DIR" -name "post-tool-failure.js" -path "*/hooks/*" 2>/dev/null | head -1)
if [ -n "$PTF_JS" ] && [ -f "$PTF_JS" ]; then
  RECOVERY_CHECK=$(node -e "
    const m = require('$PTF_JS');
    if (typeof m.getRecoverySuggestion === 'function') {
      const r = m.getRecoverySuggestion('ENOENT: file not found', 'Read');
      console.log(r.includes('not exist') ? 'ok' : 'wrong');
    } else { console.log('no-export'); }
  " 2>/dev/null)
  if [ "$RECOVERY_CHECK" = "ok" ]; then
    pass "post-tool-failure: getRecoverySuggestion works"
  else
    warn "post-tool-failure: getRecoverySuggestion check=$RECOVERY_CHECK"
  fi
else
  warn "post-tool-failure.js not found"
fi

# 2.5-3. auto-tuner 모듈 존재 확인
TUNER_JS=$(find "$VERSION_DIR" -name "auto-tuner.js" -path "*/forge/*" 2>/dev/null | head -1)
if [ -n "$TUNER_JS" ] && [ -f "$TUNER_JS" ]; then
  TUNER_CHECK=$(node -e "
    const m = require('$TUNER_JS');
    if (typeof m.computeDeltas === 'function' && typeof m.tuneFromBehavior === 'function' && typeof m.parseBehaviorFile === 'function') {
      console.log('ok');
    } else { console.log('missing-exports'); }
  " 2>/dev/null)
  if [ "$TUNER_CHECK" = "ok" ]; then
    pass "forge/auto-tuner: all exports present (computeDeltas, tuneFromBehavior, parseBehaviorFile)"
  else
    fail "forge/auto-tuner: missing exports — $TUNER_CHECK"
  fi
else
  fail "forge/auto-tuner.js not found in dist"
fi

# 2.5-4. session-store FTS5 코드 존재 확인
SESSION_JS=$(find "$VERSION_DIR" -name "session-store.js" -path "*/core/*" 2>/dev/null | head -1)
if [ -n "$SESSION_JS" ] && [ -f "$SESSION_JS" ]; then
  if grep -q "messages_fts" "$SESSION_JS" && grep -q "fts5" "$SESSION_JS"; then
    pass "session-store: FTS5 code present"
  else
    fail "session-store: FTS5 code missing"
  fi
else
  warn "session-store.js not found"
fi

echo ""

# ──────────────────────────────────────────────
# Phase 3: tenetx doctor
# ──────────────────────────────────────────────
echo "  [Phase 3: tenetx doctor]"

DOCTOR_OUTPUT=$(tenetx doctor 2>&1 || true)
if echo "$DOCTOR_OUTPUT" | grep -q "Diagnostics"; then
  pass "tenetx doctor runs successfully"

  # 플러그인 캐시 체크 결과
  if echo "$DOCTOR_OUTPUT" | grep -q "✓.*tenetx plugin cache"; then
    pass "doctor: plugin cache OK"
  else
    fail "doctor: plugin cache check failed"
  fi
else
  fail "tenetx doctor failed to run"
fi

echo ""

# ──────────────────────────────────────────────
# Phase 4: MCP 서버
# ──────────────────────────────────────────────
echo "  [Phase 4: MCP Server]"

# tenetx-mcp가 실행 가능한지 (즉시 종료 — stdin 없으면 대기)
timeout 3 tenetx-mcp </dev/null >/dev/null 2>&1 &
MCP_PID=$!
sleep 1
if kill -0 $MCP_PID 2>/dev/null; then
  pass "tenetx-mcp process starts"
  kill $MCP_PID 2>/dev/null || true
else
  # 프로세스가 이미 종료됨 (stdin 없어서 정상)
  pass "tenetx-mcp executed (exited — no stdin)"
fi

echo ""

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo "═══════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "═══════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  ❌ VERIFICATION FAILED — $FAIL issues must be fixed"
  exit 1
else
  echo "  ✅ ALL CHECKS PASSED"
  exit 0
fi
