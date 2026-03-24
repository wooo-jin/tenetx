/**
 * Tenetx — Gemini CLI Adapter
 *
 * Generates GEMINI.md, .gemini/settings.json hooks, and skills for Gemini CLI.
 * Gemini has 10+ hook events that map 1:1 with Claude Code:
 *   BeforeTool = PreToolUse, AfterTool = PostToolUse,
 *   PreCompress = PreCompact, SessionStart = SessionStart
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncToInstructionFile } from './adapter.js';

/** Initialize tenetx for Gemini CLI */
export function initGemini(cwd: string): { files: string[] } {
  const files: string[] = [];

  // 1. Sync solutions to GEMINI.md
  const { written } = syncToInstructionFile(cwd, 'gemini');
  files.push(written);

  // 2. Create .gemini/settings.json with hooks
  const geminiDir = path.join(cwd, '.gemini');
  fs.mkdirSync(geminiDir, { recursive: true });

  const settingsPath = path.join(geminiDir, 'settings.json');
  const settings = {
    hooks: {
      SessionStart: [{
        hooks: [{
          name: 'tenetx-session-start',
          type: 'command',
          command: 'tenetx sync gemini --quiet 2>/dev/null || true',
          description: 'Sync tenetx compound solutions',
        }],
      }],
      BeforeTool: [{
        matcher: 'write_file|replace_in_file|run_terminal_command',
        hooks: [{
          name: 'tenetx-before-tool',
          type: 'command',
          command: 'node -e "process.stdin.resume(); let d=\\"\\"; process.stdin.on(\\"data\\",c=>d+=c); process.stdin.on(\\"end\\",()=>{const i=JSON.parse(d); if(i.tool===\\"run_terminal_command\\"){const c=i.input?.command||\\"\\"; const bad=[/rm\\s+-rf\\s+[\\/~]/,/git\\s+push\\s+--force/,/drop\\s+table/i]; if(bad.some(p=>p.test(c))){console.log(JSON.stringify({exitCode:2}));return}} console.log(JSON.stringify({exitCode:0}))})"',
          description: 'Tenetx safety check',
        }],
      }],
      AfterTool: [{
        hooks: [{
          name: 'tenetx-after-tool',
          type: 'command',
          command: 'echo ""',
          description: 'Tenetx post-tool tracking (placeholder)',
        }],
      }],
      PreCompress: [{
        hooks: [{
          name: 'tenetx-pre-compress',
          type: 'command',
          command: 'echo "Consider running /compound to extract patterns before context compression"',
          description: 'Tenetx compound hint before compression',
        }],
      }],
    },
  };

  // Merge with existing settings if present
  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(settingsPath)) {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch { /* new file */ }

  // Only write hooks if not already present
  if (!existing.hooks || !(existing.hooks as Record<string, unknown>).SessionStart) {
    const merged = { ...existing, hooks: settings.hooks };
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
    files.push(settingsPath);
  }

  // 3. Create compound command
  const commandsDir = path.join(geminiDir, 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });

  const compoundCmd = path.join(commandsDir, 'compound.toml');
  if (!fs.existsSync(compoundCmd)) {
    fs.writeFileSync(compoundCmd, `# Tenetx compound command for Gemini CLI
name = "compound"
description = "Extract and accumulate coding patterns from this session"

[command]
type = "shell"
shell = "tenetx compound"
`);
    files.push(compoundCmd);
  }

  return { files };
}

/** Sync current solutions to Gemini GEMINI.md */
export function syncGemini(cwd: string, quiet = false): void {
  const { written, solutionCount } = syncToInstructionFile(cwd, 'gemini');
  if (!quiet) {
    console.log(`\n  ✓ Synced ${solutionCount} solutions to ${written}\n`);
  }
}
