# tenetx — Same Tool, Different Developer
# Shows how forge adapts Claude to YOUR coding style

Output assets/demo/before-after.gif

Set Shell "zsh"
Set FontFamily "JetBrains Mono"
Set FontSize 14
Set Width 1200
Set Height 750
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 25ms
Set WindowBar Colorful
Set BorderRadius 10
Set Margin 20
Set MarginFill "#1e1e2e"

# ═══════════════════════════════════════
# Developer A: Senior — wants terse, severity-only
# ═══════════════════════════════════════

Hide
Type `TMPDIR=$(mktemp -d) && cd "$TMPDIR" && git init -q && git config user.email "t@t" && git config user.name "T" && mkdir -p .claude/rules && cat > .claude/rules/forge-communication.md << 'EOF'`
Enter
Type "# Tenetx Forge — Communication Style (terse profile)"
Enter
Type "- Keep responses under 3 sentences unless showing code"
Enter
Type "- No preamble or trailing summary"
Enter
Type "- For code review: use [SEVERITY] format only"
Enter
Type "EOF"
Enter
Type "clear"
Enter
Sleep 1s
Show

Type "echo '  Developer A: Senior engineer — prefers terse, severity-only'"
Enter
Sleep 2s

Type "cat .claude/rules/forge-communication.md"
Enter
Sleep 3s

Type@20ms `claude -p "이 코드를 리뷰해줘: function add(a, b) { let result = a + b; return result; } 파일은 만들지 마."`
Sleep 500ms
Enter
Sleep 20s

Sleep 5s

# ═══════════════════════════════════════
# Developer B: Junior — wants explanations & examples
# ═══════════════════════════════════════

Hide
Type `TMPDIR2=$(mktemp -d) && cd "$TMPDIR2" && git init -q && git config user.email "t@t" && git config user.name "T" && mkdir -p .claude/rules && cat > .claude/rules/forge-communication.md << 'EOF'`
Enter
Type "# Tenetx Forge — Communication Style (educational profile)"
Enter
Type "- Explain reasoning and trade-offs for every suggestion"
Enter
Type "- Include examples showing what could go wrong"
Enter
Type "- Teach concepts — explain the why not just the what"
Enter
Type "EOF"
Enter
Type "clear"
Enter
Sleep 1s
Show

Type ""
Enter
Type "echo '  Developer B: Junior engineer — wants explanations & examples'"
Enter
Sleep 2s

Type "cat .claude/rules/forge-communication.md"
Enter
Sleep 3s

Type@20ms `claude -p "이 코드를 리뷰해줘: function add(a, b) { let result = a + b; return result; } 파일은 만들지 마."`
Sleep 500ms
Enter
Sleep 25s

Sleep 3s
Type ""
Enter
Type "echo '  Same question. Same tool. Different developer. ⚡'"
Enter
Sleep 5s
