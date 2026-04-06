# tenetx — Forge Personalization Demo
# Shows: forge interview → profile generated → personalized config

Output assets/demo/03-forge-personalization.gif

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

# Step 1: Start forge
Type "tenetx forge"
Sleep 500ms
Enter
Sleep 3s

# Answer questions (simulated — quality-focused developer)
Type "2"
Enter
Sleep 2s

Type "1"
Enter
Sleep 2s

Type "2"
Enter
Sleep 2s

Type "1"
Enter
Sleep 2s

Type "2"
Enter
Sleep 2s

# Wait for profile generation
Sleep 5s

# Step 2: Show generated rules
Type "cat .claude/rules/forge-quality.md | head -15"
Sleep 500ms
Enter
Sleep 3s

# Step 3: Show that Claude behavior is now personalized
Type "# Claude is now tuned to YOUR coding style"
Enter
Sleep 3s
