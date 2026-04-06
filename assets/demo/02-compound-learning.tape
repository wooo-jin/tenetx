# tenetx — Compound Learning Demo
# Shows: Claude using accumulated knowledge → auto-compound extracting patterns

Output assets/demo/02-compound-learning.gif

Set Shell "zsh"
Set FontFamily "JetBrains Mono"
Set FontSize 15
Set Width 1200
Set Height 700
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set WindowBar Colorful
Set BorderRadius 10
Set Margin 20
Set MarginFill "#1e1e2e"

Hide
Type "cd /tmp/tenetx-demo && clear"
Enter
Sleep 1s
Show

# Step 1: Ask Claude about TDD — compound should inject knowledge
Type "claude -p 'tdd 방식으로 isPrime 함수 만들어줘' --allowedTools Bash,Write,Edit"
Sleep 500ms
Enter
Sleep 15s

# Step 2: Show compound solutions matched
Type "# Compound matched starter-tdd-red-green-refactor"
Enter
Sleep 2s

# Step 3: Search compound knowledge via MCP
Type "claude -p 'compound-search MCP 도구로 typescript를 검색해줘'"
Sleep 500ms
Enter
Sleep 10s

# Step 4: Show accumulated solutions
Type "ls ~/.compound/me/solutions/ | wc -l"
Sleep 500ms
Enter
Sleep 1s

Type "# Knowledge grows with every session"
Enter
Sleep 3s
